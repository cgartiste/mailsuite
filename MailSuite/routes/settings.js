const router = require('express').Router();
const crypto = require('crypto');
const { loginRequired, adminRequired } = require('../middleware/auth');
const { getDb, getAllSettings } = require('../db/index');

router.get('/settings', loginRequired, adminRequired, (req, res) => {
  const db = getDb();
  const settings = getAllSettings();
  const users = db.prepare('SELECT * FROM app_users ORDER BY created_at').all();
  res.render('settings', { settings, users, page: 'settings' });
});

router.post('/settings', loginRequired, adminRequired, (req, res) => {
  const db = getDb();
  const keys = ['cloudflare_api_token','cloudflare_zone_id','n8n_url','n8n_api_key',
    'postal_url','postal_api_key','telegram_bot_token','telegram_chat_id',
    'app_name','max_spam_score','min_inbox_score','dkim_selector'];
  const stmt = db.prepare("INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES (?,?,datetime('now'))");
  for (const key of keys) stmt.run(key, req.body[key] || '');
  req.flash('success', 'Paramètres sauvegardés');
  res.redirect('/settings');
});

router.post('/settings/users/add', loginRequired, adminRequired, (req, res) => {
  const { username, password, role, first_name, last_name } = req.body;
  if (!username || !password) { req.flash('error', 'Username et mot de passe requis'); return res.redirect('/settings'); }
  const hash = crypto.createHash('sha256').update(password).digest('hex');
  try {
    getDb().prepare('INSERT INTO app_users (username,password_hash,role,first_name,last_name) VALUES (?,?,?,?,?)').run(username, hash, role||'user', first_name, last_name);
    req.flash('success', `Utilisateur ${username} créé`);
  } catch { req.flash('error', `Username ${username} déjà utilisé`); }
  res.redirect('/settings');
});

module.exports = router;
