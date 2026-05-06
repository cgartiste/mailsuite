'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export default function CfDns({ zoneId }: { zoneId: string }) {
  const [zone, setZone] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [typeFilter, setTypeFilter] = useState('');
  const [form, setForm] = useState({ type: 'A', name: '', content: '', ttl: '1', proxied: false });
  const { toast } = useToast();

  const load = async () => {
    const r = await api.get(`/cloudflare/zones/${zoneId}/dns${typeFilter ? `?type=${typeFilter}` : ''}`);
    if (r.ok) { setZone(r.data.zone); setRecords(r.data.records || []); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [zoneId, typeFilter]);

  const addRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await api.post(`/cloudflare/zones/${zoneId}/dns`, form);
    toast(r.ok ? 'Enregistrement créé' : r.data?.error || 'Erreur', r.ok ? 'success' : 'error');
    if (r.ok) { setShowAdd(false); load(); }
  };

  const deleteRecord = async (rid: string, name: string) => {
    if (!confirm(`Supprimer ${name} ?`)) return;
    const r = await api.delete(`/cloudflare/zones/${zoneId}/dns/${rid}`);
    toast(r.ok ? 'Supprimé' : r.data?.error || 'Erreur', r.ok ? 'success' : 'error');
    if (r.ok) setRecords(p => p.filter(x => x.id !== rid));
  };

  const types = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV'];
  const typeColors: Record<string,string> = { A:'indigo', AAAA:'violet', CNAME:'sky', MX:'emerald', TXT:'amber', NS:'rose', SRV:'cyan' };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1><i className="bi bi-server" style={{ color: 'var(--cf-orange)' }} /> DNS — {zone?.name || zoneId}</h1>
            <p>{records.length} enregistrement(s)</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowAdd(!showAdd)}><i className="bi bi-plus-lg" /> Ajouter</button>
        </div>
      </div>

      {showAdd && (
        <div className="card mb-4">
          <div className="card-header"><i className="bi bi-plus-circle" /> Nouvel enregistrement</div>
          <div className="card-body">
            <form onSubmit={addRecord}>
              <div className="grid-4" style={{ gap: 12, marginBottom: 16 }}>
                <div><label className="form-label">Type</label>
                  <select className="form-select" value={form.type} onChange={e => setForm(p => ({...p, type: e.target.value}))}>
                    {types.map(t => <option key={t}>{t}</option>)}
                  </select></div>
                <div><label className="form-label">Nom</label><input className="form-control" value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} required placeholder="@" /></div>
                <div><label className="form-label">Contenu</label><input className="form-control" value={form.content} onChange={e => setForm(p => ({...p, content: e.target.value}))} required /></div>
                <div><label className="form-label">TTL</label>
                  <select className="form-select" value={form.ttl} onChange={e => setForm(p => ({...p, ttl: e.target.value}))}>
                    <option value="1">Auto</option><option value="300">5 min</option><option value="3600">1 h</option><option value="86400">24 h</option>
                  </select></div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
                <label style={{ display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:'.82rem',color:'var(--text-secondary)' }}>
                  <input type="checkbox" checked={form.proxied} onChange={e => setForm(p => ({...p,proxied:e.target.checked}))} />
                  Proxied via Cloudflare (orange cloud)
                </label>
              </div>
              <div style={{ display:'flex',gap:8 }}>
                <button className="btn btn-primary" type="submit">Créer</button>
                <button className="btn btn-ghost" type="button" onClick={() => setShowAdd(false)}>Annuler</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="card mb-4">
        <div className="card-body" style={{ padding: '12px 16px', display:'flex', gap:6, flexWrap:'wrap' }}>
          <button className={`btn btn-sm ${!typeFilter ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTypeFilter('')}>Tous</button>
          {types.map(t => <button key={t} className={`btn btn-sm ${typeFilter===t ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTypeFilter(t)}>{t}</button>)}
        </div>
      </div>

      <div className="card">
        <div className="table-wrapper">
          {loading ? <div style={{ padding:32,textAlign:'center' }}><div className="spin" style={{ width:28,height:28,border:'3px solid rgba(99,102,241,.3)',borderTopColor:'#6366f1',borderRadius:'50%',display:'inline-block' }} /></div> : (
            <table>
              <thead><tr><th>Type</th><th>Nom</th><th>Contenu</th><th>TTL</th><th>Proxy</th><th>Actions</th></tr></thead>
              <tbody>
                {records.map((r: any) => (
                  <tr key={r.id}>
                    <td><span className={`badge badge-${typeColors[r.type] || 'gray'}`}>{r.type}</span></td>
                    <td style={{ fontWeight:600,color:'var(--text-primary)',fontSize:'.82rem',maxWidth:220,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{r.name}</td>
                    <td><code style={{ fontSize:'.72rem',maxWidth:300,display:'inline-block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{r.content}</code></td>
                    <td><span className="text-muted" style={{ fontSize:'.75rem' }}>{r.ttl === 1 ? 'Auto' : r.ttl + 's'}</span></td>
                    <td>{r.proxied ? <span className="text-cf">☁</span> : <span className="text-muted">—</span>}</td>
                    <td><button className="btn btn-sm btn-danger" onClick={() => deleteRecord(r.id, r.name)}><i className="bi bi-trash" /></button></td>
                  </tr>
                ))}
                {!records.length && <tr><td colSpan={6}><div className="empty-state" style={{ padding:32 }}><p>Aucun enregistrement {typeFilter}</p></div></td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
