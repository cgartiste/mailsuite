const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { requireAuth } = require('./middleware');
const { getDb } = require('../../db/index');
const { GoogleWorkspaceService } = require('../../services/google-workspace');
const { generateOtp, validateTotpSecret } = require('../../services/otp');

const GW_CREDS_DIR = path.join(__dirname, '..', '..', 'gw_creds');
if (!fs.existsSync(GW_CREDS_DIR)) fs.mkdirSync(GW_CREDS_DIR, { recursive: true });

const upload = multer({ dest: GW_CREDS_DIR, fileFilter:(r,f,cb)=>cb(null, f.originalname.endsWith('.json')) });

function buildGw(cred) {
  const fp = path.join(GW_CREDS_DIR, cred.json_filename);
  if (!fs.existsSync(fp)) return null;
  try { return new GoogleWorkspaceService(fp, cred.admin_email); } catch { return null; }
}

function getActiveGw() {
  const row = getDb().prepare("SELECT * FROM gw_credentials WHERE is_active=1 ORDER BY id DESC LIMIT 1").get();
  if (!row) return null;
  return buildGw(row);
}

// ─── Credentials ────────────────────────────────────────────────
router.get('/credentials', requireAuth, (req, res) => {
  res.json({ success: true, credentials: getDb().prepare('SELECT * FROM gw_credentials ORDER BY is_active DESC, created_at DESC').all() });
});

router.post('/credentials', requireAuth, upload.single('json_file'), async (req, res) => {
  const adminEmail = (req.body.admin_email||'').trim();
  const name = (req.body.name||'').trim();
  if (!req.file || !adminEmail) return res.status(400).json({ success: false, error: 'Fichier JSON et email admin requis' });
  const fp = req.file.path;
  const v = GoogleWorkspaceService.validateJson(fp);
  if (!v.valid) { fs.unlinkSync(fp); return res.status(400).json({ success: false, error: `JSON invalide: ${v.error}` }); }
  try {
    const gw = new GoogleWorkspaceService(fp, adminEmail);
    const test = await gw.testConnection();
    if (!test.success) { fs.unlinkSync(fp); return res.status(400).json({ success: false, error: `Connexion échouée: ${test.error}` }); }
    const info = GoogleWorkspaceService.getJsonInfo(fp);
    const domain = adminEmail.split('@')[1]||'';
    const db = getDb();
    const r = db.prepare('INSERT INTO gw_credentials (name,admin_email,domain,json_filename,project_id,client_email) VALUES (?,?,?,?,?,?)')
      .run(name||domain, adminEmail, domain, path.basename(fp), info.projectId||'', info.clientEmail||'');
    res.json({ success: true, id: r.lastInsertRowid });
  } catch(e) { try { fs.unlinkSync(fp); } catch {} res.status(500).json({ success: false, error: e.message }); }
});

