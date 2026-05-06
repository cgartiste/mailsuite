const router = require('express').Router();
const { loginRequired } = require('../middleware/auth');
const { getDb, getSetting } = require('../db/index');
const { CloudflareService } = require('../services/cloudflare');

function getCf() {
  // Try multi-account first
  const db = getDb();
  const active = db.prepare("SELECT * FROM cf_accounts WHERE is_active=1 LIMIT 1").get();
  if (active) return new CloudflareService(active.api_token);
  // Fallback to settings
  const token = getSetting('cloudflare_api_token');
  return CloudflareService.isConfigured(token) ? new CloudflareService(token) : null;
}

router.get('/cloudflare', loginRequired, async (req, res) => {
  const cf = getCf();
  let zones = [], error = null;
  if (cf) {
    const resp = await cf.getZones();
    if (resp.success) zones = resp.result || [];
    else error = CloudflareService.getError(resp);
  }
  res.render('cf_overview', { zones, error, configured: !!cf, page: 'cloudflare' });
});

router.get('/cloudflare/zones/:zid/dns', loginRequired, async (req, res) => {
  const cf = getCf();
  if (!cf) { req.flash('warning', 'Configurez Cloudflare'); return res.redirect('/settings'); }
  const zoneResp = await cf.getZone(req.params.zid);
  const zone = zoneResp.success ? zoneResp.result : {};
  const recResp = await cf.getDnsRecords(req.params.zid, { type: req.query.type || undefined });
  let records = recResp.success ? recResp.result || [] : [];
  if (req.query.search) {
    const s = req.query.search.toLowerCase();
    records = records.filter(r => r.name?.toLowerCase().includes(s) || r.content?.toLowerCase().includes(s));
  }
  const emailRecords = records.filter(r =>
    ['_domainkey','_dmarc','_bimi','spf'].some(t => r.name?.includes(t)) ||
    r.type === 'MX' || (r.type === 'TXT' && r.content?.includes('v=spf1'))
  );
  const types = [...new Set(records.map(r => r.type))].sort();
  res.render('cf_dns', { zone, zone_id: req.params.zid, records, emailRecords, types, record_type: req.query.type||'', search: req.query.search||'', page: 'cloudflare' });
});

router.post('/cloudflare/zones/:zid/dns/add', loginRequired, async (req, res) => {
  const cf = getCf();
  if (!cf) return res.redirect('/settings');
  const resp = await cf.createDnsRecord(req.params.zid, {
    type: (req.body.type||'').toUpperCase(), name: req.body.name, content: req.body.content,
    ttl: parseInt(req.body.ttl)||1, proxied: req.body.proxied === 'on',
    priority: req.body.priority ? parseInt(req.body.priority) : null,
  });
  req.flash(resp.success ? 'success' : 'error', resp.success ? `Record créé` : CloudflareService.getError(resp));
  res.redirect(`/cloudflare/zones/${req.params.zid}/dns`);
});

router.post('/cloudflare/zones/:zid/dns/:rid/delete', loginRequired, async (req, res) => {
  const cf = getCf();
  if (!cf) return res.redirect('/settings');
  const resp = await cf.deleteDnsRecord(req.params.zid, req.params.rid);
  req.flash(resp.success ? 'success' : 'error', resp.success ? 'Record supprimé' : CloudflareService.getError(resp));
  res.redirect(`/cloudflare/zones/${req.params.zid}/dns`);
});

router.post('/cloudflare/zones/:zid/dns/:rid/edit', loginRequired, async (req, res) => {
  const cf = getCf();
  if (!cf) return res.redirect('/settings');
  const resp = await cf.updateDnsRecord(req.params.zid, req.params.rid, {
    type: (req.body.type||'').toUpperCase(), name: req.body.name, content: req.body.content,
    ttl: parseInt(req.body.ttl)||1, proxied: req.body.proxied === 'on',
    priority: req.body.priority ? parseInt(req.body.priority) : null,
  });
  req.flash(resp.success ? 'success' : 'error', resp.success ? 'Record mis à jour' : CloudflareService.getError(resp));
  res.redirect(`/cloudflare/zones/${req.params.zid}/dns`);
});

