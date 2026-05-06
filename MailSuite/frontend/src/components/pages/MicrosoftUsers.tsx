'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export default function MicrosoftUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [domains, setDomains] = useState<any[]>([]);
  const [domainFilter, setDomainFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ display_name:'', email:'', password:'Azerty@123' });
  const [bulkForm, setBulkForm] = useState({ domain:'', count:'10', password:'Azerty@123' });
  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    Promise.all([api.get(`/microsoft/users${domainFilter ? `?domain=${domainFilter}` : ''}`), api.get('/microsoft/domains')]).then(([ur, dr]) => {
      if (ur.ok) setUsers(ur.data.users || []);
      if (dr.ok) setDomains(dr.data.domains || []);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, [domainFilter]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await api.post('/microsoft/users', form);
    toast(r.ok ? `✓ ${form.display_name} créé` : r.data?.error || 'Erreur', r.ok ? 'success' : 'error');
    if (r.ok) { setShowCreate(false); load(); }
  };

  const bulkCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    toast('Création en masse...', 'info');
    const r = await api.post('/microsoft/users/bulk', bulkForm);
    toast(r.ok ? `✓ ${r.data.createdCount} créés` : r.data?.error || 'Erreur', r.ok ? 'success' : 'error');
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div><h1><i className="bi bi-people" style={{ color:'var(--ms-blue)' }} /> Utilisateurs Microsoft 365</h1><p>{users.length} utilisateur(s)</p></div>
          <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}><i className="bi bi-person-plus" /> Créer</button>
        </div>
      </div>

      {showCreate && (
        <div className="grid-2 mb-4">
          <div className="card">
            <div className="card-header"><i className="bi bi-person-plus" /> Créer un utilisateur</div>
            <div className="card-body">
              <form onSubmit={create}>
                <div style={{ marginBottom:12 }}><label className="form-label">Nom complet</label><input className="form-control" value={form.display_name} onChange={e => setForm(p => ({...p,display_name:e.target.value}))} required /></div>
                <div style={{ marginBottom:12 }}><label className="form-label">Email (UPN)</label><input className="form-control" type="email" value={form.email} onChange={e => setForm(p => ({...p,email:e.target.value}))} required /></div>
                <div style={{ marginBottom:16 }}><label className="form-label">Mot de passe</label><input className="form-control" value={form.password} onChange={e => setForm(p => ({...p,password:e.target.value}))} /></div>
                <button className="btn btn-primary btn-full" type="submit">Créer</button>
              </form>
            </div>
          </div>
          <div className="card">
            <div className="card-header"><i className="bi bi-people-fill" /> Création en masse</div>
            <div className="card-body">
              <form onSubmit={bulkCreate}>
                <div style={{ marginBottom:12 }}><label className="form-label">Domaine</label>
                  <select className="form-select" value={bulkForm.domain} onChange={e => setBulkForm(p => ({...p,domain:e.target.value}))} required>
                    <option value="">Sélectionner...</option>
                    {domains.map((d: any) => <option key={d.id} value={d.id}>{d.id}</option>)}
                  </select></div>
                <div style={{ marginBottom:12 }}><label className="form-label">Nombre</label><input className="form-control" type="number" min="1" max="200" value={bulkForm.count} onChange={e => setBulkForm(p => ({...p,count:e.target.value}))} /></div>
                <div style={{ marginBottom:16 }}><label className="form-label">Mot de passe</label><input className="form-control" value={bulkForm.password} onChange={e => setBulkForm(p => ({...p,password:e.target.value}))} /></div>
                <button className="btn btn-success btn-full" type="submit">Créer {bulkForm.count} users</button>
              </form>
            </div>
          </div>
        </div>
      )}

      <div className="card mb-3"><div className="card-body" style={{ padding:'12px 20px' }}>
        <select className="form-select" style={{ width:260 }} value={domainFilter} onChange={e => setDomainFilter(e.target.value)}>
          <option value="">Tous les domaines</option>
          {domains.map((d: any) => <option key={d.id} value={d.id}>{d.id}</option>)}
        </select>
      </div></div>

      <div className="card">
        <div className="table-wrapper" style={{ maxHeight:500,overflowY:'auto' }}>
          {loading ? <div style={{ padding:40,textAlign:'center' }}><div className="spin" style={{ width:28,height:28,border:'3px solid rgba(0,164,239,.3)',borderTopColor:'var(--ms-blue)',borderRadius:'50%',display:'inline-block' }} /></div> : (
            <table>
              <thead><tr><th>Nom</th><th>Email</th><th>Activé</th><th>Licences</th></tr></thead>
              <tbody>
                {users.map((u: any) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight:600,color:'var(--text-primary)' }}>{u.displayName}</td>
                    <td style={{ fontSize:'.8rem' }}>{u.userPrincipalName}</td>
                    <td><span className={`badge badge-${u.accountEnabled?'success':'danger'}`}>{u.accountEnabled?'Actif':'Désactivé'}</span></td>
                    <td><span className="badge badge-gray">{(u.assignedLicenses||[]).length}</span></td>
                  </tr>
                ))}
                {!users.length && <tr><td colSpan={4}><div className="empty-state" style={{ padding:32 }}><span style={{ fontSize:'2rem' }}>👥</span><h3>Aucun utilisateur</h3></div></td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
