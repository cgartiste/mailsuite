const router = require('express').Router();
const { loginRequired } = require('../middleware/auth');
const { getDb } = require('../db/index');

router.get('/accounts', loginRequired, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`SELECT a.*, d.domain as domain_name FROM gw_accounts a
    LEFT JOIN domains d ON a.domain_id=d.id ORDER BY d.domain, a.email`).all();
  const domains = db.prepare('SELECT id, domain FROM domains ORDER BY domain').all();
  res.render('accounts', { accounts: rows, domains, page: 'accounts' });
});

router.post('/accounts/add', loginRequired, (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const { domain_id, daily_limit } = req.body;
  if (!email) { req.flash('error', 'Email requis'); return res.redirect('/accounts'); }
  const db = getDb();
  try {
    db.prepare('INSERT INTO gw_accounts (email,domain_id,daily_limit) VALUES (?,?,?)').run(email, domain_id || null, daily_limit || 400);
    req.flash('success', `Compte ${email} ajouté`);
  } catch { req.flash('error', `Le compte ${email} existe déjà`); }
  res.redirect('/accounts');
});

router.post('/accounts/:id/toggle', loginRequired, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM gw_accounts WHERE id=?').get(req.params.id);
  if (row) {
    const ns = ['active','warming'].includes(row.status) ? 'paused' : 'active';
    db.prepare('UPDATE gw_accounts SET status=? WHERE id=?').run(ns, req.params.id);
    req.flash('success', `Compte ${row.email} : ${ns}`);
  }
  res.redirect('/accounts');
});

router.post('/accounts/:id/delete', loginRequired, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT email FROM gw_accounts WHERE id=?').get(req.params.id);
  if (row) { db.prepare('DELETE FROM gw_accounts WHERE id=?').run(req.params.id); req.flash('success', `Compte ${row.email} supprimé`); }
  res.redirect('/accounts');
});

module.exports = router;
