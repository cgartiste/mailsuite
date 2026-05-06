const router = require('express').Router();
const crypto = require('crypto');
const { getDb } = require('../../db/index');

// Login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ success: false, error: 'Champs requis' });
  const hash = crypto.createHash('sha256').update(password).digest('hex');
  const db = getDb();
  const user = db.prepare('SELECT * FROM app_users WHERE username=? AND password_hash=?').get(username, hash);
  if (!user) return res.status(401).json({ success: false, error: 'Identifiants incorrects' });
  req.session.loggedIn = true;
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.role = user.role;
  req.session.firstName = user.first_name || user.username;
  req.session.lastName = user.last_name || '';
  res.json({ success: true, user: { username: user.username, role: user.role, firstName: user.first_name, lastName: user.last_name } });
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Session check
router.get('/me', (req, res) => {
  if (!req.session?.loggedIn) return res.status(401).json({ success: false, error: 'Non connecté' });
  res.json({ success: true, user: { username: req.session.username, role: req.session.role, firstName: req.session.firstName, lastName: req.session.lastName } });
});

module.exports = router;
