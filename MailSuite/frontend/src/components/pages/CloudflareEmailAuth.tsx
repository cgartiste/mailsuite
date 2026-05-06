'use client';
import { useEffect, useState, useRef } from 'react';
import api from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

const SPF_OPTIONS = [
  { value: 'spf_google',    label: 'Google Workspace',     hint: 'include:_spf.google.com' },
  { value: 'spf_microsoft', label: 'Microsoft 365',        hint: 'include:spf.protection.outlook.com' },
  { value: 'spf_both',      label: 'Google + Microsoft',   hint: 'Les deux combinés' },
  { value: 'spf',           label: 'Personnalisé',         hint: '' },
];

type DomainRow = {
  domain: string; domain_id: number; zone: any;
  spf: any; dkim: any; dmarc: any; bimi: any; mx: any[];
};

export default function CloudflareEmailAuth() {
  const [data, setData]           = useState<DomainRow[]>([]);
  const [loading, setLoading]     = useState(true);
  const [deploying, setDeploying] = useState<Record<string, boolean>>({});
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [search, setSearch]       = useState('');
  const [filter, setFilter]       = useState<'all' | 'issues' | 'complete'>('all');
  const [bulkSpf, setBulkSpf]     = useState('spf_both');
  const [bulkOps, setBulkOps]     = useState({ spf: true, dmarc: true, mx: false });
  const [bulking, setBulking]     = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [dkimGuide, setDkimGuide] = useState(false);
  const [dkimModal, setDkimModal] = useState<{ domain: string; zoneId: string; info: any } | null>(null);
  const [dkimKey, setDkimKey] = useState('');
  const [deployingDkim, setDeployingDkim] = useState(false);
  const [showNoZone, setShowNoZone] = useState(false);
  const { toast } = useToast();

  const loadData = async () => {
    setLoading(true);
    const r = await api.get('/cloudflare/email-auth');
    if (r.ok) setData(r.data.data || []);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const deploy = async (domain: string, zoneId: string, recordType: string, recordId?: string, content?: string) => {
    const key = `${domain}-${recordType}`;
    setDeploying(p => ({ ...p, [key]: true }));
    const r = await api.post('/cloudflare/email-auth/deploy', { domain, zone_id: zoneId, record_type: recordType, record_id: recordId, content });

    // DKIM needs user to paste key
    if (!r.ok && r.data?.needs_key) {
      setDkimModal({ domain, zoneId, info: r.data });
      setDkimKey('');
    } else {
      toast(r.ok ? `✓ ${recordType.toUpperCase()} déployé — ${domain}` : r.data?.error || 'Erreur', r.ok ? 'success' : 'error');
      if (r.ok) loadData();
    }
    setDeploying(p => ({ ...p, [key]: false }));
  };

  const deployDkim = async () => {
    if (!dkimModal || !dkimKey.trim()) return;
    setDeployingDkim(true);
    const r = await api.post('/cloudflare/email-auth/deploy', {
      domain: dkimModal.domain, zone_id: dkimModal.zoneId,
      record_type: 'dkim', content: dkimKey.trim(),
    });
    toast(r.ok ? `✓ DKIM déployé — ${dkimModal.domain}` : r.data?.error || 'Erreur', r.ok ? 'success' : 'error');
    setDeployingDkim(false);
    if (r.ok) { setDkimModal(null); setDkimKey(''); loadData(); }
  };

  const deployBulk = async () => {
    const targets = data.filter(d => d.zone && selected.has(d.domain));
    if (!targets.length) return toast('Sélectionnez au moins un domaine', 'warning');

    const types: string[] = [];
    if (bulkOps.spf)  types.push(bulkSpf);
    if (bulkOps.dmarc) types.push('dmarc');
    if (bulkOps.mx)   types.push('mx_google');
    if (!types.length) return toast('Sélectionnez au moins un type', 'warning');

    setBulking(true); setBulkProgress(0);
    const zoneIds = targets.map(d => d.zone.id);
    const r = await api.post('/cloudflare/email-auth/deploy-bulk', { zone_ids: zoneIds, record_types: types, spf_type: bulkSpf });
    setBulkProgress(100);
    if (r.ok) {
      toast(`✓ Déployé sur ${r.data.applied || targets.length} zones`, 'success');
      loadData();
    } else toast(r.data?.error || 'Erreur bulk', 'error');
    setBulking(false);
  };

  const toggleSelect = (domain: string) => {
    setSelected(p => { const n = new Set(p); n.has(domain) ? n.delete(domain) : n.add(domain); return n; });
  };

  const selectAll = () => {
    const visible = filtered.filter(d => d.zone);
    if (selected.size === visible.length) setSelected(new Set());
    else setSelected(new Set(visible.map(d => d.domain)));
  };

  const isComplete = (d: DomainRow) => !!d.spf && !!d.dkim && !!d.dmarc;
  const hasIssue   = (d: DomainRow) => !d.spf || !d.dmarc;

  const filtered = data.filter(d => {
    if (!showNoZone && !d.zone) return false;
    const matchSearch = !search || d.domain.includes(search.toLowerCase());
    const matchFilter = filter === 'all' || (filter === 'complete' ? isComplete(d) : hasIssue(d));
    return matchSearch && matchFilter;
  });

  const stats = {
    total:    data.length,
    spf:      data.filter(d => d.spf).length,
    dmarc:    data.filter(d => d.dmarc).length,
    dkim:     data.filter(d => d.dkim).length,
    complete: data.filter(isComplete).length,
    issues:   data.filter(hasIssue).length,
  };

  const StatusDot = ({ ok, label }: { ok: boolean; label: string }) => (
    <span style={{ fontSize: '.7rem', fontWeight: 600, padding: '2px 7px', borderRadius: 5,
      background: ok ? 'rgba(16,185,129,.15)' : 'rgba(244,63,94,.12)',
      color: ok ? '#34d399' : '#fb7185' }}>
      {ok ? '✓' : '✕'} {label}
    </span>
  );

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1><i className="bi bi-shield-lock" style={{ color: 'var(--cf-orange)' }} /> Email Authentication</h1>
            <p>SPF · DKIM · DMARC · BIMI — Déploiement automatisé Cloudflare</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline" onClick={() => setDkimGuide(!dkimGuide)}>
              <i className="bi bi-key" /> Guide DKIM
            </button>
            <button className="btn btn-outline" onClick={loadData}><i className="bi bi-arrow-repeat" /></button>
          </div>
        </div>
      </div>

      {/* Stats */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { v: stats.total,    l: 'Domaines',  c: '#94a3b8' },
            { v: stats.spf,      l: 'SPF OK',    c: '#34d399' },
            { v: stats.dkim,     l: 'DKIM OK',   c: '#34d399' },
            { v: stats.dmarc,    l: 'DMARC OK',  c: '#34d399' },
            { v: stats.complete, l: 'Complets',  c: '#818cf8' },
            { v: stats.issues,   l: 'Problèmes', c: '#fb7185' },
          ].map(s => (
            <div key={s.l} className="card" style={{ padding: '12px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: s.c }}>{s.v}</div>
              <div style={{ fontSize: '.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>{s.l}</div>
            </div>
          ))}
        </div>
      )}

      {/* DKIM Guide */}
      {dkimGuide && (
        <div className="card mb-4" style={{ border: '1px solid rgba(245,158,11,.3)', background: 'rgba(245,158,11,.04)' }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#f59e0b' }}><i className="bi bi-key" /> Guide DKIM — Configuration manuelle requise</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setDkimGuide(false)}>✕</button>
          </div>
          <div className="card-body" style={{ fontSize: '.82rem', lineHeight: 1.7 }}>
            <p style={{ color: 'var(--text-secondary)', marginBottom: 12 }}>DKIM nécessite une clé cryptographique générée par Google Workspace. Voici la procédure :</p>
            <ol style={{ paddingLeft: 20, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li>Allez sur <strong style={{ color: '#4285F4' }}>admin.google.com</strong> → Apps → Google Workspace → Gmail → Authentifier les e-mails</li>
              <li>Sélectionnez votre domaine → Générer une nouvelle clé (2048 bits recommandé)</li>
              <li>Copiez la valeur TXT affichée (commence par <code style={{ color: '#f59e0b' }}>v=DKIM1; k=rsa; p=...</code>)</li>
              <li>Ajoutez-la manuellement dans Cloudflare DNS sous le nom <code style={{ color: '#f59e0b' }}>mail._domainkey.votredomaine.com</code></li>
              <li>Revenez sur admin.google.com → Démarrer l'authentification</li>
            </ol>
          </div>
        </div>
      )}

      {/* Bulk deploy panel */}
      {selected.size > 0 && (
        <div className="card mb-4" style={{ border: '1px solid rgba(99,102,241,.3)', background: 'rgba(99,102,241,.04)' }}>
          <div className="card-body" style={{ padding: '14px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, color: '#818cf8' }}>
                <i className="bi bi-lightning-fill" /> {selected.size} zone(s) sélectionnée(s)
              </span>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>SPF:</span>
                <select className="form-control" style={{ width: 200, padding: '5px 10px', fontSize: '.8rem' }}
                  value={bulkSpf} onChange={e => setBulkSpf(e.target.value)}>
                  {SPF_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label} — {o.hint}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                {[{ k: 'spf', l: 'SPF' }, { k: 'dmarc', l: 'DMARC' }, { k: 'mx', l: 'MX Google' }].map(op => (
                  <label key={op.k} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '.8rem', cursor: 'pointer', userSelect: 'none' }}>
                    <input type="checkbox" checked={(bulkOps as any)[op.k]}
                      onChange={e => setBulkOps(p => ({ ...p, [op.k]: e.target.checked }))} />
                    {op.l}
                  </label>
                ))}
              </div>

              <button className="btn btn-primary" onClick={deployBulk} disabled={bulking} style={{ marginLeft: 'auto' }}>
                {bulking
                  ? <><span className="spin" style={{ width:14,height:14,border:'2px solid rgba(255,255,255,.3)',borderTopColor:'#fff',borderRadius:'50%',display:'inline-block' }} /> Déploiement...</>
                  : <><i className="bi bi-rocket-takeoff" /> Déployer sur {selected.size} zones</>}
              </button>

              <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>✕ Désélectionner</button>
            </div>
            {bulking && (
              <div style={{ marginTop: 10, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: '#6366f1', width: `${bulkProgress}%`, transition: 'width .3s' }} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Filters + search */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="form-control" placeholder="🔍 Rechercher un domaine..." value={search}
          onChange={e => setSearch(e.target.value)} style={{ maxWidth: 280, fontSize: '.82rem' }} />
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-card)', borderRadius: 8, padding: 3, border: '1px solid var(--border)' }}>
          {(['all','issues','complete'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: '.78rem', transition: 'all .12s',
              background: filter === f ? 'rgba(246,130,31,0.2)' : 'transparent',
              color: filter === f ? '#f6821f' : 'var(--text-muted)', fontWeight: filter === f ? 700 : 400,
            }}>
              {f === 'all' ? `Tous (${data.length})` : f === 'issues' ? `⚠ Problèmes (${stats.issues})` : `✓ Complets (${stats.complete})`}
            </button>
          ))}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.78rem', color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={showNoZone} onChange={e => setShowNoZone(e.target.checked)} />
          Afficher sans zone CF ({data.filter(d => !d.zone).length})
        </label>
        <span style={{ marginLeft: 'auto', fontSize: '.75rem', color: 'var(--text-muted)' }}>{filtered.length} / {data.length} zones</span>
      </div>

      {/* Table */}
      {loading ? (
        <div>{[...Array(5)].map((_, i) => <div key={i} className="skeleton mb-2" style={{ height: 52 }} />)}</div>
      ) : (
        <div className="card">
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input type="checkbox"
                      checked={selected.size > 0 && selected.size === filtered.filter(d => d.zone).length}
                      onChange={selectAll} />
                  </th>
                  <th>Domaine</th><th>Zone CF</th><th>SPF</th><th>DKIM</th><th>DMARC</th><th>MX</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => {
                  const dk = `${d.domain}`;
                  return (
                    <tr key={d.domain} style={{ background: selected.has(d.domain) ? 'rgba(99,102,241,.05)' : undefined }}>
                      <td onClick={e => e.stopPropagation()}>
                        {d.zone && <input type="checkbox" checked={selected.has(d.domain)} onChange={() => toggleSelect(d.domain)} />}
                      </td>
                      <td>
                        <span style={{ fontFamily: 'monospace', fontSize: '.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>{d.domain}</span>
                      </td>
                      <td>
                        {d.zone
                          ? <span style={{ fontSize: '.7rem', color: '#f6821f', fontFamily: 'monospace' }}>{d.zone.name}</span>
                          : <span style={{ fontSize: '.7rem', color: 'var(--rose)' }}>Zone introuvable</span>}
                      </td>
                      <td><StatusDot ok={!!d.spf} label="SPF" /></td>
                      <td>
                        <span style={{ fontSize: '.7rem', fontWeight: 600, padding: '2px 7px', borderRadius: 5,
                          background: d.dkim ? 'rgba(16,185,129,.15)' : 'rgba(148,163,184,.1)',
                          color: d.dkim ? '#34d399' : '#94a3b8' }}>
                          {d.dkim ? '✓ DKIM' : '— DKIM'}
                        </span>
                      </td>
                      <td><StatusDot ok={!!d.dmarc} label="DMARC" /></td>
                      <td>
                        <span style={{ fontSize: '.7rem', color: d.mx?.length ? '#34d399' : '#94a3b8' }}>
                          {d.mx?.length ? `${d.mx.length} MX` : '—'}
                        </span>
                      </td>
                      <td>
                        {d.zone && (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {!d.spf && (
                              <button className="btn btn-sm btn-primary" style={{ fontSize: '.68rem', padding: '3px 8px' }}
                                disabled={deploying[`${dk}-spf_both`]}
                                onClick={() => deploy(d.domain, d.zone.id, 'spf_both', d.spf?.id)}>
                                + SPF
                              </button>
                            )}
                            {!d.dmarc && (
                              <button className="btn btn-sm" style={{ fontSize: '.68rem', padding: '3px 8px', background: 'rgba(14,165,233,.15)', color: '#0ea5e9', border: '1px solid rgba(14,165,233,.3)' }}
                                disabled={deploying[`${dk}-dmarc`]}
                                onClick={() => deploy(d.domain, d.zone.id, 'dmarc', d.dmarc?.id)}>
                                + DMARC
                              </button>
                            )}
                            {(!d.mx || !d.mx.length) && (
                              <button className="btn btn-sm" style={{ fontSize: '.68rem', padding: '3px 8px', background: 'rgba(16,185,129,.1)', color: '#34d399', border: '1px solid rgba(16,185,129,.25)' }}
                                disabled={deploying[`${dk}-mx_google`]}
                                onClick={() => deploy(d.domain, d.zone.id, 'mx_google')}>
                                + MX
                              </button>
                            )}
                            {d.spf && d.dmarc && (
                              <span style={{ fontSize: '.68rem', color: '#34d399', padding: '3px 6px' }}>✓ Configuré</span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!filtered.length && (
                  <tr><td colSpan={8}>
                    <div className="empty-state" style={{ padding: 40 }}>
                      <span style={{ fontSize: '2rem' }}>🛡</span>
                      <h3>{data.length ? 'Aucun résultat' : 'Aucun domaine trouvé'}</h3>
                      <p>Synchronisez vos domaines depuis la page Domaines & DNS</p>
                    </div>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DKIM deploy modal */}
      {dkimModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="card" style={{ width: '100%', maxWidth: 560, border: '1px solid rgba(245,158,11,.3)' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, color: '#f59e0b' }}><i className="bi bi-key" /> Déployer DKIM — {dkimModal.domain}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setDkimModal(null)}>✕</button>
            </div>
            <div className="card-body">
              <div className="alert alert-info" style={{ background: 'rgba(14,165,233,.08)', border: '1px solid rgba(14,165,233,.2)', borderRadius: 8, padding: '12px 14px', marginBottom: 16, fontSize: '.82rem', color: '#7dd3fc' }}>
                <strong>Comment obtenir la clé DKIM :</strong>
                <ol style={{ marginTop: 8, paddingLeft: 18, lineHeight: 1.8 }}>
                  <li>Allez sur <strong>admin.google.com</strong></li>
                  <li>Apps → Google Workspace → Gmail → Authentifier les emails</li>
                  <li>Sélectionnez <strong>{dkimModal.domain}</strong> → Générer une nouvelle clé (2048 bits)</li>
                  <li>Copiez la valeur TXT affichée</li>
                </ol>
                {dkimModal.info?.gw_account && (
                  <p style={{ marginTop: 8 }}>Compte GW lié : <strong>{dkimModal.info.gw_account.admin_email}</strong></p>
                )}
              </div>

              <div style={{ marginBottom: 14 }}>
                <label className="form-label" style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
                  Nom du record TXT à créer dans Cloudflare :
                </label>
                <code style={{ display: 'block', padding: '8px 12px', background: 'var(--bg)', borderRadius: 6, fontSize: '.8rem', color: '#f59e0b', border: '1px solid var(--border)' }}>
                  {dkimModal.info?.dkim_record_name}
                </code>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label className="form-label" style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
                  Collez la valeur DKIM (commence par <code>v=DKIM1; k=rsa; p=...</code>) :
                </label>
                <textarea className="form-control" rows={4} style={{ fontFamily: 'monospace', fontSize: '.75rem' }}
                  placeholder="v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA..."
                  value={dkimKey} onChange={e => setDkimKey(e.target.value)} />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={deployDkim}
                  disabled={deployingDkim || !dkimKey.trim()}>
                  {deployingDkim
                    ? <><span className="spin" style={{ width:14,height:14,border:'2px solid rgba(255,255,255,.3)',borderTopColor:'#fff',borderRadius:'50%',display:'inline-block' }} /> Déploiement...</>
                    : <><i className="bi bi-cloud-upload" /> Déployer DKIM sur Cloudflare</>}
                </button>
                <button className="btn btn-outline" onClick={() => setDkimModal(null)}>Annuler</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
