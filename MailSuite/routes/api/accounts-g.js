const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('./middleware');
const { getDb } = require('../../db/index');
const { GoogleWorkspaceService } = require('../../services/google-workspace');

const GW_CREDS_DIR = path.join(__dirname, '..', '..', 'gw_creds');

function buildGw(cred) {
  const fp = path.join(GW_CREDS_DIR, cred.json_filename);
  if (!fs.existsSync(fp)) return null;
  try { return new GoogleWorkspaceService(fp, cred.admin_email); } catch { return null; }
}

// ─── All accounts — FAST: returns cached DB values ──────────────────────────
router.get('/', requireAuth, async (req, res) => {
  const db = getDb();
  const creds = db.prepare('SELECT * FROM gw_credentials ORDER BY is_active DESC, created_at DESC').all();

  // Fast path — return cached DB stats
  if (req.query.live !== '1') {
    const cards = creds.map(cred => {
      // Parse cached domain names from domains_json column
      let domains = [];
      if (cred.domains_json) {
        try {
          const names = JSON.parse(cred.domains_json);
          domains = names.map(n => ({ domainName: n }));
        } catch {}
      }
      return {
        ...cred,
        domains,
        totalUsers:     cred.total_users     || 0,
        activeUsers:    cred.active_users     || 0,
        suspendedUsers: cred.suspended_users  || 0,
        connected:      cred.status === 'connected',
      };
    });
    return res.json({ success: true, accounts: cards });
  }

  // Live path (slow) — only if ?live=1 is passed explicitly
  const cards = [];
  for (const cred of creds) {
    const gw = buildGw(cred);
    const card = { ...cred, domains: [], totalUsers: 0, activeUsers: 0, suspendedUsers: 0, connected: false };
    if (gw) {
      try {
        const domains = await gw.listDomains();
        card.domains = domains; card.connected = true;
        let total = 0, active = 0, suspended = 0;
        for (const d of domains) {
          try {
            const users = await gw.listUsers({ domain: d.domainName, maxResults: 500 });
            total += users.length;
            active += users.filter(u => !u.suspended).length;
            suspended += users.filter(u => u.suspended).length;
          } catch {}
        }
        card.totalUsers = total; card.activeUsers = active; card.suspendedUsers = suspended;
        const domainNames = JSON.stringify(domains.map(d => d.domainName));
        db.prepare("UPDATE gw_credentials SET total_users=?,active_users=?,suspended_users=?,domain_count=?,domains_json=?,last_sync=datetime('now'),status='connected' WHERE id=?")
          .run(total, active, suspended, domains.length, domainNames, cred.id);
      } catch { card.connected = false; }
    }
    cards.push(card);
  }
  res.json({ success: true, accounts: cards });
});

