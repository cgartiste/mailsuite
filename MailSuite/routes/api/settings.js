const router = require('express').Router();
const crypto = require('crypto');
const { requireAuth, requireAdmin } = require('./middleware');
const { getDb, getAllSettings } = require('../../db/index');

router.get('/', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const settings = getAllSettings();
  const users = db.prepare('SELECT id,username,role,first_name,last_name,created_at FROM app_users ORDER BY created_at').all();
  res.json({ success: true, settings, users });
});

router.put('/', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const keys = ['cloudflare_api_token','cloudflare_zone_id','n8n_url','n8n_api_key','postal_url','postal_api_key',
    'telegram_bot_token','telegram_chat_id','app_name','max_spam_score','min_inbox_score','dkim_selector','frontend_url'];
  const stmt = db.prepare("INSERT OR REPLACE INTO settings (key,value,updated_at) VALUES (?,?,datetime('now'))");
  for (const key of keys) if (req.body[key] !== undefined) stmt.run(key, req.body[key]);
  res.json({ success: true });
});

router.post('/users', requireAuth, requireAdmin, (req, res) => {
  const { username, password, role, first_name, last_name } = req.body;
  if (!username || !password) return res.status(400).json({ success: false, error: 'Username et mot de passe requis' });
  const hash = crypto.createHash('sha256').update(password).digest('hex');
  try {
    const r = getDb().prepare('INSERT INTO app_users (username,password_hash,role,first_name,last_name) VALUES (?,?,?,?,?)').run(username, hash, role||'user', first_name||'', last_name||'');
    res.json({ success: true, id: r.lastInsertRowid });
  } catch { res.status(409).json({ success: false, error: 'Username déjà utilisé' }); }
});

router.delete('/users/:id', requireAuth, requireAdmin, (req, res) => {
  if (req.session.userId === parseInt(req.params.id)) return res.status(400).json({ success: false, error: 'Auto-suppression impossible' });
  getDb().prepare('DELETE FROM app_users WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ─── Agent API Keys ───────────────────────────────────────────────────────────

router.get('/agent-keys', requireAuth, requireAdmin, (req, res) => {
  const keys = getDb().prepare('SELECT id, name, agent, key_preview, calls_count, last_used, active, created_at FROM agent_api_keys ORDER BY created_at DESC').all();
  res.json({ success: true, keys });
});

router.post('/agent-keys', requireAuth, requireAdmin, (req, res) => {
  const { name, agent = 'all' } = req.body;
  if (!name) return res.status(400).json({ success: false, error: 'Nom requis' });

  const rawKey = 'msk_' + crypto.randomBytes(24).toString('hex');
  const hash   = crypto.createHash('sha256').update(rawKey).digest('hex');
  const preview = rawKey.slice(0, 12) + '...' + rawKey.slice(-6);

  getDb().prepare('INSERT INTO agent_api_keys (name, key_hash, key_preview, agent) VALUES (?,?,?,?)').run(name, hash, preview, agent);
  res.json({ success: true, key: rawKey, preview, note: 'Copiez cette clé maintenant — elle ne sera plus affichée.' });
});

router.patch('/agent-keys/:id/toggle', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT active FROM agent_api_keys WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ success: false, error: 'Introuvable' });
  db.prepare('UPDATE agent_api_keys SET active=? WHERE id=?').run(row.active ? 0 : 1, req.params.id);
  res.json({ success: true, active: !row.active });
});

router.delete('/agent-keys/:id', requireAuth, requireAdmin, (req, res) => {
  getDb().prepare('DELETE FROM agent_api_keys WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
