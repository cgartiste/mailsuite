'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export default function ContactsPage() {
  const [lists, setLists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const { toast } = useToast();

  const load = () => api.get('/contacts').then(r => { if (r.ok) setLists(r.data.lists || []); setLoading(false); });
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await api.post('/contacts', form);
    toast(r.ok ? `✓ Liste "${form.name}" créée` : r.data?.error, r.ok ? 'success' : 'error');
    if (r.ok) { setShowCreate(false); setForm({ name:'',description:'' }); load(); }
  };

  const del = async (id: number, name: string) => {
    if (!confirm(`Supprimer "${name}" ?`)) return;
    const r = await api.delete(`/contacts/${id}`);
    toast(r.ok ? 'Liste supprimée' : r.data?.error, r.ok ? 'success' : 'error');
    if (r.ok) setLists(p => p.filter(l => l.id !== id));
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div><h1><i className="bi bi-people" /> Contacts</h1><p>{lists.length} liste(s)</p></div>
          <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}><i className="bi bi-plus-lg" /> Nouvelle liste</button>
        </div>
      </div>

      {showCreate && (
        <div className="card mb-4">
          <div className="card-header"><i className="bi bi-plus-circle" /> Nouvelle liste de contacts</div>
          <div className="card-body">
            <form onSubmit={create}>
              <div className="grid-2" style={{ gap:12,marginBottom:14 }}>
                <div><label className="form-label">Nom *</label><input className="form-control" value={form.name} onChange={e => setForm(p => ({...p,name:e.target.value}))} required /></div>
                <div><label className="form-label">Description</label><input className="form-control" value={form.description} onChange={e => setForm(p => ({...p,description:e.target.value}))} /></div>
              </div>
              <div style={{ display:'flex',gap:8 }}>
                <button className="btn btn-primary" type="submit">Créer</button>
                <button className="btn btn-ghost" type="button" onClick={() => setShowCreate(false)}>Annuler</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid-3">{[...Array(3)].map((_,i) => <div key={i} className="skeleton" style={{ height:120 }} />)}</div>
      ) : lists.length === 0 ? (
        <div className="card"><div className="empty-state"><span style={{ fontSize:'2.5rem' }}>📋</span><h3>Aucune liste de contacts</h3></div></div>
      ) : (
        <div className="grid-3">
          {lists.map((l: any) => (
            <div key={l.id} style={{ background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:16,padding:22,transition:'all .2s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor='var(--indigo)',e.currentTarget.style.transform='translateY(-2px)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor='var(--border)',e.currentTarget.style.transform='')}>
              <div style={{ display:'flex',alignItems:'center',gap:12,marginBottom:14 }}>
                <div style={{ width:44,height:44,background:'rgba(99,102,241,0.12)',borderRadius:12,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.2rem' }}>📋</div>
                <div>
                  <div style={{ fontWeight:700,color:'var(--text-primary)' }}>{l.name}</div>
                  <div style={{ fontSize:'.72rem',color:'var(--text-muted)' }}>{l.description || 'Aucune description'}</div>
                </div>
              </div>
              <div style={{ display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:12,borderTop:'1px solid var(--border)' }}>
                <div style={{ display:'flex',gap:8 }}>
                  <span className="badge badge-indigo"><i className="bi bi-people" /> {l.contact_count||0}</span>
                  <span className="badge badge-success"><i className="bi bi-check-circle" /> {l.active_count||0}</span>
                </div>
                <button className="btn btn-sm btn-danger" onClick={() => del(l.id, l.name)}><i className="bi bi-trash" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
