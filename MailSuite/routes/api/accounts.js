const router = require('express').Router();
const { requireAuth } = require('./middleware');
const { getDb } = require('../../db/index');

router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`SELECT a.*, d.domain as domain_name FROM gw_accounts a
    LEFT JOIN domains d ON a.domain_id=d.id ORDER BY d.domain, a.email`).all();
  res.json({ success: true, accounts: rows });
});

router.post('/', requireAuth, (req, res) => {
  const { email, domain_id, daily_limit } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'Email requis' });
  try {
    const r = getDb().prepare('INSERT INTO gw_accounts (email,domain_id,daily_limit) VALUES (?,?,?)').run(email.trim().toLowerCase(), domain_id||null, daily_limit||400);
    res.json({ success: true, id: r.lastInsertRowid });
  } catch { res.status(409).json({ success: false, error: 'Compte déjà existant' }); }
});

router.patch('/:id/toggle', requireAuth, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM gw_accounts WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ success: false, error: 'Introuvable' });
  const ns = ['active','warming'].includes(row.status) ? 'paused' : 'active';
  db.prepare('UPDATE gw_accounts SET status=? WHERE id=?').run(ns, req.params.id);
  res.json({ success: true, status: ns });
});

router.delete('/:id', requireAuth, (req, res) => {
  getDb().prepare('DELETE FROM gw_accounts WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
