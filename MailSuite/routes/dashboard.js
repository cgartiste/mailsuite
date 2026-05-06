const router = require('express').Router();
const { loginRequired } = require('../middleware/auth');
const { getDb } = require('../db/index');

router.get('/', loginRequired, (req, res) => {
  const db = getDb();
  const s = {};
  s.total_domains = db.prepare('SELECT COUNT(*) as c FROM domains').get().c;
  s.active_domains = db.prepare("SELECT COUNT(*) as c FROM domains WHERE status='active'").get().c;
  s.total_accounts = db.prepare('SELECT COUNT(*) as c FROM gw_accounts').get().c;
  s.active_accounts = db.prepare("SELECT COUNT(*) as c FROM gw_accounts WHERE status='active'").get().c;
  s.total_campaigns = db.prepare('SELECT COUNT(*) as c FROM campaigns').get().c;
  s.running_campaigns = db.prepare("SELECT COUNT(*) as c FROM campaigns WHERE status='running'").get().c;
  s.total_contacts = db.prepare("SELECT COUNT(*) as c FROM contacts WHERE status='active'").get().c;
  s.total_users = db.prepare("SELECT COUNT(*) as c FROM gw_created_users WHERE status='created'").get().c;
  s.suppression_count = db.prepare('SELECT COUNT(*) as c FROM suppression_list').get().c;
  s.total_sent = db.prepare('SELECT COALESCE(SUM(sent_count),0) as c FROM campaigns').get().c;
  s.open_incidents = db.prepare("SELECT COUNT(*) as c FROM incidents WHERE resolved=0").get().c;
  s.gw_accounts_count = db.prepare('SELECT COUNT(*) as c FROM gw_credentials').get().c;
  s.cf_accounts_count = db.prepare('SELECT COUNT(*) as c FROM cf_accounts').get().c;
  s.ms_accounts_count = db.prepare('SELECT COUNT(*) as c FROM ms_accounts').get().c;

  s.domains = db.prepare(`SELECT d.*, (SELECT COUNT(*) FROM incidents WHERE domain_id=d.id AND resolved=0) as open_incidents
    FROM domains d ORDER BY created_at DESC LIMIT 8`).all();
  s.recent_logs = db.prepare('SELECT * FROM agent_logs ORDER BY created_at DESC LIMIT 8').all();
  s.active_campaigns = db.prepare(`SELECT c.id, c.name, c.status, c.sent_count, c.total_recipients,
    c.open_count, c.bounce_count, d.domain FROM campaigns c LEFT JOIN domains d ON c.domain_id=d.id
    WHERE c.status IN ('running','scheduled') ORDER BY c.started_at DESC LIMIT 5`).all();
  s.incidents = db.prepare(`SELECT i.*, d.domain as domain_name FROM incidents i
    LEFT JOIN domains d ON i.domain_id=d.id WHERE i.resolved=0
    ORDER BY CASE i.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, i.created_at DESC LIMIT 5`).all();

  res.render('dashboard', { stats: s, page: 'dashboard' });
});

module.exports = router;
