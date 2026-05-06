'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export default function GWUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [domains, setDomains] = useState<any[]>([]);
  const [domainFilter, setDomainFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = async (domain = domainFilter) => {
    setLoading(true);
    const [ur, dr] = await Promise.all([api.get(`/gworkspace/users${domain ? `?domain=${domain}` : ''}`), api.get('/gworkspace/domains')]);
    if (ur.ok) setUsers(ur.data.users || []);
    else toast(ur.data?.error || 'Erreur', 'error');
    if (dr.ok) setDomains(dr.data.domains || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [domainFilter]);

  const suspend = async (email: string, s: boolean) => {
    const r = await api.patch(`/gworkspace/users/${encodeURIComponent(email)}/suspend`, { suspend: s });
    toast(r.ok ? `${s ? 'Suspendu' : 'Réactivé'}: ${email}` : r.data?.error, r.ok ? 'success' : 'error');
    if (r.ok) setUsers(p => p.map(u => u.primaryEmail === email ? { ...u, suspended: s } : u));
  };

  const del = async (email: string) => {
    if (!confirm(`Supprimer définitivement ${email} ?`)) return;
    const r = await api.delete(`/gworkspace/users/${encodeURIComponent(email)}`);
    toast(r.ok ? `Supprimé: ${email}` : r.data?.error, r.ok ? 'success' : 'error');
    if (r.ok) setUsers(p => p.filter(u => u.primaryEmail !== email));
  };

  const filtered = search ? users.filter(u => u.primaryEmail?.includes(search) || u.name?.fullName?.toLowerCase().includes(search.toLowerCase())) : users;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1><i className="bi bi-people text-google" /> Utilisateurs Google Workspace</h1>
            <p>{users.length} utilisateur(s) trouvé(s)</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card mb-4">
        <div className="card-body" style={{ padding:'14px 20px',display:'flex',gap:10,flexWrap:'wrap',alignItems:'center' }}>
          <select className="form-select" style={{ width:220 }} value={domainFilter} onChange={e => setDomainFilter(e.target.value)}>
            <option value="">Tous les domaines</option>
            {domains.map((d: any) => <option key={d.domainName} value={d.domainName}>{d.domainName}</option>)}
          </select>
          <input className="form-control" style={{ maxWidth:280 }} placeholder="Rechercher email ou nom..." value={search} onChange={e => setSearch(e.target.value)} />
          <span className="text-muted" style={{ fontSize:'.78rem' }}>{filtered.length} résultat(s)</span>
        </div>
      </div>

      <div className="card">
        <div className="table-wrapper" style={{ maxHeight:600,overflowY:'auto' }}>
          {loading ? (
            <div style={{ padding:48,textAlign:'center' }}><div className="spin" style={{ width:32,height:32,border:'3px solid rgba(66,133,244,.3)',borderTopColor:'#4285F4',borderRadius:'50%',display:'inline-block' }} /></div>
          ) : (
            <table>
              <thead><tr><th>Email</th><th>Nom</th><th>Status</th><th>2FA</th><th>Admin</th><th>Dernière connexion</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map((u: any) => (
                  <tr key={u.primaryEmail}>
                    <td style={{ fontWeight:600,color:'var(--text-primary)',maxWidth:220 }}>{u.primaryEmail}</td>
                    <td style={{ color:'var(--text-secondary)' }}>{u.name?.fullName || '—'}</td>
                    <td><span className={`badge badge-${u.suspended ? 'danger' : 'success'}`}>{u.suspended ? 'Suspendu' : 'Actif'}</span></td>
                    <td>{u.isEnrolledIn2Sv ? <span className="badge badge-success"><i className="bi bi-shield-check" /></span> : <span className="text-muted">—</span>}</td>
                    <td>{u.isAdmin ? <span className="badge badge-violet">Admin</span> : null}</td>
                    <td style={{ fontSize:'.72rem',color:'var(--text-muted)' }}>{u.lastLoginTime ? new Date(u.lastLoginTime).toLocaleDateString('fr') : 'Jamais'}</td>
                    <td><div style={{ display:'flex',gap:6 }}>
                      <button className="btn btn-sm btn-outline" title={u.suspended ? 'Réactiver' : 'Suspendre'} onClick={() => suspend(u.primaryEmail, !u.suspended)}>
                        <i className={`bi bi-${u.suspended ? 'person-check' : 'pause-circle'}`} />
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => del(u.primaryEmail)}><i className="bi bi-trash" /></button>
                    </div></td>
                  </tr>
                ))}
                {!filtered.length && <tr><td colSpan={7}><div className="empty-state" style={{ padding:40 }}><span style={{ fontSize:'2rem' }}>👥</span><h3>Aucun utilisateur</h3><p>Sélectionnez un domaine ou connectez un compte GW</p></div></td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
