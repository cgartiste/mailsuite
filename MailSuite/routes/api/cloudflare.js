const router = require('express').Router();
const { requireAuth } = require('./middleware');
const { getDb, getSetting } = require('../../db/index');
const { CloudflareService } = require('../../services/cloudflare');

function getCf(accountId) {
  const db = getDb();
  if (accountId) {
    const row = db.prepare("SELECT * FROM cf_accounts WHERE id=?").get(accountId);
    if (row) return new CloudflareService(row.api_token);
  }
  const active = db.prepare("SELECT * FROM cf_accounts WHERE is_active=1 LIMIT 1").get();
  if (active) return new CloudflareService(active.api_token);
  const token = getSetting('cloudflare_api_token');
  return token ? new CloudflareService(token) : null;
}

// ─── Multi-account ─────────────────────────────────────────────────────────
router.get('/accounts', requireAuth, (req, res) => {
  res.json({ success: true, accounts: getDb().prepare('SELECT * FROM cf_accounts ORDER BY is_active DESC, created_at DESC').all() });
});

router.post('/accounts', requireAuth, async (req, res) => {
  const { name, api_token, email } = req.body;
  if (!name || !api_token) return res.status(400).json({ success: false, error: 'Nom et token requis' });
  const cf = new CloudflareService(api_token);
  const allZones = await cf.getAllZones();
  if (!allZones.length && !(await cf.getZones()).success)
    return res.status(400).json({ success: false, error: 'Token invalide ou aucune zone trouvée' });
  const db = getDb();
  const accResp = await cf.getAccounts();
  const accountId = (accResp.result || [])[0]?.id || '';
  const r = db.prepare('INSERT INTO cf_accounts (name,api_token,email,account_id,zone_count,is_active) VALUES (?,?,?,?,?,1)')
    .run(name, api_token, email || '', accountId, allZones.length);
  res.json({ success: true, id: r.lastInsertRowid, zone_count: allZones.length });
});

