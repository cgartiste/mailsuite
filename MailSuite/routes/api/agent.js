/**
 * MailSuite — Agent API
 * Auth: header X-Agent-Key (SHA-256 hashed against agent_api_keys table)
 * All responses are compact JSON optimised for OpenClaw agents.
 */
const router = require('express').Router();
const path   = require('path');
const fs     = require('fs');
const { requireAgentKey } = require('./agent-middleware');
const { getDb, getSetting } = require('../../db/index');

router.use(requireAgentKey);

// ─── helpers ──────────────────────────────────────────────────────────────────
function ok(res, data) { res.json({ success: true, ...data }); }
function err(res, msg, code = 400) { res.status(code).json({ success: false, error: msg }); }

function getActiveCf() {
  const { CloudflareService } = require('../../services/cloudflare');
  const db = getDb();
  const acc = db.prepare("SELECT * FROM cf_accounts WHERE is_active=1 LIMIT 1").get();
  if (acc) return new CloudflareService(acc.api_token);
  const token = getSetting('cloudflare_api_token');
  return token ? new CloudflareService(token) : null;
}

function getActiveGw() {
  const { GoogleWorkspaceService } = require('../../services/google-workspace');
  const db = getDb();
  const cred = db.prepare("SELECT * FROM gw_credentials WHERE is_active=1 LIMIT 1").get();
  if (!cred) return null;
  const fp = path.join(__dirname, '..', '..', 'gw_creds', cred.json_filename);
  if (!fs.existsSync(fp)) return null;
  try { return new GoogleWorkspaceService(fp, cred.admin_email); } catch { return null; }
}

function getActiveMs() {
  const { getMsInstance } = require('../../services/microsoft365');
  const db = getDb();
  const acc = db.prepare("SELECT * FROM ms_accounts WHERE is_active=1 LIMIT 1").get();
  if (!acc) return null;
  return getMsInstance(acc.id, acc);
}

