const router = require('express').Router();
const { requireAuth } = require('./middleware');
const { getDb } = require('../../db/index');

// ─── System overview (rich dashboard) ────────────────────────────────────────
router.get('/system', requireAuth, async (req, res) => {
  const db = getDb();

  // GW accounts
  const gwAccounts = db.prepare('SELECT * FROM gw_credentials ORDER BY is_active DESC').all();

  // MS accounts
  const msAccounts = db.prepare('SELECT * FROM ms_accounts ORDER BY is_active DESC').all();

  // CF accounts
  const cfAccounts = db.prepare('SELECT * FROM cf_accounts ORDER BY is_active DESC').all();
  const cfZoneCount = db.prepare("SELECT value FROM settings WHERE key='cf_zone_count_cache'").get()?.value || '0';

  // Domain DNS health
  const domainStats = db.prepare(`SELECT
    COUNT(*) as total,
    SUM(CASE WHEN spf_status='valid' THEN 1 ELSE 0 END) as spf_ok,
    SUM(CASE WHEN dkim_status='valid' THEN 1 ELSE 0 END) as dkim_ok,
    SUM(CASE WHEN dmarc_status='valid' THEN 1 ELSE 0 END) as dmarc_ok,
    SUM(CASE WHEN spf_status='valid' AND dmarc_status='valid' THEN 1 ELSE 0 END) as fully_configured,
    SUM(CASE WHEN last_dns_check IS NOT NULL THEN 1 ELSE 0 END) as checked
    FROM domains`).get();

  // Source breakdown (source column added by sync migration — safe fallback)
  let domainSources = [];
  try { domainSources = db.prepare(`SELECT COALESCE(source,'manual') as source, COUNT(*) as count FROM domains GROUP BY source`).all(); } catch {}

  // Recent operations (last 50 agent logs)
  const recentOps = db.prepare(`SELECT * FROM agent_logs ORDER BY created_at DESC LIMIT 30`).all();

  // Operation stats last 24h
  const opsStats = db.prepare(`SELECT
    COUNT(*) as total,
    SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) as success,
    SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) as errors
    FROM agent_logs WHERE created_at > datetime('now','-24 hours')`).get();

  // Open incidents
  const incidents = db.prepare(`SELECT i.*, d.domain as domain_name FROM incidents i
    LEFT JOIN domains d ON i.domain_id=d.id WHERE i.resolved=0
    ORDER BY CASE i.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, i.created_at DESC`).all();

  // Domains needing attention (SPF/DMARC missing)
  let domainsNeedingAttention = [];
  try {
    domainsNeedingAttention = db.prepare(`SELECT domain, spf_status, dmarc_status, last_dns_check
      FROM domains WHERE (spf_status!='valid' OR dmarc_status!='valid')
      ORDER BY last_dns_check ASC LIMIT 10`).all();
  } catch {
    domainsNeedingAttention = db.prepare(`SELECT domain, spf_status, dmarc_status, last_dns_check
      FROM domains WHERE (spf_status!='valid' OR dmarc_status!='valid') LIMIT 10`).all();
  }

  // GW created users last 7 days
  const recentUsers = db.prepare(`SELECT COUNT(*) as count FROM gw_created_users WHERE created_at > datetime('now','-7 days')`).get() || { count: 0 };

  res.json({
    success: true,
    gw: { accounts: gwAccounts, active: gwAccounts.find(a => a.is_active) },
    ms: { accounts: msAccounts, active: msAccounts.find(a => a.is_active) },
    cf: { accounts: cfAccounts, zone_count: parseInt(cfZoneCount) },
    domains: { ...domainStats, sources: domainSources },
    ops: { ...opsStats, recent: recentOps },
    incidents,
    attention: domainsNeedingAttention,
    recent_users: recentUsers,
  });
});

router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const incidents = db.prepare(`SELECT i.*, d.domain as domain_name FROM incidents i
    LEFT JOIN domains d ON i.domain_id=d.id WHERE i.resolved=0
    ORDER BY CASE i.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, i.created_at DESC`).all();
  const agent_activity = db.prepare(`SELECT agent_name, COUNT(*) as total_runs,
    SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) as success_count,
    SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) as error_count,
    MAX(created_at) as last_run FROM agent_logs WHERE created_at > datetime('now','-24 hours')
    GROUP BY agent_name ORDER BY last_run DESC`).all();
  const domains_health = db.prepare(`SELECT d.*,
    (SELECT COUNT(*) FROM gw_accounts WHERE domain_id=d.id AND status='active') as active_accounts,
    (SELECT COUNT(*) FROM incidents WHERE domain_id=d.id AND resolved=0) as open_incidents
    FROM domains d ORDER BY open_incidents DESC, d.domain`).all();
  const campaign_stats = db.prepare('SELECT COALESCE(SUM(sent_count),0) as total_sent, COALESCE(SUM(open_count),0) as total_opens FROM campaigns').get();
  res.json({ success: true, incidents, agent_activity, domains_health, campaign_stats });
});

router.patch('/incidents/:id/resolve', requireAuth, (req, res) => {
  getDb().prepare("UPDATE incidents SET resolved=1,resolved_at=datetime('now') WHERE id=?").run(req.params.id);
  res.json({ success: true });
});

router.get('/logs', requireAuth, (req, res) => {
  const logs = getDb().prepare('SELECT * FROM agent_logs ORDER BY created_at DESC LIMIT 100').all();
  res.json({ success: true, logs });
});

module.exports = router;