router.get('/cloudflare/email-auth', loginRequired, async (req, res) => {
  const cf = getCf();
  const db = getDb();
  const domains = db.prepare('SELECT * FROM domains ORDER BY domain').all();
  const dkimSel = getSetting('dkim_selector') || 'mail';
  const domainsData = [];
  if (cf) {
    for (const d of domains) {
      const zone = await cf.findZoneByDomain(d.domain);
      if (zone) {
        const auth = await cf.getEmailAuthRecords(zone.id, d.domain, dkimSel);
        domainsData.push({ domain: d.domain, domain_id: d.id, zone, ...auth });
      } else {
        domainsData.push({ domain: d.domain, domain_id: d.id, zone: null, spf:null, dkim:null, dmarc:null, bimi:null, mx:[] });
      }
    }
  }
  res.render('cf_email_auth', { domainsData, configured: !!cf, dkimSelector: dkimSel, page: 'cloudflare' });
});

router.post('/cloudflare/email-auth/deploy', loginRequired, async (req, res) => {
  const cf = getCf();
  if (!cf) { req.flash('warning', 'Configurez Cloudflare'); return res.redirect('/settings'); }
  const { domain, record_type, zone_id, record_id, content } = req.body;
  const dkimSel = getSetting('dkim_selector') || 'mail';
  const templates = {
    spf: { type:'TXT', name:domain, content: content || 'v=spf1 include:_spf.google.com include:_spf.mx.cloudflare.net ~all' },
    dmarc: { type:'TXT', name:`_dmarc.${domain}`, content: content || `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}; pct=100; adkim=s; aspf=s` },
    bimi: { type:'TXT', name:`default._bimi.${domain}`, content: content || `v=BIMI1; l=https://${domain}/logo.svg` },
  };
  if (record_type === 'dkim') { req.flash('info', 'Configurez DKIM depuis Google Admin Console'); return res.redirect('/cloudflare/email-auth'); }
  const tpl = templates[record_type];
  if (!tpl) { req.flash('error', 'Type invalide'); return res.redirect('/cloudflare/email-auth'); }
  const resp = record_id ? await cf.updateDnsRecord(zone_id, record_id, tpl) : await cf.createDnsRecord(zone_id, tpl);
  req.flash(resp.success ? 'success' : 'error', resp.success ? `${record_type.toUpperCase()} déployé pour ${domain}` : CloudflareService.getError(resp));
  res.redirect('/cloudflare/email-auth');
});

router.get('/cloudflare/email-routing', loginRequired, async (req, res) => {
  const cf = getCf();
  const routingData = [];
  if (cf) {
    const zr = await cf.getZones();
    if (zr.success) {
      for (const zone of (zr.result||[])) {
        const routing = await cf.getEmailRouting(zone.id);
        const rules = await cf.getEmailRoutingRules(zone.id);
        routingData.push({ zone, routing: routing.result||{}, rules: rules.result||[], rulesCount: (rules.result||[]).length });
      }
    }
  }
  res.render('cf_email_routing', { routingData, configured: !!cf, page: 'cloudflare' });
});

router.get('/cloudflare/workers', loginRequired, async (req, res) => {
  const cf = getCf();
  let accounts = [];
  if (cf) { const r = await cf.getAccounts(); if (r.success) accounts = r.result||[]; }
  res.render('cf_workers', { accounts, configured: !!cf, page: 'cloudflare' });
});

// ─── CF Multi-Account Management ────────────────────────────────
router.post('/cloudflare/accounts/add', loginRequired, async (req, res) => {
  const { name, api_token, email } = req.body;
  if (!name || !api_token) { req.flash('error', 'Nom et token requis'); return res.redirect('/cloudflare'); }
  const cf = new CloudflareService(api_token);
  const test = await cf.getZones();
  if (!test.success) { req.flash('error', `Token invalide: ${CloudflareService.getError(test)}`); return res.redirect('/cloudflare'); }
  const db = getDb();
  const accResp = await cf.getAccounts();
  const accountId = (accResp.result||[])[0]?.id || '';
  db.prepare('INSERT INTO cf_accounts (name,api_token,email,account_id,zone_count,is_active) VALUES (?,?,?,?,?,1)')
    .run(name, api_token, email||'', accountId, (test.result||[]).length);
  req.flash('success', `Compte Cloudflare "${name}" ajouté — ${(test.result||[]).length} zones`);
  res.redirect('/cloudflare');
});

router.post('/cloudflare/accounts/:id/activate', loginRequired, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE cf_accounts SET is_active=0').run();
  db.prepare('UPDATE cf_accounts SET is_active=1 WHERE id=?').run(req.params.id);
  req.flash('success', 'Compte activé');
  res.redirect('/cloudflare');
});

router.post('/cloudflare/accounts/:id/delete', loginRequired, (req, res) => {
  getDb().prepare('DELETE FROM cf_accounts WHERE id=?').run(req.params.id);
  req.flash('success', 'Compte supprimé');
  res.redirect('/cloudflare');
});

module.exports = router;
