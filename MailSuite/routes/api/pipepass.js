/**
 * MailSuite ↔ PipePass Bridge API
 * Routes: /api/pipepass/*
 * 
 * Features:
 * - Detect available PipePass servers (via IP scan / stored list)
 * - Export users to a PipePass server (POST credentials)
 * - Receive results back (2FA + app-password CSV)
 * - Download result files
 * - Notification endpoint (called by PipePass when job is done)
 */
const router = require('express').Router();
const { requireAuth } = require('./middleware');
const { getDb } = require('../../db/index');
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');

const RESULTS_DIR = path.join(__dirname, '..', '..', 'pipepass_results');
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

// ─── Helper: HTTP request with timeout ──────────────────────────────────────
function httpGet(url, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve({ ok: true, status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ ok: true, status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function httpPost(url, body, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const payload = JSON.stringify(body);
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (url.startsWith('https') ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: timeoutMs,
    };
    const req = mod.request(options, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve({ ok: res.statusCode < 400, status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ ok: res.statusCode < 400, status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(payload);
    req.end();
  });
}

// ─── DB: PipePass servers table (ensure it exists) ──────────────────────────
function ensureTables() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS pipepass_servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      status TEXT DEFAULT 'unknown',
      last_seen TEXT,
      meta TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS pipepass_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_url TEXT NOT NULL,
      job_id TEXT,
      batch_name TEXT,
      user_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending',
      result_file TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      finished_at TEXT
    );
    CREATE TABLE IF NOT EXISTS pipepass_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER,
      email TEXT,
      password TEXT,
      fa_secret TEXT,
      app_password TEXT,
      imported_at TEXT DEFAULT (datetime('now'))
    );
  `);
  // Migrate: add meta column if not present (existing DBs)
  try { db.exec(`ALTER TABLE pipepass_servers ADD COLUMN meta TEXT`); } catch { /* already exists */ }
}

// ─── GET /api/pipepass/servers — list stored servers ────────────────────────
router.get('/servers', requireAuth, (req, res) => {
  ensureTables();
  const db = getDb();
  const servers = db.prepare('SELECT * FROM pipepass_servers ORDER BY created_at DESC').all();
  res.json({ success: true, servers });
});

// ─── POST /api/pipepass/servers — add a server ──────────────────────────────
router.post('/servers', requireAuth, (req, res) => {
  ensureTables();
  const { name, url } = req.body;
  if (!name || !url) return res.status(400).json({ success: false, error: 'Nom et URL requis' });
  const cleanUrl = url.replace(/\/$/, '');
  const db = getDb();
  try {
    const r = db.prepare('INSERT OR IGNORE INTO pipepass_servers (name, url) VALUES (?,?)').run(name, cleanUrl);
    res.json({ success: true, id: r.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// ─── DELETE /api/pipepass/servers/:id ────────────────────────────────────────
router.delete('/servers/:id', requireAuth, (req, res) => {
  ensureTables();
  getDb().prepare('DELETE FROM pipepass_servers WHERE id=?').run(req.params.id);
  res.json({ success: true });
});

// ─── POST /api/pipepass/servers/ping — check if servers are online ──────────
router.post('/servers/ping', requireAuth, async (req, res) => {
  ensureTables();
  const db = getDb();
  const servers = db.prepare('SELECT * FROM pipepass_servers').all();
  const results = [];
  for (const srv of servers) {
    try {
      const r = await httpGet(`${srv.url}/api/mailsuite/ping`, 2500);
      const online = r.ok && r.status === 200;
      db.prepare("UPDATE pipepass_servers SET status=?, last_seen=datetime('now') WHERE id=?")
        .run(online ? 'online' : 'error', srv.id);
      results.push({ id: srv.id, url: srv.url, online, version: r.data?.version });
    } catch {
      db.prepare("UPDATE pipepass_servers SET status='offline' WHERE id=?").run(srv.id);
      results.push({ id: srv.id, url: srv.url, online: false });
    }
  }
  res.json({ success: true, results });
});

// ─── POST /api/pipepass/register — PipePass self-registers on startup ────────
// Called BY PipePass (no auth) — public endpoint
router.post('/register', async (req, res) => {
  ensureTables();
  const { url, name, version, public_ip } = req.body;
  if (!url) return res.status(400).json({ success: false, error: 'url requis' });

  const cleanUrl = url.replace(/\/$/, '');
  // Derive display name from IP/hostname if not provided
  const displayName = name || `PipePass @ ${public_ip || new URL(cleanUrl).hostname}`;
  const db = getDb();

  // Upsert: insert or update if URL already known
  const existing = db.prepare('SELECT id FROM pipepass_servers WHERE url=?').get(cleanUrl);
  if (existing) {
    db.prepare("UPDATE pipepass_servers SET name=?, status='online', last_seen=datetime('now') WHERE url=?")
      .run(displayName, cleanUrl);
  } else {
    db.prepare("INSERT INTO pipepass_servers (name, url, status, last_seen) VALUES (?,?,'online',datetime('now'))")
      .run(displayName, cleanUrl);
  }

  console.log(`[PipePass] Registered: ${displayName} → ${cleanUrl}`);
  res.json({ success: true, message: 'Registered', mailsuite_version: '2.0' });
});

// ─── POST /api/pipepass/heartbeat — PipePass sends heartbeat every 30s ───────
// Called BY PipePass (no auth)
router.post('/heartbeat', (req, res) => {
  ensureTables();
  const { url, stats } = req.body;
  if (!url) return res.status(400).json({ success: false });

  const cleanUrl = url.replace(/\/$/, '');
  const db = getDb();
  const row = db.prepare('SELECT id FROM pipepass_servers WHERE url=?').get(cleanUrl);

  if (row) {
    db.prepare("UPDATE pipepass_servers SET status='online', last_seen=datetime('now'), meta=? WHERE url=?")
      .run(stats ? JSON.stringify(stats) : null, cleanUrl);
  }
  // If not registered yet, silently ignore (they must call /register first)
  res.json({ success: true });
});

// ─── Background: mark servers offline if no heartbeat for 2 min ─────────────
setInterval(() => {
  try {
    const db = getDb();
    db.prepare(`UPDATE pipepass_servers SET status='offline'
      WHERE status='online' AND last_seen < datetime('now', '-2 minutes')`).run();
  } catch { /* db might not be initialized yet */ }
}, 30_000);

// ─── POST /api/pipepass/ping-url — ping a single custom URL ─────────────────
router.post('/ping-url', requireAuth, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ success: false, error: 'URL requise' });
  try {
    const r = await httpGet(`${url.replace(/\/$/, '')}/api/mailsuite/ping`, 3000);
    res.json({ online: r.ok && r.status === 200, data: r.data });
  } catch {
    res.json({ online: false });
  }
});


// ─── POST /api/pipepass/export — send users to PipePass ─────────────────────
router.post('/export', requireAuth, async (req, res) => {
  ensureTables();
  const { server_url, users, batch_name } = req.body;
  if (!server_url || !users?.length) {
    return res.status(400).json({ success: false, error: 'server_url et users requis' });
  }

  const db = getDb();
  // Build credentials list: email:password
  const credentials = users.map((u) => `${u.email}:${u.password}`).join('\n');
  const batchName = batch_name || `batch_${Date.now()}`;

  // Create job record
  const jobRow = db.prepare('INSERT INTO pipepass_jobs (server_url, batch_name, user_count, status) VALUES (?,?,?,?)')
    .run(server_url, batchName, users.length, 'sending');

  try {
    const callbackUrl = `${process.env.SELF_URL || 'http://localhost:5050'}/api/pipepass/callback`;
    const r = await httpPost(`${server_url}/api/mailsuite/import`, {
      credentials,
      batch_name: batchName,
      job_db_id: jobRow.lastInsertRowid,
      callback_url: callbackUrl,
    }, 8000);

    if (r.ok) {
      db.prepare("UPDATE pipepass_jobs SET status='running', job_id=? WHERE id=?")
        .run(r.data?.job_id || null, jobRow.lastInsertRowid);
      res.json({ success: true, job_db_id: jobRow.lastInsertRowid, pipe_job_id: r.data?.job_id });
    } else {
      db.prepare("UPDATE pipepass_jobs SET status='error' WHERE id=?").run(jobRow.lastInsertRowid);
      res.status(400).json({ success: false, error: r.data?.error || 'Erreur PipePass' });
    }
  } catch (e) {
    db.prepare("UPDATE pipepass_jobs SET status='error' WHERE id=?").run(jobRow.lastInsertRowid);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── POST /api/pipepass/callback — PipePass calls this when job is done ──────
router.post('/callback', async (req, res) => {
  ensureTables();
  const { job_db_id, status, results_csv, stats } = req.body;
  const db = getDb();

  if (job_db_id && results_csv) {
    // Save the CSV result file
    const filename = `pipepass_result_${job_db_id}_${Date.now()}.csv`;
    const filepath = path.join(RESULTS_DIR, filename);
    fs.writeFileSync(filepath, results_csv, 'utf8');

    db.prepare("UPDATE pipepass_jobs SET status=?, result_file=?, finished_at=datetime('now') WHERE id=?")
      .run(status || 'done', filename, job_db_id);

    // Parse and store individual results
    const lines = results_csv.split('\n').filter(l => l.trim() && !l.startsWith('Email'));
    const stmt = db.prepare('INSERT OR REPLACE INTO pipepass_results (job_id, email, password, fa_secret, app_password) VALUES (?,?,?,?,?)');
    for (const line of lines) {
      const parts = line.split(',').map(p => p.replace(/^"|"$/g, '').trim());
      if (parts.length >= 4) stmt.run(job_db_id, parts[0], parts[1], parts[2], parts[3]);
    }

    // Log notification
    db.prepare("INSERT INTO agent_logs (agent_name, action, status, result) VALUES (?,?,?,?)")
      .run('pipepass', `Job #${job_db_id} terminé`, 'success', `${stats?.success || 0} 2FA activés`);
  }

  res.json({ success: true });
});

