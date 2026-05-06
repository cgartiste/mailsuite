const router = require('express').Router();
const { loginRequired } = require('../middleware/auth');
const { getDb } = require('../db/index');

router.get('/contacts', loginRequired, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`SELECT l.*, COUNT(c.id) as total_count,
    SUM(CASE WHEN c.status='active' THEN 1 ELSE 0 END) as active_count,
    SUM(CASE WHEN c.status='bounced' THEN 1 ELSE 0 END) as bounce_count,
    SUM(CASE WHEN c.status='unsubscribed' THEN 1 ELSE 0 END) as unsub_count
    FROM contact_lists l LEFT JOIN contacts c ON c.list_id=l.id GROUP BY l.id ORDER BY l.created_at DESC`).all();
  res.render('contacts', { lists: rows, page: 'contacts' });
});

router.post('/contacts/lists/add', loginRequired, (req, res) => {
  const { name, description } = req.body;
  if (!name) { req.flash('error', 'Nom requis'); return res.redirect('/contacts'); }
  getDb().prepare('INSERT INTO contact_lists (name,description) VALUES (?,?)').run(name, description || '');
  req.flash('success', `Liste "${name}" créée`);
  res.redirect('/contacts');
});

router.get('/contacts/lists/:id', loginRequired, (req, res) => {
  const db = getDb();
  const lst = db.prepare('SELECT * FROM contact_lists WHERE id=?').get(req.params.id);
  if (!lst) { req.flash('error', 'Liste introuvable'); return res.redirect('/contacts'); }
  const contacts = db.prepare('SELECT * FROM contacts WHERE list_id=? ORDER BY created_at DESC LIMIT 200').all(req.params.id);
  const stats = db.prepare(`SELECT COUNT(*) as total,
    SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) as active,
    SUM(CASE WHEN status='bounced' THEN 1 ELSE 0 END) as bounced,
    SUM(CASE WHEN status='unsubscribed' THEN 1 ELSE 0 END) as unsubscribed
    FROM contacts WHERE list_id=?`).get(req.params.id);
  res.render('list_detail', { list: lst, contacts, stats, page: 'contacts' });
});

router.post('/contacts/lists/:id/delete', loginRequired, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM contacts WHERE list_id=?').run(req.params.id);
  db.prepare('DELETE FROM contact_lists WHERE id=?').run(req.params.id);
  req.flash('success', 'Liste supprimée');
  res.redirect('/contacts');
});

module.exports = router;
