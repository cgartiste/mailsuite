'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

const SRC_BADGE: Record<string, { label: string; color: string }> = {
  cloudflare: { label: '☁ CF',     color: '#f6821f' },
  google:     { label: '⊡ GW',     color: '#4285F4' },
  microsoft:  { label: '⊞ MS365',  color: '#00a4ef' },
  manual:     { label: '⚙ Manuel', color: '#94a3b8' },
};

function DnsPill({ status, label }: { status: string; label: string }) {
  const cls = status === 'valid' ? 'dns-pill-valid' : status === 'missing' ? 'dns-pill-missing' : 'dns-pill-invalid';
  return <span className={`dns-pill ${cls}`}>{label}</span>;
}

export default function Domains() {
  const [domains, setDomains]       = useState<any[]>([]);
  const [sources, setSources]       = useState<any>(null);
  const [loading, setLoading]       = useState(true);
  const [syncing, setSyncing]       = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [newDomain, setNewDomain]   = useState('');
  const [checking, setChecking]     = useState<number | null>(null);
  const [search, setSearch]         = useState('');
  const [filterSrc, setFilterSrc]   = useState('all');
  const { toast } = useToast();

  const load = () => api.get('/domains').then(r => { if (r.ok) setDomains(r.data.domains || []); setLoading(false); });
  useEffect(() => { load(); }, []);

  const loadSources = async () => {
    setShowSources(true);
    const r = await api.get('/domains/sources');
    if (r.ok) setSources(r.data);
  };

  const sync = async (srcs?: string[]) => {
    setSyncing(true);
    const r = await api.post('/domains/sync', srcs ? { sources: srcs } : {});
    if (r.ok) {
      toast(`✓ ${r.data.added} domaine(s) ajouté(s), ${r.data.skipped} déjà présents`, 'success');
      load();
    } else toast(r.data?.error || 'Erreur sync', 'error');
    setSyncing(false);
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await api.post('/domains', { domain: newDomain.trim().toLowerCase() });
    toast(r.ok ? `✓ ${newDomain} ajouté` : r.data?.error || 'Erreur', r.ok ? 'success' : 'error');
    if (r.ok) { setNewDomain(''); load(); }
  };

  const checkDns = async (id: number, domain: string) => {
    setChecking(id);
    const r = await api.post(`/domains/${id}/check-dns`);
    toast(r.ok ? (r.data.allValid ? `✓ ${domain}: DNS OK` : `⚠ ${domain}: Problèmes DNS`) : r.data?.error || 'Erreur',
          r.ok ? (r.data.allValid ? 'success' : 'warning') : 'error');
    setChecking(null);
    load();
  };

  const toggle = async (id: number) => {
    const r = await api.patch(`/domains/${id}/toggle`);
    if (r.ok) load();
  };

  const del = async (id: number, domain: string) => {
    if (!confirm(`Supprimer ${domain} ?`)) return;
    const r = await api.delete(`/domains/${id}`);
    toast(r.ok ? `${domain} supprimé` : r.data?.error, r.ok ? 'success' : 'error');
    if (r.ok) setDomains(p => p.filter(d => d.id !== id));
  };

  const statusColor: Record<string, string> = { active: 'success', paused: 'warning', blocked: 'danger', warming: 'info' };

  const filtered = domains.filter(d => {
    const matchSearch = !search || d.domain.includes(search.toLowerCase());
    const matchSrc = filterSrc === 'all' || (d.source || 'manual') === filterSrc;
    return matchSearch && matchSrc;
  });

  const srcCounts = domains.reduce((acc: any, d) => {
    const s = d.source || 'manual';
    acc[s] = (acc[s] || 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1><i className="bi bi-globe" /> Domaines & DNS</h1>
            <p>{domains.length} domaine(s) · importés depuis Cloudflare, Google Workspace et Microsoft 365</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline" onClick={loadSources}>
              <i className="bi bi-eye" /> Voir sources
            </button>
            <button className="btn btn-primary" onClick={() => sync()} disabled={syncing}>
              {syncing
                ? <><span className="spin" style={{ width:14,height:14,border:'2px solid rgba(255,255,255,.3)',borderTopColor:'#fff',borderRadius:'50%',display:'inline-block' }} /> Synchronisation...</>
                : <><i className="bi bi-arrow-repeat" /> Synchroniser tout</>}
            </button>
          </div>
        </div>
      </div>

      {/* Sources panel */}
      {showSources && (
        <div className="card mb-4">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span><i className="bi bi-diagram-3" /> Sources de domaines</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowSources(false)}>✕</button>
          </div>
          <div className="card-body">
            {!sources ? (
              <div style={{ textAlign: 'center', padding: 20 }}><div className="spin" style={{ width:20,height:20,border:'2px solid rgba(99,102,241,.3)',borderTopColor:'#6366f1',borderRadius:'50%',display:'inline-block' }} /></div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
                {[
                  { key: 'cloudflare', label: 'Cloudflare', icon: '☁', color: '#f6821f', data: sources.cloudflare },
                  { key: 'google',     label: 'Google Workspace', icon: '⊡', color: '#4285F4', data: sources.google },
                  { key: 'microsoft',  label: 'Microsoft 365', icon: '⊞', color: '#00a4ef', data: sources.microsoft },
                ].map(s => (
                  <div key={s.key} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <span style={{ fontSize: '1.4rem', color: s.color }}>{s.icon}</span>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '.9rem' }}>{s.label}</div>
                        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{(s.data || []).length} domaines</div>
                      </div>
                      <button className="btn btn-sm btn-outline" style={{ marginLeft: 'auto', fontSize: '.7rem' }}
                        onClick={() => sync([s.key])} disabled={syncing}>
                        Importer
                      </button>
                    </div>
                    <div style={{ maxHeight: 120, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {(s.data || []).slice(0, 20).map((d: any) => {
                        const name = d.name || d.domainName || d.id;
                        const already = (sources.already_added || []).includes(name);
                        return (
                          <div key={name} style={{ fontSize: '.72rem', display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                            <span style={{ color: already ? 'var(--text-muted)' : 'var(--text-primary)', fontFamily: 'monospace' }}>{name}</span>
                            {already && <span style={{ color: 'var(--emerald)', fontSize: '.65rem' }}>✓</span>}
                          </div>
                        );
                      })}
                      {(s.data || []).length > 20 && <div style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>+{(s.data || []).length - 20} autres...</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add + filters */}
      <div className="card mb-4">
        <div className="card-body" style={{ padding: '14px 20px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <form onSubmit={add} style={{ display: 'flex', gap: 8 }}>
            <input className="form-control" style={{ width: 240 }} placeholder="exemple.com" value={newDomain} onChange={e => setNewDomain(e.target.value)} />
            <button className="btn btn-outline" type="submit"><i className="bi bi-plus-lg" /> Ajouter</button>
          </form>
          <div style={{ width: 1, height: 28, background: 'var(--border)', margin: '0 4px' }} />
          <input className="form-control" style={{ width: 200 }} placeholder="🔍 Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg)', borderRadius: 8, padding: 3, border: '1px solid var(--border)' }}>
            {['all', 'cloudflare', 'google', 'microsoft', 'manual'].map(s => (
              <button key={s} onClick={() => setFilterSrc(s)} style={{
                padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: '.72rem', fontWeight: filterSrc === s ? 700 : 400,
                background: filterSrc === s ? 'rgba(99,102,241,0.2)' : 'transparent',
                color: filterSrc === s ? '#818cf8' : 'var(--text-muted)', transition: 'all .12s',
              }}>
                {s === 'all' ? `Tous (${domains.length})` : `${SRC_BADGE[s]?.label} (${srcCounts[s] || 0})`}
              </button>
            ))}
          </div>
          <span style={{ marginLeft: 'auto', fontSize: '.75rem', color: 'var(--text-muted)' }}>{filtered.length} / {domains.length}</span>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-wrapper">
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <div className="spin" style={{ width:28,height:28,border:'3px solid rgba(99,102,241,.3)',borderTopColor:'#6366f1',borderRadius:'50%',display:'inline-block' }} />
            </div>
          ) : (
            <table>
              <thead>
                <tr><th>Domaine</th><th>Source</th><th>Status</th><th>SPF</th><th>DKIM</th><th>DMARC</th><th>BIMI</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {filtered.map((d: any) => {
                  const src = SRC_BADGE[d.source || 'manual'];
                  return (
                    <tr key={d.id}>
                      <td>
                        <strong style={{ color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '.85rem' }}>{d.domain}</strong>
                        {d.open_incidents > 0 && <span className="badge badge-danger" style={{ marginLeft: 6, fontSize: '.6rem' }}>{d.open_incidents} incident(s)</span>}
                      </td>
                      <td>
                        <span style={{ fontSize: '.7rem', fontWeight: 600, color: src.color, background: src.color + '18', padding: '2px 8px', borderRadius: 6 }}>
                          {src.label}
                        </span>
                      </td>
                      <td><span className={`badge badge-${statusColor[d.status] || 'gray'}`}>{d.status}</span></td>
                      <td><DnsPill status={d.spf_status} label="SPF" /></td>
                      <td><DnsPill status={d.dkim_status} label="DKIM" /></td>
                      <td><DnsPill status={d.dmarc_status} label="DMARC" /></td>
                      <td><DnsPill status={d.bimi_status} label="BIMI" /></td>
                      <td>
                        <div style={{ display: 'flex', gap: 5 }}>
                          <button className="btn btn-sm btn-outline" title="Vérifier DNS" disabled={checking === d.id} onClick={() => checkDns(d.id, d.domain)}>
                            {checking === d.id
                              ? <span className="spin" style={{ width:12,height:12,border:'2px solid rgba(99,102,241,.3)',borderTopColor:'#6366f1',borderRadius:'50%',display:'inline-block' }} />
                              : <i className="bi bi-wifi" />}
                          </button>
                          <button className="btn btn-sm btn-outline" onClick={() => toggle(d.id)} title="Toggle status">
                            <i className={`bi bi-${d.status === 'active' ? 'pause' : 'play'}`} />
                          </button>
                          <button className="btn btn-sm btn-danger" onClick={() => del(d.id, d.domain)}>
                            <i className="bi bi-trash" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!filtered.length && (
                  <tr><td colSpan={8}>
                    <div className="empty-state" style={{ padding: 40 }}>
                      <span style={{ fontSize: '2rem' }}>🌐</span>
                      <h3>{domains.length ? 'Aucun résultat' : 'Aucun domaine'}</h3>
                      <p>{domains.length ? 'Modifiez le filtre' : 'Cliquez sur "Synchroniser tout" pour importer vos domaines'}</p>
                    </div>
                  </td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
