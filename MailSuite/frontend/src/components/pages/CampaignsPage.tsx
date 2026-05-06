'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name:'', subject:'', from_email:'', from_name:'', domain_id:'', contact_list_id:'', schedule_type:'immediate' });
  const [domains, setDomains] = useState<any[]>([]);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const [cr, dr] = await Promise.all([api.get('/campaigns'), api.get('/domains')]);
    if (cr.ok) setCampaigns(cr.data.campaigns || []);
    if (dr.ok) setDomains(dr.data.domains || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await api.post('/campaigns', form);
    toast(r.ok ? `✓ Campagne "${form.name}" créée` : r.data?.error, r.ok ? 'success' : 'error');
    if (r.ok) { setShowCreate(false); load(); }
  };

  const launch = async (id: number, name: string) => {
    const r = await api.post(`/campaigns/${id}/launch`);
    toast(r.ok ? `✓ "${name}" lancée` : r.data?.error, r.ok ? 'success' : 'error');
    if (r.ok) load();
  };

  const pause = async (id: number) => {
    const r = await api.post(`/campaigns/${id}/pause`);
    toast(r.ok ? 'Campagne en pause' : r.data?.error, r.ok ? 'success' : 'error');
    if (r.ok) load();
  };

  const statusColor: Record<string,string> = { draft:'gray', scheduled:'info', running:'success', paused:'warning', completed:'indigo', failed:'danger' };
  const statusIcon: Record<string,string> = { draft:'pencil', scheduled:'calendar', running:'play-fill', paused:'pause-fill', completed:'check-circle', failed:'x-circle' };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div><h1><i className="bi bi-send" /> Campagnes</h1><p>{campaigns.length} campagne(s)</p></div>
          <button className="btn btn-primary" onClick={() => setShowCreate(!showCreate)}><i className="bi bi-plus-lg" /> Nouvelle campagne</button>
        </div>
      </div>

      {showCreate && (
        <div className="card mb-4">
          <div className="card-header"><i className="bi bi-send-plus" /> Nouvelle campagne</div>
          <div className="card-body">
            <form onSubmit={create}>
              <div className="grid-2" style={{ gap:12,marginBottom:14 }}>
                <div><label className="form-label">Nom *</label><input className="form-control" value={form.name} onChange={e => setForm(p => ({...p,name:e.target.value}))} required /></div>
                <div><label className="form-label">Sujet *</label><input className="form-control" value={form.subject} onChange={e => setForm(p => ({...p,subject:e.target.value}))} required /></div>
                <div><label className="form-label">From Email</label><input className="form-control" type="email" value={form.from_email} onChange={e => setForm(p => ({...p,from_email:e.target.value}))} /></div>
                <div><label className="form-label">From Nom</label><input className="form-control" value={form.from_name} onChange={e => setForm(p => ({...p,from_name:e.target.value}))} /></div>
                <div><label className="form-label">Domaine</label>
                  <select className="form-select" value={form.domain_id} onChange={e => setForm(p => ({...p,domain_id:e.target.value}))}>
                    <option value="">Sans domaine</option>
                    {domains.map((d: any) => <option key={d.id} value={d.id}>{d.domain}</option>)}
                  </select></div>
                <div><label className="form-label">Envoi</label>
                  <select className="form-select" value={form.schedule_type} onChange={e => setForm(p => ({...p,schedule_type:e.target.value}))}>
                    <option value="immediate">Immédiat</option><option value="scheduled">Planifié</option>
                  </select></div>
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
        <div className="grid-3">{[...Array(3)].map((_,i) => <div key={i} className="skeleton" style={{ height:160 }} />)}</div>
      ) : campaigns.length === 0 ? (
        <div className="card"><div className="empty-state"><span style={{ fontSize:'2.5rem' }}>📤</span><h3>Aucune campagne</h3><p>Créez votre première campagne email</p></div></div>
      ) : (
        <div className="grid-3">
          {campaigns.map((c: any) => (
            <div key={c.id} style={{ background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:16,padding:20,transition:'all .2s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor='var(--border-hover)',e.currentTarget.style.transform='translateY(-2px)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor='var(--border)',e.currentTarget.style.transform='')}>
              <div style={{ display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700,color:'var(--text-primary)',marginBottom:4 }}>{c.name}</div>
                  <div style={{ fontSize:'.72rem',color:'var(--text-muted)' }}>{c.subject}</div>
                </div>
                <span className={`badge badge-${statusColor[c.status]||'gray'}`}><i className={`bi bi-${statusIcon[c.status]||'circle'}`} />{c.status}</span>
              </div>

              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:16 }}>
                {[
                  { v: c.sent_count||0, l: 'Envoyés', c:'indigo' },
                  { v: c.open_rate!=null?`${c.open_rate}%`:'—', l: 'Ouverture', c:'emerald' },
                  { v: c.click_rate!=null?`${c.click_rate}%`:'—', l: 'Clics', c:'violet' },
                ].map(s => (
                  <div key={s.l} style={{ textAlign:'center',background:`rgba(255,255,255,0.04)`,borderRadius:8,padding:'10px 6px' }}>
                    <div style={{ fontWeight:800,fontSize:'1.1rem',color:`var(--${s.c})` }}>{s.v}</div>
                    <div style={{ fontSize:'.62rem',color:'var(--text-muted)',textTransform:'uppercase' }}>{s.l}</div>
                  </div>
                ))}
              </div>

              <div style={{ display:'flex',gap:6 }}>
                {c.status === 'draft' && <button className="btn btn-sm btn-success" onClick={() => launch(c.id, c.name)}><i className="bi bi-play" /> Lancer</button>}
                {c.status === 'running' && <button className="btn btn-sm btn-warning" onClick={() => pause(c.id)}><i className="bi bi-pause" /> Pause</button>}
                {c.status === 'paused' && <button className="btn btn-sm btn-success" onClick={() => launch(c.id, c.name)}><i className="bi bi-play" /> Reprendre</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
