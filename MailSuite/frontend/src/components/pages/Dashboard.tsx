'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import Link from 'next/link';

interface Stats {
  total_domains: number; active_domains: number;
  total_accounts: number; active_accounts: number;
  cf_accounts_count: number; cf_zone_count: number;
  ms_accounts_count: number; ms_active_users: number;
  total_campaigns: number; running_campaigns: number;
  total_contacts: number; open_incidents: number;
  total_sent: number; gw_created_users: number;
  gw_accounts_count: number; gw_active_users: number; gw_total_users: number;
}

function StatCard({ value, label, icon, color }: { value: number | string; label: string; icon: string; color: string }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${color}`}><i className={`bi ${icon}`} /></div>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}

function DnsPill({ status, label }: { status: string; label: string }) {
  const cls = status === 'valid' ? 'dns-pill-valid' : status === 'missing' ? 'dns-pill-missing' : 'dns-pill-invalid';
  return <span className={`dns-pill ${cls}`}>{label}</span>;
}

function ProviderBadge({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 10px', borderRadius: 8,
      background: `color-mix(in srgb, ${color} 12%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
      color, fontSize: '.72rem', fontWeight: 700
    }}>
      <span style={{ fontWeight: 900 }}>{count}</span> {label}
    </span>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/dashboard').then(r => { if (r.ok) setData(r.data); setLoading(false); });
  }, []);

  if (loading) return (
    <div>
      <div className="page-header"><h1>Dashboard</h1></div>
      <div className="grid-4" style={{ marginBottom: 24 }}>
        {[...Array(4)].map((_, i) => <div key={i} className="skeleton" style={{ height: 88 }} />)}
      </div>
    </div>
  );

  const s: Stats = data?.stats || {};
  const domains = data?.domains || [];
  const incidents = data?.incidents || [];

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Dashboard</h1>
            <p>Vue d'ensemble de votre infrastructure email</p>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid-4 mb-6">
        <StatCard value={s.total_domains} label="Domaines" icon="bi-globe" color="indigo" />
        <StatCard value={s.gw_total_users || 0} label="Comptes GW" icon="bi-person-workspace" color="sky" />
        <StatCard value={s.total_sent?.toLocaleString()} label="Emails envoyés" icon="bi-send" color="emerald" />
        <StatCard value={s.open_incidents} label="Incidents ouverts" icon="bi-exclamation-triangle" color="rose" />
      </div>

      {/* Provider cards */}
      <div className="grid-3 mb-6">

        {/* ── Google Workspace ── */}
        <Link href="/accounts-g" className="provider-card provider-card-google" style={{ display: 'block', textDecoration: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <div className="stat-icon google" style={{ width: 52, height: 52, borderRadius: 14, fontSize: '1.4rem' }}>
              <i className="bi bi-google" />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '.98rem', color: 'var(--text-primary)' }}>Google Workspace</div>
              <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                {s.gw_accounts_count || 0} compte(s) connecté(s)
              </div>
            </div>
          </div>

          {/* Mini stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
            <div style={{ background: 'rgba(52,168,83,0.08)', borderRadius: 8, padding: '8px 12px', textAlign: 'center', border: '1px solid rgba(52,168,83,0.15)' }}>
              <div style={{ fontWeight: 900, fontSize: '1.2rem', color: '#34A853', lineHeight: 1 }}>{s.gw_active_users || 0}</div>
              <div style={{ fontSize: '.6rem', color: '#34A853', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 2 }}>Actifs</div>
            </div>
            <div style={{ background: 'rgba(251,188,4,0.08)', borderRadius: 8, padding: '8px 12px', textAlign: 'center', border: '1px solid rgba(251,188,4,0.15)' }}>
              <div style={{ fontWeight: 900, fontSize: '1.2rem', color: '#F59E0B', lineHeight: 1 }}>{(s.gw_total_users || 0) - (s.gw_active_users || 0)}</div>
              <div style={{ fontSize: '.6rem', color: '#F59E0B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 2 }}>Suspendus</div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8, background: 'rgba(66,133,244,0.1)', border: '1px solid rgba(66,133,244,0.2)', color: '#4285F4', fontSize: '.72rem', fontWeight: 700 }}>
              <i className="bi bi-people-fill" /> {s.gw_total_users || 0} total
            </span>
            <span style={{ color: 'var(--google-blue)', fontSize: '.8rem', fontWeight: 600 }}>Gérer →</span>
          </div>
        </Link>

        {/* ── Cloudflare ── */}
        <Link href="/cloudflare" className="provider-card provider-card-cf" style={{ display: 'block', textDecoration: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <div className="stat-icon cf" style={{ width: 52, height: 52, borderRadius: 14, fontSize: '1.4rem' }}>
              <i className="bi bi-cloud-lightning" />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '.98rem', color: 'var(--text-primary)' }}>Cloudflare</div>
              <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                {s.cf_accounts_count || 0} compte(s) · {s.cf_zone_count || 0} zone(s)
              </div>
            </div>
          </div>

          {/* Mini stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
            <div style={{ background: 'rgba(249,115,22,0.08)', borderRadius: 8, padding: '8px 12px', textAlign: 'center', border: '1px solid rgba(249,115,22,0.15)' }}>
              <div style={{ fontWeight: 900, fontSize: '1.2rem', color: '#F97316', lineHeight: 1 }}>{s.cf_accounts_count || 0}</div>
              <div style={{ fontSize: '.6rem', color: '#F97316', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 2 }}>Comptes</div>
            </div>
            <div style={{ background: 'rgba(249,115,22,0.08)', borderRadius: 8, padding: '8px 12px', textAlign: 'center', border: '1px solid rgba(249,115,22,0.15)' }}>
              <div style={{ fontWeight: 900, fontSize: '1.2rem', color: '#F97316', lineHeight: 1 }}>{s.cf_zone_count || 0}</div>
              <div style={{ fontSize: '.6rem', color: '#F97316', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 2 }}>Zones</div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8, background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)', color: '#F97316', fontSize: '.72rem', fontWeight: 700 }}>
              <i className="bi bi-shield-check" /> DNS Guardian
            </span>
            <span style={{ color: 'var(--cf-orange)', fontSize: '.8rem', fontWeight: 600 }}>Gérer →</span>
          </div>
        </Link>

        {/* ── Microsoft 365 ── */}
        <Link href="/microsoft" className="provider-card provider-card-ms" style={{ display: 'block', textDecoration: 'none' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <div className="stat-icon ms" style={{ width: 52, height: 52, borderRadius: 14, fontSize: '1.4rem' }}>
              <i className="bi bi-microsoft" />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: '.98rem', color: 'var(--text-primary)' }}>Microsoft 365</div>
              <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
                {s.ms_accounts_count || 0} compte(s) connecté(s)
              </div>
            </div>
          </div>

          {/* Mini stats */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
            <div style={{ background: 'rgba(0,120,212,0.08)', borderRadius: 8, padding: '8px 12px', textAlign: 'center', border: '1px solid rgba(0,120,212,0.15)' }}>
              <div style={{ fontWeight: 900, fontSize: '1.2rem', color: '#0078D4', lineHeight: 1 }}>{s.ms_accounts_count || 0}</div>
              <div style={{ fontSize: '.6rem', color: '#0078D4', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 2 }}>Tenants</div>
            </div>
            <div style={{ background: 'rgba(0,120,212,0.08)', borderRadius: 8, padding: '8px 12px', textAlign: 'center', border: '1px solid rgba(0,120,212,0.15)' }}>
              <div style={{ fontWeight: 900, fontSize: '1.2rem', color: '#0078D4', lineHeight: 1 }}>{s.ms_active_users || 0}</div>
              <div style={{ fontSize: '.6rem', color: '#0078D4', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 2 }}>Actifs</div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8, background: 'rgba(0,120,212,0.1)', border: '1px solid rgba(0,120,212,0.2)', color: '#0078D4', fontSize: '.72rem', fontWeight: 700 }}>
              <i className="bi bi-building" /> Azure AD
            </span>
            <span style={{ color: 'var(--ms-blue)', fontSize: '.8rem', fontWeight: 600 }}>Gérer →</span>
          </div>
        </Link>
      </div>

      {/* Bottom row */}
      <div className="grid-2">
        {/* Domains */}
        <div className="card">
          <div className="card-header">
            <i className="bi bi-globe" /> Domaines récents
            <Link href="/domains" className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }}>Voir tout →</Link>
          </div>
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Domaine</th><th>Status</th><th>DNS</th></tr></thead>
              <tbody>
                {domains.map((d: any) => (
                  <tr key={d.id}>
                    <td><Link href={`/domains/${d.id}`} style={{ color: '#818cf8', fontWeight: 600 }}>{d.domain}</Link></td>
                    <td><span className={`badge badge-${d.status === 'active' ? 'success' : d.status === 'paused' ? 'warning' : 'gray'}`}>{d.status}</span></td>
                    <td style={{ display: 'flex', gap: 4 }}>
                      <DnsPill status={d.spf_status} label="SPF" />
                      <DnsPill status={d.dkim_status} label="DKIM" />
                      <DnsPill status={d.dmarc_status} label="DMARC" />
                    </td>
                  </tr>
                ))}
                {!domains.length && <tr><td colSpan={3}><div className="empty-state" style={{ padding: '24px' }}><p>Aucun domaine</p></div></td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Incidents */}
        <div className="card">
          <div className="card-header">
            <i className="bi bi-exclamation-triangle" style={{ color: '#fb7185' }} /> Incidents actifs
            <Link href="/monitoring" className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }}>Monitoring →</Link>
          </div>
          {incidents.length > 0 ? incidents.map((i: any) => (
            <div key={i.id} style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className={`badge badge-${i.severity === 'critical' ? 'danger' : 'warning'}`}>{i.severity}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{i.title}</div>
                <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{i.domain_name}</div>
              </div>
            </div>
          )) : (
            <div className="empty-state">
              <span style={{ fontSize: '2rem' }}>✓</span>
              <p>Aucun incident actif</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
