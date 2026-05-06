const router = require('express').Router();
const { requireAuth } = require('./middleware');
const { getDb } = require('../../db/index');

router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const { reason } = req.query;
  const items = reason
    ? db.prepare('SELECT * FROM suppression_list WHERE reason=? ORDER BY added_at DESC LIMIT 200').all(reason)
    : db.prepare('SELECT * FROM suppression_list ORDER BY added_at DESC LIMIT 200').all();
  const stats = db.prepare('SELECT reason, COUNT(*) as count FROM suppression_list GROUP BY reason').all();
  res.json({ success: true, items, stats });
});

router.post('/', requireAuth, (req, res) => {
  const { email, reason, source } = req.body;
  if (!email) return res.status(400).json({ success: false, error: 'Email requis' });
  try {
    const r = getDb().prepare('INSERT INTO suppression_list (email,reason,source) VALUES (?,?,?)').run(email.trim().toLowerCase(), reason||'manual', source||'api');
    res.json({ success: true, id: r.lastInsertRowid });
  } catch { res.status(409).json({ success: false, error: 'Email déjà en suppression' }); }
});

router.delete('/:id', requireAuth, (req, res) => {
  getDb().prepare('DELETE FROM suppression_list WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