// ─── GET /api/pipepass/jobs — list jobs ─────────────────────────────────────
router.get('/jobs', requireAuth, (req, res) => {
  ensureTables();
  const db = getDb();
  const jobs = db.prepare('SELECT * FROM pipepass_jobs ORDER BY created_at DESC LIMIT 50').all();
  res.json({ success: true, jobs });
});

// ─── GET /api/pipepass/jobs/:id/status — poll job status from PipePass ───────
router.get('/jobs/:id/status', requireAuth, async (req, res) => {
  ensureTables();
  const db = getDb();
  const job = db.prepare('SELECT * FROM pipepass_jobs WHERE id=?').get(req.params.id);
  if (!job) return res.status(404).json({ success: false, error: 'Job introuvable' });

  if (job.job_id && job.status === 'running') {
    try {
      const r = await httpGet(`${job.server_url}/api/mailsuite/job/${job.job_id}`, 3000);
      if (r.ok && r.data?.status && r.data.status !== job.status) {
        db.prepare("UPDATE pipepass_jobs SET status=? WHERE id=?").run(r.data.status, job.id);
        job.status = r.data.status;
      }
      return res.json({ success: true, job: { ...job, remote: r.data } });
    } catch { /* offline, return cached status */ }
  }
  res.json({ success: true, job });
});

