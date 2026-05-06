'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

type Zone = { id: string; name: string; status: string };
type RoutingZone = { zone: Zone; routing: any; rules: any[] };

export default function EmailRouting() {
  const [summary, setSummary]         = useState<any>(null);
  const [zones, setZones]             = useState<RoutingZone[]>([]);
  const [allZones, setAllZones]       = useState<Zone[]>([]);
  const [loadingAll, setLoadingAll]   = useState(false);
  const [expanded, setExpanded]       = useState<string | null>(null);
  const [zoneDetail, setZoneDetail]   = useState<Record<string, RoutingZone>>({});
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const [destination, setDestination] = useState('');
  const [bulking, setBulking]         = useState(false);
  const [wizard, setWizard]           = useState(false);
  const [newRule, setNewRule]         = useState<Record<string, any>>({});
  const [addingRule, setAddingRule]   = useState<string | null>(null);
  const { toast } = useToast();

  const loadSummary = async () => {
    setLoading(true);
    const r = await api.get('/cloudflare/email-routing/summary');
    if (r.ok) { setSummary(r.data); setZones(r.data.data || []); }
    setLoading(false);
  };

  const loadAllZones = async () => {
    setLoadingAll(true);
    const r = await api.get('/cloudflare/zones');
    if (r.ok) setAllZones(r.data.result || []);
    setLoadingAll(false);
  };

  useEffect(() => { loadSummary(); }, []);

  const loadZoneDetail = async (zoneId: string) => {
    if (zoneDetail[zoneId]) { setExpanded(expanded === zoneId ? null : zoneId); return; }
    const r = await api.get(`/cloudflare/email-routing/${zoneId}`);
    if (r.ok) { setZoneDetail(p => ({ ...p, [zoneId]: r.data })); setExpanded(zoneId); }
  };

  const toggleRouting = async (zoneId: string, enable: boolean) => {
    const r = await api.post(`/cloudflare/email-routing/${zoneId}/${enable ? 'enable' : 'disable'}`);
    toast(r.ok ? `Routing ${enable ? 'activé' : 'désactivé'}` : r.data?.error || 'Erreur', r.ok ? 'success' : 'error');
    if (r.ok) { setZoneDetail(p => { const c = { ...p }; if (c[zoneId]) c[zoneId] = { ...c[zoneId], routing: { ...c[zoneId].routing, enabled: enable } }; return c; }); loadSummary(); }
  };

  const deleteRule = async (zoneId: string, ruleId: string) => {
    if (!confirm('Supprimer cette règle ?')) return;
    const r = await api.delete(`/cloudflare/email-routing/${zoneId}/rules/${ruleId}`);
    toast(r.ok ? 'Règle supprimée' : r.data?.error || 'Erreur', r.ok ? 'success' : 'error');
    if (r.ok) {
      setZoneDetail(p => {
        const c = { ...p };
        if (c[zoneId]) c[zoneId] = { ...c[zoneId], rules: c[zoneId].rules.filter((r: any) => r.id !== ruleId) };
        return c;
      });
    }
  };

  const addRule = async (zoneId: string) => {
    setAddingRule(zoneId);
    const rule = newRule[zoneId] || {};
    const isCatchAll = rule.type === 'catchall';
    const body = {
      name: rule.name || (isCatchAll ? 'Catch-all' : `Rule for ${zoneId}`),
      priority: 0, enabled: true,
      matchers: isCatchAll ? [{ type: 'all' }] : [{ type: 'literal', field: 'to', value: rule.matcher }],
      actions: [{ type: 'forward', value: rule.destination }],
    };
    const r = await api.post(`/cloudflare/email-routing/${zoneId}/rules`, body);
    if (r.ok) {
      toast('Règle créée', 'success');
      setZoneDetail(p => { const c = { ...p }; if (c[zoneId]) c[zoneId] = { ...c[zoneId], rules: [...c[zoneId].rules, r.data.result] }; return c; });
      setNewRule(p => { const c = { ...p }; delete c[zoneId]; return c; });
    } else toast(r.data?.error || 'Erreur', 'error');
    setAddingRule(null);
  };

  const bulkEnable = async () => {
    if (!destination) return toast('Entrez un email de destination', 'warning');
    if (!selected.size) return toast('Sélectionnez au moins une zone', 'warning');
    setBulking(true);
    const r = await api.post('/cloudflare/email-routing/bulk-enable', {
      zone_ids: [...selected], catch_all_to: destination,
    });
    if (r.ok) {
      toast(`✓ Routing activé sur ${r.data.enabled || selected.size} zones avec catch-all → ${destination}`, 'success');
      setWizard(false); setSelected(new Set()); loadSummary();
    } else toast(r.data?.error || 'Erreur', 'error');
    setBulking(false);
  };

  const filteredZones = zones.filter(z => !search || z.zone?.name?.includes(search.toLowerCase()));
  const activeCount = zones.filter(z => z.routing?.enabled).length;

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1><i className="bi bi-envelope-at" style={{ color: 'var(--cf-orange)' }} /> Email Routing</h1>
            <p>Centralisez tous vos emails entrants dans une seule boîte — {activeCount} zones actives</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline" onClick={loadSummary}><i className="bi bi-arrow-repeat" /></button>
            <button className="btn btn-primary" onClick={() => { setWizard(true); loadAllZones(); }}>
              <i className="bi bi-lightning-fill" /> Activation en masse
            </button>
          </div>
        </div>
      </div>

      {/* How it works */}
      <div className="card mb-4" style={{ border: '1px solid rgba(14,165,233,.2)', background: 'rgba(14,165,233,.04)' }}>
        <div className="card-body" style={{ padding: '14px 20px', display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          <i className="bi bi-info-circle" style={{ color: '#0ea5e9', fontSize: '1.2rem', marginTop: 2, flexShrink: 0 }} />
          <div style={{ fontSize: '.8rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <strong style={{ color: '#0ea5e9' }}>Comment ça marche :</strong> Cloudflare Email Routing transfère tous les emails reçus sur vos domaines vers une adresse centrale (ex: votre Gmail). Activez le <strong>catch-all</strong> pour capturer <em>tous</em> les emails (contact@, info@, reply@, etc.) et les centraliser en un seul endroit. Idéal pour gérer les réponses à vos campagnes email.
          </div>
        </div>
      </div>

      {/* Bulk activation wizard */}
      {wizard && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div className="card" style={{ width: '100%', maxWidth: 680, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', flexShrink: 0 }}>
              <h3 style={{ margin: 0 }}><i className="bi bi-lightning-fill" style={{ color: '#f59e0b' }} /> Activation Email Routing en masse</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setWizard(false)}>✕</button>
            </div>
            <div className="card-body" style={{ overflow: 'auto', flex: 1 }}>

              {/* Step 1: destination */}
              <div style={{ marginBottom: 20 }}>
                <label className="form-label" style={{ fontWeight: 700, fontSize: '.9rem' }}>
                  1. Email de destination (catch-all)
                </label>
                <input className="form-control" placeholder="votre@gmail.com" value={destination}
                  onChange={e => setDestination(e.target.value)} style={{ maxWidth: 360 }} />
                <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 5 }}>
                  Tous les emails reçus sur les domaines sélectionnés seront transférés ici.
                </p>
              </div>

              {/* Step 2: select zones */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <label className="form-label" style={{ fontWeight: 700, fontSize: '.9rem', margin: 0 }}>
                    2. Sélectionner les zones ({selected.size} / {allZones.length})
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set(allZones.map(z => z.id)))}>Tout</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Aucun</button>
                  </div>
                </div>
                {loadingAll ? (
                  <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>Chargement des zones...</div>
                ) : (
                  <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {allZones.map(z => {
                      const sel = selected.has(z.id);
                      return (
                        <div key={z.id} onClick={() => setSelected(p => { const n = new Set(p); n.has(z.id) ? n.delete(z.id) : n.add(z.id); return n; })}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                            background: sel ? 'rgba(99,102,241,.12)' : 'var(--bg)', border: `1px solid ${sel ? 'rgba(99,102,241,.35)' : 'var(--border)'}`,
                            transition: 'all .12s' }}>
                          <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${sel ? '#6366f1' : 'var(--border)'}`,
                            background: sel ? '#6366f1' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {sel && <i className="bi bi-check" style={{ fontSize: '.65rem', color: '#fff' }} />}
                          </div>
                          <span style={{ fontFamily: 'monospace', fontSize: '.83rem', color: sel ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{z.name}</span>
                          <span style={{ marginLeft: 'auto', fontSize: '.68rem', color: z.status === 'active' ? '#34d399' : '#94a3b8' }}>● {z.status}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Footer actions */}
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, flexShrink: 0 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={bulkEnable} disabled={bulking || !destination || !selected.size}>
                {bulking
                  ? <><span className="spin" style={{ width:14,height:14,border:'2px solid rgba(255,255,255,.3)',borderTopColor:'#fff',borderRadius:'50%',display:'inline-block' }} /> Activation...</>
                  : <><i className="bi bi-check-circle" /> Activer routing + catch-all sur {selected.size} zones</>}
              </button>
              <button className="btn btn-outline" onClick={() => setWizard(false)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* Stats + search */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
        <input className="form-control" placeholder="🔍 Rechercher une zone..." value={search}
          onChange={e => setSearch(e.target.value)} style={{ maxWidth: 260, fontSize: '.82rem' }} />
        {summary && (
          <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
            <span style={{ fontSize: '.78rem', color: '#34d399' }}><i className="bi bi-check-circle" /> {activeCount} actifs</span>
            <span style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{zones.length} zones chargées</span>
          </div>
        )}
      </div>

      {/* Zones list */}
      {loading ? (
        <div>{[...Array(5)].map((_, i) => <div key={i} className="skeleton mb-2" style={{ height: 56 }} />)}</div>
      ) : filteredZones.length === 0 ? (
        <div className="card"><div className="empty-state" style={{ padding: 48 }}>
          <span style={{ fontSize: '2rem' }}>✉</span>
          <h3>Aucune zone</h3>
          <p>Synchronisez vos domaines depuis la page Domaines & DNS</p>
        </div></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filteredZones.map(({ zone, routing, rules }) => {
            const detail = zoneDetail[zone?.id];
            const isExpanded = expanded === zone?.id;
            const enabled = detail?.routing?.enabled ?? routing?.enabled;
            const ruleList = detail?.rules ?? rules ?? [];

            return (
              <div key={zone?.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {/* Zone header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', cursor: 'pointer' }}
                  onClick={() => zone?.id && loadZoneDetail(zone.id)}>
                  <i className={`bi bi-chevron-${isExpanded ? 'down' : 'right'}`} style={{ color: 'var(--text-muted)', fontSize: '.75rem' }} />

                  <span style={{ fontFamily: 'monospace', fontSize: '.88rem', fontWeight: 600, color: 'var(--text-primary)', flex: 1 }}>{zone?.name}</span>

                  <span style={{ fontSize: '.72rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                    background: enabled ? 'rgba(16,185,129,.12)' : 'rgba(148,163,184,.1)',
                    color: enabled ? '#34d399' : '#94a3b8' }}>
                    {enabled ? '● Routing actif' : '○ Inactif'}
                  </span>

                  {ruleList.length > 0 && (
                    <span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{ruleList.length} règle(s)</span>
                  )}

                  <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                    <button className={`btn btn-sm ${enabled ? 'btn-outline' : 'btn-success'}`}
                      style={{ fontSize: '.7rem', padding: '4px 10px' }}
                      onClick={() => zone?.id && toggleRouting(zone.id, !enabled)}>
                      {enabled ? 'Désactiver' : 'Activer'}
                    </button>
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && detail && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '14px 18px', background: 'rgba(0,0,0,.15)' }}>
                    {/* Rules */}
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: '.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)', marginBottom: 8 }}>
                        Règles de routage
                      </div>
                      {ruleList.length === 0 ? (
                        <p style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Aucune règle — ajoutez un catch-all pour recevoir tous les emails</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {ruleList.map((rule: any) => (
                            <div key={rule.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--bg-card)', borderRadius: 8, border: '1px solid var(--border)', fontSize: '.8rem' }}>
                              <span style={{ color: rule.enabled ? '#34d399' : '#94a3b8', flexShrink: 0 }}>{rule.enabled ? '●' : '○'}</span>
                              <span style={{ color: 'var(--text-muted)', minWidth: 80 }}>{rule.matchers?.[0]?.type === 'all' ? 'Catch-all' : rule.matchers?.[0]?.value || 'Règle'}</span>
                              <i className="bi bi-arrow-right" style={{ color: 'var(--text-muted)', fontSize: '.7rem' }} />
                              <span style={{ color: '#0ea5e9', fontFamily: 'monospace' }}>{rule.actions?.[0]?.value}</span>
                              <button className="btn btn-sm btn-danger" style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: '.68rem' }}
                                onClick={() => deleteRule(zone.id, rule.id)}>
                                <i className="bi bi-trash" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Add rule form */}
                    <div style={{ background: 'rgba(99,102,241,.05)', borderRadius: 8, padding: 12, border: '1px solid rgba(99,102,241,.15)' }}>
                      <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#818cf8', marginBottom: 10 }}>+ Ajouter une règle</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <select className="form-control" style={{ width: 150, fontSize: '.8rem', padding: '6px 10px' }}
                          value={newRule[zone.id]?.type || 'catchall'}
                          onChange={e => setNewRule(p => ({ ...p, [zone.id]: { ...p[zone.id], type: e.target.value } }))}>
                          <option value="catchall">Catch-all (tout)</option>
                          <option value="specific">Adresse spécifique</option>
                        </select>
                        {newRule[zone.id]?.type === 'specific' && (
                          <input className="form-control" placeholder={`contact@${zone.name}`} style={{ width: 220, fontSize: '.8rem', padding: '6px 10px' }}
                            value={newRule[zone.id]?.matcher || ''}
                            onChange={e => setNewRule(p => ({ ...p, [zone.id]: { ...p[zone.id], matcher: e.target.value } }))} />
                        )}
                        <i className="bi bi-arrow-right" style={{ color: 'var(--text-muted)', alignSelf: 'center' }} />
                        <input className="form-control" placeholder="destination@email.com" style={{ width: 220, fontSize: '.8rem', padding: '6px 10px' }}
                          value={newRule[zone.id]?.destination || ''}
                          onChange={e => setNewRule(p => ({ ...p, [zone.id]: { ...p[zone.id], destination: e.target.value } }))} />
                        <button className="btn btn-primary btn-sm" onClick={() => addRule(zone.id)}
                          disabled={addingRule === zone.id || !newRule[zone.id]?.destination}>
                          {addingRule === zone.id ? '...' : 'Créer'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
