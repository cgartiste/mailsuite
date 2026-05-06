const router = require('express').Router();
const { requireAuth } = require('./middleware');
const { getDb } = require('../../db/index');

router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const lists = db.prepare(`SELECT l.*, COUNT(c.id) as total_count,
    SUM(CASE WHEN c.status='active' THEN 1 ELSE 0 END) as active_count,
    SUM(CASE WHEN c.status='bounced' THEN 1 ELSE 0 END) as bounce_count,
    SUM(CASE WHEN c.status='unsubscribed' THEN 1 ELSE 0 END) as unsub_count
    FROM contact_lists l LEFT JOIN contacts c ON c.list_id=l.id GROUP BY l.id ORDER BY l.created_at DESC`).all();
  res.json({ success: true, lists });
});

router.post('/lists', requireAuth, (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'Nom requis' });
  const r = getDb().prepare('INSERT INTO contact_lists (name,description) VALUES (?,?)').run(name, description||'');
  res.json({ success: true, id: r.lastInsertRowid });
});

router.get('/lists/:id', requireAuth, (req, res) => {
  const db = getDb();
  const list = db.prepare('SELECT * FROM contact_lists WHERE id=?').get(req.params.id);
  if (!list) return res.status(404).json({ success: false, error: 'Introuvable' });
  const contacts = db.prepare('SELECT * FROM contacts WHERE list_id=? ORDER BY created_at DESC LIMIT 200').all(req.params.id);
  const stats = db.prepare(`SELECT COUNT(*) as total, SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) as active,
    SUM(CASE WHEN status='bounced' THEN 1 ELSE 0 END) as bounced, SUM(CASE WHEN status='unsubscribed' THEN 1 ELSE 0 END) as unsubscribed
    FROM contacts WHERE list_id=?`).get(req.params.id);
  res.json({ success: true, list, contacts, stats });
});

router.delete('/lists/:id', requireAuth, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM contacts WHERE list_id=?').run(req.params.id);
  db.prepare('DELETE FROM contact_lists WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
