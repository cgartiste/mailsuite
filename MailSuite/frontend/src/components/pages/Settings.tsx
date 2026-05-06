'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

const AGENTS = ['all', 'dns-guardian', 'domain-sync', 'gw-operator', 'reputation-watchdog', 'reporter', 'command-handler'];

export default function Settings() {
  const [settings, setSettings] = useState<any>({});
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newUser, setNewUser] = useState({ username:'', password:'', role:'user', first_name:'', last_name:'' });
  const [agentKeys, setAgentKeys] = useState<any[]>([]);
  const [newKey, setNewKey] = useState({ name: '', agent: 'all' });
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const { toast } = useToast();

  const loadAgentKeys = () => api.get('/settings/agent-keys').then(r => { if (r.ok) setAgentKeys(r.data.keys || []); });

  useEffect(() => {
    api.get('/settings').then(r => { if (r.ok) { setSettings(r.data.settings || {}); setUsers(r.data.users || []); } setLoading(false); });
    loadAgentKeys();
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const r = await api.put('/settings', settings);
    toast(r.ok ? 'Paramètres sauvegardés' : r.data?.error, r.ok ? 'success' : 'error');
    setSaving(false);
  };

  const addUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await api.post('/settings/users', newUser);
    toast(r.ok ? `Utilisateur ${newUser.username} créé` : r.data?.error, r.ok ? 'success' : 'error');
    if (r.ok) { setNewUser({ username:'',password:'',role:'user',first_name:'',last_name:'' }); api.get('/settings').then(r2 => { if (r2.ok) setUsers(r2.data.users || []); }); }
  };

  const delUser = async (id: number) => {
    if (!confirm('Supprimer cet utilisateur ?')) return;
    const r = await api.delete(`/settings/users/${id}`);
    toast(r.ok ? 'Utilisateur supprimé' : r.data?.error, r.ok ? 'success' : 'error');
    if (r.ok) setUsers(p => p.filter(u => u.id !== id));
  };

  const createAgentKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.name) return toast('Nom requis', 'warning');
    const r = await api.post('/settings/agent-keys', newKey);
    if (r.ok) {
      setCreatedKey(r.data.key);
      setNewKey({ name: '', agent: 'all' });
      loadAgentKeys();
      toast('Clé créée — copiez-la maintenant !', 'success');
    } else toast(r.data?.error || 'Erreur', 'error');
  };

  const toggleKey = async (id: number) => {
    const r = await api.patch(`/settings/agent-keys/${id}/toggle`);
    if (r.ok) loadAgentKeys();
  };

  const deleteKey = async (id: number) => {
    if (!confirm('Supprimer cette clé API ?')) return;
    const r = await api.delete(`/settings/agent-keys/${id}`);
    if (r.ok) { loadAgentKeys(); toast('Clé supprimée', 'success'); }
  };

  const Field = ({ k, label, type = 'text', placeholder = '' }: { k: string; label: string; type?: string; placeholder?: string }) => (
    <div><label className="form-label">{label}</label>
      <input className="form-control" type={type} placeholder={placeholder} value={settings[k] || ''} onChange={e => setSettings((p: any) => ({ ...p, [k]: e.target.value }))} />
    </div>
  );

  if (loading) return <div style={{ padding:40,textAlign:'center' }}><div className="spin" style={{ width:32,height:32,border:'3px solid rgba(99,102,241,.3)',borderTopColor:'#6366f1',borderRadius:'50%',display:'inline-block' }} /></div>;

  return (
    <div>
      <div className="page-header"><h1><i className="bi bi-gear" /> Paramètres</h1><p>Configuration des services et APIs</p></div>

      <form onSubmit={save}>
        <div className="grid-2 mb-4">
          {/* Cloudflare */}
          <div className="card">
            <div className="card-header"><i className="bi bi-cloud-lightning" style={{ color:'var(--cf-orange)' }} /> Cloudflare</div>
            <div className="card-body" style={{ display:'flex',flexDirection:'column',gap:12 }}>
              <Field k="cloudflare_api_token" label="API Token" type="password" />
              <Field k="dkim_selector" label="DKIM Selector" placeholder="mail" />
            </div>
          </div>

          {/* N8N */}
          <div className="card">
            <div className="card-header"><i className="bi bi-robot" style={{ color:'#818cf8' }} /> N8N Automation</div>
            <div className="card-body" style={{ display:'flex',flexDirection:'column',gap:12 }}>
              <Field k="n8n_url" label="N8N URL" placeholder="https://n8n.example.com" />
              <Field k="n8n_api_key" label="API Key" type="password" />
            </div>
          </div>

          {/* Telegram */}
          <div className="card">
            <div className="card-header"><i className="bi bi-telegram" style={{ color:'#2ca5e0' }} /> Notifications Telegram</div>
            <div className="card-body" style={{ display:'flex',flexDirection:'column',gap:12 }}>
              <Field k="telegram_bot_token" label="Bot Token" type="password" />
              <Field k="telegram_chat_id" label="Chat ID" />
            </div>
          </div>

          {/* App settings */}
          <div className="card">
            <div className="card-header"><i className="bi bi-sliders" /> Application</div>
            <div className="card-body" style={{ display:'flex',flexDirection:'column',gap:12 }}>
              <Field k="app_name" label="Nom de l'application" placeholder="MailSuite" />
              <Field k="max_spam_score" label="Score spam max" placeholder="5" />
              <Field k="min_inbox_score" label="Score inbox min" placeholder="80" />
            </div>
          </div>
        </div>

        <button className="btn btn-primary btn-lg" type="submit" disabled={saving} style={{ marginBottom:32 }}>
          {saving ? 'Sauvegarde...' : <><i className="bi bi-check-lg" /> Sauvegarder les paramètres</>}
        </button>
      </form>

      {/* Users */}
      <div className="card mb-4">
        <div className="card-header"><i className="bi bi-people" /> Utilisateurs de l'application</div>
        <div className="table-wrapper">
          <table><thead><tr><th>Username</th><th>Nom</th><th>Rôle</th><th>Créé le</th><th>Actions</th></tr></thead>
          <tbody>{users.map((u: any) => (
            <tr key={u.id}>
              <td><strong style={{ color:'var(--text-primary)' }}>{u.username}</strong></td>
              <td>{u.first_name} {u.last_name}</td>
              <td><span className={`badge badge-${u.role==='admin'?'violet':'gray'}`}>{u.role}</span></td>
              <td style={{ fontSize:'.72rem',color:'var(--text-muted)' }}>{new Date(u.created_at).toLocaleDateString('fr')}</td>
              <td><button className="btn btn-sm btn-danger" onClick={() => delUser(u.id)}><i className="bi bi-trash" /></button></td>
            </tr>
          ))}</tbody></table>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-header"><i className="bi bi-person-plus" /> Ajouter un utilisateur</div>
        <div className="card-body">
          <form onSubmit={addUser}>
            <div className="grid-3" style={{ gap:12,marginBottom:14 }}>
              <div><label className="form-label">Username *</label><input className="form-control" value={newUser.username} onChange={e => setNewUser(p => ({...p,username:e.target.value}))} required /></div>
              <div><label className="form-label">Mot de passe *</label><input className="form-control" type="password" value={newUser.password} onChange={e => setNewUser(p => ({...p,password:e.target.value}))} required /></div>
              <div><label className="form-label">Rôle</label>
                <select className="form-select" value={newUser.role} onChange={e => setNewUser(p => ({...p,role:e.target.value}))}>
                  <option value="user">User</option><option value="admin">Admin</option>
                </select></div>
              <div><label className="form-label">Prénom</label><input className="form-control" value={newUser.first_name} onChange={e => setNewUser(p => ({...p,first_name:e.target.value}))} /></div>
              <div><label className="form-label">Nom</label><input className="form-control" value={newUser.last_name} onChange={e => setNewUser(p => ({...p,last_name:e.target.value}))} /></div>
            </div>
            <button className="btn btn-primary" type="submit"><i className="bi bi-person-plus" /> Ajouter</button>
          </form>
        </div>
      </div>

      {/* ── Agent API Keys ── */}
      <div className="card mb-4" style={{ border: '1px solid rgba(139,92,246,.25)' }}>
        <div className="card-header" style={{ background: 'rgba(139,92,246,.06)' }}>
          <i className="bi bi-cpu" style={{ color: '#8b5cf6' }} /> Clés API — Agents OpenClaw
          <span style={{ marginLeft: 8, fontSize: '.72rem', color: 'var(--text-muted)' }}>Utilisez le header <code>X-Agent-Key</code></span>
        </div>

        {/* Clé nouvellement créée */}
        {createdKey && (
          <div style={{ margin: '0 20px 0', marginTop: 16, padding: '14px 18px', background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.3)', borderRadius: 10 }}>
            <div style={{ fontSize: '.78rem', fontWeight: 700, color: '#34d399', marginBottom: 8 }}>
              <i className="bi bi-check-circle" /> Clé créée — copiez-la maintenant, elle ne sera plus affichée !
            </div>
            <code style={{ display: 'block', wordBreak: 'break-all', fontSize: '.82rem', color: '#a7f3d0', background: 'rgba(0,0,0,.2)', padding: '10px 14px', borderRadius: 8 }}>
              {createdKey}
            </code>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => { navigator.clipboard.writeText(createdKey); toast('Copié !', 'success'); }}>
              <i className="bi bi-clipboard" /> Copier
            </button>
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 8, marginLeft: 6 }} onClick={() => setCreatedKey(null)}>
              Fermer
            </button>
          </div>
        )}

        {/* Table des clés existantes */}
        {agentKeys.length > 0 && (
          <div className="table-wrapper" style={{ marginTop: 12 }}>
            <table>
              <thead><tr><th>Nom</th><th>Agent</th><th>Clé (aperçu)</th><th>Appels</th><th>Dernier usage</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {agentKeys.map((k: any) => (
                  <tr key={k.id}>
                    <td><strong style={{ color: 'var(--text-primary)' }}>{k.name}</strong></td>
                    <td><span style={{ fontSize: '.72rem', background: 'rgba(139,92,246,.15)', color: '#a78bfa', padding: '2px 8px', borderRadius: 5 }}>{k.agent}</span></td>
                    <td><code style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{k.key_preview}</code></td>
                    <td><span className="badge badge-gray">{k.calls_count}</span></td>
                    <td style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
                      {k.last_used ? new Date(k.last_used).toLocaleString('fr') : '—'}
                    </td>
                    <td>
                      <span className={`badge badge-${k.active ? 'success' : 'gray'}`}>{k.active ? '● Actif' : 'Inactif'}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 5 }}>
                        <button className="btn btn-sm btn-outline" onClick={() => toggleKey(k.id)} title={k.active ? 'Désactiver' : 'Activer'}>
                          <i className={`bi bi-${k.active ? 'pause' : 'play'}`} />
                        </button>
                        <button className="btn btn-sm btn-danger" onClick={() => deleteKey(k.id)}>
                          <i className="bi bi-trash" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Créer une nouvelle clé */}
        <div className="card-body" style={{ borderTop: agentKeys.length ? '1px solid var(--border)' : 'none', paddingTop: 16 }}>
          <div style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12 }}>+ Nouvelle clé agent</div>
          <form onSubmit={createAgentKey} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label className="form-label">Nom de la clé</label>
              <input className="form-control" style={{ width: 200 }} placeholder="dns-guardian-prod" value={newKey.name} onChange={e => setNewKey(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Agent associé</label>
              <select className="form-select" style={{ width: 180 }} value={newKey.agent} onChange={e => setNewKey(p => ({ ...p, agent: e.target.value }))}>
                {AGENTS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <button className="btn btn-primary" type="submit" style={{ background: '#8b5cf6', borderColor: '#8b5cf6' }}>
              <i className="bi bi-key" /> Générer la clé
            </button>
          </form>
        </div>

        {/* Référence des endpoints */}
        <div style={{ margin: '0 20px 20px', padding: '14px 16px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10 }}>
          <div style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>
            Endpoints disponibles (base: <code>http://localhost:5050</code>)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px' }}>
            {[
              ['GET',  '/api/agent/status',             'État global du système'],
              ['GET',  '/api/agent/domains',             'Liste des domaines'],
              ['GET',  '/api/agent/dns/missing',         'Domaines sans SPF/DMARC'],
              ['POST', '/api/agent/dns/deploy',          'Déployer SPF/DMARC en masse'],
              ['POST', '/api/agent/domains/sync',        'Sync CF + GW + MS365'],
              ['GET',  '/api/agent/gw/accounts',         'Comptes GW actifs'],
              ['POST', '/api/agent/gw/create-users',     'Créer users Google en masse'],
              ['POST', '/api/agent/gw/pipepass',         'Envoyer vers PipePass'],
              ['GET',  '/api/agent/alerts',              'Incidents ouverts'],
              ['POST', '/api/agent/alerts',              'Créer un incident'],
              ['POST', '/api/agent/notify',              'Envoyer message Telegram'],
              ['GET',  '/api/agent/reputation/check',    'Vérifier blacklists domaine'],
              ['POST', '/api/agent/log',                 'Écrire un log agent'],
              ['GET',  '/api/agent/logs',                'Lire les logs agents'],
            ].map(([method, path, desc]) => (
              <div key={path} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: '.72rem' }}>
                <span style={{ width: 36, textAlign: 'center', fontWeight: 700, fontSize: '.65rem', padding: '1px 4px', borderRadius: 4,
                  background: method === 'GET' ? 'rgba(16,185,129,.15)' : method === 'POST' ? 'rgba(99,102,241,.15)' : 'rgba(245,158,11,.15)',
                  color: method === 'GET' ? '#34d399' : method === 'POST' ? '#818cf8' : '#f59e0b' }}>
                  {method}
                </span>
                <code style={{ color: 'var(--text-secondary)', flex: 1 }}>{path}</code>
                <span style={{ color: 'var(--text-muted)' }}>{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
