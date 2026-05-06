const router = require('express').Router();
const { loginRequired } = require('../middleware/auth');
const { getDb } = require('../db/index');

router.get('/monitoring', loginRequired, (req, res) => {
  const db = getDb();
  const domains_health = db.prepare(`SELECT d.*,
    (SELECT COUNT(*) FROM incidents WHERE domain_id=d.id AND resolved=0) as open_incidents,
    (SELECT COUNT(*) FROM gw_accounts WHERE domain_id=d.id AND status='active') as active_accounts
    FROM domains d ORDER BY d.domain`).all();
  const incidents = db.prepare(`SELECT i.*, d.domain as domain_name FROM incidents i
    LEFT JOIN domains d ON i.domain_id=d.id WHERE i.resolved=0
    ORDER BY CASE i.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, i.created_at DESC`).all();
  const resolved = db.prepare(`SELECT i.*, d.domain as domain_name FROM incidents i
    LEFT JOIN domains d ON i.domain_id=d.id WHERE i.resolved=1 AND i.resolved_at >= datetime('now','-7 days')
    ORDER BY i.resolved_at DESC LIMIT 10`).all();
  const agent_activity = db.prepare(`SELECT agent_name, COUNT(*) as total_runs,
    SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) as success_count,
    SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) as error_count,
    MAX(created_at) as last_run FROM agent_logs WHERE created_at >= datetime('now','-24 hours')
    GROUP BY agent_name ORDER BY total_runs DESC`).all();
  const campaign_stats = db.prepare(`SELECT COUNT(*) as total,
    SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed,
    SUM(CASE WHEN status='running' THEN 1 ELSE 0 END) as running,
    COALESCE(SUM(sent_count),0) as total_sent, COALESCE(SUM(open_count),0) as total_opens,
    COALESCE(SUM(bounce_count),0) as total_bounces FROM campaigns`).get();
  res.render('monitoring', { domains_health, incidents, resolved, agent_activity, campaign_stats, page: 'monitoring' });
});

router.post('/monitoring/incidents/:id/resolve', loginRequired, (req, res) => {
  getDb().prepare("UPDATE incidents SET resolved=1, resolved_at=datetime('now') WHERE id=?").run(req.params.id);
  req.flash('success', 'Incident résolu');
  res.redirect('/monitoring');
});

module.exports = router;
