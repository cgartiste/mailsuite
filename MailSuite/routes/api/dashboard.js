const router = require('express').Router();
const { requireAuth } = require('./middleware');
const { getDb, getSetting } = require('../../db/index');
const { CloudflareService } = require('../../services/cloudflare');
const { GoogleWorkspaceService } = require('../../services/google-workspace');
const path = require('path');
const fs = require('fs');

const GW_CREDS_DIR = path.join(__dirname, '..', '..', 'gw_creds');

// Background GW sync (non-blocking) for accounts never synced
async function syncGwIfStale(db) {
  try {
    const stale = db.prepare('SELECT * FROM gw_credentials WHERE (last_sync IS NULL OR active_users=0) AND status="connected"').all();
    for (const cred of stale) {
      const fp = path.join(GW_CREDS_DIR, cred.json_filename);
      if (!fs.existsSync(fp)) continue;
      const gw = new GoogleWorkspaceService(fp, cred.admin_email);
      const domains = await gw.listDomains().catch(() => []);
      let total = 0, active = 0, suspended = 0;
      for (const d of domains) {
        const users = await gw.listUsers({ domain: d.domainName, maxResults: 500 }).catch(() => []);
        total += users.length;
        active += users.filter(u => !u.suspended).length;
        suspended += users.filter(u => u.suspended).length;
      }
      db.prepare('UPDATE gw_credentials SET total_users=?,active_users=?,suspended_users=?,domain_count=?,last_sync=datetime("now"),status=? WHERE id=?')
        .run(total, active, suspended, domains.length, 'connected', cred.id);
    }
  } catch {}
}

router.get('/', requireAuth, async (req, res) => {
  const db = getDb();

  // ─── Google Workspace ───────────────────────────────────────
  // Count from gw_credentials table
  const gwAll = db.prepare('SELECT * FROM gw_credentials').all();
  const gwConnected = gwAll.filter(r => r.status === 'connected');
  const gwActiveUsers = gwConnected.reduce((s, r) => s + (r.active_users || 0), 0);
  const gwTotalUsers = gwConnected.reduce((s, r) => s + (r.total_users || 0), 0);

  // If any GW account has never been synced, trigger background sync (non-blocking)
  const hasStale = gwConnected.some(r => !r.last_sync || r.total_users === 0);
  if (hasStale) {
    syncGwIfStale(db).catch(() => {}); // fire-and-forget
  }

  // ─── Cloudflare ─────────────────────────────────────────────
  let cfAccountsCount = db.prepare('SELECT COUNT(*) as c FROM cf_accounts').get().c;
  let cfZoneCount     = db.prepare('SELECT COALESCE(SUM(zone_count),0) as c FROM cf_accounts').get().c;

  // Legacy token in settings — read from cache only (never live on dashboard)
  if (cfAccountsCount === 0) {
    const legacyToken = getSetting('cloudflare_api_token');
    if (legacyToken) {
      cfAccountsCount = 1;
      const cached = getSetting('cf_zone_count_cache');
      cfZoneCount = cached ? parseInt(cached) : 0;
    }
  }

  // ─── Microsoft ───────────────────────────────────────────────
  const msRow = db.prepare('SELECT COUNT(*) as accounts, COALESCE(SUM(active_users),0) as active_users FROM ms_accounts').get();

  res.json({
    success: true,
    stats: {
      total_domains:    db.prepare('SELECT COUNT(*) as c FROM domains').get().c,
      active_domains:   db.prepare("SELECT COUNT(*) as c FROM domains WHERE status='active'").get().c,
      total_accounts:   db.prepare('SELECT COUNT(*) as c FROM gw_accounts').get().c,
      active_accounts:  db.prepare("SELECT COUNT(*) as c FROM gw_accounts WHERE status='active'").get().c,
      total_campaigns:  db.prepare('SELECT COUNT(*) as c FROM campaigns').get().c,
      running_campaigns:db.prepare("SELECT COUNT(*) as c FROM campaigns WHERE status='running'").get().c,
      total_contacts:   db.prepare("SELECT COUNT(*) as c FROM contacts WHERE status='active'").get().c,
      gw_created_users: db.prepare('SELECT COUNT(*) as c FROM gw_created_users').get().c,
      suppression_count:db.prepare('SELECT COUNT(*) as c FROM suppression_list').get().c,
      total_sent:       db.prepare('SELECT COALESCE(SUM(sent_count),0) as c FROM campaigns').get().c,
      open_incidents:   db.prepare("SELECT COUNT(*) as c FROM incidents WHERE resolved=0").get().c,
      // Google Workspace
      gw_accounts_count: gwAll.length,
      gw_active_users:   gwActiveUsers,
      gw_total_users:    gwTotalUsers,
      gw_syncing:        hasStale, // tells frontend a sync is in progress
      // Cloudflare
      cf_accounts_count: cfAccountsCount,
      cf_zone_count:     cfZoneCount,
      // Microsoft
      ms_accounts_count: msRow.accounts,
      ms_active_users:   msRow.active_users,
    },
    domains: db.prepare(`SELECT d.*, (SELECT COUNT(*) FROM incidents WHERE domain_id=d.id AND resolved=0) as open_incidents
      FROM domains d ORDER BY created_at DESC LIMIT 8`).all(),
    recent_logs: db.prepare('SELECT * FROM agent_logs ORDER BY created_at DESC LIMIT 8').all(),
    active_campaigns: db.prepare(`SELECT c.id,c.name,c.status,c.sent_count,c.total_recipients,c.open_count,c.bounce_count,d.domain
      FROM campaigns c LEFT JOIN domains d ON c.domain_id=d.id WHERE c.status IN ('running','scheduled') ORDER BY c.started_at DESC LIMIT 5`).all(),
    incidents: db.prepare(`SELECT i.*,d.domain as domain_name FROM incidents i LEFT JOIN domains d ON i.domain_id=d.id WHERE i.resolved=0
      ORDER BY CASE i.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, i.created_at DESC LIMIT 5`).all(),
  });
});

module.exports = router;
