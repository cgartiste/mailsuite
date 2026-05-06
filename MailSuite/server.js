/**
 * MailSuite API Server — Express REST API
 * Pure JSON API consumed by the Next.js frontend.
 * Port: 5050
 */
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const { initDb } = require('./db/schema');
const { getDb, getSetting } = require('./db/index');

const app = express();
const PORT = process.env.PORT || 5050;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// ─── CORS ────────────────────────────────────────────────────────
app.use(cors({
  origin: [FRONTEND_URL, 'http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
}));

const FileStore = require('session-file-store')(session);

// ─── Middleware ──────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'mailsuite-secret-2025',
  resave: false,
  saveUninitialized: false,
  store: new FileStore({
    path: path.join(__dirname, '.sessions'),
    ttl: 86400,        // 24h in seconds
    retries: 0,
    logFn: () => {},   // silence session-file-store logs
  }),
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24h
    sameSite: 'lax',
    httpOnly: true,
  },
}));

// File upload config (for GW credentials JSON)
const upload = multer({
  dest: path.join(__dirname, 'gw_creds'),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/json' || file.originalname.endsWith('.json')) {
      cb(null, true);
    } else {
      cb(new Error('Only JSON files allowed'));
    }
  },
});
app.locals.upload = upload;

// ─── Health check ─────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ─── API Routes ───────────────────────────────────────────────
app.use('/api/auth',       require('./routes/api/auth'));
app.use('/api/dashboard',  require('./routes/api/dashboard'));
app.use('/api/domains',    require('./routes/api/domains'));
app.use('/api/accounts',   require('./routes/api/accounts'));
app.use('/api/campaigns',  require('./routes/api/campaigns'));
app.use('/api/contacts',   require('./routes/api/contacts'));
app.use('/api/suppression',require('./routes/api/suppression'));
app.use('/api/monitoring', require('./routes/api/monitoring'));
app.use('/api/settings',   require('./routes/api/settings'));
app.use('/api/cloudflare', require('./routes/api/cloudflare'));
app.use('/api/gworkspace', require('./routes/api/gworkspace'));
app.use('/api/microsoft',  require('./routes/api/microsoft'));
app.use('/api/accounts-ms',require('./routes/api/microsoft')); // alias used by AccountsGDetail
app.use('/api/accounts-g', require('./routes/api/accounts-g'));
app.use('/api/pipepass',   require('./routes/api/pipepass'));
app.use('/api/agent',     require('./routes/api/agent'));
app.use('/api/jobs',       require('./routes/api/jobs'));

// ─── Global error handler ─────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: err.message || 'Internal server error' });
});

// ─── Start ───────────────────────────────────────────────────
initDb();
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  ✓ MailSuite API → http://localhost:${PORT}`);
  console.log(`  ✓ CORS allowed for ${FRONTEND_URL}\n`);
});
