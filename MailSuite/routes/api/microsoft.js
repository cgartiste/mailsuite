const router = require('express').Router();
const { requireAuth } = require('./middleware');
const { getDb } = require('../../db/index');
const { Microsoft365Service, getMsInstance, invalidateMsInstance } = require('../../services/microsoft365');

function getActiveRow() {
  return getDb().prepare("SELECT * FROM ms_accounts WHERE is_active=1 LIMIT 1").get() || null;
}

function getMs() {
  const row = getActiveRow();
  if (!row) return null;
  return getMsInstance(row.id, row);
}

// ─── Accounts ─────────────────────────────────────────────────────────────────
router.get('/accounts', requireAuth, (req, res) => {
  res.json({ success: true, accounts: getDb().prepare('SELECT * FROM ms_accounts ORDER BY is_active DESC, created_at DESC').all() });
});

router.post('/accounts', requireAuth, async (req, res) => {
  const { name, tenant_id, client_id, client_secret } = req.body;
  if (!name || !tenant_id || !client_id || !client_secret) return res.status(400).json({ success: false, error: 'Tous les champs requis' });
  try {
    const ms = new Microsoft365Service({ tenantId: tenant_id, clientId: client_id, clientSecret: client_secret });
    const test = await ms.testConnection();
    if (!test.success) return res.status(400).json({ success: false, error: test.error });
    const db = getDb();
    const r = db.prepare('INSERT INTO ms_accounts (name,tenant_id,client_id,client_secret,domain,is_active,total_users) VALUES (?,?,?,?,?,1,?)')
      .run(name, tenant_id, client_id, client_secret, test.domains?.[0]?.id || '', test.domainCount || 0);
    res.json({ success: true, id: r.lastInsertRowid });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.patch('/accounts/:id/activate', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE ms_accounts SET is_active=0').run();
  db.prepare('UPDATE ms_accounts SET is_active=1 WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

router.delete('/accounts/:id', requireAuth, (req, res) => {
  invalidateMsInstance(req.params.id);
  getDb().prepare('DELETE FROM ms_accounts WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ─── Stats ────────────────────────────────────────────────────────────────────
router.get('/stats', requireAuth, async (req, res) => {
  const ms = getMs();
  if (!ms) return res.status(400).json({ success: false, error: 'Aucun compte MS365 actif' });
  try { res.json(await ms.getStats()); } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/stats/fast', requireAuth, async (req, res) => {
  const ms = getMs();
  if (!ms) return res.status(400).json({ success: false, error: 'Aucun compte MS365 actif' });
  try { res.json(await ms.fastGetStats()); } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── Users ────────────────────────────────────────────────────────────────────
router.get('/users', requireAuth, async (req, res) => {
  const ms = getMs();
  if (!ms) return res.status(400).json({ success: false, error: 'Aucun compte MS365 actif' });
  try { res.json({ success: true, users: await ms.listUsers({ domain: req.query.domain }) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/users/:id', requireAuth, async (req, res) => {
  const ms = getMs();
  if (!ms) return res.status(400).json({ success: false, error: 'Aucun compte MS365 actif' });
  try { res.json({ success: true, user: await ms.getUserDetails(req.params.id) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/users', requireAuth, async (req, res) => {
  const ms = getMs();
  if (!ms) return res.status(400).json({ success: false, error: 'Non configuré' });
  try { const user = await ms.createUser(req.body); res.json({ success: true, user }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/users/:id', requireAuth, async (req, res) => {
  const ms = getMs();
  if (!ms) return res.status(400).json({ success: false, error: 'Non configuré' });
  res.json(await ms.deleteUser(req.params.id));
});

router.post('/users/:id/enable', requireAuth, async (req, res) => {
  const ms = getMs();
  if (!ms) return res.status(400).json({ success: false, error: 'Non configuré' });
  res.json(await ms.enableUser(req.params.id));
});

router.post('/users/:id/disable', requireAuth, async (req, res) => {
  const ms = getMs();
  if (!ms) return res.status(400).json({ success: false, error: 'Non configuré' });
  res.json(await ms.disableUser(req.params.id));
});

router.post('/users/:id/reset-password', requireAuth, async (req, res) => {
  const ms = getMs();
  if (!ms) return res.status(400).json({ success: false, error: 'Non configuré' });
  const { password, forceChange } = req.body;
  if (!password) return res.status(400).json({ success: false, error: 'Mot de passe requis' });
  res.json(await ms.resetPassword(req.params.id, password, forceChange !== false));
});

router.post('/users/:id/assign-license', requireAuth, async (req, res) => {
  const ms = getMs();
  if (!ms) return res.status(400).json({ success: false, error: 'Non configuré' });
  const { skuId } = req.body;
  if (!skuId) return res.status(400).json({ success: false, error: 'skuId requis' });
  res.json(await ms.assignLicense(req.params.id, skuId));
});

router.post('/users/:id/remove-license', requireAuth, async (req, res) => {
  const ms = getMs();
  if (!ms) return res.status(400).json({ success: false, error: 'Non configuré' });
  const { skuId } = req.body;
  if (!skuId) return res.status(400).json({ success: false, error: 'skuId requis' });
  res.json(await ms.removeLicense(req.params.id, skuId));
});

router.get('/users/:id/mfa', requireAuth, async (req, res) => {
  const ms = getMs();
  if (!ms) return res.status(400).json({ success: false, error: 'Non configuré' });
  res.json(await ms.getUserMfaStatus(req.params.id));
});

router.post('/users/bulk', requireAuth, async (req, res) => {
  const ms = getMs();
  if (!ms) return res.status(400).json({ success: false, error: 'Non configuré' });
  const { domain, count, password } = req.body;
  if (!domain) return res.status(400).json({ success: false, error: 'Domaine requis' });
  try {
    const results = await ms.bulkCreateUsers(Math.min(parseInt(count) || 1, 200), domain, password || 'Azerty@123');
    const db = getDb();
    const acct = getActiveRow();
    const stmt = db.prepare('INSERT INTO ms_created_users (email,display_name,password,domain,ms_account_id) VALUES (?,?,?,?,?)');
    for (const u of results.created) stmt.run(u.email, `${u.firstName} ${u.lastName}`, u.password, domain, acct?.id);
    res.json({ success: true, createdCount: results.createdCount, failedCount: results.failedCount });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/users/bulk-license', requireAuth, async (req, res) => {
  const ms = getMs();
  if (!ms) return res.status(400).json({ success: false, error: 'Non configuré' });
  const { userIds, skuId } = req.body;
  if (!userIds?.length || !skuId) return res.status(400).json({ success: false, error: 'userIds et skuId requis' });
  try { res.json({ success: true, results: await ms.bulkAssignLicense(userIds, skuId) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── Groups ───────────────────────────────────────────────────────────────────
router.get('/groups', requireAuth, async (req, res) => {
  const ms = getMs();
  if (!ms) return res.status(400).json({ success: false, error: 'Non configuré' });
  try { res.json({ success: true, groups: await ms.listGroups() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/groups', requireAuth, async (req, res) => {
  const ms = getMs();
  if (!ms) return res.status(400).json({ success: false, error: 'Non configuré' });
  try { res.json({ success: true, group: await ms.createGroup(req.body) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.delete('/groups/:id', requireAuth, async (req, res) => {
  const ms = getMs();
  if (!ms) return res.status(400).json({ success: false, error: 'Non configuré' });
  res.json(await ms.deleteGroup(req.params.id));
});

router.get('/groups/:id/members', requireAuth, async (req, res) => {
  const ms = getMs();
  if (!ms) return res.status(400).json({ success: false, error: 'Non configuré' });
  try { res.json({ success: true, members: await ms.listGroupMembers(req.params.id) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/groups/:id/members', requireAuth, async (req, res) => {
  const ms = getMs();
  if (!ms) return res.status(400).json({ success: false, error: 'Non configuré' });
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ success: false, error: 'userId requis' });
  res.json(await ms.addGroupMember(req.params.id, userId));
});

router.delete('/groups/:id/members/:userId', requireAuth, async (req, res) => {
  const ms = getMs();
  if (!ms) return res.status(400).json({ success: false, error: 'Non configuré' });
  res.json(await ms.removeGroupMember(req.params.id, req.params.userId));
});

// ─── Domains ──────────────────────────────────────────────────────────────────
router.get('/domains', requireAuth, async (req, res) => {
  const ms = getMs();
  if (!ms) return res.status(400).json({ success: false, error: 'Non configuré' });
  try { res.json({ success: true, domains: await ms.listDomains() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/domains/:id/dns', requireAuth, async (req, res) => {
  const ms = getMs();
  if (!ms) return res.status(400).json({ success: false, error: 'Non configuré' });
  try { res.json({ success: true, records: await ms.getDomainDnsRecords(req.params.id) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/domains/:id/dns', requireAuth, async (req, res) => {
  const ms = getMs();
  if (!ms) return res.status(400).json({ success: false, error: 'Non configuré' });
  try { res.json({ success: true, record: await ms.addDomainDnsRecord(req.params.id, req.body) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── Licenses ─────────────────────────────────────────────────────────────────
router.get('/licenses', requireAuth, async (req, res) => {
  const ms = getMs();
  if (!ms) return res.status(400).json({ success: false, error: 'Non configuré' });
  try { res.json({ success: true, skus: await ms.getSubscribedSkus() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── Audit Logs ───────────────────────────────────────────────────────────────
router.get('/sign-in-logs', requireAuth, async (req, res) => {
  const ms = getMs();
  if (!ms) return res.status(400).json({ success: false, error: 'Non configuré' });
  try { res.json({ success: true, logs: await ms.listSignInLogs({ top: parseInt(req.query.top) || 50, filter: req.query.filter }) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.get('/audit-logs', requireAuth, async (req, res) => {
  const ms = getMs();
  if (!ms) return res.status(400).json({ success: false, error: 'Non configuré' });
  try { res.json({ success: true, logs: await ms.listAuditLogs({ top: parseInt(req.query.top) || 50, filter: req.query.filter }) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── Mailboxes ────────────────────────────────────────────────────────────────
router.get('/mailboxes', requireAuth, async (req, res) => {
  const ms = getMs();
  if (!ms) return res.status(400).json({ success: false, error: 'Non configuré' });
  try { res.json({ success: true, mailboxes: await ms.listSharedMailboxes() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

router.post('/mailboxes', requireAuth, async (req, res) => {
  const ms = getMs();
  if (!ms) return res.status(400).json({ success: false, error: 'Non configuré' });
  try { res.json({ success: true, mailbox: await ms.createSharedMailbox(req.body) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ─── Export ───────────────────────────────────────────────────────────────────
router.get('/export/users', requireAuth, async (req, res) => {
  const ms = getMs();
  if (!ms) return res.status(400).json({ success: false, error: 'Non configuré' });
  try {
    const csv = await ms.exportUsersCSV(req.query.domain);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="ms365-users-${Date.now()}.csv"`);
    res.send(csv);
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

module.exports = router;
