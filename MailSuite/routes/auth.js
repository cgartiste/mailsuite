const router = require('express').Router();
const crypto = require('crypto');
const { getDb } = require('../db/index');

router.get('/login', (req, res) => {
  if (req.session.loggedIn) return res.redirect('/');
  res.render('login', { error: null, page: 'login' });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const hash = crypto.createHash('sha256').update(password || '').digest('hex');
  const db = getDb();
  const user = db.prepare('SELECT * FROM app_users WHERE username=? AND password_hash=?').get(username, hash);
  if (user) {
    req.session.loggedIn = true;
    req.session.username = user.username;
    req.session.role = user.role;
    req.session.firstName = user.first_name || user.username;
    req.session.lastName = user.last_name || '';
    return res.redirect('/');
  }
  res.render('login', { error: 'Identifiants incorrects', page: 'login' });
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

module.exports = router;
