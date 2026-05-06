/**
 * MailSuite — Database Schema & Initialization
 * Creates all tables and seeds default data.
 */
const crypto = require('crypto');
const { getDb } = require('./index');

function initDb() {
  const db = getDb();

  // ─── Core tables ──────────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      first_name TEXT,
      last_name TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS domains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'warming',
      reputation TEXT DEFAULT 'unknown',
      spf_status TEXT DEFAULT 'unknown',
      dkim_status TEXT DEFAULT 'unknown',
      dmarc_status TEXT DEFAULT 'unknown',
      bimi_status TEXT DEFAULT 'unknown',
      daily_volume_limit INTEGER DEFAULT 50,
      current_warmup_day INTEGER DEFAULT 0,
      warmup_target INTEGER DEFAULT 5000,
      emails_sent_today INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      last_dns_check TEXT
    );

    CREATE TABLE IF NOT EXISTS ip_pool (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip_address TEXT UNIQUE NOT NULL,
      domain_id INTEGER REFERENCES domains(id),
      status TEXT DEFAULT 'active',
      reputation TEXT DEFAULT 'unknown',
      sent_today INTEGER DEFAULT 0,
      sent_hour INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS gw_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      domain_id INTEGER REFERENCES domains(id),
      status TEXT DEFAULT 'warming',
      sent_today INTEGER DEFAULT 0,
      sent_hour INTEGER DEFAULT 0,
      daily_limit INTEGER DEFAULT 400,
      hourly_limit INTEGER DEFAULT 50,
      reputation_score REAL DEFAULT 100.0,
      last_used TEXT,
      warmup_day INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contact_lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      total_contacts INTEGER DEFAULT 0,
      active_contacts INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      list_id INTEGER REFERENCES contact_lists(id),
      first_name TEXT,
      last_name TEXT,
      status TEXT DEFAULT 'active',
      engagement_score REAL DEFAULT 50.0,
      bounce_count INTEGER DEFAULT 0,
      opens INTEGER DEFAULT 0,
      clicks INTEGER DEFAULT 0,
      last_opened TEXT,
      last_clicked TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(email, list_id)
    );

    CREATE TABLE IF NOT EXISTS suppression_list (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      reason TEXT NOT NULL,
      source TEXT,
      permanent INTEGER DEFAULT 1,
      added_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      from_name TEXT,
      from_email TEXT,
      content TEXT,
      list_id INTEGER REFERENCES contact_lists(id),
      domain_id INTEGER REFERENCES domains(id),
      status TEXT DEFAULT 'draft',
      spam_score REAL,
      inbox_score REAL,
      scheduled_at TEXT,
      started_at TEXT,
      completed_at TEXT,
      total_recipients INTEGER DEFAULT 0,
      sent_count INTEGER DEFAULT 0,
      open_count INTEGER DEFAULT 0,
      click_count INTEGER DEFAULT 0,
      bounce_count INTEGER DEFAULT 0,
      complaint_count INTEGER DEFAULT 0,
      unsub_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agent_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_name TEXT NOT NULL,
      action TEXT NOT NULL,
      status TEXT DEFAULT 'success',
      result TEXT,
      duration_ms INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      domain_id INTEGER REFERENCES domains(id),
      severity TEXT DEFAULT 'warning',
      title TEXT NOT NULL,
      description TEXT,
      resolved INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT
    );
  `);

  // ─── Google Workspace tables ──────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS gw_credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      admin_email TEXT NOT NULL,
      domain TEXT NOT NULL,
      json_filename TEXT NOT NULL,
      project_id TEXT,
      client_email TEXT,
      is_active INTEGER DEFAULT 0,
      status TEXT DEFAULT 'connected',
      total_users INTEGER DEFAULT 0,
      active_users INTEGER DEFAULT 0,
      suspended_users INTEGER DEFAULT 0,
      domain_count INTEGER DEFAULT 0,
      last_sync TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS gw_totp_secrets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT,
      totp_secret TEXT,
      app_password TEXT,
      notes TEXT,
      source TEXT DEFAULT 'manual',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS gw_domain_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      credential_id INTEGER REFERENCES gw_credentials(id),
      old_domain TEXT,
      new_domain TEXT,
      status TEXT DEFAULT 'pending',
      total_users INTEGER DEFAULT 0,
      changed_users INTEGER DEFAULT 0,
      failed_users INTEGER DEFAULT 0,
      result_json TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS gw_domain_deleted (
      domain TEXT PRIMARY KEY,
      deleted_count INTEGER DEFAULT 0,
      last_deleted_at TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS gw_created_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER,
      email TEXT NOT NULL,
      password TEXT,
      first_name TEXT,
      last_name TEXT,
      domain TEXT,
      credential_id INTEGER REFERENCES gw_credentials(id),
      status TEXT DEFAULT 'created',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // ─── Cloudflare multi-account tables ──────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS cf_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      api_token TEXT NOT NULL,
      email TEXT,
      account_id TEXT,
      is_active INTEGER DEFAULT 0,
      zone_count INTEGER DEFAULT 0,
      last_sync TEXT,
      status TEXT DEFAULT 'connected',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // ─── Microsoft 365 multi-account tables ───────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS ms_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      client_id TEXT NOT NULL,
      client_secret TEXT NOT NULL,
      domain TEXT,
      is_active INTEGER DEFAULT 0,
      total_users INTEGER DEFAULT 0,
      active_users INTEGER DEFAULT 0,
      licensed_users INTEGER DEFAULT 0,
      last_sync TEXT,
      status TEXT DEFAULT 'connected',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ms_created_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      display_name TEXT,
      password TEXT,
      domain TEXT,
      ms_account_id INTEGER REFERENCES ms_accounts(id),
      license TEXT,
      status TEXT DEFAULT 'created',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // ─── DNS / import jobs ────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS dns_jobs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      status TEXT DEFAULT 'running',
      log TEXT DEFAULT '[]',
      progress INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      finished_at TEXT
    );
  `);

  // ─── Agent API keys ───────────────────────────────────────────────
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      key_preview TEXT NOT NULL,
      agent TEXT DEFAULT 'all',
      calls_count INTEGER DEFAULT 0,
      last_used TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // ─── Seed users ───────────────────────────────────────────────────
  const pwHash = crypto.createHash('sha256').update('B8B9mAZ77m5PUDr//').digest('hex');
  const seedUsers = [
    ['said',  pwHash, 'admin', 'Said',  ''],
    ['nabil', pwHash, 'admin', 'Nabil', ''],
    ['tarek', pwHash, 'admin', 'Tarek', ''],
  ];
  const seedStmt = db.prepare('INSERT OR IGNORE INTO app_users (username, password_hash, role, first_name, last_name) VALUES (?,?,?,?,?)');
  for (const u of seedUsers) seedStmt.run(...u);
  // Supprimer l'ancien compte admin par défaut s'il existe encore
  db.prepare("DELETE FROM app_users WHERE username='admin' AND first_name='Admin'").run();

  // ─── Seed default settings ────────────────────────────────────────
  const defaults = [
    ['cloudflare_api_token', ''],
    ['cloudflare_zone_id', ''],
    ['n8n_url', 'http://localhost:5678'],
    ['n8n_api_key', ''],
    ['postal_url', 'http://localhost:4000'],
    ['postal_api_key', ''],
    ['telegram_bot_token', ''],
    ['telegram_chat_id', ''],
    ['app_name', 'MailSuite'],
    ['max_spam_score', '3.0'],
    ['min_inbox_score', '80'],
    ['dkim_selector', 'mail'],
  ];
  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [key, value] of defaults) {
    insertSetting.run(key, value);
  }

  console.log('  ✓ Database initialized');
}

module.exports = { initDb };
