const router = require('express').Router();
const { loginRequired } = require('../middleware/auth');
const { getDb, getSetting } = require('../db/index');
const { fullDnsCheck } = require('../services/dns-checker');
const { generateOtp } = require('../services/otp');
const fetch = require('node-fetch');

router.get('/api/stats', loginRequired, (req, res) => {
  const db = getDb();
  res.json({
    total_domains: db.prepare('SELECT COUNT(*) as c FROM domains').get().c,
    total_accounts: db.prepare('SELECT COUNT(*) as c FROM gw_accounts').get().c,
    total_campaigns: db.prepare('SELECT COUNT(*) as c FROM campaigns').get().c,
    total_contacts: db.prepare("SELECT COUNT(*) as c FROM contacts WHERE status='active'").get().c,
  });
});

router.get('/api/domains/:id/dns', loginRequired, async (req, res) => {
  const row = getDb().prepare('SELECT * FROM domains WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const selector = getSetting('dkim_selector') || 'mail';
  res.json(await fullDnsCheck(row.domain, selector));
});

router.get('/api/n8n/status', loginRequired, async (req, res) => {
  const url = getSetting('n8n_url') || 'http://localhost:5678';
  try { await fetch(`${url}/healthz`, { timeout: 3000 }); res.json({ status: 'online', url }); }
  catch { res.json({ status: 'offline', url }); }
});

router.get('/api/gw/otp/:secret', loginRequired, (req, res) => {
  const r = generateOtp(req.params.secret);
  res.json({ code: r.code, remaining: r.remaining, valid: !!r.code });
});

router.get('/api/gw/users', loginRequired, async (req, res) => {
  const path = require('path'), fs = require('fs');
  const { GoogleWorkspaceService } = require('../services/google-workspace');
  const db = getDb();
  const row = db.prepare("SELECT * FROM gw_credentials WHERE is_active=1 LIMIT 1").get();
  if (!row) return res.json({ success: false, error: 'Non connecté' });
  const fp = path.join(__dirname, '..', 'gw_creds', row.json_filename);
  if (!fs.existsSync(fp)) return res.json({ success: false, error: 'Fichier manquant' });
  try {
    const gw = new GoogleWorkspaceService(fp, row.admin_email);
    const users = await gw.listUsers({ domain: req.query.domain, maxResults: 200 });
    res.json({ success: true, users: users.map(u => ({ email: u.primaryEmail, name: u.name?.fullName||'', suspended: !!u.suspended })) });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

router.get('/api/gw/domain-stats/:domain', loginRequired, async (req, res) => {
  const path = require('path'), fs = require('fs');
  const { GoogleWorkspaceService } = require('../services/google-workspace');
  const db = getDb();
  const row = db.prepare("SELECT * FROM gw_credentials WHERE is_active=1 LIMIT 1").get();
  if (!row) return res.json({ success: false, error: 'Non connecté' });
  const fp = path.join(__dirname, '..', 'gw_creds', row.json_filename);
  try {
    const gw = new GoogleWorkspaceService(fp, row.admin_email);
    res.json(await gw.getDomainStats(req.params.domain));
  } catch (e) { res.json({ success: false, error: e.message }); }
});

router.get('/api/gw/created-users', (req, res) => {
  const rows = getDb().prepare('SELECT * FROM gw_created_users ORDER BY domain, email').all();
  const byDomain = {};
  rows.forEach(r => { const d = r.domain||'unknown'; if (!byDomain[d]) byDomain[d]=[]; byDomain[d].push(r); });
  res.json({ success: true, total: rows.length, by_domain: byDomain, users: rows });
});

router.get('/api/gw/export-created', loginRequired, (req, res) => {
  const rows = getDb().prepare('SELECT email,password,first_name,last_name,domain,created_at FROM gw_created_users ORDER BY created_at DESC').all();
  let csv = 'email,password,first_name,last_name,domain,created_at\n';
  rows.forEach(r => { csv += `${r.email},${r.password},${r.first_name},${r.last_name},${r.domain},${r.created_at}\n`; });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=gw_created_users.csv');
  res.send(csv);
});

router.get('/api/cloudflare/zones', loginRequired, async (req, res) => {
  const { CloudflareService } = require('../services/cloudflare');
  const token = getSetting('cloudflare_api_token');
  if (!CloudflareService.isConfigured(token)) return res.json({ success: false, error: 'Non configuré' });
  res.json(await new CloudflareService(token).getZones());
});

module.exports = router;
