const router = require('express').Router();
const { loginRequired, adminRequired } = require('../middleware/auth');
const { getDb } = require('../db/index');

router.get('/suppression', loginRequired, (req, res) => {
  const db = getDb();
  const reason = req.query.reason || '';
  const items = reason
    ? db.prepare('SELECT * FROM suppression_list WHERE reason=? ORDER BY added_at DESC').all(reason)
    : db.prepare('SELECT * FROM suppression_list ORDER BY added_at DESC LIMIT 500').all();
  const stats = db.prepare('SELECT reason, COUNT(*) as count FROM suppression_list GROUP BY reason ORDER BY count DESC').all();
  res.render('suppression', { items, stats, reason_filter: reason, page: 'suppression' });
});

router.post('/suppression/add', loginRequired, (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const reason = req.body.reason || 'manual';
  if (!email || !email.includes('@')) { req.flash('error', 'Email invalide'); return res.redirect('/suppression'); }
  const db = getDb();
  try {
    db.prepare("INSERT INTO suppression_list (email,reason,source) VALUES (?,?,'manual')").run(email, reason);
    db.prepare("UPDATE contacts SET status='unsubscribed' WHERE email=?").run(email);
    req.flash('success', `${email} ajouté à la suppression`);
  } catch { req.flash('warning', `${email} déjà dans la liste`); }
  res.redirect('/suppression');
});

router.post('/suppression/remove/:id', loginRequired, adminRequired, (req, res) => {
  getDb().prepare('DELETE FROM suppression_list WHERE id=?').run(req.params.id);
  req.flash('success', 'Retiré de la suppression');
  res.redirect('/suppression');
});

module.exports = router;
