const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const { loginRequired } = require('../middleware/auth');
const { getDb } = require('../db/index');
const { GoogleWorkspaceService } = require('../services/google-workspace');
const { generateOtp, validateTotpSecret, parseBulkappCsv } = require('../services/otp');
const multer = require('multer');
const upload = multer({ dest: path.join(__dirname, '..', 'gw_creds') });

const GW_CREDS_DIR = path.join(__dirname, '..', 'gw_creds');
if (!fs.existsSync(GW_CREDS_DIR)) fs.mkdirSync(GW_CREDS_DIR, { recursive: true });

function getActiveGw() {
  const db = getDb();
  const row = db.prepare("SELECT * FROM gw_credentials WHERE is_active=1 ORDER BY id DESC LIMIT 1").get();
  if (!row) return { gw: null, cred: null };
  const fp = path.join(GW_CREDS_DIR, row.json_filename);
  if (!fs.existsSync(fp)) return { gw: null, cred: row };
  try { return { gw: new GoogleWorkspaceService(fp, row.admin_email), cred: row }; }
  catch { return { gw: null, cred: row }; }
}

router.get('/gworkspace', loginRequired, async (req, res) => {
  const { gw, cred } = getActiveGw();
  const db = getDb();
  const allCreds = db.prepare('SELECT * FROM gw_credentials ORDER BY is_active DESC, created_at DESC').all();
  const totpCount = db.prepare('SELECT COUNT(*) as c FROM gw_totp_secrets').get().c;
  const recentJobs = db.prepare('SELECT * FROM gw_domain_jobs ORDER BY created_at DESC LIMIT 5').all();
  let stats = { user_count: 0, domain_count: 0, connected: false }, domains = [];
  if (gw) {
    try { domains = await gw.listDomains(); stats = { domain_count: domains.length, connected: true, user_count: '...' }; } catch {}
  }
  res.render('gw_overview', { cred, allCreds, stats, domains, totpCount, recentJobs, gwAvailable: true, page: 'gworkspace' });
});

router.get('/gworkspace/connect', loginRequired, (req, res) => {
  const creds = getDb().prepare('SELECT * FROM gw_credentials ORDER BY is_active DESC, created_at DESC').all();
  res.render('gw_connect', { creds, gwAvailable: true, page: 'gworkspace' });
});

router.post('/gworkspace/connect', loginRequired, upload.single('json_file'), async (req, res) => {
  const action = req.body.action || 'upload';
  const db = getDb();
  if (action === 'upload') {
    const adminEmail = (req.body.admin_email || '').trim();
    const name = (req.body.name || '').trim();
    if (!req.file || !adminEmail) { req.flash('error', 'Fichier JSON et email admin requis'); return res.redirect('/gworkspace/connect'); }
    const fp = req.file.path;
    const v = GoogleWorkspaceService.validateJson(fp);
    if (!v.valid) { fs.unlinkSync(fp); req.flash('error', `JSON invalide: ${v.error}`); return res.redirect('/gworkspace/connect'); }
    try {
      const gwTest = new GoogleWorkspaceService(fp, adminEmail);
      const test = await gwTest.testConnection();
      if (!test.success) { fs.unlinkSync(fp); req.flash('error', `Connexion échouée: ${test.error}`); return res.redirect('/gworkspace/connect'); }
      const info = GoogleWorkspaceService.getJsonInfo(fp);
      const domain = adminEmail.split('@')[1] || '';
      db.prepare('INSERT INTO gw_credentials (name,admin_email,domain,json_filename,project_id,client_email) VALUES (?,?,?,?,?,?)')
        .run(name || domain, adminEmail, domain, path.basename(fp), info.projectId||'', info.clientEmail||'');
      req.flash('success', `Compte Google Workspace connecté !`);
    } catch (e) { fs.unlinkSync(fp); req.flash('error', `Erreur: ${e.message}`); }
  } else if (action === 'activate') {
    db.prepare('UPDATE gw_credentials SET is_active=0').run();
    db.prepare('UPDATE gw_credentials SET is_active=1 WHERE id=?').run(req.body.cred_id);
    req.flash('success', 'Compte activé');
  } else if (action === 'delete') {
    const row = db.prepare('SELECT * FROM gw_credentials WHERE id=?').get(req.body.cred_id);
    if (row) { const fp = path.join(GW_CREDS_DIR, row.json_filename); if (fs.existsSync(fp)) fs.unlinkSync(fp); db.prepare('DELETE FROM gw_credentials WHERE id=?').run(req.body.cred_id); }
    req.flash('success', 'Compte supprimé');
  } else if (action === 'test') {
    const row = db.prepare('SELECT * FROM gw_credentials WHERE id=?').get(req.body.cred_id);
    if (row) {
      try {
        const gwTest = new GoogleWorkspaceService(path.join(GW_CREDS_DIR, row.json_filename), row.admin_email);
        const test = await gwTest.testConnection();
        req.flash(test.success ? 'success' : 'error', test.success ? `OK — ${test.domainCount} domaine(s)` : test.error);
      } catch (e) { req.flash('error', e.message); }
    }
  }
  res.redirect('/gworkspace/connect');
});