// ══════════════════════════════════════════════════════════════════════════════
// SYSTEM STATUS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/agent/status — vue d'ensemble du système
router.get('/status', async (req, res) => {
  const db = getDb();
  const domainStats = db.prepare(`SELECT
    COUNT(*) as total,
    SUM(CASE WHEN spf_status='valid' THEN 1 ELSE 0 END) as spf_ok,
    SUM(CASE WHEN dmarc_status='valid' THEN 1 ELSE 0 END) as dmarc_ok,
    SUM(CASE WHEN dkim_status='valid' THEN 1 ELSE 0 END) as dkim_ok
    FROM domains`).get();

  const gwActive  = db.prepare("SELECT name, domain, total_users FROM gw_credentials WHERE is_active=1 LIMIT 1").get();
  const msActive  = db.prepare("SELECT name, total_users FROM ms_accounts WHERE is_active=1 LIMIT 1").get();
  const cfZones   = parseInt(getSetting('cf_zone_count_cache') || '0');
  const incidents = db.prepare("SELECT COUNT(*) as n FROM incidents WHERE resolved=0").get()?.n || 0;
  const opsToday  = db.prepare("SELECT COUNT(*) as n FROM agent_logs WHERE created_at > datetime('now','-24 hours')").get()?.n || 0;

  ok(res, {
    domains: domainStats,
    gw: gwActive || null,
    ms: msActive || null,
    cloudflare: { zones: cfZones },
    alerts: { open_incidents: incidents },
    activity: { ops_24h: opsToday },
    timestamp: new Date().toISOString(),
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// DOMAINS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/agent/domains — tous les domaines avec statut DNS
router.get('/domains', (req, res) => {
  const db = getDb();
  const { filter } = req.query; // ?filter=missing_spf | missing_dmarc | issues | all
  let query = 'SELECT domain, spf_status, dkim_status, dmarc_status, status, last_dns_check FROM domains';
  if (filter === 'missing_spf')   query += " WHERE spf_status != 'valid'";
  if (filter === 'missing_dmarc') query += " WHERE dmarc_status != 'valid'";
  if (filter === 'issues')        query += " WHERE spf_status != 'valid' OR dmarc_status != 'valid'";
  query += ' ORDER BY domain LIMIT 500';
  ok(res, { domains: db.prepare(query).all() });
});

// GET /api/agent/dns/missing — domaines sans SPF ou sans DMARC (pour dns-guardian)
router.get('/dns/missing', (req, res) => {
  const db = getDb();
  const missing = db.prepare(`SELECT domain, spf_status, dmarc_status, dkim_status
    FROM domains WHERE spf_status != 'valid' OR dmarc_status != 'valid'
    ORDER BY domain`).all();
  ok(res, {
    count: missing.length,
    missing_spf:   missing.filter(d => d.spf_status   !== 'valid').map(d => d.domain),
    missing_dmarc: missing.filter(d => d.dmarc_status !== 'valid').map(d => d.domain),
    domains: missing,
  });
});

// POST /api/agent/domains/sync — sync depuis CF/GW/MS (pour domain-sync)
router.post('/domains/sync', async (req, res) => {
  const sources = req.body.sources || ['cloudflare', 'google', 'microsoft'];
  const db = getDb();
  const existing = new Set(db.prepare('SELECT domain FROM domains').all().map(r => r.domain));

  try { db.prepare("ALTER TABLE domains ADD COLUMN source TEXT DEFAULT 'manual'").run(); } catch {}

  const toInsert = [];
  const promises = [];

  if (sources.includes('cloudflare')) {
    promises.push((async () => {
      const cf = getActiveCf();
      if (!cf) return;
      const zones = await cf.getAllZones();
      zones.forEach(z => { if (!existing.has(z.name)) toInsert.push({ domain: z.name, source: 'cloudflare' }); });
    })());
  }

  if (sources.includes('google')) {
    promises.push((async () => {
      const gw = getActiveGw();
      if (!gw) return;
      const domains = await gw.listDomains();
      domains.forEach(d => {
        const name = d.domainName || d.name;
        if (name && !existing.has(name)) toInsert.push({ domain: name, source: 'google' });
      });
    })());
  }

  if (sources.includes('microsoft')) {
    promises.push((async () => {
      const ms = getActiveMs();
      if (!ms) return;
      const domains = await ms.listDomains();
      domains.forEach(d => { if (d.id && !existing.has(d.id)) toInsert.push({ domain: d.id, source: 'microsoft' }); });
    })());
  }

  await Promise.all(promises);

  const stmt = db.prepare("INSERT OR IGNORE INTO domains (domain, source) VALUES (?, ?)");
  let added = 0;
  const txn = db.transaction(() => {
    for (const row of toInsert) {
      const info = stmt.run(row.domain, row.source);
      if (info.changes > 0) added++;
    }
  });
  txn();

  ok(res, { added, skipped: toInsert.length - added, sources });
});

// ══════════════════════════════════════════════════════════════════════════════
// DNS DEPLOY
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/agent/dns/deploy — déploie SPF/DMARC sur une liste de domaines
router.post('/dns/deploy', async (req, res) => {
  const { domains: domainList, record_types = ['spf_both', 'dmarc'] } = req.body;
  if (!domainList?.length) return err(res, 'domains[] requis');

  const cf = getActiveCf();
  if (!cf) return err(res, 'Cloudflare non configuré');

  const allZones = await cf.getAllZones();
  const findZone = (domain) => allZones.find(z => z.name === domain)
    || allZones.find(z => domain.endsWith('.' + z.name));

  const SPF_CONTENT = {
    spf_google:    'v=spf1 include:_spf.google.com ~all',
    spf_microsoft: 'v=spf1 include:spf.protection.outlook.com ~all',
    spf_both:      'v=spf1 include:_spf.google.com include:spf.protection.outlook.com ~all',
    spf:           'v=spf1 include:_spf.google.com ~all',
  };

  const GW_MX = [
    { content: 'aspmx.l.google.com', priority: 1 },
    { content: 'alt1.aspmx.l.google.com', priority: 5 },
    { content: 'alt2.aspmx.l.google.com', priority: 5 },
    { content: 'alt3.aspmx.l.google.com', priority: 10 },
    { content: 'alt4.aspmx.l.google.com', priority: 10 },
  ];

  const results = [];
  const BATCH = 10;

  for (let i = 0; i < domainList.length; i += BATCH) {
    const batch = domainList.slice(i, i + BATCH);
    const batchResults = await Promise.all(batch.map(async (domain) => {
      const zone = findZone(domain);
      if (!zone) return { domain, skipped: true, reason: 'zone CF introuvable' };
      const deployed = [];
      try {
        for (const rt of record_types) {
          if (SPF_CONTENT[rt]) {
            await cf.upsertDnsRecord(zone.id, { type: 'TXT', name: domain, content: SPF_CONTENT[rt], ttl: 3600 });
            deployed.push(rt);
          } else if (rt === 'dmarc') {
            await cf.upsertDnsRecord(zone.id, { type: 'TXT', name: `_dmarc.${domain}`, content: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domain}; pct=100`, ttl: 3600 });
            deployed.push('dmarc');
          } else if (rt === 'mx_google') {
            for (const mx of GW_MX) await cf.upsertDnsRecord(zone.id, { type: 'MX', name: domain, ...mx, ttl: 3600 });
            deployed.push('mx_google');
          }
        }
        return { domain, success: true, deployed };
      } catch (e) {
        return { domain, success: false, error: e.message };
      }
    }));
    results.push(...batchResults);
  }

  const db = getDb();
  db.prepare("INSERT INTO agent_logs (agent_name,action,status,result) VALUES (?,?,?,?)").run(
    req.agentKey.agent || 'agent',
    `DNS deploy sur ${domainList.length} domaines`,
    'success',
    `Types: ${record_types.join(', ')}`
  );

  ok(res, {
    total: domainList.length,
    deployed: results.filter(r => r.success).length,
    skipped:  results.filter(r => r.skipped).length,
    failed:   results.filter(r => !r.success && !r.skipped).length,
    results,
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// GOOGLE WORKSPACE
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/agent/gw/accounts
router.get('/gw/accounts', (req, res) => {
  const rows = getDb().prepare('SELECT id, name, domain, admin_email, is_active, total_users, status FROM gw_credentials ORDER BY is_active DESC').all();
  ok(res, { accounts: rows });
});

// POST /api/agent/gw/create-users
router.post('/gw/create-users', async (req, res) => {
  const { domain, count = 10, password = 'Azerty@123' } = req.body;
  if (!domain) return err(res, 'domain requis');
  if (domain.includes('.onmicrosoft.com')) return err(res, 'Domaine Microsoft — utilisez /gw/create-users avec un domaine Google');

  const gw = getActiveGw();
  if (!gw) return err(res, 'Aucun compte Google Workspace actif');

  const results = await gw.bulkCreateUsers(Math.min(parseInt(count) || 10, 200), domain, password);

  const db = getDb();
  const cred = db.prepare("SELECT * FROM gw_credentials WHERE is_active=1 LIMIT 1").get();
  const stmt = db.prepare('INSERT OR IGNORE INTO gw_created_users (email,password,first_name,last_name,domain,credential_id,status) VALUES (?,?,?,?,?,?,?)');
  for (const u of results.created) stmt.run(u.email, u.password, u.firstName, u.lastName, domain, cred?.id, 'created');

  db.prepare("INSERT INTO agent_logs (agent_name,action,status,result) VALUES (?,?,?,?)").run(
    req.agentKey.agent || 'gw-operator',
    `Bulk create ${count} users sur ${domain}`,
    results.createdCount > 0 ? 'success' : 'error',
    `${results.createdCount} créés, ${results.failedCount} échoués`
  );

  ok(res, {
    created_count: results.createdCount,
    failed_count:  results.failedCount,
    domain,
    created: results.created,
    failed:  results.failed?.slice(0, 5),
  });
});

// GET /api/agent/gw/created-users — utilisateurs récemment créés
router.get('/gw/created-users', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const rows = getDb().prepare('SELECT email, password, domain, created_at FROM gw_created_users ORDER BY created_at DESC LIMIT ?').all(limit);
  ok(res, { users: rows, count: rows.length });
});

// POST /api/agent/gw/pipepass — envoie des users vers PipePass
router.post('/gw/pipepass', async (req, res) => {
  const { users, server_url, num_browsers = 3 } = req.body;
  if (!users?.length) return err(res, 'users[] requis');
  if (!server_url) return err(res, 'server_url requis (ex: http://localhost:7070)');

  const credentials = users.map(u => `${u.email}:${u.password}`).join('\n');
  try {
    const fetch = require('node-fetch');
    const r = await fetch(`${server_url}/api/mailsuite/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentials, batch_name: `agent_${Date.now()}`, num_browsers }),
    });
    const data = await r.json();
    ok(res, { job_id: data.job_id, users_sent: users.length, pipepass_url: server_url });
  } catch (e) {
    err(res, `PipePass inaccessible: ${e.message}`);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ALERTS & INCIDENTS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/agent/alerts — incidents ouverts
router.get('/alerts', (req, res) => {
  const db = getDb();
  const incidents = db.prepare(`SELECT i.id, i.type, i.severity, i.title, i.description, i.created_at, d.domain
    FROM incidents i LEFT JOIN domains d ON i.domain_id=d.id
    WHERE i.resolved=0 ORDER BY CASE i.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END`).all();
  ok(res, { count: incidents.length, incidents });
});

// POST /api/agent/alerts — créer un incident
router.post('/alerts', (req, res) => {
  const { type = 'agent', severity = 'warning', title, description, domain } = req.body;
  if (!title) return err(res, 'title requis');
  const db = getDb();
  let domainId = null;
  if (domain) {
    const row = db.prepare('SELECT id FROM domains WHERE domain=?').get(domain);
    domainId = row?.id || null;
  }
  const r = db.prepare("INSERT INTO incidents (type,severity,title,description,domain_id) VALUES (?,?,?,?,?)").run(type, severity, title, description || '', domainId);
  ok(res, { id: r.lastInsertRowid });
});

// PATCH /api/agent/alerts/:id/resolve
router.patch('/alerts/:id/resolve', (req, res) => {
  getDb().prepare("UPDATE incidents SET resolved=1, resolved_at=datetime('now') WHERE id=?").run(req.params.id);
  ok(res, { resolved: true });
});

// ══════════════════════════════════════════════════════════════════════════════
// LOGS
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/agent/log — agent écrit un log
router.post('/log', (req, res) => {
  const { action, status = 'success', result = '' } = req.body;
  if (!action) return err(res, 'action requis');
  const agent = req.agentKey.agent || 'agent';
  getDb().prepare("INSERT INTO agent_logs (agent_name,action,status,result) VALUES (?,?,?,?)").run(agent, action, status, result);
  ok(res, { logged: true });
});

// GET /api/agent/logs — derniers logs
router.get('/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const agent = req.query.agent;
  let query = 'SELECT * FROM agent_logs';
  if (agent) query += ` WHERE agent_name=?`;
  query += ' ORDER BY created_at DESC LIMIT ?';
  const rows = agent
    ? getDb().prepare(query).all(agent, limit)
    : getDb().prepare(query).all(limit);
  ok(res, { logs: rows });
});

// ══════════════════════════════════════════════════════════════════════════════
// NOTIFY (Telegram)
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/agent/notify — envoie un message Telegram
router.post('/notify', async (req, res) => {
  const { message } = req.body;
  if (!message) return err(res, 'message requis');

  const botToken = getSetting('telegram_bot_token');
  const chatId   = getSetting('telegram_chat_id');
  if (!botToken || !chatId) return err(res, 'Telegram non configuré dans les paramètres');

  try {
    const fetch = require('node-fetch');
    const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
    });
    const data = await r.json();
    if (data.ok) ok(res, { sent: true });
    else err(res, data.description || 'Erreur Telegram');
  } catch (e) {
    err(res, `Telegram inaccessible: ${e.message}`);
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// REPUTATION (reputation-watchdog)
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/agent/reputation/check?domain=xxx — vérifie blacklists via DNS
router.get('/reputation/check', async (req, res) => {
  const { domain } = req.query;
  if (!domain) return err(res, 'domain requis');

  const dns = require('dns').promises;
  const BLACKLISTS = [
    'zen.spamhaus.org', 'bl.spamcop.net', 'b.barracudacentral.org',
    'dnsbl.sorbs.net', 'spam.dnsbl.sorbs.net',
  ];

  const checks = await Promise.all(BLACKLISTS.map(async (bl) => {
    try {
      await dns.resolve4(`${domain}.${bl}`);
      return { blacklist: bl, listed: true };
    } catch {
      return { blacklist: bl, listed: false };
    }
  }));

  const listed = checks.filter(c => c.listed);

  if (listed.length > 0) {
    const db = getDb();
    db.prepare("INSERT OR IGNORE INTO incidents (type,severity,title,description) VALUES (?,?,?,?)").run(
      'reputation', 'critical',
      `${domain} listé sur ${listed.length} blacklist(s)`,
      listed.map(c => c.blacklist).join(', ')
    );
  }

  ok(res, {
    domain,
    clean: listed.length === 0,
    listed_count: listed.length,
    blacklists: checks,
  });
});

module.exports = router;
