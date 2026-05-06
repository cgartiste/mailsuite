const router = require('express').Router();
const { loginRequired } = require('../middleware/auth');
const { getDb } = require('../db/index');
const { Microsoft365Service } = require('../services/microsoft365');

function getActiveMs() {
  const row = getDb().prepare("SELECT * FROM ms_accounts WHERE is_active=1 LIMIT 1").get();
  if (!row) return { ms: null, account: null };
  try { return { ms: new Microsoft365Service({ tenantId: row.tenant_id, clientId: row.client_id, clientSecret: row.client_secret }), account: row }; }
  catch { return { ms: null, account: row }; }
}

router.get('/microsoft', loginRequired, async (req, res) => {
  const db = getDb();
  const accounts = db.prepare('SELECT * FROM ms_accounts ORDER BY is_active DESC, created_at DESC').all();
  const { ms, account } = getActiveMs();
  let stats = { connected: false }, domains = [];
  if (ms) {
    try {
      const s = await ms.getStats();
      if (s.success) { stats = { ...s, connected: true }; domains = s.domains || []; }
    } catch {}
  }
  res.render('ms365_overview', { accounts, activeAccount: account, stats, domains, page: 'microsoft' });
});

router.post('/microsoft/accounts/add', loginRequired, async (req, res) => {
  const { name, tenant_id, client_id, client_secret } = req.body;
  if (!name || !tenant_id || !client_id || !client_secret) { req.flash('error', 'Tous les champs requis'); return res.redirect('/microsoft'); }
  try {
    const ms = new Microsoft365Service({ tenantId: tenant_id, clientId: client_id, clientSecret: client_secret });
    const test = await ms.testConnection();
    if (!test.success) { req.flash('error', `Connexion échouée: ${test.error}`); return res.redirect('/microsoft'); }
    const db = getDb();
    db.prepare('INSERT INTO ms_accounts (name,tenant_id,client_id,client_secret,domain,is_active,total_users) VALUES (?,?,?,?,?,1,?)')
      .run(name, tenant_id, client_id, client_secret, test.domains?.[0]?.id||'', test.domainCount||0);
    req.flash('success', `Compte Microsoft 365 "${name}" connecté — ${test.domainCount} domaine(s)`);
  } catch (e) { req.flash('error', e.message); }
  res.redirect('/microsoft');
});

router.post('/microsoft/accounts/:id/activate', loginRequired, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE ms_accounts SET is_active=0').run();
  db.prepare('UPDATE ms_accounts SET is_active=1 WHERE id=?').run(req.params.id);
  req.flash('success', 'Compte activé');
  res.redirect('/microsoft');
});

router.post('/microsoft/accounts/:id/delete', loginRequired, (req, res) => {
  getDb().prepare('DELETE FROM ms_accounts WHERE id=?').run(req.params.id);
  req.flash('success', 'Compte supprimé');
  res.redirect('/microsoft');
});

router.get('/microsoft/users', loginRequired, async (req, res) => {
  const { ms, account } = getActiveMs();
  if (!ms) { req.flash('warning', 'Connectez un compte Microsoft 365'); return res.redirect('/microsoft'); }
  let users = [], domains = [];
  try { users = await ms.listUsers({ domain: req.query.domain||undefined }); domains = await ms.listDomains(); } catch {}
  res.render('ms365_users', { users, domains, account, domain_filter: req.query.domain||'', page: 'microsoft' });
});

router.post('/microsoft/users/create', loginRequired, async (req, res) => {
  const { ms, account } = getActiveMs();
  if (!ms) return res.redirect('/microsoft');
  const { display_name, email, password } = req.body;
  try {
    await ms.createUser({ displayName: display_name, email, password });
    const db = getDb();
    db.prepare('INSERT INTO ms_created_users (email,display_name,password,domain,ms_account_id) VALUES (?,?,?,?,?)')
      .run(email, display_name, password, email.split('@')[1], account?.id);
    req.flash('success', `Utilisateur ${email} créé`);
  } catch (e) { req.flash('error', e.message); }
  res.redirect('/microsoft/users');
});

router.post('/microsoft/users/bulk-create', loginRequired, async (req, res) => {
  const { ms, account } = getActiveMs();
  if (!ms) return res.redirect('/microsoft');
  const count = Math.min(parseInt(req.body.count)||1, 200);
  const domain = req.body.domain;
  const password = req.body.password || 'Azerty@123';
  try {
    const results = await ms.bulkCreateUsers(count, domain, password);
    const db = getDb();
    const stmt = db.prepare('INSERT INTO ms_created_users (email,display_name,password,domain,ms_account_id) VALUES (?,?,?,?,?)');
    for (const u of results.created) stmt.run(u.email, `${u.firstName} ${u.lastName}`, u.password, domain, account?.id);
    req.flash('success', `${results.createdCount} utilisateurs créés sur ${domain}`);
  } catch (e) { req.flash('error', e.message); }
  res.redirect('/microsoft/users');
});

module.exports = router;
