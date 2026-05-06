/**
 * ACCOUNTS G — Multi Google Workspace Account Cards + Detail Pages
 * Shows ultra-modern cards per GW account with live stats from the API.
 */
const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const { loginRequired } = require('../middleware/auth');
const { getDb } = require('../db/index');
const { GoogleWorkspaceService } = require('../services/google-workspace');

const GW_CREDS_DIR = path.join(__dirname, '..', 'gw_creds');

function buildGw(cred) {
  const fp = path.join(GW_CREDS_DIR, cred.json_filename);
  if (!fs.existsSync(fp)) return null;
  try { return new GoogleWorkspaceService(fp, cred.admin_email); } catch { return null; }
}

router.get('/accounts-g', loginRequired, async (req, res) => {
  const db = getDb();
  const creds = db.prepare('SELECT * FROM gw_credentials ORDER BY is_active DESC, created_at DESC').all();
  const accountCards = [];

  for (const cred of creds) {
    const gw = buildGw(cred);
    const card = { ...cred, domains: [], totalUsers: 0, activeUsers: 0, suspendedUsers: 0, connected: false };
    if (gw) {
      try {
        const domains = await gw.listDomains();
        card.domains = domains;
        card.connected = true;
        let total = 0, active = 0, suspended = 0;
        for (const d of domains) {
          try {
            const users = await gw.listUsers({ domain: d.domainName, maxResults: 500 });
            total += users.length;
            active += users.filter(u => !u.suspended).length;
            suspended += users.filter(u => u.suspended).length;
          } catch {}
        }
        card.totalUsers = total;
        card.activeUsers = active;
        card.suspendedUsers = suspended;
        // Update DB cache
        db.prepare('UPDATE gw_credentials SET total_users=?, active_users=?, suspended_users=?, domain_count=?, last_sync=datetime("now"), status=? WHERE id=?')
          .run(total, active, suspended, domains.length, 'connected', cred.id);
      } catch { card.connected = false; }
    }
    accountCards.push(card);
  }

  res.render('accounts_g', { accountCards, page: 'accounts-g' });
});

router.get('/accounts-g/:id', loginRequired, async (req, res) => {
  const db = getDb();
  const cred = db.prepare('SELECT * FROM gw_credentials WHERE id=?').get(req.params.id);
  if (!cred) { req.flash('error', 'Compte introuvable'); return res.redirect('/accounts-g'); }
  const gw = buildGw(cred);
  let domains = [], allUsers = [], orgUnits = [], groups = [];
  let stats = { total: 0, active: 0, suspended: 0, twoFaOn: 0, admins: 0 };

  if (gw) {
    try {
      domains = await gw.listDomains();
      orgUnits = await gw.listOrgUnits();
      for (const d of domains) {
        try {
          const users = await gw.listUsers({ domain: d.domainName, maxResults: 500 });
          allUsers.push(...users.map(u => ({
            email: u.primaryEmail, name: u.name?.fullName||'',
            suspended: !!u.suspended, twoFa: !!u.isEnrolledIn2Sv,
            admin: !!u.isAdmin, orgUnit: u.orgUnitPath||'/',
            creationTime: u.creationTime, lastLoginTime: u.lastLoginTime,
            domain: d.domainName,
          })));
        } catch {}
        try { const g = await gw.listGroups(d.domainName); groups.push(...g); } catch {}
      }
      stats.total = allUsers.length;
      stats.active = allUsers.filter(u => !u.suspended).length;
      stats.suspended = allUsers.filter(u => u.suspended).length;
      stats.twoFaOn = allUsers.filter(u => u.twoFa).length;
      stats.admins = allUsers.filter(u => u.admin).length;
    } catch {}
  }

  const createdUsers = db.prepare('SELECT * FROM gw_created_users WHERE credential_id=? ORDER BY created_at DESC LIMIT 50').all(cred.id);
  const deletedStats = {};
  for (const d of domains) {
    const row = db.prepare('SELECT deleted_count FROM gw_domain_deleted WHERE domain=?').get(d.domainName);
    deletedStats[d.domainName] = row ? row.deleted_count : 0;
  }

  res.render('accounts_g_detail', { cred, domains, allUsers, orgUnits, groups, stats, createdUsers, deletedStats, page: 'accounts-g' });
});

// Suspend/unsuspend from accounts-g detail
router.post('/accounts-g/:id/users/:email/suspend', loginRequired, async (req, res) => {
  const cred = getDb().prepare('SELECT * FROM gw_credentials WHERE id=?').get(req.params.id);
  if (!cred) return res.redirect('/accounts-g');
  const gw = buildGw(cred);
  if (!gw) return res.redirect('/accounts-g');
  const suspend = req.body.suspend !== '0';
  const r = await gw.suspendUser(req.params.email, suspend);
  req.flash(r.success ? 'success' : 'error', r.success ? `${suspend?'Suspendu':'Réactivé'}: ${req.params.email}` : r.error);
  res.redirect(`/accounts-g/${req.params.id}`);
});

router.post('/accounts-g/:id/users/:email/delete', loginRequired, async (req, res) => {
  const cred = getDb().prepare('SELECT * FROM gw_credentials WHERE id=?').get(req.params.id);
  if (!cred) return res.redirect('/accounts-g');
  const gw = buildGw(cred);
  if (!gw) return res.redirect('/accounts-g');
  const r = await gw.deleteUser(req.params.email);
  req.flash(r.success ? 'success' : 'error', r.success ? `Supprimé: ${req.params.email}` : r.error);
  res.redirect(`/accounts-g/${req.params.id}`);
});

router.post('/accounts-g/:id/users/:email/reset-password', loginRequired, async (req, res) => {
  const cred = getDb().prepare('SELECT * FROM gw_credentials WHERE id=?').get(req.params.id);
  if (!cred) return res.redirect('/accounts-g');
  const gw = buildGw(cred);
  if (!gw) return res.redirect('/accounts-g');
  const r = await gw.resetPassword(req.params.email, req.body.new_password);
  req.flash(r.success ? 'success' : 'error', r.success ? `MDP réinitialisé: ${req.params.email}` : r.error);
  res.redirect(`/accounts-g/${req.params.id}`);
});

module.exports = router;
