const router = require('express').Router();
const { requireAuth, requireAdmin } = require('./middleware');
const { getDb } = require('../../db/index');
const { fullDnsCheck } = require('../../services/dns-checker');
const { getSetting } = require('../../db/index');
const { CloudflareService } = require('../../services/cloudflare');
const { GoogleWorkspaceService } = require('../../services/google-workspace');
const { getMsInstance } = require('../../services/microsoft365');
const path = require('path');

function ensureSourceColumn(db) {
  try { db.prepare("ALTER TABLE domains ADD COLUMN source TEXT DEFAULT 'manual'").run(); } catch {}
}

function getCf(db) {
  const active = db.prepare("SELECT * FROM cf_accounts WHERE is_active=1 LIMIT 1").get();
  if (active) return new CloudflareService(active.api_token);
  const token = db.prepare("SELECT value FROM settings WHERE key='cloudflare_api_token'").get();
  return token ? new CloudflareService(token.value) : null;
}

function getGw(db) {
  const cred = db.prepare("SELECT * FROM gw_credentials WHERE is_active=1 LIMIT 1").get();
  if (!cred) return null;
  const fp = path.join(process.cwd(), 'gw_creds', cred.filename || cred.credential_file || '');
  return new GoogleWorkspaceService(fp, cred.admin_email);
}

function getMs(db) {
  const row = db.prepare("SELECT * FROM ms_accounts WHERE is_active=1 LIMIT 1").get();
  if (!row) return null;
  return getMsInstance(row.id, row);
}

router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  ensureSourceColumn(db);
  const rows = db.prepare(`SELECT d.*,
    (SELECT COUNT(*) FROM gw_accounts WHERE domain_id=d.id) as account_count,
    (SELECT COUNT(*) FROM incidents WHERE domain_id=d.id AND resolved=0) as open_incidents
    FROM domains d ORDER BY d.created_at DESC`).all();
  res.json({ success: true, domains: rows });
});

router.post('/', requireAuth, (req, res) => {
  const domain = (req.body.domain || '').trim().toLowerCase();
  const source = req.body.source || 'manual';
  if (!domain) return res.status(400).json({ success: false, error: 'Domaine requis' });
  const db = getDb();
  ensureSourceColumn(db);
  try {
    const r = db.prepare("INSERT INTO domains (domain, source) VALUES (?, ?)").run(domain, source);
    db.prepare("INSERT INTO agent_logs (agent_name,action,status,result) VALUES (?,?,?,?)").run('system', `Domaine ajouté: ${domain}`, 'success', `Nouveau domaine`);
    res.json({ success: true, id: r.lastInsertRowid });
  } catch { res.status(409).json({ success: false, error: `Domaine ${domain} existe déjà` }); }
});

router.get('/sources', requireAuth, async (req, res) => {
  const db = getDb();
  ensureSourceColumn(db);
  const alreadyAdded = db.prepare('SELECT domain FROM domains').all().map(r => r.domain);
  const result = { cloudflare: [], google: [], microsoft: [], already_added: alreadyAdded };

  await Promise.allSettled([
    (async () => {
      const cf = getCf(db);
      if (!cf) return;
      const zones = await cf.getAllZones();
      result.cloudflare = zones.map(z => ({ name: z.name, id: z.id }));
    })(),
    (async () => {
      const gw = getGw(db);
      if (!gw) return;
      const r = await gw.testConnection();
      if (r.success) result.google = (r.domains || []).map(d => ({ name: d.domainName, id: d.domainName }));
    })(),
    (async () => {
      const ms = getMs(db);
      if (!ms) return;
      const domains = await ms.listDomains();
      result.microsoft = (domains || []).map(d => ({ name: d.id, id: d.id }));
    })(),
  ]);

  res.json({ success: true, ...result });
});