router.get('/gworkspace/users', loginRequired, async (req, res) => {
  const { gw, cred } = getActiveGw();
  if (!gw) { req.flash('warning', 'Connectez un compte GW'); return res.redirect('/gworkspace/connect'); }
  let query = null;
  if (req.query.search) query = `email:${req.query.search}* name:${req.query.search}*`;
  if (req.query.status === 'suspended') query = (query||'') + ' isSuspended=true';
  else if (req.query.status === 'admin') query = (query||'') + ' isAdmin=true';
  let users = [], domains = [];
  try { users = await gw.listUsers({ domain: req.query.domain||undefined, maxResults: 200, query: query||undefined }); domains = await gw.listDomains(); }
  catch (e) { req.flash('error', `Erreur API: ${e.message}`); }
  res.render('gw_users', { users, domains, cred, domain_filter: req.query.domain||'', search: req.query.search||'', status_filter: req.query.status||'', page: 'gworkspace' });
});

router.post('/gworkspace/users/:email/suspend', loginRequired, async (req, res) => {
  const { gw } = getActiveGw();
  if (!gw) return res.redirect('/gworkspace/connect');
  const suspend = req.body.suspend !== '0';
  const r = await gw.suspendUser(req.params.email, suspend);
  req.flash(r.success ? 'success' : 'error', r.success ? `${suspend ? 'Suspendu' : 'Réactivé'}: ${req.params.email}` : r.error);
  res.redirect('/gworkspace/users');
});

router.post('/gworkspace/users/:email/delete', loginRequired, async (req, res) => {
  const { gw } = getActiveGw();
  if (!gw) return res.redirect('/gworkspace/connect');
  const r = await gw.deleteUser(req.params.email);
  req.flash(r.success ? 'success' : 'error', r.success ? `Supprimé: ${req.params.email}` : r.error);
  res.redirect('/gworkspace/users');
});

router.post('/gworkspace/users/:email/reset-password', loginRequired, async (req, res) => {
  const { gw } = getActiveGw();
  if (!gw) return res.redirect('/gworkspace/connect');
  const r = await gw.resetPassword(req.params.email, req.body.new_password, req.body.force_change !== '0');
  req.flash(r.success ? 'success' : 'error', r.success ? `MDP réinitialisé: ${req.params.email}` : r.error);
  res.redirect('/gworkspace/users');
});

router.post('/gworkspace/users/:email/make-admin', loginRequired, async (req, res) => {
  const { gw } = getActiveGw();
  if (!gw) return res.redirect('/gworkspace/connect');
  const isAdmin = req.body.is_admin !== '0';
  const r = await gw.makeAdmin(req.params.email, isAdmin);
  req.flash(r.success ? 'success' : 'error', r.success ? `Admin ${isAdmin ? 'accordé' : 'retiré'}: ${req.params.email}` : r.error);
  res.redirect('/gworkspace/users');
});

router.get('/gworkspace/create-users', loginRequired, async (req, res) => {
  const { gw, cred } = getActiveGw();
  if (!gw) { req.flash('warning', 'Connectez un compte GW'); return res.redirect('/gworkspace/connect'); }
  let domains = [];
  try { domains = await gw.listDomains(); } catch {}
  const recent = getDb().prepare('SELECT * FROM gw_created_users ORDER BY created_at DESC LIMIT 50').all();
  res.render('gw_create_users', { cred, domains, recent, page: 'gworkspace' });
});

