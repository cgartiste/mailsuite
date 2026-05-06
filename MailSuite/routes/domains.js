const router = require('express').Router();
const { loginRequired, adminRequired } = require('../middleware/auth');
const { getDb, getSetting } = require('../db/index');
const { fullDnsCheck } = require('../services/dns-checker');

router.get('/domains', loginRequired, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`SELECT d.*,
    (SELECT COUNT(*) FROM gw_accounts WHERE domain_id=d.id) as account_count,
    (SELECT COUNT(*) FROM incidents WHERE domain_id=d.id AND resolved=0) as open_incidents
    FROM domains d ORDER BY d.created_at DESC`).all();
  res.render('domains', { domains: rows, page: 'domains' });
});

router.post('/domains/add', loginRequired, (req, res) => {
  const domain = (req.body.domain || '').trim().toLowerCase();
  if (!domain) { req.flash('error', 'Domaine requis'); return res.redirect('/domains'); }
  const db = getDb();
  try {
    db.prepare('INSERT INTO domains (domain) VALUES (?)').run(domain);
    db.prepare("INSERT INTO agent_logs (agent_name,action,status,result) VALUES (?,?,?,?)").run('system', `Domaine ajouté: ${domain}`, 'success', `Nouveau domaine ${domain}`);
    req.flash('success', `Domaine ${domain} ajouté`);
  } catch { req.flash('error', `Le domaine ${domain} existe déjà`); }
  res.redirect('/domains');
});

router.get('/domains/:id', loginRequired, (req, res) => {
  const db = getDb();
  const domain = db.prepare('SELECT * FROM domains WHERE id=?').get(req.params.id);
  if (!domain) { req.flash('error', 'Domaine introuvable'); return res.redirect('/domains'); }
  const accounts = db.prepare('SELECT * FROM gw_accounts WHERE domain_id=? ORDER BY created_at DESC').all(req.params.id);
  const incidents = db.prepare('SELECT * FROM incidents WHERE domain_id=? ORDER BY created_at DESC LIMIT 10').all(req.params.id);
  const logs = db.prepare("SELECT * FROM agent_logs WHERE result LIKE ? ORDER BY created_at DESC LIMIT 10").all(`%${domain.domain}%`);
  res.render('domain_detail', { domain, accounts, incidents, logs, page: 'domains' });
});

router.post('/domains/:id/check-dns', loginRequired, async (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM domains WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const selector = getSetting('dkim_selector') || 'mail';
  const result = await fullDnsCheck(row.domain, selector);
  db.prepare(`UPDATE domains SET spf_status=?, dkim_status=?, dmarc_status=?, bimi_status=?, last_dns_check=datetime('now') WHERE id=?`)
    .run(result.spf.status, result.dkim.status, result.dmarc.status, result.bimi.status, req.params.id);
  db.prepare("INSERT INTO agent_logs (agent_name,action,status,result) VALUES (?,?,?,?)")
    .run('dns_guardian', `DNS check: ${row.domain}`, result.allValid ? 'success' : 'warning',
      `SPF:${result.spf.status} | DKIM:${result.dkim.status} | DMARC:${result.dmarc.status}`);
  res.json(result);
});

router.post('/domains/:id/toggle', loginRequired, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM domains WHERE id=?').get(req.params.id);
  if (row) {
    const ns = ['active','warming'].includes(row.status) ? 'paused' : 'active';
    db.prepare('UPDATE domains SET status=? WHERE id=?').run(ns, req.params.id);
    req.flash('success', `Domaine ${row.domain} : ${ns}`);
  }
  res.redirect(`/domains/${req.params.id}`);
});

router.post('/domains/:id/delete', loginRequired, adminRequired, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT domain FROM domains WHERE id=?').get(req.params.id);
  if (row) { db.prepare('DELETE FROM domains WHERE id=?').run(req.params.id); req.flash('success', `Domaine ${row.domain} supprimé`); }
  res.redirect('/domains');
});

module.exports = router;