router.post('/sync', requireAuth, async (req, res) => {
  const db = getDb();
  ensureSourceColumn(db);
  const sources = req.body.sources || ['cloudflare', 'google', 'microsoft'];
  const alreadyAdded = new Set(db.prepare('SELECT domain FROM domains').all().map(r => r.domain));
  let added = 0; let skipped = 0;

  const toInsert = [];

  await Promise.allSettled([
    (async () => {
      if (!sources.includes('cloudflare')) return;
      const cf = getCf(db);
      if (!cf) return;
      const zones = await cf.getAllZones();
      for (const z of zones) {
        if (alreadyAdded.has(z.name)) { skipped++; continue; }
        toInsert.push({ domain: z.name, source: 'cloudflare' });
        alreadyAdded.add(z.name);
      }
    })(),
    (async () => {
      if (!sources.includes('google')) return;
      const gw = getGw(db);
      if (!gw) return;
      const r = await gw.testConnection();
      for (const d of (r.domains || [])) {
        const name = d.domainName;
        if (alreadyAdded.has(name)) { skipped++; continue; }
        toInsert.push({ domain: name, source: 'google' });
        alreadyAdded.add(name);
      }
    })(),
    (async () => {
      if (!sources.includes('microsoft')) return;
      const ms = getMs(db);
      if (!ms) return;
      const domains = await ms.listDomains();
      for (const d of (domains || [])) {
        if (alreadyAdded.has(d.id)) { skipped++; continue; }
        toInsert.push({ domain: d.id, source: 'microsoft' });
        alreadyAdded.add(d.id);
      }
    })(),
  ]);

  const stmt = db.prepare("INSERT OR IGNORE INTO domains (domain, source) VALUES (?, ?)");
  const insertMany = db.transaction((rows) => {
    for (const row of rows) {
      const info = stmt.run(row.domain, row.source);
      if (info.changes > 0) added++;
      else skipped++;
    }
  });
  insertMany(toInsert);

  db.prepare("INSERT INTO agent_logs (agent_name,action,status,result) VALUES (?,?,?,?)").run('system', 'Domain sync', 'success', `+${added} added, ${skipped} skipped`);
  res.json({ success: true, added, skipped, total: added + skipped });
});

router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const domain = db.prepare('SELECT * FROM domains WHERE id=?').get(req.params.id);
  if (!domain) return res.status(404).json({ success: false, error: 'Introuvable' });
  const accounts = db.prepare('SELECT * FROM gw_accounts WHERE domain_id=? ORDER BY created_at DESC').all(req.params.id);
  const incidents = db.prepare('SELECT * FROM incidents WHERE domain_id=? ORDER BY created_at DESC LIMIT 10').all(req.params.id);
  res.json({ success: true, domain, accounts, incidents });
});

router.post('/:id/check-dns', requireAuth, async (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM domains WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ success: false, error: 'Introuvable' });
  const selector = getSetting('dkim_selector') || 'mail';
  const result = await fullDnsCheck(row.domain, selector);
  db.prepare(`UPDATE domains SET spf_status=?,dkim_status=?,dmarc_status=?,bimi_status=?,last_dns_check=datetime('now') WHERE id=?`)
    .run(result.spf.status, result.dkim.status, result.dmarc.status, result.bimi.status, req.params.id);
  db.prepare("INSERT INTO agent_logs (agent_name,action,status,result) VALUES (?,?,?,?)")
    .run('dns_guardian', `DNS check: ${row.domain}`, result.allValid ? 'success' : 'warning',
      `SPF:${result.spf.status} DKIM:${result.dkim.status} DMARC:${result.dmarc.status}`);
  res.json({ success: true, ...result });
});

router.patch('/:id/toggle', requireAuth, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM domains WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ success: false, error: 'Introuvable' });
  const ns = ['active','warming'].includes(row.status) ? 'paused' : 'active';
  db.prepare('UPDATE domains SET status=? WHERE id=?').run(ns, req.params.id);
  res.json({ success: true, status: ns });
});

router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  getDb().prepare('DELETE FROM domains WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