router.post('/gworkspace/create-users', loginRequired, async (req, res) => {
  const { gw, cred } = getActiveGw();
  if (!gw) return res.redirect('/gworkspace/connect');
  const count = Math.min(Math.max(parseInt(req.body.count)||1, 1), 200);
  const domain = (req.body.domain||'').trim();
  const password = (req.body.password||'Azerty@123').trim();
  if (!domain) { req.flash('error', 'Domaine requis'); return res.redirect('/gworkspace/create-users'); }
  try {
    const results = await gw.bulkCreateUsers(count, domain, password);
    const db = getDb();
    const stmt = db.prepare('INSERT OR IGNORE INTO gw_created_users (email,password,first_name,last_name,domain,credential_id,status) VALUES (?,?,?,?,?,?,?)');
    for (const u of results.created) stmt.run(u.email, u.password, u.firstName, u.lastName, domain, cred?.id, 'created');
    db.prepare("INSERT INTO agent_logs (agent_name,action,status,result) VALUES (?,?,?,?)")
      .run('system', `Création ${count} users sur ${domain}`, 'success', `${results.createdCount} créés, ${results.failedCount} échoués`);
    req.flash('success', `${results.createdCount} utilisateurs créés sur ${domain}`);
  } catch (e) { req.flash('error', e.message); }
  res.redirect('/gworkspace/create-users');
});

router.get('/gworkspace/domain-change', loginRequired, async (req, res) => {
  const { gw, cred } = getActiveGw();
  if (!gw) { req.flash('warning', 'Connectez un compte GW'); return res.redirect('/gworkspace/connect'); }
  let domains = [], usersPreview = [];
  try { domains = await gw.listDomains(); if (req.query.src_domain) usersPreview = await gw.listUsers({ domain: req.query.src_domain, maxResults: 500 }); } catch {}
  const recentJobs = getDb().prepare('SELECT * FROM gw_domain_jobs ORDER BY created_at DESC LIMIT 10').all();
  res.render('gw_domain_change', { gw: !!gw, cred, domains, usersPreview, srcDomain: req.query.src_domain||'', recentJobs, page: 'gworkspace' });
});

router.get('/gworkspace/2fa', loginRequired, (req, res) => {
  const db = getDb();
  const search = req.query.search || '';
  let items = search
    ? db.prepare("SELECT * FROM gw_totp_secrets WHERE email LIKE ? ORDER BY email").all(`%${search}%`)
    : db.prepare('SELECT * FROM gw_totp_secrets ORDER BY email').all();
  items = items.map(i => { if (i.totp_secret) { const o = generateOtp(i.totp_secret); i.otp_code = o.code; i.otp_remaining = o.remaining; } return i; });
  res.render('gw_2fa', { items, search, page: 'gworkspace' });
});

router.post('/gworkspace/2fa', loginRequired, (req, res) => {
  const db = getDb();
  const action = req.body.action || 'add';
  if (action === 'add') {
    const email = (req.body.email||'').trim().toLowerCase();
    if (!email) { req.flash('error', 'Email requis'); return res.redirect('/gworkspace/2fa'); }
    const secret = (req.body.totp_secret||'').trim().toUpperCase().replace(/\s/g, '');
    if (secret && !validateTotpSecret(secret)) { req.flash('error', 'Secret TOTP invalide'); return res.redirect('/gworkspace/2fa'); }
    db.prepare('INSERT OR REPLACE INTO gw_totp_secrets (email,password,totp_secret,app_password,notes,source) VALUES (?,?,?,?,?,?)')
      .run(email, req.body.password||'', secret, req.body.app_password||'', req.body.notes||'', 'manual');
    req.flash('success', `Compte 2FA ajouté: ${email}`);
  } else if (action === 'delete') {
    db.prepare('DELETE FROM gw_totp_secrets WHERE id=?').run(req.body.item_id);
    req.flash('success', 'Supprimé');
  }
  res.redirect('/gworkspace/2fa');
});

router.get('/gworkspace/authenticator', loginRequired, (req, res) => {
  const items = getDb().prepare("SELECT * FROM gw_totp_secrets WHERE totp_secret IS NOT NULL AND totp_secret != '' ORDER BY email").all();
  const accounts = items.map(i => { const o = generateOtp(i.totp_secret); return { ...i, otp_code: o.code||'------', otp_remaining: o.remaining||30 }; });
  res.render('gw_authenticator', { accounts, page: 'gworkspace' });
});

module.exports = router;
