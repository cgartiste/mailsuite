'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ email:'', password:'', domain:'', notes:'' });
  const { toast } = useToast();

  const load = () => api.get('/accounts').then(r => { if (r.ok) setAccounts(r.data.accounts || []); setLoading(false); });
  useEffect(() => { load(); }, []);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await api.post('/accounts', form);
    toast(r.ok ? '✓ Compte ajouté' : r.data?.error, r.ok ? 'success' : 'error');
    if (r.ok) { setShowAdd(false); setForm({ email:'',password:'',domain:'',notes:'' }); load(); }
  };

  const del = async (id: number) => {
    if (!confirm('Supprimer ce compte ?')) return;
    const r = await api.delete(`/accounts/${id}`);
    toast(r.ok ? 'Supprimé' : r.data?.error, r.ok ? 'success' : 'error');
    if (r.ok) setAccounts(p => p.filter(a => a.id !== id));
  };

  const toggle = async (id: number) => {
    const r = await api.patch(`/accounts/${id}/toggle`);
    toast(r.ok ? 'Status mis à jour' : r.data?.error, r.ok ? 'success' : 'error');
    if (r.ok) load();
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div><h1><i className="bi bi-person-badge" /> Comptes GW Pool</h1><p>{accounts.length} compte(s) dans le pool</p></div>
          <button className="btn btn-primary" onClick={() => setShowAdd(!showAdd)}><i className="bi bi-plus-lg" /> Ajouter</button>
        </div>
      </div>

      {showAdd && (
        <div className="card mb-4">
          <div className="card-header"><i className="bi bi-person-plus" /> Nouveau compte</div>
          <div className="card-body">
            <form onSubmit={add}>
              <div className="grid-2" style={{ gap:12,marginBottom:14 }}>
                <div><label className="form-label">Email *</label><input className="form-control" type="email" value={form.email} onChange={e => setForm(p => ({...p,email:e.target.value}))} required /></div>
                <div><label className="form-label">Mot de passe</label><input className="form-control" value={form.password} onChange={e => setForm(p => ({...p,password:e.target.value}))} /></div>
                <div><label className="form-label">Domaine</label><input className="form-control" value={form.domain} onChange={e => setForm(p => ({...p,domain:e.target.value}))} /></div>
                <div><label className="form-label">Notes</label><input className="form-control" value={form.notes} onChange={e => setForm(p => ({...p,notes:e.target.value}))} /></div>
              </div>
              <div style={{ display:'flex',gap:8 }}>
                <button className="btn btn-primary" type="submit">Ajouter</button>
                <button className="btn btn-ghost" type="button" onClick={() => setShowAdd(false)}>Annuler</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card">
        <div className="table-wrapper">
          {loading ? <div style={{ padding:40,textAlign:'center' }}><div className="spin" style={{ width:28,height:28,border:'3px solid rgba(99,102,241,.3)',borderTopColor:'#6366f1',borderRadius:'50%',display:'inline-block' }} /></div> : (
            <table>
              <thead><tr><th>Email</th><th>Domaine</th><th>Status</th><th>Emails envoyés</th><th>Score spam</th><th>Notes</th><th>Actions</th></tr></thead>
              <tbody>
                {accounts.map((a: any) => (
                  <tr key={a.id}>
                    <td><strong style={{ color:'var(--text-primary)' }}>{a.email}</strong></td>
                    <td><span className="badge badge-google">{a.domain || '—'}</span></td>
                    <td><span className={`badge badge-${a.status==='active'?'success':a.status==='paused'?'warning':'danger'}`}>{a.status}</span></td>
                    <td><span className="badge badge-gray">{a.emails_sent || 0}</span></td>
                    <td>{a.spam_score != null ? <span className={`badge badge-${a.spam_score < 3 ? 'success' : a.spam_score < 7 ? 'warning' : 'danger'}`}>{a.spam_score}</span> : <span className="text-muted">—</span>}</td>
                    <td style={{ fontSize:'.75rem',color:'var(--text-muted)' }}>{a.notes || '—'}</td>
                    <td><div style={{ display:'flex',gap:5 }}>
                      <button className="btn btn-sm btn-outline" onClick={() => toggle(a.id)}><i className={`bi bi-${a.status==='active'?'pause':'play'}`} /></button>
                      <button className="btn btn-sm btn-danger" onClick={() => del(a.id)}><i className="bi bi-trash" /></button>
                    </div></td>
                  </tr>
                ))}
                {!accounts.length && <tr><td colSpan={7}><div className="empty-state" style={{ padding:40 }}><span style={{ fontSize:'2rem' }}>👤</span><h3>Aucun compte dans le pool</h3></div></td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
