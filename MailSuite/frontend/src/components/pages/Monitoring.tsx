'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

const ACTION_COLOR: Record<string, string> = { success: '#34d399', error: '#fb7185', warning: '#f59e0b' };

function ServiceCard({ icon, label, value, sub, color, href }: any) {
  const content = (
    <div style={{ background: 'var(--bg-card)', border: `1px solid ${color}33`, borderRadius: 14, padding: '18px 20px',
      display: 'flex', alignItems: 'center', gap: 14, transition: 'all .15s', cursor: href ? 'pointer' : 'default' }}
      onMouseEnter={e => href && (e.currentTarget.style.transform = 'translateY(-2px)', e.currentTarget.style.borderColor = color + '66')}
      onMouseLeave={e => href && (e.currentTarget.style.transform = '', e.currentTarget.style.borderColor = color + '33')}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', color, flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: '1.5rem', fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', marginTop: 3 }}>{sub}</div>}
      </div>
    </div>
  );
  return href ? <a href={href} style={{ textDecoration: 'none' }}>{content}</a> : content;
}

function ProgressBar({ value, max, color = '#6366f1' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>
        <span>{value} / {max}</span><span>{pct}%</span>
      </div>
      <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width .4s' }} />
      </div>
    </div>
  );
}

export default function Monitoring() {
  const [data, setData]     = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<number | null>(null);
  const { toast } = useToast();

  const load = async () => {
    const r = await api.get('/monitoring/system');
    if (r.ok) setData(r.data);
    setLoading(false);
  };

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);

  const resolve = async (id: number) => {
    setResolving(id);
    await api.patch(`/monitoring/incidents/${id}/resolve`);
    toast('Incident résolu', 'success');
    load();
    setResolving(null);
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div className="spin" style={{ width: 32, height: 32, border: '3px solid rgba(99,102,241,.3)', borderTopColor: '#6366f1', borderRadius: '50%' }} />
    </div>
  );

  const { gw, ms, cf, domains, ops, incidents, attention, recent_users } = data || {};
  const gwActive = gw?.active;
  const msActive = ms?.active;
  const cfZones  = cf?.zone_count || 0;
  const domainSrcMap = (domains?.sources || []).reduce((a: any, s: any) => { a[s.source] = s.count; return a; }, {});

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1><i className="bi bi-activity" style={{ color: '#34d399' }} /> Monitoring</h1>
            <p>État du système en temps réel — refresh 30s</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {incidents?.length > 0 && (
              <span style={{ background: 'rgba(244,63,94,.15)', color: '#fb7185', padding: '4px 12px', borderRadius: 20, fontSize: '.78rem', fontWeight: 700 }}>
                <i className="bi bi-exclamation-triangle" /> {incidents.length} incident(s)
              </span>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399', animation: 'pulse 2s infinite' }} />
              <span style={{ fontSize: '.75rem', color: '#34d399' }}>Live</span>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={load}><i className="bi bi-arrow-repeat" /></button>
          </div>
        </div>
      </div>

      {/* ── Services status ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
        <ServiceCard icon="⊡" label="Google Workspace" color="#4285F4" href="/accounts-g"
          value={gwActive?.domain || 'Non configuré'}
          sub={gwActive ? `${gwActive.total_users || 0} users · ${gw.accounts.length} compte(s)` : 'Connectez un compte GW'} />
        <ServiceCard icon="⊞" label="Microsoft 365" color="#00a4ef" href="/microsoft"
          value={msActive?.name || 'Non configuré'}
          sub={msActive ? `${msActive.total_users || 0} users · ${ms.accounts.length} compte(s)` : 'Connectez un tenant MS365'} />
        <ServiceCard icon="☁" label="Cloudflare" color="#f6821f" href="/cloudflare"
          value={`${cfZones} zones`}
          sub={`${cf?.accounts?.length || 0} compte(s) CF connecté(s)`} />
        <ServiceCard icon="🌐" label="Domaines" color="#8b5cf6" href="/domains"
          value={domains?.total || 0}
          sub={`☁ ${domainSrcMap.cloudflare||0} · ⊡ ${domainSrcMap.google||0} · ⊞ ${domainSrcMap.microsoft||0}`} />
      </div>

      {/* ── DNS Health + Ops ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>

        {/* DNS Health */}
        <div className="card">
          <div className="card-header"><i className="bi bi-shield-check" style={{ color: '#34d399' }} /> Santé DNS des domaines</div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>SPF configuré</div>
              <ProgressBar value={domains?.spf_ok || 0} max={domains?.total || 1} color="#34d399" />
            </div>
            <div>
              <div style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>DMARC configuré</div>
              <ProgressBar value={domains?.dmarc_ok || 0} max={domains?.total || 1} color="#0ea5e9" />
            </div>
            <div>
              <div style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>DKIM configuré</div>
              <ProgressBar value={domains?.dkim_ok || 0} max={domains?.total || 1} color="#f59e0b" />
            </div>
            <div>
              <div style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Entièrement configurés</div>
              <ProgressBar value={domains?.fully_configured || 0} max={domains?.total || 1} color="#8b5cf6" />
            </div>
            <a href="/cloudflare/email-auth" className="btn btn-outline btn-sm" style={{ textAlign: 'center', marginTop: 4 }}>
              <i className="bi bi-arrow-right-circle" /> Déployer SPF/DMARC manquants
            </a>
          </div>
        </div>

        {/* Operations 24h */}
        <div className="card">
          <div className="card-header"><i className="bi bi-clock-history" style={{ color: '#818cf8' }} /> Opérations dernières 24h</div>
          <div className="card-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 16 }}>
              {[
                { v: ops?.total || 0,   l: 'Total',    c: '#94a3b8' },
                { v: ops?.success || 0, l: 'Succès',   c: '#34d399' },
                { v: ops?.errors || 0,  l: 'Erreurs',  c: ops?.errors > 0 ? '#fb7185' : '#94a3b8' },
              ].map(s => (
                <div key={s.l} style={{ textAlign: 'center', padding: '10px 6px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: s.c }}>{s.v}</div>
                  <div style={{ fontSize: '.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>{s.l}</div>
                </div>
              ))}
            </div>
            <div style={{ maxHeight: 200, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(ops?.recent || []).slice(0, 20).map((op: any, i: number) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: ACTION_COLOR[op.status] || '#94a3b8', flexShrink: 0 }} />
                  <span style={{ fontSize: '.72rem', color: 'var(--text-secondary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{op.action}</span>
                  <span style={{ fontSize: '.65rem', color: 'var(--text-muted)', flexShrink: 0 }}>{op.agent_name}</span>
                  <span style={{ fontSize: '.62rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                    {op.created_at ? new Date(op.created_at).toLocaleTimeString('fr', { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
              ))}
              {!ops?.recent?.length && <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>Aucune opération récente</p>}
            </div>
          </div>
        </div>
      </div>

      {/* ── Incidents + Attention ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>

        {/* Incidents */}
        <div className="card">
          <div className="card-header">
            <i className="bi bi-exclamation-triangle" style={{ color: '#fb7185' }} /> Incidents ouverts
            {incidents?.length > 0 && <span className="badge badge-danger" style={{ marginLeft: 8 }}>{incidents.length}</span>}
          </div>
          {incidents?.length > 0 ? (
            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
              {incidents.map((inc: any) => (
                <div key={inc.id} style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span className={`badge badge-${inc.severity === 'critical' ? 'danger' : 'warning'}`} style={{ flexShrink: 0 }}>{inc.severity}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '.83rem', color: 'var(--text-primary)' }}>{inc.title}</div>
                    {inc.domain_name && <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', marginTop: 2 }}>{inc.domain_name}</div>}
                  </div>
                  <button className="btn btn-sm btn-success" style={{ padding: '3px 10px', fontSize: '.72rem' }}
                    disabled={resolving === inc.id} onClick={() => resolve(inc.id)}>
                    {resolving === inc.id ? '...' : 'Résoudre'}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: 40 }}>
              <span style={{ fontSize: '2rem' }}>✓</span>
              <p style={{ color: '#34d399', fontWeight: 600 }}>Aucun incident — système sain</p>
            </div>
          )}
        </div>

        {/* Domains needing attention */}
        <div className="card">
          <div className="card-header"><i className="bi bi-shield-exclamation" style={{ color: '#f59e0b' }} /> Domaines CF sans SPF/DMARC</div>
          {attention?.length > 0 ? (
            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
              {attention.map((d: any) => (
                <div key={d.domain} style={{ padding: '9px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '.8rem', color: 'var(--text-primary)', flex: 1 }}>{d.domain}</span>
                  <span style={{ fontSize: '.68rem', padding: '2px 6px', borderRadius: 4, background: d.spf_status === 'valid' ? 'rgba(16,185,129,.15)' : 'rgba(244,63,94,.12)', color: d.spf_status === 'valid' ? '#34d399' : '#fb7185' }}>SPF</span>
                  <span style={{ fontSize: '.68rem', padding: '2px 6px', borderRadius: 4, background: d.dmarc_status === 'valid' ? 'rgba(16,185,129,.15)' : 'rgba(244,63,94,.12)', color: d.dmarc_status === 'valid' ? '#34d399' : '#fb7185' }}>DMARC</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: 40 }}>
              <span style={{ fontSize: '2rem' }}>✓</span>
              <p style={{ color: '#34d399', fontWeight: 600 }}>Tous les domaines CF ont SPF et DMARC</p>
            </div>
          )}
          {attention?.length > 0 && (
            <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)' }}>
              <a href="/cloudflare/email-auth" className="btn btn-primary btn-sm" style={{ width: '100%', textAlign: 'center' }}>
                <i className="bi bi-rocket-takeoff" /> Déployer en masse sur Email Auth
              </a>
            </div>
          )}
        </div>
      </div>

      {/* ── GW Accounts detail ── */}
      {gw?.accounts?.length > 0 && (
        <div className="card mb-4">
          <div className="card-header"><i className="bi bi-google" style={{ color: '#4285F4' }} /> Comptes Google Workspace</div>
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Compte</th><th>Domaine</th><th>Users</th><th>Status</th></tr></thead>
              <tbody>
                {gw.accounts.map((a: any) => (
                  <tr key={a.id}>
                    <td><strong style={{ color: 'var(--text-primary)' }}>{a.name}</strong><br /><span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{a.admin_email}</span></td>
                    <td><span style={{ fontFamily: 'monospace', fontSize: '.82rem' }}>{a.domain}</span></td>
                    <td><span className="badge badge-gray">{a.total_users || 0}</span></td>
                    <td><span className={`badge badge-${a.is_active ? 'success' : 'gray'}`}>{a.is_active ? '● Actif' : 'Inactif'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
