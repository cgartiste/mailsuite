'use client';
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export default function AccountsGDetail({ id }: { id: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { toast } = useToast();

  // Modals state
  const [cfModalOpen, setCfModalOpen] = useState(false);
  const [cfZones, setCfZones] = useState<any[]>([]);
  const [cfZonesLoading, setCfZonesLoading] = useState(false);
  const [selectedZones, setSelectedZones] = useState<string[]>([]);
  
  // Progress modal state
  const [progressModalOpen, setProgressModalOpen] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobLogs, setJobLogs] = useState<string[]>([]);
  const [jobStatus, setJobStatus] = useState<string>(''); // 'running', 'done', 'failed'
  const [jobProgress, setJobProgress] = useState(0);
  const pollInterval = useRef<NodeJS.Timeout | null>(null);

  const loadData = async () => {
    const r = await api.get(`/accounts-g/${id}`);
    if (r.ok) setData(r.data);
    else toast('Erreur', 'error');
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [id]);

  useEffect(() => {
    return () => { if (pollInterval.current) clearInterval(pollInterval.current); };
  }, []);

  const handleSuspend = async (email: string, suspend: boolean) => {
    const r = await api.patch(`/accounts-g/${id}/users/${encodeURIComponent(email)}/suspend`, { suspend });
    toast(r.ok ? `${suspend ? 'Suspendu' : 'Réactivé'}: ${email}` : r.data?.error, r.ok ? 'success' : 'error');
    if (r.ok) setData((p: any) => ({ ...p, allUsers: p.allUsers.map((u: any) => u.email === email ? { ...u, suspended: suspend } : u) }));
  };

  const handleDelete = async (email: string) => {
    if (!confirm(`Supprimer ${email} ?`)) return;
    const r = await api.delete(`/accounts-g/${id}/users/${encodeURIComponent(email)}`);
    toast(r.ok ? `Supprimé: ${email}` : r.data?.error, r.ok ? 'success' : 'error');
    if (r.ok) setData((p: any) => ({ ...p, allUsers: p.allUsers.filter((u: any) => u.email !== email) }));
  };

      // Cloudflare Import Logic
  const openCfModal = async () => {
    setCfModalOpen(true);
    if (cfZones.length === 0) {
      setCfZonesLoading(true);
      const r = await api.get('/cloudflare/zones');
      if (r.ok && r.data.result) setCfZones(r.data.result);
      else toast('Erreur chargement zones Cloudflare', 'error');
      setCfZonesLoading(false);
    }
  };

  const toggleZone = (zoneId: string) => {
    setSelectedZones(prev => prev.includes(zoneId) ? prev.filter(z => z !== zoneId) : [...prev, zoneId]);
  };

  const launchCfImport = async () => {
    if (selectedZones.length === 0) return toast('Sélectionnez au moins une zone', 'error');
    setCfModalOpen(false);
    setProgressModalOpen(true);
    setJobLogs(['Démarrage du job d\'importation Cloudflare...']);
    setJobProgress(5);
    setJobStatus('running');

    const zonesToImport = cfZones.filter(z => selectedZones.includes(z.id)).map(z => ({ id: z.id, name: z.name }));
    
    const r = await api.post(`/accounts-g/${id}/import-cf-domains`, { zones: zonesToImport });
    if (!r.ok || !r.data.jobId) {
      toast('Erreur au lancement', 'error');
      setJobStatus('failed');
      return;
    }

    setJobId(r.data.jobId);
    pollJobStatus(r.data.jobId);
  };

  // Microsoft 365 Import Logic
  const [msModalOpen, setMsModalOpen] = useState(false);
  const [msDomains, setMsDomains] = useState<any[]>([]);
  const [msDomainsLoading, setMsDomainsLoading] = useState(false);
  const [selectedMsDomains, setSelectedMsDomains] = useState<string[]>([]);
  const [msSearch, setMsSearch] = useState('');
  const [cfSearch, setCfSearch] = useState('');

  const openMsModal = async () => {
    setMsModalOpen(true);
    if (msDomains.length === 0) {
      setMsDomainsLoading(true);
      const r = await api.get('/accounts-ms/domains');
      if (r.ok && r.data.domains) setMsDomains(r.data.domains.filter((d: any) => d.id.includes('.onmicrosoft.com')));
      else toast('Erreur chargement domaines MS365', 'error');
      setMsDomainsLoading(false);
    }
  };

  const toggleMsDomain = (domainId: string) => {
    setSelectedMsDomains(prev => prev.includes(domainId) ? prev.filter(d => d !== domainId) : [...prev, domainId]);
  };

  const launchMsImport = async () => {
    if (selectedMsDomains.length === 0) return toast('Sélectionnez au moins un domaine', 'error');
    setMsModalOpen(false);
    setProgressModalOpen(true);
    setJobLogs(['Démarrage du job d\'importation OnMicrosoft...']);
    setJobProgress(5);
    setJobStatus('running');

    const domainsToImport = msDomains.filter(d => selectedMsDomains.includes(d.id)).map(d => ({ id: d.id, name: d.id }));
    
    const r = await api.post(`/accounts-g/${id}/import-ms-domains`, { domains: domainsToImport });
    if (!r.ok || !r.data.jobId) {
      toast('Erreur au lancement', 'error');
      setJobStatus('failed');
      return;
    }

    setJobId(r.data.jobId);
    pollJobStatus(r.data.jobId);
  };

  const pollJobStatus = (jId: string) => {
    if (pollInterval.current) clearInterval(pollInterval.current);
    pollInterval.current = setInterval(async () => {
      const r = await api.get(`/jobs/${jId}/status`);
      if (r.ok) {
        setJobStatus(r.data.status);
        setJobLogs(r.data.logs || []);
        setJobProgress(r.data.progress || 10);
        if (r.data.status === 'done' || r.data.status === 'failed') {
          clearInterval(pollInterval.current!);
          if (r.data.status === 'done') {
            toast('Importation terminée !', 'success');
            loadData(); // reload domains
          }
        }
      }
    }, 2000);
  };

  if (loading) return <div style={{ padding:40,textAlign:'center' }}><div className="spin" style={{ width:32,height:32,border:'3px solid rgba(99,102,241,.3)',borderTopColor:'#6366f1',borderRadius:'50%',display:'inline-block' }} /></div>;
  if (!data) return <div className="empty-state"><h3>Compte introuvable</h3><Link href="/accounts-g" className="btn btn-primary mt-3">← Retour</Link></div>;

  const { cred, stats, domains, allUsers, orgUnits, groups } = data;
  const filtered = search ? allUsers.filter((u: any) => u.email.includes(search) || u.name?.toLowerCase().includes(search.toLowerCase())) : allUsers;

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display:'flex',alignItems:'center',gap:8,fontSize:'.78rem',color:'var(--text-muted)',marginBottom:16 }}>
        <Link href="/accounts-g" style={{ color:'var(--indigo)' }}>Accounts G</Link>
        <span>›</span><span>{cred.domain}</span>
      </div>

      <div className="page-header">
        <div className="page-header-row">
          <div style={{ display:'flex',alignItems:'center',gap:14 }}>
            <div style={{ width:56,height:56,background:'linear-gradient(135deg,rgba(66,133,244,.2),rgba(52,168,83,.1))',borderRadius:16,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.8rem',fontWeight:900,color:'#4285F4',border:'1px solid rgba(66,133,244,.25)' }}>G</div>
            <div><h1 style={{ margin:0 }}>{cred.domain}</h1><p style={{ margin:0 }}>{cred.name} · {cred.admin_email}</p></div>
          </div>
          <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
            <button className="btn btn-outline" onClick={openCfModal} style={{ borderColor:'rgba(167,139,250,0.4)', color:'var(--purple)' }}>
              ☁️ Cloudflare
            </button>
            <button className="btn btn-outline" onClick={openMsModal} style={{ borderColor:'rgba(59,130,246,0.4)', color:'var(--blue)' }}>
              <i className="bi bi-microsoft"></i> OnMicrosoft
            </button>
            <Link href="/gworkspace/create-users" className="btn btn-primary"><i className="bi bi-person-plus" /> Créer users</Link>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid-4 mb-6">
        {[
          { v: stats.total, l: 'Total users', i: 'bi-people-fill', c: 'indigo' },
          { v: stats.active, l: 'Actifs', i: 'bi-person-check-fill', c: 'emerald' },
          { v: stats.suspended, l: 'Suspendus', i: 'bi-person-x-fill', c: 'rose' },
          { v: stats.twoFaOn, l: '2FA activé', i: 'bi-shield-lock-fill', c: 'violet' },
        ].map(s => (
          <div key={s.l} className="stat-card">
            <div className={`stat-icon ${s.c}`}><i className={`bi ${s.i}`} /></div>
            <div><div className="stat-value">{s.v}</div><div className="stat-label">{s.l}</div></div>
          </div>
        ))}
      </div>

      {/* Domains */}
      <div className="card mb-4">
        <div className="card-header" style={{ display:'flex',justifyContent:'space-between',alignItems:'center' }}>
          <div><i className="bi bi-globe" /> Domaines ({domains.length})</div>
          <button className="btn btn-ghost btn-sm" onClick={loadData}>🔄 Rafraîchir</button>
        </div>
        <div className="table-wrapper">
          <table>
            <thead><tr><th>DOMAINE</th><th>TYPE</th><th>VÉRIFIÉ</th><th>ACTIONS</th></tr></thead>
            <tbody>{domains.map((d: any) => (
              <tr key={d.domainName}>
                <td><strong style={{ color:'var(--text-primary)', fontFamily:'monospace' }}>{d.domainName}</strong></td>
                <td><span className={`badge badge-${d.isPrimary ? 'violet' : d.domainName.includes('onmicrosoft.com') ? 'blue' : 'gray'}`}>{d.isPrimary ? 'Primaire' : d.domainName.includes('onmicrosoft.com') ? 'OnMicrosoft' : 'Alias'}</span></td>
                <td><span className={`badge badge-${d.verified ? 'success' : 'warning'}`}>{d.verified ? '✓ Vérifié' : '⏳ En attente'}</span></td>
                <td>
                  <div style={{ display:'flex',gap:6 }}>
                    <button className="btn btn-sm btn-outline" title="Reconfigurer DNS">⚙️</button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>

      {/* Users */}
      <div className="card mb-4">
        <div className="card-header">
          <i className="bi bi-people" /> Utilisateurs ({allUsers.length})
          <input value={search} onChange={e => setSearch(e.target.value)} className="form-control" placeholder="Rechercher..." style={{ marginLeft:'auto',width:220,padding:'5px 10px',fontSize:'.8rem' }} />
        </div>
        <div className="table-wrapper" style={{ maxHeight:500,overflowY:'auto' }}>
          <table><thead><tr><th>Email</th><th>Nom</th><th>Domaine</th><th>Status</th><th>2FA</th><th>Admin</th><th>Actions</th></tr></thead>
          <tbody>{filtered.map((u: any) => (
            <tr key={u.email}>
              <td style={{ color:'var(--text-primary)',fontWeight:500 }}>{u.email}</td>
              <td>{u.name}</td>
              <td><span className="badge badge-google" style={{ fontSize:'.62rem' }}>{u.domain}</span></td>
              <td><span className={`badge badge-${u.suspended ? 'danger' : 'success'}`}>{u.suspended ? 'Suspendu' : 'Actif'}</span></td>
              <td>{u.twoFa ? <span className="badge badge-success"><i className="bi bi-shield-check" /></span> : <span className="text-muted">—</span>}</td>
              <td>{u.admin ? <span className="badge badge-violet">Admin</span> : null}</td>
              <td><div style={{ display:'flex',gap:6 }}>
                <button className="btn btn-sm btn-outline" onClick={() => handleSuspend(u.email, !u.suspended)} title={u.suspended ? 'Réactiver' : 'Suspendre'}>
                  <i className={`bi bi-${u.suspended ? 'person-check' : 'pause-circle'}`} />
                </button>
                <button className="btn btn-sm btn-danger" onClick={() => handleDelete(u.email)}><i className="bi bi-trash" /></button>
              </div></td>
            </tr>
          ))}{!filtered.length && <tr><td colSpan={7}><div className="empty-state" style={{ padding:24 }}><p>Aucun utilisateur</p></div></td></tr>}
          </tbody></table>
        </div>
      </div>

      {/* Groups + Org Units */}
      <div className="grid-2">
        <div className="card">
          <div className="card-header"><i className="bi bi-diagram-3" /> Org Units ({orgUnits.length})</div>
          <div style={{ maxHeight:240,overflowY:'auto',padding:'8px 0' }}>
            {orgUnits.map((o: any) => <div key={o.orgUnitPath} style={{ padding:'8px 20px',borderBottom:'1px solid var(--border)',fontSize:'.8rem',color:'var(--text-secondary)' }}><i className="bi bi-folder" style={{ color:'var(--amber)',marginRight:8 }} />{o.orgUnitPath}</div>)}
            {!orgUnits.length && <div className="empty-state" style={{ padding:20 }}><p>Aucune org unit</p></div>}
          </div>
        </div>
        <div className="card">
          <div className="card-header"><i className="bi bi-people-fill" /> Groupes ({groups.length})</div>
          <div style={{ maxHeight:240,overflowY:'auto',padding:'8px 0' }}>
            {groups.map((g: any) => <div key={g.email} style={{ padding:'8px 20px',borderBottom:'1px solid var(--border)',fontSize:'.8rem',color:'var(--text-secondary)' }}><i className="bi bi-people" style={{ marginRight:8 }} />{g.email}</div>)}
            {!groups.length && <div className="empty-state" style={{ padding:20 }}><p>Aucun groupe</p></div>}
          </div>
        </div>
      </div>

      {/* Modal Cloudflare Zones */}
      {cfModalOpen && (() => {
        const existingDomains = new Set((domains || []).map((d: any) => d.domainName));
        const filteredCf = cfZones.filter(z => !cfSearch || z.name?.toLowerCase().includes(cfSearch.toLowerCase()));
        const newZones = filteredCf.filter(z => !existingDomains.has(z.name));
        const alreadyAdded = filteredCf.filter(z => existingDomains.has(z.name));
        return (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', backdropFilter:'blur(4px)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div className="card" style={{ width:'100%', maxWidth:560, border:'1px solid var(--border)', display:'flex', flexDirection:'column', maxHeight:'90vh' }}>
            <div className="card-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
              <h3 style={{ margin:0, fontSize:'1.1rem' }}>☁️ Importer depuis Cloudflare</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => { setCfModalOpen(false); setCfSearch(''); }}>✕</button>
            </div>
            <div className="card-body" style={{ display:'flex', flexDirection:'column', overflow:'hidden', flex:1 }}>
              <p style={{ fontSize:'.8rem', color:'var(--text-muted)', marginBottom:12, flexShrink:0 }}>
                Sélectionnez les zones Cloudflare à ajouter. Le DNS sera configuré et validé automatiquement chez Google Workspace.
              </p>

              {/* Search + stats */}
              <div style={{ display:'flex', gap:8, marginBottom:10, flexShrink:0 }}>
                <input
                  className="form-control" placeholder="🔍 Rechercher un domaine..."
                  value={cfSearch} onChange={e => setCfSearch(e.target.value)}
                  style={{ flex:1, fontSize:'.82rem' }}
                />
                <button className="btn btn-ghost btn-sm" onClick={() => setSelectedZones(newZones.map(z => z.id))}>
                  Tout sélectionner
                </button>
              </div>
              <div style={{ display:'flex', gap:12, marginBottom:10, flexShrink:0 }}>
                <span style={{ fontSize:'.72rem', color:'var(--text-muted)' }}>{filteredCf.length} zones • <span style={{ color:'var(--emerald)' }}>{newZones.length} disponibles</span>{alreadyAdded.length > 0 && <span style={{ color:'var(--amber)' }}> • {alreadyAdded.length} déjà ajoutés</span>}</span>
                {selectedZones.length > 0 && <span style={{ fontSize:'.72rem', color:'var(--indigo)', marginLeft:'auto' }}>{selectedZones.length} sélectionné(s)</span>}
              </div>

              {/* Zone list */}
              <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:4, paddingRight:4, minHeight:0 }}>
                {cfZonesLoading ? (
                  <div style={{ textAlign:'center', padding:20, color:'var(--text-muted)' }}>Chargement...</div>
                ) : (
                  <>
                    {newZones.map(z => {
                      const isSelected = selectedZones.includes(z.id);
                      return (
                        <div key={z.id} onClick={() => toggleZone(z.id)} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 14px', borderRadius:8, background: isSelected ? 'rgba(167,139,250,0.15)' : 'var(--bg-card)', border:`1px solid ${isSelected ? 'rgba(167,139,250,0.4)' : 'var(--border)'}`, cursor:'pointer', transition:'all 0.15s' }}>
                          <span style={{ fontFamily:'monospace', fontSize:'.83rem', color:'var(--text-primary)', fontWeight:isSelected?600:400 }}>{z.name}</span>
                          <span style={{ fontSize:'.7rem', color: isSelected ? 'var(--purple)' : 'var(--emerald)' }}>{isSelected ? '✓ Sélectionné' : '● ' + (z.status || 'active')}</span>
                        </div>
                      );
                    })}
                    {alreadyAdded.length > 0 && (
                      <div style={{ padding:'6px 0 2px', fontSize:'.7rem', color:'var(--text-muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:'.05em' }}>
                        Déjà dans ce compte GW
                      </div>
                    )}
                    {alreadyAdded.map(z => (
                      <div key={z.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 14px', borderRadius:8, background:'rgba(245,158,11,0.05)', border:'1px solid rgba(245,158,11,0.2)', opacity:.6 }}>
                        <span style={{ fontFamily:'monospace', fontSize:'.83rem', color:'var(--text-secondary)' }}>{z.name}</span>
                        <span style={{ fontSize:'.7rem', color:'var(--amber)' }}>✓ Déjà ajouté</span>
                      </div>
                    ))}
                    {!filteredCf.length && <div style={{ textAlign:'center', padding:24, color:'var(--text-muted)', fontSize:'.85rem' }}>Aucune zone trouvée</div>}
                  </>
                )}
              </div>

              {/* Actions — always visible */}
              <div style={{ marginTop:16, display:'flex', gap:10, flexShrink:0, paddingTop:12, borderTop:'1px solid var(--border)' }}>
                <button className="btn btn-primary" style={{ flex:1 }} onClick={launchCfImport} disabled={cfZonesLoading || selectedZones.length === 0}>
                  🚀 Importer et configurer auto {selectedZones.length > 0 ? `(${selectedZones.length})` : ''}
                </button>
                <button className="btn btn-outline" onClick={() => { setCfModalOpen(false); setCfSearch(''); }}>Annuler</button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Modal OnMicrosoft Domains */}
      {msModalOpen && (() => {
        const filteredMs = msDomains.filter(d => !msSearch || d.id?.toLowerCase().includes(msSearch.toLowerCase()));
        return (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', backdropFilter:'blur(4px)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div className="card" style={{ width:'100%', maxWidth:560, border:'1px solid rgba(59,130,246,0.3)', display:'flex', flexDirection:'column', maxHeight:'90vh' }}>
            <div className="card-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
              <h3 style={{ margin:0, fontSize:'1.1rem', color:'var(--blue)' }}><i className="bi bi-microsoft"></i> Importer depuis OnMicrosoft</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => { setMsModalOpen(false); setMsSearch(''); }}>✕</button>
            </div>
            <div className="card-body" style={{ display:'flex', flexDirection:'column', overflow:'hidden', flex:1 }}>
              <p style={{ fontSize:'.8rem', color:'var(--text-muted)', marginBottom:12, flexShrink:0 }}>
                Sélectionnez les domaines OnMicrosoft à ajouter. Le DNS sera configuré via Microsoft 365.
              </p>

              {/* Search + count */}
              <div style={{ display:'flex', gap:8, marginBottom:10, flexShrink:0 }}>
                <input
                  className="form-control" placeholder="🔍 Rechercher un domaine..."
                  value={msSearch} onChange={e => setMsSearch(e.target.value)}
                  style={{ flex:1, fontSize:'.82rem' }}
                />
                <button className="btn btn-ghost btn-sm" onClick={() => setSelectedMsDomains(filteredMs.map(d => d.id))}>
                  Tout sélectionner
                </button>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8, flexShrink:0 }}>
                <span style={{ fontSize:'.72rem', color:'var(--text-muted)' }}>{filteredMs.length} domaine(s) trouvé(s)</span>
                {selectedMsDomains.length > 0 && <span style={{ fontSize:'.72rem', color:'var(--blue)' }}>{selectedMsDomains.length} sélectionné(s)</span>}
              </div>

              {/* Domain list */}
              <div style={{ flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:5, paddingRight:4, minHeight:0 }}>
                {msDomainsLoading ? (
                  <div style={{ textAlign:'center', padding:20, color:'var(--text-muted)' }}>
                    <div className="spin" style={{ width:20,height:20,border:'2px solid rgba(96,165,250,0.3)',borderTopColor:'var(--blue)',borderRadius:'50%',display:'inline-block',marginBottom:8 }} />
                    <p>Chargement...</p>
                  </div>
                ) : filteredMs.length === 0 ? (
                  <div style={{ padding:24, textAlign:'center', color:'var(--text-muted)', fontSize:'.85rem' }}>
                    {msDomains.length === 0 ? 'Aucun domaine onmicrosoft trouvé. Vérifiez la configuration MS365 dans les paramètres.' : 'Aucune correspondance pour cette recherche.'}
                  </div>
                ) : (
                  filteredMs.map(d => {
                    const isSelected = selectedMsDomains.includes(d.id);
                    return (
                      <div key={d.id} onClick={() => toggleMsDomain(d.id)} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', borderRadius:8, background: isSelected ? 'rgba(59,130,246,0.12)' : 'var(--bg-card)', border:`1px solid ${isSelected ? 'rgba(59,130,246,0.45)' : 'var(--border)'}`, cursor:'pointer', transition:'all 0.15s' }}>
                        <div>
                          <span style={{ fontFamily:'monospace', fontSize:'.83rem', color:'var(--text-primary)', fontWeight:isSelected?600:400 }}>{d.id}</span>
                        </div>
                        <span style={{ fontSize:'.7rem', color: isSelected ? 'var(--blue)' : 'var(--text-muted)', flexShrink:0, marginLeft:8 }}>
                          {isSelected ? '✓ Sélectionné' : '● Microsoft 365'}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Actions — always visible at bottom */}
              <div style={{ marginTop:16, display:'flex', gap:10, flexShrink:0, paddingTop:12, borderTop:'1px solid var(--border)' }}>
                <button className="btn btn-primary" style={{ flex:1, background:'var(--blue)', borderColor:'var(--blue)' }} onClick={launchMsImport} disabled={msDomainsLoading || selectedMsDomains.length === 0}>
                  🚀 Importer {selectedMsDomains.length > 0 ? `(${selectedMsDomains.length})` : 'et configurer'}
                </button>
                <button className="btn btn-outline" onClick={() => { setMsModalOpen(false); setMsSearch(''); }}>Annuler</button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Modal Progress Tracker */}

      {progressModalOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', backdropFilter:'blur(4px)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div className="card" style={{ width:'100%', maxWidth:520, border:'1px solid var(--border)' }}>
            <div className="card-header" style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <h3 style={{ margin:0, fontSize:'1.1rem' }}>⚙️ Configuration en cours…</h3>
              {jobStatus === 'done' || jobStatus === 'failed' ? (
                <button className="btn btn-ghost btn-sm" onClick={() => setProgressModalOpen(false)}>✕</button>
              ) : null}
            </div>
            <div className="card-body">
              <div style={{ height:6, background:'var(--bg-hover)', borderRadius:3, overflow:'hidden', marginBottom:20 }}>
                <div style={{ height:'100%', background: jobStatus === 'failed' ? 'var(--rose)' : 'linear-gradient(90deg, var(--indigo), var(--purple))', width: `${jobProgress}%`, transition:'width 0.5s' }} />
              </div>
              
              <div style={{ maxHeight:300, overflowY:'auto', background:'var(--bg-card)', borderRadius:8, border:'1px solid var(--border)', padding:14, display:'flex', flexDirection:'column', gap:8, fontFamily:'monospace', fontSize:'.75rem', color:'var(--text-secondary)' }}>
                {jobLogs.map((log, i) => (
                  <div key={i} style={{ color: log.includes('✅') ? 'var(--emerald)' : log.includes('❌') ? 'var(--rose)' : 'inherit' }}>
                    {log}
                  </div>
                ))}
                {jobStatus === 'running' && (
                  <div style={{ display:'flex', alignItems:'center', gap:8, color:'var(--blue)' }}>
                    <div className="spin" style={{ width:12,height:12,border:'2px solid rgba(96,165,250,0.3)',borderTopColor:'var(--blue)',borderRadius:'50%' }} />
                    Traitement en cours...
                  </div>
                )}
              </div>

              {jobStatus === 'done' && (
                <div style={{ marginTop:16, padding:12, background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.3)', borderRadius:8, color:'var(--emerald)', fontSize:'.85rem', fontWeight:600 }}>
                  ✅ Opération terminée avec succès.
                </div>
              )}
              {jobStatus === 'failed' && (
                <div style={{ marginTop:16, padding:12, background:'rgba(244,63,94,0.1)', border:'1px solid rgba(244,63,94,0.3)', borderRadius:8, color:'var(--rose)', fontSize:'.85rem', fontWeight:600 }}>
                  ❌ Erreur lors de l'opération.
                </div>
              )}

              {(jobStatus === 'done' || jobStatus === 'failed') && (
                <div style={{ marginTop:16, textAlign:'right' }}>
                  <button className="btn btn-outline" onClick={() => setProgressModalOpen(false)}>Fermer</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