// ─── Sync a single account (background-friendly) ────────────────────────────
router.post('/:id/sync', requireAuth, async (req, res) => {
  const db = getDb();
  const cred = db.prepare('SELECT * FROM gw_credentials WHERE id=?').get(req.params.id);
  if (!cred) return res.status(404).json({ success: false, error: 'Introuvable' });
  const gw = buildGw(cred);
  if (!gw) return res.status(400).json({ success: false, error: 'Fichier JSON introuvable' });

  // Timeout after 60s
  const timer = setTimeout(() => {
    if (!res.headersSent) res.status(408).json({ success: false, error: 'Timeout — réessayez' });
  }, 60000);

  try {
    const domains = await gw.listDomains();
    let total = 0, active = 0, suspended = 0;
    for (const d of domains) {
      try {
        const users = await gw.listUsers({ domain: d.domainName, maxResults: 500 });
        total += users.length;
        active += users.filter(u => !u.suspended).length;
        suspended += users.filter(u => u.suspended).length;
      } catch {}
    }
    const domainNames = JSON.stringify(domains.map(d => d.domainName));
    db.prepare("UPDATE gw_credentials SET total_users=?,active_users=?,suspended_users=?,domain_count=?,domains_json=?,last_sync=datetime('now'),status='connected' WHERE id=?")
      .run(total, active, suspended, domains.length, domainNames, cred.id);
    clearTimeout(timer);
    if (!res.headersSent)
      res.json({ success: true, total, active, suspended, domain_count: domains.length, domains: domains.map(d => d.domainName) });
  } catch (err) {
    clearTimeout(timer);
    db.prepare("UPDATE gw_credentials SET status='error' WHERE id=?").run(cred.id);
    if (!res.headersSent)
      res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Single account detail (live — called on detail page only) ──────────────
router.get('/:id', requireAuth, async (req, res) => {
  const db = getDb();
  const cred = db.prepare('SELECT * FROM gw_credentials WHERE id=?').get(req.params.id);
  if (!cred) return res.status(404).json({ success: false, error: 'Introuvable' });
  const gw = buildGw(cred);
  let domains = [], allUsers = [], orgUnits = [], groups = [];
  let stats = { total: 0, active: 0, suspended: 0, twoFaOn: 0, admins: 0 };
  if (gw) {
    try {
      domains = await gw.listDomains();
      orgUnits = await gw.listOrgUnits();
      for (const d of domains) {
        try {
          const users = await gw.listUsers({ domain: d.domainName, maxResults: 500 });
          allUsers.push(...users.map(u => ({ email: u.primaryEmail, name: u.name?.fullName || '', suspended: !!u.suspended, twoFa: !!u.isEnrolledIn2Sv, admin: !!u.isAdmin, orgUnit: u.orgUnitPath || '/', creationTime: u.creationTime, lastLoginTime: u.lastLoginTime, domain: d.domainName })));
        } catch {}
        try { const g = await gw.listGroups(d.domainName); groups.push(...g); } catch {}
      }
      stats = { total: allUsers.length, active: allUsers.filter(u => !u.suspended).length, suspended: allUsers.filter(u => u.suspended).length, twoFaOn: allUsers.filter(u => u.twoFa).length, admins: allUsers.filter(u => u.admin).length };
      // Update cache in DB
      db.prepare('UPDATE gw_credentials SET total_users=?,active_users=?,suspended_users=?,domain_count=?,last_sync=datetime("now"),status=? WHERE id=?')
        .run(stats.total, stats.active, stats.suspended, domains.length, 'connected', cred.id);
    } catch {}
  }
  const createdUsers = db.prepare('SELECT * FROM gw_created_users WHERE credential_id=? ORDER BY created_at DESC LIMIT 100').all(cred.id);
  res.json({ success: true, cred, domains, allUsers, orgUnits, groups, stats, createdUsers });
});

router.patch('/:id/users/:email/suspend', requireAuth, async (req, res) => {
  const cred = getDb().prepare('SELECT * FROM gw_credentials WHERE id=?').get(req.params.id);
  if (!cred) return res.status(404).json({ success: false, error: 'Introuvable' });
  const gw = buildGw(cred); if (!gw) return res.status(400).json({ success: false, error: 'GW non dispo' });
  res.json(await gw.suspendUser(req.params.email, req.body.suspend !== false));
});

router.delete('/:id/users/:email', requireAuth, async (req, res) => {
  const cred = getDb().prepare('SELECT * FROM gw_credentials WHERE id=?').get(req.params.id);
  if (!cred) return res.status(404).json({ success: false, error: 'Introuvable' });
  const gw = buildGw(cred); if (!gw) return res.status(400).json({ success: false, error: 'GW non dispo' });
  res.json(await gw.deleteUser(req.params.email));
});

// Helper function for updating job logs
function updateJob(id, log, progress = null, status = null) {
  const db = getDb();
  const job = db.prepare('SELECT * FROM dns_jobs WHERE id=?').get(id);
  if (!job) return;
  const logs = JSON.parse(job.log || '[]');
  logs.push(`[${new Date().toLocaleTimeString()}] ${log}`);
  
  let q = 'UPDATE dns_jobs SET log=?';
  const params = [JSON.stringify(logs)];
  if (progress !== null) { q += ', progress=?'; params.push(progress); }
  if (status !== null) { q += ', status=?'; params.push(status); }
  q += ' WHERE id=?';
  params.push(id);
  
  db.prepare(q).run(...params);
}

// ─── Import CF Domains to Google Workspace ─────────────────────────────────
router.post('/:id/import-cf-domains', requireAuth, async (req, res) => {
  const { zones } = req.body;
  if (!zones || !zones.length) return res.status(400).json({ success: false, error: 'Zones manquantes' });

  const cred = getDb().prepare('SELECT * FROM gw_credentials WHERE id=?').get(req.params.id);
  if (!cred) return res.status(404).json({ success: false, error: 'Compte introuvable' });

  const jobId = 'job_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  getDb().prepare("INSERT INTO dns_jobs (id, type, status, log, progress) VALUES (?, 'import_cf', 'running', '[]', 5)").run(jobId);
  res.json({ success: true, jobId });

  (async () => {
    try {
      const gw = buildGw(cred);
      if (!gw) throw new Error("Erreur d'initialisation Google Workspace");

      const { CloudflareService } = require('../../services/cloudflare');
      const cfToken = getSetting('cloudflare_api_token') || getDb().prepare('SELECT api_token FROM cf_accounts WHERE is_active=1').get()?.api_token;
      if (!cfToken) throw new Error('Token Cloudflare introuvable — vérifiez les paramètres');
      const cf = new CloudflareService(cfToken);

      const totalSteps = zones.length * 7;
      let currentStep = 0;
      let successCount = 0;

      for (const zone of zones) {
        const domainName = zone.name;
        try {
          updateJob(jobId, `⚙️ [${domainName}] Démarrage...`, Math.floor((currentStep / totalSteps) * 100));

          // ── STEP 1: Add domain to Google Workspace ────────────────
          const addResult = await gw.addDomain(domainName);
          if (addResult.error) throw new Error(`GW insert: ${addResult.error}`);
          const msg1 = addResult.alreadyExists
            ? `ℹ️ [${domainName}] Déjà dans Google Workspace`
            : `✅ [${domainName}] Ajouté à Google Workspace`;
          updateJob(jobId, msg1, Math.floor((++currentStep / totalSteps) * 100));

          // ── STEP 2: Get Google verification token ─────────────────
          let verifyToken = null;
          try {
            verifyToken = await gw.getDomainVerificationToken(domainName);
            updateJob(jobId, `✅ [${domainName}] Token de vérification obtenu`, Math.floor((++currentStep / totalSteps) * 100));
          } catch (e) {
            updateJob(jobId, `⚠️ [${domainName}] Impossible d'obtenir le token (scope siteverification non délégué): ${e.message}`, Math.floor((++currentStep / totalSteps) * 100));
          }

          // ── STEP 3: Push verification TXT to Cloudflare ───────────
          if (verifyToken) {
            try {
              await cf.upsertDnsRecord(zone.id, { type: 'TXT', name: domainName, content: verifyToken, ttl: 300 });
              updateJob(jobId, `✅ [${domainName}] TXT vérification poussé: ${verifyToken}`, Math.floor((++currentStep / totalSteps) * 100));
            } catch (e) {
              updateJob(jobId, `⚠️ [${domainName}] Erreur TXT vérification: ${e.message}`, Math.floor((++currentStep / totalSteps) * 100));
            }
          } else { currentStep++; }

          // ── STEP 4: Push MX records to Cloudflare ────────────────
          let mxOk = 0;
          for (const mx of gw.getMxRecords()) {
            try {
              await cf.upsertDnsRecord(zone.id, { type: 'MX', name: domainName, content: mx.content, priority: mx.priority, ttl: 3600 });
              mxOk++;
            } catch {}
          }
          updateJob(jobId, `✅ [${domainName}] ${mxOk}/5 enregistrements MX Google poussés`, Math.floor((++currentStep / totalSteps) * 100));

          // ── STEP 5: SPF + DMARC ───────────────────────────────────
          try {
            await cf.upsertDnsRecord(zone.id, { type: 'TXT', name: domainName, content: 'v=spf1 include:_spf.google.com ~all', ttl: 3600 });
            await cf.upsertDnsRecord(zone.id, { type: 'TXT', name: `_dmarc.${domainName}`, content: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${domainName}; pct=100`, ttl: 3600 });
            updateJob(jobId, `✅ [${domainName}] SPF et DMARC configurés`, Math.floor((++currentStep / totalSteps) * 100));
          } catch (e) {
            updateJob(jobId, `⚠️ [${domainName}] SPF/DMARC: ${e.message}`, Math.floor((++currentStep / totalSteps) * 100));
          }

          // ── STEP 6: Wait 15s for DNS propagation ─────────────────
          updateJob(jobId, `⏳ [${domainName}] Attente propagation DNS (15s)...`, Math.floor((++currentStep / totalSteps) * 100));
          await new Promise(r => setTimeout(r, 15000));

          // ── STEP 7: Trigger Google verification ──────────────────
          if (verifyToken) {
            const verResult = await gw.verifyDomainSiteVerification(domainName);
            if (verResult.success) {
              updateJob(jobId, `✅ [${domainName}] Domaine vérifié chez Google !`, Math.floor((++currentStep / totalSteps) * 100));
              successCount++;
            } else {
              updateJob(jobId, `⚠️ [${domainName}] Vérification Google: ${verResult.error} (DNS peut nécessiter plus de temps)`, Math.floor((++currentStep / totalSteps) * 100));
              successCount++;
            }
          } else {
            updateJob(jobId, `ℹ️ [${domainName}] Domaine ajouté — vérification manuelle requise dans admin.google.com`, Math.floor((++currentStep / totalSteps) * 100));
            successCount++;
          }

        } catch (err) {
          updateJob(jobId, `❌ [${domainName}] Erreur: ${err.message}`);
          currentStep += 7;
        }
      }

      updateJob(jobId, `✅ Terminé: ${successCount}/${zones.length} domaines traités.`, 100, 'done');
    } catch (err) {
      updateJob(jobId, `❌ Erreur critique: ${err.message}`, null, 'failed');
    }
  })();
});

// ─── Import MS Domains to Google Workspace ─────────────────────────────────
router.post('/:id/import-ms-domains', requireAuth, async (req, res) => {
  const { domains: msDomains } = req.body;
  if (!msDomains || !msDomains.length) return res.status(400).json({ success: false, error: 'Domaines manquants' });

  const cred = getDb().prepare('SELECT * FROM gw_credentials WHERE id=?').get(req.params.id);
  if (!cred) return res.status(404).json({ success: false, error: 'Compte introuvable' });

  const jobId = 'job_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  getDb().prepare("INSERT INTO dns_jobs (id, type, status, log, progress) VALUES (?, 'import_ms', 'running', '[]', 5)").run(jobId);
  res.json({ success: true, jobId });

  (async () => {
    try {
      const gw = buildGw(cred);
      if (!gw) throw new Error("Erreur d'initialisation Google Workspace");

      const totalSteps = msDomains.length * 4;
      let currentStep = 0;
      let successCount = 0;

      for (const domain of msDomains) {
        const domainName = domain.id || domain.name;
        const isOnMicrosoft = domainName.includes('.onmicrosoft.com');

        try {
          updateJob(jobId, `⚙️ [${domainName}] Démarrage...`, Math.floor((currentStep / totalSteps) * 100));

          // ── STEP 1: Add domain to Google Workspace ─────────────────
          const addResult = await gw.addDomain(domainName);
          if (addResult.error) throw new Error(`GW insert: ${addResult.error}`);
          const msg1 = addResult.alreadyExists
            ? `ℹ️ [${domainName}] Déjà dans Google Workspace`
            : `✅ [${domainName}] Ajouté à Google Workspace`;
          updateJob(jobId, msg1, Math.floor((++currentStep / totalSteps) * 100));

          // ── STEP 2: Verification token ─────────────────────────────
          let verifyToken = null;
          try {
            verifyToken = await gw.getDomainVerificationToken(domainName);
            updateJob(jobId, `✅ [${domainName}] Token de vérification: ${verifyToken}`, Math.floor((++currentStep / totalSteps) * 100));
          } catch (e) {
            updateJob(jobId, `⚠️ [${domainName}] Token non obtenu: ${e.message}`, Math.floor((++currentStep / totalSteps) * 100));
          }

          // ── STEP 3: onmicrosoft.com — DNS managed by Microsoft ─────
          if (isOnMicrosoft) {
            updateJob(jobId, `⚠️ [${domainName}] DNS contrôlé par Microsoft — ajout automatique TXT impossible`, Math.floor((++currentStep / totalSteps) * 100));
            if (verifyToken) {
              updateJob(jobId, `📋 [${domainName}] MANUEL REQUIS: Ajoutez ce TXT dans admin.microsoft.com → DNS: ${verifyToken}`, Math.floor((currentStep / totalSteps) * 100));
            }
          } else {
            // Non-onmicrosoft domain with Microsoft DNS — try Microsoft Graph API if configured
            updateJob(jobId, `ℹ️ [${domainName}] Vérification manuelle requise dans admin.google.com`, Math.floor((++currentStep / totalSteps) * 100));
          }

          // ── STEP 4: Try verification anyway (might work if already propagated) ──
          if (verifyToken) {
            updateJob(jobId, `⏳ [${domainName}] Tentative de vérification Google...`, Math.floor((++currentStep / totalSteps) * 100));
            const verResult = await gw.verifyDomainSiteVerification(domainName);
            if (verResult.success) {
              updateJob(jobId, `✅ [${domainName}] Domaine vérifié chez Google !`, Math.floor((currentStep / totalSteps) * 100));
            } else {
              updateJob(jobId, `ℹ️ [${domainName}] Pas encore vérifié (${verResult.error}) — ajoutez le TXT puis relancez`, Math.floor((currentStep / totalSteps) * 100));
            }
          } else { currentStep++; }

          successCount++;

        } catch (err) {
          updateJob(jobId, `❌ [${domainName}] Erreur: ${err.message}`);
          currentStep += 4;
        }
      }

      updateJob(jobId,
        `✅ Terminé: ${successCount}/${msDomains.length} domaines traités.\n` +
        `ℹ️ Pour les domaines *.onmicrosoft.com: ajoutez le TXT de vérification dans admin.microsoft.com → Settings → Domains → DNS.`,
        100, 'done');
    } catch (err) {
      updateJob(jobId, `❌ Erreur critique: ${err.message}`, null, 'failed');
    }
  })();
});

module.exports = router;
