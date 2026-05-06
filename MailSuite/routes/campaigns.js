const router = require('express').Router();
const { loginRequired } = require('../middleware/auth');
const { getDb } = require('../db/index');

router.get('/campaigns', loginRequired, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`SELECT c.*, d.domain as domain_name, l.name as list_name
    FROM campaigns c LEFT JOIN domains d ON c.domain_id=d.id LEFT JOIN contact_lists l ON c.list_id=l.id
    ORDER BY c.created_at DESC`).all();
  res.render('campaigns', { campaigns: rows, page: 'campaigns' });
});

router.get('/campaigns/new', loginRequired, (req, res) => {
  const db = getDb();
  const domains = db.prepare("SELECT id,domain FROM domains WHERE status!='blacklisted' ORDER BY domain").all();
  const lists = db.prepare('SELECT id,name,active_contacts FROM contact_lists ORDER BY name').all();
  res.render('campaign_new', { domains, lists, page: 'campaigns' });
});

router.post('/campaigns/new', loginRequired, (req, res) => {
  const { name, subject, from_name, from_email, content, list_id, domain_id, scheduled_at } = req.body;
  if (!name || !subject || !content) { req.flash('error', 'Nom, objet et contenu requis'); return res.redirect('/campaigns/new'); }
  const db = getDb();
  let total = 0;
  if (list_id) total = db.prepare("SELECT COUNT(*) as c FROM contacts WHERE list_id=? AND status='active'").get(list_id).c;
  const info = db.prepare(`INSERT INTO campaigns (name,subject,from_name,from_email,content,list_id,domain_id,scheduled_at,total_recipients) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(name, subject, from_name, from_email, content, list_id||null, domain_id||null, scheduled_at||null, total);
  req.flash('success', `Campagne "${name}" créée`);
  res.redirect(`/campaigns/${info.lastInsertRowid}`);
});

router.get('/campaigns/:id', loginRequired, (req, res) => {
  const db = getDb();
  const row = db.prepare(`SELECT c.*, d.domain as domain_name, l.name as list_name FROM campaigns c
    LEFT JOIN domains d ON c.domain_id=d.id LEFT JOIN contact_lists l ON c.list_id=l.id WHERE c.id=?`).get(req.params.id);
  if (!row) { req.flash('error', 'Campagne introuvable'); return res.redirect('/campaigns'); }
  const c = { ...row };
  const sent = c.sent_count || 0;
  c.open_rate = sent > 0 ? Math.round(c.open_count / sent * 1000) / 10 : 0;
  c.click_rate = sent > 0 ? Math.round(c.click_count / sent * 1000) / 10 : 0;
  c.bounce_rate = sent > 0 ? Math.round(c.bounce_count / sent * 10000) / 100 : 0;
  c.progress = c.total_recipients > 0 ? Math.round(sent / c.total_recipients * 100) : 0;
  res.render('campaign_detail', { campaign: c, page: 'campaigns' });
});

router.post('/campaigns/:id/launch', loginRequired, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM campaigns WHERE id=?').get(req.params.id);
  if (!row || !['draft','scheduled'].includes(row.status)) { req.flash('error', 'Impossible'); return res.redirect(`/campaigns/${req.params.id}`); }
  db.prepare("UPDATE campaigns SET status='running', started_at=datetime('now') WHERE id=?").run(req.params.id);
  req.flash('success', `Campagne "${row.name}" lancée !`);
  res.redirect(`/campaigns/${req.params.id}`);
});

router.post('/campaigns/:id/pause', loginRequired, (req, res) => {
  const db = getDb();
  db.prepare("UPDATE campaigns SET status='paused' WHERE id=?").run(req.params.id);
  req.flash('warning', 'Campagne en pause');
  res.redirect(`/campaigns/${req.params.id}`);
});

router.post('/campaigns/:id/delete', loginRequired, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM campaigns WHERE id=?').run(req.params.id);
  req.flash('success', 'Campagne supprimée');
  res.redirect('/campaigns');
});

module.exports = router;
