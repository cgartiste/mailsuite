const router = require('express').Router();
const { requireAuth } = require('./middleware');
const { getDb } = require('../../db/index');

router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`SELECT c.*, d.domain as domain_name, l.name as list_name
    FROM campaigns c LEFT JOIN domains d ON c.domain_id=d.id LEFT JOIN contact_lists l ON c.list_id=l.id
    ORDER BY c.created_at DESC`).all();
  res.json({ success: true, campaigns: rows });
});

router.post('/', requireAuth, (req, res) => {
  const { name, subject, from_name, from_email, content, list_id, domain_id, scheduled_at } = req.body;
  if (!name || !subject || !content) return res.status(400).json({ success: false, error: 'Nom, objet et contenu requis' });
  const db = getDb();
  let total = 0;
  if (list_id) total = db.prepare("SELECT COUNT(*) as c FROM contacts WHERE list_id=? AND status='active'").get(list_id).c;
  const r = db.prepare(`INSERT INTO campaigns (name,subject,from_name,from_email,content,list_id,domain_id,scheduled_at,total_recipients) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(name, subject, from_name||'', from_email||'', content, list_id||null, domain_id||null, scheduled_at||null, total);
  res.json({ success: true, id: r.lastInsertRowid });
});

router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const row = db.prepare(`SELECT c.*, d.domain as domain_name, l.name as list_name FROM campaigns c
    LEFT JOIN domains d ON c.domain_id=d.id LEFT JOIN contact_lists l ON c.list_id=l.id WHERE c.id=?`).get(req.params.id);
  if (!row) return res.status(404).json({ success: false, error: 'Introuvable' });
  const s = row.sent_count || 0;
  res.json({ success: true, campaign: { ...row, open_rate: s > 0 ? +(row.open_count/s*100).toFixed(1) : 0, click_rate: s > 0 ? +(row.click_count/s*100).toFixed(1) : 0, bounce_rate: s > 0 ? +(row.bounce_count/s*100).toFixed(2) : 0, progress: row.total_recipients > 0 ? Math.round(s/row.total_recipients*100) : 0 } });
});

router.patch('/:id/launch', requireAuth, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM campaigns WHERE id=?').get(req.params.id);
  if (!row || !['draft','scheduled'].includes(row.status)) return res.status(400).json({ success: false, error: 'Impossible' });
  db.prepare("UPDATE campaigns SET status='running',started_at=datetime('now') WHERE id=?").run(req.params.id);
  res.json({ success: true });
});

router.patch('/:id/pause', requireAuth, (req, res) => {
  getDb().prepare("UPDATE campaigns SET status='paused' WHERE id=?").run(req.params.id);
  res.json({ success: true });
});

router.delete('/:id', requireAuth, (req, res) => {
  getDb().prepare('DELETE FROM campaigns WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
