'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';
import PipePassModal from '@/components/PipePassModal';

export default function GWCreateUsers() {
  const [domains, setDomains] = useState<any[]>([]);
  const [recent, setRecent] = useState<any[]>([]);
  const [form, setForm] = useState({ domain: '', count: '10', password: 'Azerty@123' });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [showPipePass, setShowPipePass] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<{email:string;password:string}[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    api.get('/gworkspace/domains').then(r => { if (r.ok) setDomains(r.data.domains || []); });
    loadRecent();
  }, []);

  const loadRecent = () =>
    api.get('/gworkspace/created-users').then(r => { if (r.ok) setRecent((r.data.users || []).slice(0, 200)); });

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.domain) return toast('Sélectionnez un domaine', 'warning');
    setLoading(true); setResult(null);
    const r = await api.post('/gworkspace/create-users', { domain: form.domain, count: parseInt(form.count), password: form.password });
    if (r.ok) {
      toast(`✓ ${r.data.createdCount} utilisateurs créés`, 'success');
      setResult(r.data);
      await loadRecent();
    } else toast(r.data?.error || 'Erreur', 'error');
    setLoading(false);
  };

  const exportCsv = () => window.open('/api/gworkspace/export-created', '_blank');

  const openPipePass = (usersToExport?: {email:string;password:string}[]) => {
    // Use passed users or all recent users
    const users = usersToExport || recent.map(u => ({ email: u.email, password: u.password }));
    if (!users.length) return toast('Aucun utilisateur à exporter', 'warning');
    setSelectedUsers(users);
    setShowPipePass(true);
  };

  // Checkbox selection
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());
  const toggleCheck = (id: number) => setCheckedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleAll = () => {
    if (checkedIds.size === recent.length) setCheckedIds(new Set());
    else setCheckedIds(new Set(recent.map(u => u.id)));
  };
  const checkedUsers = recent.filter(u => checkedIds.has(u.id)).map(u => ({ email: u.email, password: u.password }));

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1><i className="bi bi-person-plus text-google" /> Créer des utilisateurs</h1>
            <p>Création en masse Google Workspace</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {recent.length > 0 && (
              <>
                <button className="btn btn-outline" onClick={exportCsv} title="Exporter CSV basique">
                  <i className="bi bi-download" /> Export CSV
                </button>
                <button
                  onClick={() => openPipePass()}
                  title="Activer 2FA et App Password via PipePass"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 18px', borderRadius: 12, border: 'none', cursor: 'pointer',
                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                    color: '#fff', fontWeight: 800, fontSize: '.82rem',
                    boxShadow: '0 4px 20px rgba(99,102,241,0.4)',
                    transition: 'all .2s',
                    letterSpacing: '.02em',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)', e.currentTarget.style.boxShadow = '0 8px 30px rgba(99,102,241,0.5)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = '', e.currentTarget.style.boxShadow = '0 4px 20px rgba(99,102,241,0.4)')}
                >
                  🔐 EXPORTER POUR VALIDER 2FA ET APP-PASSWORD
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid-2 mb-6">
        {/* Configuration */}
        <div className="card">
          <div className="card-header"><i className="bi bi-people-fill" /> Configuration</div>
          <div className="card-body">
            <form onSubmit={create}>
              <div style={{ marginBottom: 14 }}>
                <label className="form-label">Domaine cible *</label>
                <select className="form-select" value={form.domain} onChange={e => setForm(p => ({...p, domain: e.target.value}))} required>
                  <option value="">Sélectionner un domaine...</option>
                  {domains.map((d: any) => <option key={d.domainName} value={d.domainName}>{d.domainName}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 14 }}>
                <label className="form-label">Nombre d'utilisateurs</label>
                <input className="form-control" type="number" min="1" max="200" value={form.count} onChange={e => setForm(p => ({...p, count: e.target.value}))} />
                <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', marginTop: 5 }}>Maximum 200 par batch</div>
              </div>
              <div style={{ marginBottom: 20 }}>
                <label className="form-label">Mot de passe par défaut</label>
                <input className="form-control" value={form.password} onChange={e => setForm(p => ({...p, password: e.target.value}))} />
              </div>
              <button className="btn btn-primary btn-full btn-lg" type="submit" disabled={loading}>
                {loading
                  ? <><span className="spin" style={{ width:16,height:16,border:'2px solid rgba(255,255,255,.3)',borderTopColor:'#fff',borderRadius:'50%',display:'inline-block' }} /> Création en cours...</>
                  : `Créer ${form.count} utilisateurs`}
              </button>
            </form>
          </div>
        </div>

        {/* Result */}
        <div className="card">
          <div className="card-header"><i className="bi bi-info-circle" /> Résultat</div>
          <div className="card-body">
            {result ? (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 900, color: '#34d399' }}>{result.createdCount}</div>
                    <div style={{ fontSize: '.7rem', color: '#34d399', textTransform: 'uppercase', fontWeight: 700 }}>Créés</div>
                  </div>
                  <div style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 900, color: '#fb7185' }}>{result.failedCount}</div>
                    <div style={{ fontSize: '.7rem', color: '#fb7185', textTransform: 'uppercase', fontWeight: 700 }}>Échoués</div>
                  </div>
                </div>
                {result.createdCount > 0 && (
                  <button
                    onClick={() => openPipePass(result.created?.map((u: any) => ({ email: u.email, password: u.password })))}
                    style={{
                      width: '100%', padding: '12px', borderRadius: 10, border: '2px solid rgba(99,102,241,0.4)',
                      background: 'rgba(99,102,241,0.08)', color: '#818cf8', cursor: 'pointer',
                      fontWeight: 800, fontSize: '.8rem', transition: 'all .2s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.15)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(99,102,241,0.08)'}
                  >
                    🔐 Activer 2FA &amp; App Password sur ces {result.createdCount} comptes
                  </button>
                )}
                {result.created?.slice(0, 6).map((u: any) => (
                  <div key={u.email} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)', fontSize: '.75rem', marginTop: 10 }}>
                    <span style={{ color: 'var(--text-primary)' }}>{u.email}</span>
                    <code style={{ fontSize: '.7rem' }}>{u.password}</code>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: 30 }}>
                <span style={{ fontSize: '2rem' }}>⚡</span>
                <p>Les résultats s'afficheront ici après la création</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent users table */}
      {recent.length > 0 && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span><i className="bi bi-clock-history" /> Utilisateurs créés ({recent.length})</span>
            {checkedIds.size > 0 && (
              <button
                onClick={() => openPipePass(checkedUsers)}
                style={{
                  padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff',
                  fontWeight: 700, fontSize: '.75rem', display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                🔐 2FA pour {checkedIds.size} sélectionnés
              </button>
            )}
          </div>
          <div className="table-wrapper" style={{ maxHeight: 400, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input type="checkbox" checked={checkedIds.size === recent.length && recent.length > 0} onChange={toggleAll} />
                  </th>
                  <th>Email</th><th>Mot de passe</th><th>Nom</th><th>Domaine</th><th>Date</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((u: any) => (
                  <tr key={u.id} onClick={() => toggleCheck(u.id)} style={{ cursor: 'pointer', background: checkedIds.has(u.id) ? 'rgba(99,102,241,0.06)' : undefined }}>
                    <td onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={checkedIds.has(u.id)} onChange={() => toggleCheck(u.id)} />
                    </td>
                    <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{u.email}</td>
                    <td><code style={{ fontSize: '.75rem' }}>{u.password}</code></td>
                    <td>{u.first_name} {u.last_name}</td>
                    <td><span className="badge badge-google" style={{ fontSize: '.62rem' }}>{u.domain}</span></td>
                    <td style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{new Date(u.created_at).toLocaleDateString('fr')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PipePass Export Modal */}
      {showPipePass && (
        <PipePassModal
          users={selectedUsers}
          onClose={() => setShowPipePass(false)}
        />
      )}
    </div>
  );
}
