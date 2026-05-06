const router = require('express').Router();
const { loginRequired } = require('../middleware/auth');
const { getDb, getSetting } = require('../db/index');

const AGENTS = [
  {name:'dns_guardian',label:'DNS Guardian',icon:'bi-shield-lock',color:'indigo',webhook:'dns-check',description:'Surveille les configs DNS',caps:['SPF/DKIM/DMARC','Auto-correction CF','Blacklists','Alertes']},
  {name:'content_analyzer',label:'Content Analyzer',icon:'bi-file-earmark-check',color:'sky',webhook:'content-check',description:'Analyse contenu emails',caps:['Score spam','Ratio HTML/texte','Liens','RGPD']},
  {name:'warmup_manager',label:'Warmup Manager',icon:'bi-thermometer-half',color:'amber',webhook:'warmup-update',description:'Réchauffement progressif',caps:['Plan 45 jours','Volume auto','Pause auto','Rotation']},
  {name:'bounce_manager',label:'Bounce Manager',icon:'bi-arrow-return-left',color:'rose',webhook:'bounce-process',description:'Traite bounces et plaintes',caps:['Hard/Soft','FBL','Suppression auto','Honeypots']},
  {name:'sending_orchestrator',label:'Sending Orchestrator',icon:'bi-send',color:'emerald',webhook:'sending-trigger',description:'Pilote les envois',caps:['Rotation GW','Throttling','Timing optimal','Load balancing']},
  {name:'inbox_tester',label:'Inbox Tester',icon:'bi-inbox',color:'violet',webhook:'inbox-test',description:'Teste placement inbox',caps:['Seeds Gmail/Outlook','Score inbox','Pré-envoi','Suggestions']},
];

router.get('/agents', loginRequired, (req, res) => {
  const db = getDb();
  const logsByAgent = {};
  for (const a of AGENTS) {
    logsByAgent[a.name] = db.prepare('SELECT * FROM agent_logs WHERE agent_name=? ORDER BY created_at DESC LIMIT 4').all(a.name);
  }
  const recentLogs = db.prepare('SELECT * FROM agent_logs ORDER BY created_at DESC LIMIT 20').all();
  const n8nUrl = getSetting('n8n_url') || 'http://localhost:5678';
  res.render('agents', { agents: AGENTS, logsByAgent, recentLogs, n8nUrl, page: 'agents' });
});

module.exports = router;