router.patch('/accounts/:id/activate', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE cf_accounts SET is_active=0').run();
  db.prepare('UPDATE cf_accounts SET is_active=1 WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

router.delete('/accounts/:id', requireAuth, (req, res) => {
  getDb().prepare('DELETE FROM cf_accounts WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ─── Zones per specific account ────────────────────────────────────────────
router.get('/accounts/:id/zones', requireAuth, async (req, res) => {
  const row = getDb().prepare('SELECT * FROM cf_accounts WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ success: false, error: 'Compte introuvable' });
  const cf = new CloudflareService(row.api_token);
  const zones = await cf.getAllZones({ forceRefresh: req.query.refresh === '1' });
  res.json({ success: true, result: zones, account: { id: row.id, name: row.name } });
});

// ─── Zones — ALL zones (paginated + cached) ────────────────────────────────
router.get('/zones', requireAuth, async (req, res) => {
  const cf = getCf();
  if (!cf) return res.status(400).json({ success: false, error: 'Cloudflare non configuré' });
  const forceRefresh = req.query.refresh === '1';
  const zones = await cf.getAllZones({ forceRefresh });
  const db = getDb();
  if (zones.length) {
    db.prepare("UPDATE cf_accounts SET zone_count=? WHERE is_active=1").run(zones.length);
    db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('cf_zone_count_cache',?)").run(String(zones.length));
  }
  res.json({ success: true, result: zones, result_info: { total_count: zones.length } });
});

// ─── Zone Detail (overview + analytics + settings) ─────────────────────────
router.get('/zones/:zid', requireAuth, async (req, res) => {
  const cf = getCf();
  if (!cf) return res.status(400).json({ success: false, error: 'Non configuré' });
  const zid = req.params.zid;
  const period = req.query.period || '-10080';

  const [zone, analytics, settings, dns] = await Promise.all([
    cf.getZone(zid),
    cf._req('GET', `/zones/${zid}/analytics/dashboard`, null, { since: period, until: '0', continuous: false }),
    cf._req('GET', `/zones/${zid}/settings`),
    cf.getDnsRecords(zid, {}),
  ]);

  const settingMap = {};
  for (const s of (settings.result || [])) settingMap[s.id] = s.value;

  res.json({
    success: true,
    zone: zone.result,
    analytics: analytics.result || null,
    settings: settingMap,
    dns_count: (dns.result || []).length,
  });
});

// ─── Zone Analytics — uses GraphQL ────────────────────────────────────────
router.get('/zones/:zid/analytics', requireAuth, async (req, res) => {
  const cf = getCf();
  if (!cf) return res.status(400).json({ success: false, error: 'Non configuré' });
  const period = req.query.period || '7d';
  const r = await cf.getZoneAnalyticsGql(req.params.zid, period);
  if (r.errors?.length) return res.status(500).json({ success: false, error: r.errors[0].message, errors: r.errors });

  const zones = r.data?.viewer?.zones || [];
  const timeseries = zones[0]?.timeseries || [];
  const statusGroups = zones[0]?.statusGroups || [];
  const countryGroups = zones[0]?.countryGroups || [];

  let totals = { requests: 0, cachedRequests: 0, bytes: 0, cachedBytes: 0, threats: 0, pageViews: 0, uniques: 0 };
  const statusMap = {};
  const countryMap = {};

  for (const g of timeseries) {
    totals.requests      += g.sum?.requests || 0;
    totals.cachedRequests+= g.sum?.cachedRequests || 0;
    totals.bytes         += g.sum?.bytes || 0;
    totals.cachedBytes   += g.sum?.cachedBytes || 0;
    totals.threats       += g.sum?.threats || 0;
    totals.pageViews     += g.sum?.pageViews || 0;
    totals.uniques       += g.uniq?.uniques || 0;
  }

  for (const s of statusGroups) {
    if (s.dimensions?.edgeResponseStatus) statusMap[s.dimensions.edgeResponseStatus] = s.sum?.requests || 0;
  }
  for (const c of countryGroups) {
    if (c.dimensions?.clientCountryName) countryMap[c.dimensions.clientCountryName] = { requests: c.sum?.requests || 0, threats: c.sum?.threats || 0 };
  }

  res.json({
    success: true,
    period,
    totals,
    statusMap,
    countryMap,
    timeseries: timeseries.map(g => ({
      date: g.dimensions?.date,
      requests: g.sum?.requests || 0,
      cachedRequests: g.sum?.cachedRequests || 0,
      bytes: g.sum?.bytes || 0,
      threats: g.sum?.threats || 0,
      uniques: g.uniq?.uniques || 0,
    })),
  });
});

// ─── Zone Settings ─────────────────────────────────────────────────────────
router.get('/zones/:zid/settings', requireAuth, async (req, res) => {
  const cf = getCf();
  if (!cf) return res.status(400).json({ success: false, error: 'Non configuré' });
  const r = await cf._req('GET', `/zones/${req.params.zid}/settings`);
  const settingMap = {};
  for (const s of (r.result || [])) settingMap[s.id] = { value: s.value, editable: s.editable, modified_on: s.modified_on };
  res.json({ success: true, settings: settingMap, raw: r.result || [] });
});

router.patch('/zones/:zid/settings/:setting', requireAuth, async (req, res) => {
  const cf = getCf();
  if (!cf) return res.status(400).json({ success: false, error: 'Non configuré' });
  const { value } = req.body;
  if (value === undefined) return res.status(400).json({ success: false, error: 'value requis' });
  const r = await cf._req('PATCH', `/zones/${req.params.zid}/settings/${req.params.setting}`, { value });
  res.json(r);
});

// ─── Cache Purge ────────────────────────────────────────────────────────────
router.post('/zones/:zid/purge', requireAuth, async (req, res) => {
  const cf = getCf();
  if (!cf) return res.status(400).json({ success: false, error: 'Non configuré' });
  const { urls, purge_everything } = req.body;
  let body = {};
  if (purge_everything) body = { purge_everything: true };
  else if (urls?.length) body = { files: urls };
  else return res.status(400).json({ success: false, error: 'Spécifiez urls ou purge_everything' });
  const r = await cf._req('POST', `/zones/${req.params.zid}/purge_cache`, body);
  res.json(r);
});

// ─── Logs (Logpull) ─────────────────────────────────────────────────────────
router.get('/zones/:zid/logs', requireAuth, async (req, res) => {
  const cf = getCf();
  if (!cf) return res.status(400).json({ success: false, error: 'Non configuré' });
  const end   = new Date();
  const start = new Date(end - 30 * 60 * 1000);
  const r = await cf._req('GET', `/zones/${req.params.zid}/logs/received`, null, {
    start: start.toISOString(), end: end.toISOString(), count: 100,
    fields: 'ClientIP,ClientRequestMethod,ClientRequestURI,ClientRequestHost,EdgeResponseStatus,EdgeResponseBytes,EdgeStartTimestamp',
    timestamps: 'unix',
  });
  if (typeof r === 'string') {
    const lines = r.trim().split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    return res.json({ success: true, logs: lines });
  }
  res.json({ success: true, logs: Array.isArray(r) ? r : [], raw: r });
});

// ─── DNS CRUD ───────────────────────────────────────────────────────────────
router.get('/zones/:zid/dns', requireAuth, async (req, res) => {
  const cf = getCf();
  if (!cf) return res.status(400).json({ success: false, error: 'Non configuré' });
  const [zone, records] = await Promise.all([
    cf.getZone(req.params.zid),
    cf.getDnsRecords(req.params.zid, { type: req.query.type || undefined }),
  ]);
  res.json({ success: true, zone: zone.result, records: records.result || [] });
});

router.post('/zones/:zid/dns', requireAuth, async (req, res) => {
  const cf = getCf();
  if (!cf) return res.status(400).json({ success: false, error: 'Non configuré' });
  const r = await cf.createDnsRecord(req.params.zid, {
    type:    (req.body.type || '').toUpperCase(),
    name:    req.body.name,
    content: req.body.content,
    ttl:     parseInt(req.body.ttl) || 1,
    proxied: req.body.proxied === true || req.body.proxied === 'true',
    priority: req.body.priority ? parseInt(req.body.priority) : null,
  });
  res.json(r);
});

router.put('/zones/:zid/dns/:rid', requireAuth, async (req, res) => {
  const cf = getCf();
  if (!cf) return res.status(400).json({ success: false, error: 'Non configuré' });
  const r = await cf.updateDnsRecord(req.params.zid, req.params.rid, {
    type:    (req.body.type || '').toUpperCase(),
    name:    req.body.name,
    content: req.body.content,
    ttl:     parseInt(req.body.ttl) || 1,
    proxied: req.body.proxied === true || req.body.proxied === 'true',
  });
  res.json(r);
});

router.delete('/zones/:zid/dns/:rid', requireAuth, async (req, res) => {
  const cf = getCf();
  if (!cf) return res.status(400).json({ success: false, error: 'Non configuré' });
  res.json(await cf.deleteDnsRecord(req.params.zid, req.params.rid));
});

// ─── DNS Templates ──────────────────────────────────────────────────────────
router.post('/zones/:zid/dns/template', requireAuth, async (req, res) => {
  const cf = getCf();
  if (!cf) return res.status(400).json({ success: false, error: 'Non configuré' });
  const { template, domain, options = {} } = req.body;
  const zid = req.params.zid;
  const results = {};

  const templates = {
    google_workspace: [
      { type: 'MX', name: domain, content: 'aspmx.l.google.com', priority: 1 },
      { type: 'MX', name: domain, content: 'alt1.aspmx.l.google.com', priority: 5 },
      { type: 'MX', name: domain, content: 'alt2.aspmx.l.google.com', priority: 5 },
      { type: 'MX', name: domain, content: 'alt3.aspmx.l.google.com', priority: 10 },
      { type: 'MX', name: domain, content: 'alt4.aspmx.l.google.com', priority: 10 },
      { type: 'TXT', name: domain, content: 'v=spf1 include:_spf.google.com ~all' },
      { type: 'TXT', name: `_dmarc.${domain}`, content: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}; pct=100` },
    ],
    microsoft_365: [
      { type: 'MX',   name: domain, content: `${domain.replace(/\./g, '-')}.mail.protection.outlook.com`, priority: 0 },
      { type: 'TXT',  name: domain, content: 'v=spf1 include:spf.protection.outlook.com -all' },
      { type: 'CNAME', name: `autodiscover.${domain}`, content: 'autodiscover.outlook.com', proxied: false },
      { type: 'TXT',  name: `_dmarc.${domain}`, content: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}` },
    ],
    email_security: [
      { type: 'TXT', name: domain, content: options.spf || 'v=spf1 include:_spf.google.com ~all' },
      { type: 'TXT', name: `_dmarc.${domain}`, content: options.dmarc || `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}; pct=100` },
    ],
  };

  const records = templates[template];
  if (!records) return res.status(400).json({ success: false, error: `Template inconnu: ${template}` });

  for (const rec of records) {
    try {
      results[`${rec.type}_${rec.name}`] = await cf.upsertDnsRecord(zid, rec);
    } catch (e) {
      results[`${rec.type}_${rec.name}`] = { error: e.message };
    }
  }

  res.json({ success: true, applied: Object.keys(results).length, results });
});

// ─── Email Auth ────────────────────────────────────────────────────────────
router.get('/email-auth', requireAuth, async (req, res) => {
  const cf = getCf(req.query.account_id);
  if (!cf) return res.status(400).json({ success: false, error: 'Non configuré' });
  const db = getDb();
  const dkimSel = getSetting('dkim_selector') || 'mail';
  const allZones = await cf.getAllZones();

  if (req.query.zone_id) {
    const zone = allZones.find(z => z.id === req.query.zone_id) || { id: req.query.zone_id, name: req.query.zone_id };
    const auth = await cf.getEmailAuthRecords(zone.id, zone.name, dkimSel);
    return res.json({ success: true, data: [{ domain: zone.name, zone, ...auth }], dkimSelector: dkimSel });
  }

  let sourceZones;
  if (req.query.source === 'cloudflare') {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    sourceZones = allZones.slice(offset, offset + limit);
    const results = [];
    const BATCH = 10;
    for (let i = 0; i < sourceZones.length; i += BATCH) {
      const batch = sourceZones.slice(i, i + BATCH);
      const batchResults = await Promise.all(batch.map(async (z) => {
        const auth = await cf.getEmailAuthRecords(z.id, z.name, dkimSel);
        return { domain: z.name, zone: z, ...auth };
      }));
      results.push(...batchResults);
    }
    return res.json({ success: true, data: results, dkimSelector: dkimSel, total_zones: allZones.length, page, limit });
  }

  const domains = db.prepare('SELECT * FROM domains ORDER BY domain').all();
  const matchZone = (domain) => {
    const exact = allZones.find(z => z.name === domain);
    if (exact) return exact;
    const parts = domain.split('.');
    for (let i = 1; i < parts.length - 1; i++) {
      const m = allZones.find(z => z.name === parts.slice(i).join('.'));
      if (m) return m;
    }
    return null;
  };

  const results = [];
  const BATCH = 10;
  for (let i = 0; i < domains.length; i += BATCH) {
    const batch = domains.slice(i, i + BATCH);
    const batchResults = await Promise.all(batch.map(async (d) => {
      const zone = matchZone(d.domain);
      if (!zone) return { domain: d.domain, domain_id: d.id, zone: null, spf: null, dkim: null, dmarc: null, bimi: null, mx: [] };
      const auth = await cf.getEmailAuthRecords(zone.id, d.domain, dkimSel);
      return { domain: d.domain, domain_id: d.id, zone, ...auth };
    }));
    results.push(...batchResults);
  }
  res.json({ success: true, data: results, dkimSelector: dkimSel, total_zones: allZones.length });
});

router.post('/email-auth/deploy', requireAuth, async (req, res) => {
  const cf = getCf();
  if (!cf) return res.status(400).json({ success: false, error: 'Non configuré' });
  const { domain, record_type, zone_id, record_id, content } = req.body;

  // DKIM: if content is provided, deploy it; otherwise return instructions
  if (record_type === 'dkim') {
    if (!content) {
      // Find linked GW account for this domain
      const db = getDb();
      const gwCred = db.prepare("SELECT * FROM gw_credentials WHERE domain=? OR admin_email LIKE ? LIMIT 1")
        .get(domain, `%@${domain}`);
      return res.json({
        success: false,
        needs_key: true,
        info: `Copiez la clé DKIM depuis Google Admin Console → Apps → Google Workspace → Gmail → Authenticate email → ${domain}`,
        gw_account: gwCred ? { name: gwCred.name, admin_email: gwCred.admin_email } : null,
        dkim_record_name: `mail._domainkey.${domain}`,
      });
    }
    // Deploy provided DKIM key to Cloudflare
    const tpl = { type: 'TXT', name: `mail._domainkey.${domain}`, content, ttl: 3600 };
    const r = record_id ? await cf.updateDnsRecord(zone_id, record_id, tpl) : await cf.upsertDnsRecord(zone_id, tpl);
    return res.json(r);
  }

  const spfContents = {
    spf:           content || 'v=spf1 include:_spf.google.com ~all',
    spf_google:    'v=spf1 include:_spf.google.com ~all',
    spf_microsoft: 'v=spf1 include:spf.protection.outlook.com ~all',
    spf_both:      'v=spf1 include:_spf.google.com include:spf.protection.outlook.com ~all',
  };

  if (spfContents[record_type]) {
    const tpl = { type: 'TXT', name: domain, content: spfContents[record_type] };
    const r = record_id ? await cf.updateDnsRecord(zone_id, record_id, tpl) : await cf.upsertDnsRecord(zone_id, tpl);
    return res.json(r);
  }

  if (record_type === 'dmarc') {
    const tpl = { type: 'TXT', name: `_dmarc.${domain}`, content: content || `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}; pct=100` };
    const r = record_id ? await cf.updateDnsRecord(zone_id, record_id, tpl) : await cf.upsertDnsRecord(zone_id, tpl);
    return res.json(r);
  }

  if (record_type === 'bimi') {
    const tpl = { type: 'TXT', name: `default._bimi.${domain}`, content: content || `v=BIMI1; l=https://${domain}/logo.svg` };
    const r = record_id ? await cf.updateDnsRecord(zone_id, record_id, tpl) : await cf.upsertDnsRecord(zone_id, tpl);
    return res.json(r);
  }

  if (record_type === 'mx_google') {
    const mxRecords = [
      { type: 'MX', name: domain, content: 'aspmx.l.google.com', priority: 1 },
      { type: 'MX', name: domain, content: 'alt1.aspmx.l.google.com', priority: 5 },
      { type: 'MX', name: domain, content: 'alt2.aspmx.l.google.com', priority: 5 },
      { type: 'MX', name: domain, content: 'alt3.aspmx.l.google.com', priority: 10 },
      { type: 'MX', name: domain, content: 'alt4.aspmx.l.google.com', priority: 10 },
    ];
    const results = await Promise.all(mxRecords.map(rec => cf.upsertDnsRecord(zone_id, rec)));
    return res.json({ success: true, results });
  }

  if (record_type === 'mx_microsoft') {
    const mxContent = `${domain.replace(/\./g, '-')}.mail.protection.outlook.com`;
    const r = await cf.upsertDnsRecord(zone_id, { type: 'MX', name: domain, content: mxContent, priority: 0 });
    return res.json(r);
  }

  return res.status(400).json({ success: false, error: 'Type de record invalide' });
});

router.post('/email-auth/deploy-bulk', requireAuth, async (req, res) => {
  const cf = getCf();
  if (!cf) return res.status(400).json({ success: false, error: 'Non configuré' });
  const { zone_ids, record_types, spf_type } = req.body;
  if (!zone_ids?.length || !record_types?.length) return res.status(400).json({ success: false, error: 'zone_ids et record_types requis' });

  const allZones = await cf.getAllZones();
  const results = {};
  const BATCH = 10;

  for (let i = 0; i < zone_ids.length; i += BATCH) {
    const batch = zone_ids.slice(i, i + BATCH);
    await Promise.all(batch.map(async (zid) => {
      const zone = allZones.find(z => z.id === zid);
      const domain = zone?.name || zid;
      results[zid] = { domain, records: {} };
      for (const rt of record_types) {
        try {
          if (rt === 'spf' || rt === 'spf_google' || rt === 'spf_microsoft' || rt === 'spf_both') {
            const type = spf_type || rt;
            const spfMap = {
              spf: 'v=spf1 include:_spf.google.com ~all',
              spf_google: 'v=spf1 include:_spf.google.com ~all',
              spf_microsoft: 'v=spf1 include:spf.protection.outlook.com ~all',
              spf_both: 'v=spf1 include:_spf.google.com include:spf.protection.outlook.com ~all',
            };
            results[zid].records.spf = await cf.upsertDnsRecord(zid, { type: 'TXT', name: domain, content: spfMap[type] || spfMap.spf });
          } else if (rt === 'dmarc') {
            results[zid].records.dmarc = await cf.upsertDnsRecord(zid, { type: 'TXT', name: `_dmarc.${domain}`, content: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}; pct=100` });
          } else if (rt === 'mx_google') {
            const mxRecs = [
              { type: 'MX', name: domain, content: 'aspmx.l.google.com', priority: 1 },
              { type: 'MX', name: domain, content: 'alt1.aspmx.l.google.com', priority: 5 },
              { type: 'MX', name: domain, content: 'alt2.aspmx.l.google.com', priority: 5 },
              { type: 'MX', name: domain, content: 'alt3.aspmx.l.google.com', priority: 10 },
              { type: 'MX', name: domain, content: 'alt4.aspmx.l.google.com', priority: 10 },
            ];
            results[zid].records.mx_google = await Promise.all(mxRecs.map(r => cf.upsertDnsRecord(zid, r)));
          } else if (rt === 'mx_microsoft') {
            results[zid].records.mx_microsoft = await cf.upsertDnsRecord(zid, { type: 'MX', name: domain, content: `${domain.replace(/\./g, '-')}.mail.protection.outlook.com`, priority: 0 });
          }
        } catch (e) {
          results[zid].records[rt] = { error: e.message };
        }
      }
    }));
  }

  res.json({ success: true, results, total: zone_ids.length });
});

// ─── Email Routing — Summary (fast, paginated) ─────────────────────────────
router.get('/email-routing/summary', requireAuth, async (req, res) => {
  const cf = getCf();
  if (!cf) return res.status(400).json({ success: false, error: 'Non configuré' });
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;

  const allZones = await cf.getAllZones();
  const offset = (page - 1) * limit;
  const pageZones = allZones.slice(offset, offset + limit);

  const BATCH = 10;
  const data = [];
  for (let i = 0; i < pageZones.length; i += BATCH) {
    const batch = pageZones.slice(i, i + BATCH);
    const batchResults = await Promise.all(batch.map(async (z) => {
      const [routing, rules] = await Promise.all([
        cf.getEmailRouting(z.id),
        cf.getEmailRoutingRules(z.id),
      ]);
      return { zone: z, routing: routing.result || {}, rules: rules.result || [] };
    }));
    data.push(...batchResults);
  }

  const zones_with_routing = data.filter(d => d.routing?.enabled).length;
  res.json({ success: true, data, zones_total: allZones.length, zones_with_routing, page, limit, total_pages: Math.ceil(allZones.length / limit) });
});

router.get('/email-routing/:zoneId', requireAuth, async (req, res) => {
  const cf = getCf();
  if (!cf) return res.status(400).json({ success: false, error: 'Non configuré' });
  const [routing, rules] = await Promise.all([
    cf.getEmailRouting(req.params.zoneId),
    cf.getEmailRoutingRules(req.params.zoneId),
  ]);
  res.json({ success: true, routing: routing.result || {}, rules: rules.result || [] });
});

router.post('/email-routing/:zoneId/enable', requireAuth, async (req, res) => {
  const cf = getCf();
  if (!cf) return res.status(400).json({ success: false, error: 'Non configuré' });
  const r = await cf.enableEmailRouting(req.params.zoneId);
  res.json(r);
});

router.post('/email-routing/:zoneId/disable', requireAuth, async (req, res) => {
  const cf = getCf();
  if (!cf) return res.status(400).json({ success: false, error: 'Non configuré' });
  const r = await cf.disableEmailRouting(req.params.zoneId);
  res.json(r);
});

router.post('/email-routing/:zoneId/rules', requireAuth, async (req, res) => {
  const cf = getCf();
  if (!cf) return res.status(400).json({ success: false, error: 'Non configuré' });
  const { name, priority, enabled, matchers, actions } = req.body;
  if (!matchers?.length || !actions?.length) return res.status(400).json({ success: false, error: 'matchers et actions requis' });
  const r = await cf.createEmailRoutingRule(req.params.zoneId, { name: name || 'Rule', priority: priority || 1, enabled: enabled !== false, matchers, actions });
  res.json(r);
});

router.delete('/email-routing/:zoneId/rules/:ruleId', requireAuth, async (req, res) => {
  const cf = getCf();
  if (!cf) return res.status(400).json({ success: false, error: 'Non configuré' });
  const r = await cf.deleteEmailRoutingRule(req.params.zoneId, req.params.ruleId);
  res.json(r);
});

router.post('/email-routing/bulk-enable', requireAuth, async (req, res) => {
  const cf = getCf();
  if (!cf) return res.status(400).json({ success: false, error: 'Non configuré' });
  const { zone_ids, catch_all_to } = req.body;
  if (!zone_ids?.length) return res.status(400).json({ success: false, error: 'zone_ids requis' });

  const results = {};
  const BATCH = 10;
  for (let i = 0; i < zone_ids.length; i += BATCH) {
    const batch = zone_ids.slice(i, i + BATCH);
    await Promise.all(batch.map(async (zid) => {
      results[zid] = { enabled: false, rule: null, error: null };
      try {
        await cf.enableEmailRouting(zid);
        results[zid].enabled = true;
        if (catch_all_to) {
          const rule = await cf.createEmailRoutingRule(zid, {
            name: 'Catch-all forward',
            priority: 0,
            enabled: true,
            matchers: [{ type: 'all' }],
            actions: [{ type: 'forward', value: [catch_all_to] }],
          });
          results[zid].rule = rule.result || null;
        }
      } catch (e) {
        results[zid].error = e.message;
      }
    }));
  }

  const succeeded = Object.values(results).filter(r => r.enabled).length;
  res.json({ success: true, results, succeeded, total: zone_ids.length });
});

router.post('/email-routing/bulk-disable', requireAuth, async (req, res) => {
  const cf = getCf();
  if (!cf) return res.status(400).json({ success: false, error: 'Non configuré' });
  const { zone_ids } = req.body;
  if (!zone_ids?.length) return res.status(400).json({ success: false, error: 'zone_ids requis' });

  const results = {};
  const BATCH = 10;
  for (let i = 0; i < zone_ids.length; i += BATCH) {
    const batch = zone_ids.slice(i, i + BATCH);
    await Promise.all(batch.map(async (zid) => {
      try {
        await cf.disableEmailRouting(zid);
        results[zid] = { disabled: true };
      } catch (e) {
        results[zid] = { disabled: false, error: e.message };
      }
    }));
  }

  res.json({ success: true, results, total: zone_ids.length });
});

// ─── Legacy email-routing (kept for backward compat) ───────────────────────
router.get('/email-routing', requireAuth, async (req, res) => {
  const cf = getCf();
  if (!cf) return res.status(400).json({ success: false, error: 'Non configuré' });
  const allZones = await cf.getAllZones();
  if (!allZones.length) return res.json({ success: true, data: [] });

  const BATCH = 20;
  const results = [];
  for (let i = 0; i < allZones.length; i += BATCH) {
    const batch = allZones.slice(i, i + BATCH);
    const batchResults = await Promise.all(batch.map(async (z) => {
      const [routing, rules] = await Promise.all([
        cf.getEmailRouting(z.id),
        cf.getEmailRoutingRules(z.id),
      ]);
      return { zone: z, routing: routing.result || {}, rules: rules.result || [] };
    }));
    results.push(...batchResults);
  }
  res.json({ success: true, data: results });
});

module.exports = router;
