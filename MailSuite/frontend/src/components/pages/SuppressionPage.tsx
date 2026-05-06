'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export default function SuppressionPage() {
  const [emails, setEmails] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const { toast } = useToast();

  const load = (q?: string) => { setLoading(true); api.get(`/suppression${q ? `?search=${q}` : ''}`).then(r => { if (r.ok) setEmails(r.data.emails || []); setLoading(false); }); };
  useEffect(() => { load(query); }, [query]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await api.post('/suppression', { email: newEmail });
    toast(r.ok ? `${newEmail} ajouté à la suppression` : r.data?.error, r.ok ? 'success' : 'error');
    if (r.ok) { setNewEmail(''); load(query); }
  };

  const del = async (id: number) => {
    const r = await api.delete(`/suppression/${id}`);
    toast(r.ok ? 'Retiré de la suppression' : r.data?.error, r.ok ? 'success' : 'error');
    if (r.ok) setEmails(p => p.filter(e => e.id !== id));
  };

  const reasonBadge: Record<string,string> = { unsubscribe:'warning', bounce:'danger', complaint:'rose', manual:'gray' };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div><h1><i className="bi bi-slash-circle" style={{ color:'#fb7185' }} /> Liste de suppression</h1><p>{emails.length} adresse(s)</p></div>
        </div>
      </div>

      <div className="grid-2 mb-4">
        <div className="card">
          <div className="card-body" style={{ padding:'14px 20px' }}>
            <form onSubmit={add} style={{ display:'flex',gap:8 }}>
              <input className="form-control" type="email" placeholder="email@exemple.com" value={newEmail} onChange={e => setNewEmail(e.target.value)} required />
              <button className="btn btn-danger" type="submit"><i className="bi bi-plus-lg" /> Supprimer</button>
            </form>
          </div>
        </div>
        <div className="card">
          <div className="card-body" style={{ padding:'14px 20px' }}>
            <form onSubmit={e => { e.preventDefault(); setQuery(search); }} style={{ display:'flex',gap:8 }}>
              <input className="form-control" placeholder="Rechercher un email..." value={search} onChange={e => setSearch(e.target.value)} />
              <button className="btn btn-outline" type="submit"><i className="bi bi-search" /></button>
            </form>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="table-wrapper" style={{ maxHeight:500,overflowY:'auto' }}>
          {loading ? <div style={{ padding:40,textAlign:'center' }}><div className="spin" style={{ width:28,height:28,border:'3px solid rgba(244,63,94,.3)',borderTopColor:'#fb7185',borderRadius:'50%',display:'inline-block' }} /></div> : (
            <table>
              <thead><tr><th>Email</th><th>Raison</th><th>Ajouté le</th><th>Actions</th></tr></thead>
              <tbody>
                {emails.map((e: any) => (
                  <tr key={e.id}>
                    <td style={{ fontWeight:500,color:'var(--text-primary)' }}>{e.email}</td>
                    <td><span className={`badge badge-${reasonBadge[e.reason]||'gray'}`}>{e.reason || 'manuel'}</span></td>
                    <td style={{ fontSize:'.72rem',color:'var(--text-muted)' }}>{e.created_at ? new Date(e.created_at).toLocaleDateString('fr') : '—'}</td>
                    <td><button className="btn btn-sm btn-outline" title="Retirer" onClick={() => del(e.id)}><i className="bi bi-x-circle" /></button></td>
                  </tr>
                ))}
                {!emails.length && <tr><td colSpan={4}><div className="empty-state" style={{ padding:40 }}><span style={{ fontSize:'2rem' }}>🚫</span><h3>Liste vide</h3></div></td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