router.patch('/credentials/:id/activate', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE gw_credentials SET is_active=0').run();
  db.prepare('UPDATE gw_credentials SET is_active=1 WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

router.post('/credentials/:id/test', requireAuth, async (req, res) => {
  const row = getDb().prepare('SELECT * FROM gw_credentials WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ success: false, error: 'Introuvable' });
  const gw = buildGw(row);
  if (!gw) return res.status(400).json({ success: false, error: 'Fichier JSON manquant' });
  const test = await gw.testConnection();
  res.json(test);
});

router.delete('/credentials/:id', requireAuth, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM gw_credentials WHERE id=?').get(req.params.id);
  if (row) { const fp = path.join(GW_CREDS_DIR, row.json_filename); if (fs.existsSync(fp)) fs.unlinkSync(fp); }
  db.prepare('DELETE FROM gw_credentials WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ─── Users ──────────────────────────────────────────────────────
router.get('/users', requireAuth, async (req, res) => {
  const gw = getActiveGw();
  if (!gw) return res.status(400).json({ success: false, error: 'Aucun compte GW actif' });
  try { res.json({ success: true, users: await gw.listUsers({ domain: req.query.domain, maxResults: 200 }) }); }
  catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

router.patch('/users/:email/suspend', requireAuth, async (req, res) => {
  const gw = getActiveGw(); if (!gw) return res.status(400).json({ success: false, error: 'Non configuré' });
  res.json(await gw.suspendUser(req.params.email, req.body.suspend !== false));
});

router.patch('/users/:email/reset-password', requireAuth, async (req, res) => {
  const gw = getActiveGw(); if (!gw) return res.status(400).json({ success: false, error: 'Non configuré' });
  res.json(await gw.resetPassword(req.params.email, req.body.new_password));
});

router.delete('/users/:email', requireAuth, async (req, res) => {
  const gw = getActiveGw(); if (!gw) return res.status(400).json({ success: false, error: 'Non configuré' });
  res.json(await gw.deleteUser(req.params.email));
});

// ─── Domains ────────────────────────────────────────────────────
router.get('/domains', requireAuth, async (req, res) => {
  const gw = getActiveGw(); if (!gw) return res.status(400).json({ success: false, error: 'Non configuré' });
  try { res.json({ success: true, domains: await gw.listDomains() }); } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── Bulk Create ────────────────────────────────────────────────
router.post('/create-users', requireAuth, async (req, res) => {
  const gw = getActiveGw(); if (!gw) return res.status(400).json({ success: false, error: 'Non configuré — aucun compte Google Workspace actif' });
  const { domain, count, password } = req.body;
  if (!domain) return res.status(400).json({ success: false, error: 'Domaine requis' });

  const credRow = getDb().prepare("SELECT * FROM gw_credentials WHERE is_active=1 LIMIT 1").get();
  try {
    const results = await gw.bulkCreateUsers(Math.min(parseInt(count)||1, 200), domain, password||'Azerty@123');
    const db = getDb();
    const stmt = db.prepare('INSERT OR IGNORE INTO gw_created_users (email,password,first_name,last_name,domain,credential_id,status) VALUES (?,?,?,?,?,?,?)');
    for (const u of results.created) stmt.run(u.email, u.password, u.firstName, u.lastName, domain, credRow?.id, 'created');
    db.prepare("INSERT INTO agent_logs (agent_name,action,status,result) VALUES (?,?,?,?)")
      .run('system', `Bulk create ${count} users on ${domain}`, 'success', `${results.createdCount} créés, ${results.failedCount} échoués`);

    // If nothing was created, surface the first failure reason
    if (results.createdCount === 0 && results.failed?.length) {
      const firstErr = results.failed[0].error || 'Création échouée';
      return res.status(400).json({ success: false, error: firstErr, failedCount: results.failedCount, failed: results.failed });
    }

    res.json({ success: true, createdCount: results.createdCount, failedCount: results.failedCount, created: results.created, failed: results.failed });
  } catch(e) {
    console.error('[create-users]', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/created-users', requireAuth, (req, res) => {
  const rows = getDb().prepare('SELECT * FROM gw_created_users ORDER BY created_at DESC LIMIT 500').all();
  res.json({ success: true, users: rows });
});

router.get('/export-created', requireAuth, (req, res) => {
  const rows = getDb().prepare('SELECT email,password,first_name,last_name,domain,created_at FROM gw_created_users ORDER BY created_at DESC').all();
  let csv = 'email,password,first_name,last_name,domain,created_at\n';
  rows.forEach(r => { csv += `"${r.email}","${r.password}","${r.first_name}","${r.last_name}","${r.domain}","${r.created_at}"\n`; });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=gw_created_users.csv');
  res.send(csv);
});

// ─── 2FA / TOTP ─────────────────────────────────────────────────
router.get('/totp', requireAuth, (req, res) => {
  const { search } = req.query;
  const db = getDb();
  let items = search ? db.prepare("SELECT * FROM gw_totp_secrets WHERE email LIKE ? ORDER BY email").all(`%${search}%`) : db.prepare('SELECT * FROM gw_totp_secrets ORDER BY email').all();
  items = items.map(i => { if (i.totp_secret) { const o = generateOtp(i.totp_secret); return { ...i, otp_code: o.code, otp_remaining: o.remaining }; } return i; });
  res.json({ success: true, items });
});

router.post('/totp', requireAuth, (req, res) => {
  const { email, password, totp_secret, app_password, notes } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'Email requis' });
  const secret = (totp_secret||'').trim().toUpperCase().replace(/\s/g,'');
  if (secret && !validateTotpSecret(secret)) return res.status(400).json({ success: false, error: 'Secret TOTP invalide (Base32)' });
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO gw_totp_secrets (email,password,totp_secret,app_password,notes,source) VALUES (?,?,?,?,?,?)')
    .run(email.trim().toLowerCase(), password||'', secret, app_password||'', notes||'', 'manual');
  res.json({ success: true });
});

router.delete('/totp/:id', requireAuth, (req, res) => {
  getDb().prepare('DELETE FROM gw_totp_secrets WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

router.get('/otp/:secret', requireAuth, (req, res) => {
  const r = generateOtp(req.params.secret);
  res.json({ code: r.code, remaining: r.remaining, valid: !!r.code });
});

module.exports = router;
