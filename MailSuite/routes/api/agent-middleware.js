const crypto = require('crypto');
const { getDb } = require('../../db/index');

function requireAgentKey(req, res, next) {
  const key = req.headers['x-agent-key'];
  if (!key) return res.status(401).json({ success: false, error: 'Clé API agent manquante (header X-Agent-Key)' });

  const hash = crypto.createHash('sha256').update(key).digest('hex');
  const db = getDb();
  const row = db.prepare('SELECT * FROM agent_api_keys WHERE key_hash=? AND active=1').get(hash);
  if (!row) return res.status(403).json({ success: false, error: 'Clé API invalide ou désactivée' });

  db.prepare("UPDATE agent_api_keys SET calls_count=calls_count+1, last_used=datetime('now') WHERE id=?").run(row.id);
  req.agentKey = row;
  next();
}

module.exports = { requireAgentKey };