// ─── GET /api/pipepass/results — all 2FA results ────────────────────────────
router.get('/results', requireAuth, (req, res) => {
  ensureTables();
  const db = getDb();
  const results = db.prepare('SELECT pr.*, pj.batch_name FROM pipepass_results pr LEFT JOIN pipepass_jobs pj ON pr.job_id=pj.id ORDER BY pr.imported_at DESC').all();
  res.json({ success: true, results });
});

// ─── GET /api/pipepass/results/download/:jobId — download CSV ───────────────
router.get('/results/download/:jobId', requireAuth, (req, res) => {
  ensureTables();
  const db = getDb();
  const job = db.prepare('SELECT * FROM pipepass_jobs WHERE id=?').get(req.params.jobId);
  
  if (job?.result_file) {
    const fp = path.join(RESULTS_DIR, job.result_file);
    if (fs.existsSync(fp)) return res.download(fp);
  }

  // Build CSV from results table
  const rows = db.prepare('SELECT * FROM pipepass_results WHERE job_id=?').all(req.params.jobId);
  if (!rows.length) return res.status(404).json({ success: false, error: 'Aucun résultat' });
  
  let csv = 'Email,Password,FA Secret (TOTP),App Password\n';
  rows.forEach(r => { csv += `"${r.email}","${r.password}","${r.fa_secret}","${r.app_password}"\n`; });
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=pipepass_${req.params.jobId}.csv`);
  res.send(csv);
});

// ─── GET /api/pipepass/results/download-all — download all results ───────────
router.get('/results/download-all', requireAuth, (req, res) => {
  ensureTables();
  const db = getDb();
  const rows = db.prepare('SELECT pr.*, pj.batch_name FROM pipepass_results pr LEFT JOIN pipepass_jobs pj ON pr.job_id=pj.id ORDER BY pr.imported_at DESC').all();
  
  let csv = 'Email,Password,FA Secret (TOTP),App Password,Batch\n';
  rows.forEach(r => { csv += `"${r.email}","${r.password}","${r.fa_secret}","${r.app_password}","${r.batch_name || ''}"\n`; });
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename=pipepass_all_results_${Date.now()}.csv`);
  res.send(csv);
});

module.exports = router;
