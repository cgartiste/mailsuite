'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';

const PERIODS = [
  { label: '24h', value: '24h' },
  { label: '7 jours', value: '7d' },
  { label: '30 jours', value: '30d' },
];

function fmt(n: number) {
  if (!n) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}
function fmtBytes(b: number) {
  if (!b) return '0 B';
  if (b >= 1e9) return (b / 1e9).toFixed(2) + ' GB';
  if (b >= 1e6) return (b / 1e6).toFixed(1) + ' MB';
  if (b >= 1e3) return (b / 1e3).toFixed(0) + ' KB';
  return b + ' B';
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ height: 5, background: 'var(--bg-hover)', borderRadius: 3, marginTop: 4 }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width .5s' }} />
    </div>
  );
}

export default function CfZoneAnalytics() {
  const { zid } = useParams<{ zid: string }>();
  const [data, setData]       = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [period, setPeriod]   = useState('7d');

  const load = async () => {
    setLoading(true); setError('');
    const r = await api.get(`/cloudflare/zones/${zid}/analytics?period=${period}`);
    if (r.ok && r.data.success) {
      setData(r.data);
    } else {
      setError(r.data?.error || 'Erreur chargement analytics');
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [period]);

  const t = data?.totals || {};
  const statusMap: Record<string, number> = data?.statusMap || {};
  const countryMap: Record<string, any>   = data?.countryMap || {};
  const timeseries: any[] = data?.timeseries || [];

  const cacheRatio = t.requests > 0 ? Math.round((t.cachedRequests / t.requests) * 100) : 0;
  const bandwidth  = t.bytes || 0;
  const bandwidthCached = t.cachedBytes || 0;

  // Status groups
  const s2xx = Object.entries(statusMap).filter(([k]) => k.startsWith('2')).reduce((s, [, v]) => s + v, 0);
  const s3xx = Object.entries(statusMap).filter(([k]) => k.startsWith('3')).reduce((s, [, v]) => s + v, 0);
  const s4xx = Object.entries(statusMap).filter(([k]) => k.startsWith('4')).reduce((s, [, v]) => s + v, 0);
  const s5xx = Object.entries(statusMap).filter(([k]) => k.startsWith('5')).reduce((s, [, v]) => s + v, 0);

  // Top countries
  const topCountries = Object.entries(countryMap)
    .sort(([, a], [, b]) => b.requests - a.requests)
    .slice(0, 8);

  // Timeseries max
  const maxReq = Math.max(...timeseries.map(g => g.requests), 1);

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Link href="/cloudflare" className="btn btn-ghost btn-sm" style={{ padding: '4px 10px', fontSize: '.78rem' }}>← Zones</Link>
              <h1>📊 Analytics</h1>
            </div>
            <p style={{ fontFamily: 'monospace', fontSize: '.75rem', color: 'var(--text-muted)' }}>{zid}</p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ display: 'flex', gap: 4, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 4 }}>
              {PERIODS.map(p => (
                <button key={p.value} onClick={() => setPeriod(p.value)} style={{
                  padding: '6px 14px', borderRadius: 9, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '.8rem', transition: 'all .15s',
                  background: period === p.value ? 'rgba(246,130,31,0.2)' : 'transparent',
                  color: period === p.value ? '#f6821f' : 'var(--text-muted)',
                }}>{p.label}</button>
              ))}
            </div>
            <button className="btn btn-outline btn-sm" onClick={load}>🔄</button>
          </div>
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: 80 }}>
          <div style={{ width: 36, height: 36, border: '3px solid rgba(246,130,31,.2)', borderTopColor: '#f6821f', borderRadius: '50%', display: 'inline-block', animation: 'spin 1s linear infinite' }} />
          <p style={{ marginTop: 16, color: 'var(--text-muted)' }}>Chargement via GraphQL...</p>
        </div>
      )}

      {error && !loading && (
        <div className="card" style={{ borderColor: 'rgba(251,113,133,.4)', background: 'rgba(251,113,133,.05)' }}>
          <div className="card-body" style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ fontSize: '2rem', marginBottom: 12 }}>⚠️</div>
            <div style={{ color: '#fb7185', fontWeight: 700, marginBottom: 8 }}>Erreur Analytics</div>
            <div style={{ color: 'var(--text-muted)', fontSize: '.82rem' }}>{error}</div>
          </div>
        </div>
      )}

      {!loading && data && (
        <>
          {/* Main KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Requêtes', value: fmt(t.requests || 0), sub: `Cache: ${fmt(t.cachedRequests || 0)}`, icon: '🌐', color: '#f6821f' },
              { label: 'Bande passante', value: fmtBytes(bandwidth), sub: `Cache: ${fmtBytes(bandwidthCached)}`, icon: '📶', color: '#6366f1' },
              { label: 'Visiteurs uniques', value: fmt(t.uniques || 0), sub: `Pages vues: ${fmt(t.pageViews || 0)}`, icon: '👥', color: '#34d399' },
              { label: 'Menaces', value: fmt(t.threats || 0), sub: t.threats > 0 ? '⚠ Bloquées par CF' : '✓ Aucune menace', icon: '🛡', color: t.threats > 0 ? '#fb7185' : '#34d399' },
            ].map(s => (
              <div key={s.label} className="card" style={{ padding: '18px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: '1.6rem' }}>{s.icon}</span>
                  <div>
                    <div style={{ fontSize: '1.45rem', fontWeight: 900, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>{s.label}</div>
                    <div style={{ fontSize: '.66rem', color: 'var(--text-secondary)', marginTop: 2 }}>{s.sub}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Cache ratio */}
          <div className="card mb-4">
            <div className="card-header">⚡ Taux de cache Cloudflare</div>
            <div className="card-body">
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                <div style={{ fontSize: '2.5rem', fontWeight: 900, color: cacheRatio >= 70 ? '#34d399' : cacheRatio >= 40 ? '#f59e0b' : '#fb7185' }}>
                  {cacheRatio}%
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ height: 14, background: 'var(--bg-hover)', borderRadius: 7, overflow: 'hidden' }}>
                    <div style={{ width: `${cacheRatio}%`, height: '100%', background: cacheRatio >= 70 ? '#34d399' : cacheRatio >= 40 ? '#f59e0b' : '#fb7185', borderRadius: 7, transition: 'width .8s' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: '.7rem', color: 'var(--text-muted)' }}>
                    <span>Requêtes cachées: {fmt(t.cachedRequests || 0)}</span>
                    <span>Non-cachées: {fmt((t.requests || 0) - (t.cachedRequests || 0))}</span>
                  </div>
                </div>
                <div style={{ fontSize: '.72rem', color: cacheRatio >= 70 ? '#34d399' : '#f59e0b', fontWeight: 600, textAlign: 'right' }}>
                  {cacheRatio >= 70 ? '✓ Excellent' : cacheRatio >= 40 ? '~ Correct' : '↓ Faible'}
                </div>
              </div>
            </div>
          </div>

          <div className="grid-2 mb-4">
            {/* HTTP Codes */}
            <div className="card">
              <div className="card-header">📋 Codes HTTP</div>
              <div className="card-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                  {[
                    { label: '2xx Succès',   value: s2xx, color: '#34d399' },
                    { label: '3xx Redirect', value: s3xx, color: '#f59e0b' },
                    { label: '4xx Client',   value: s4xx, color: '#fb7185' },
                    { label: '5xx Serveur',  value: s5xx, color: '#f43f5e' },
                  ].map(s => (
                    <div key={s.label} style={{ background: `${s.color}11`, border: `1px solid ${s.color}33`, borderRadius: 10, padding: '12px 14px' }}>
                      <div style={{ fontSize: '1.3rem', fontWeight: 900, color: s.color }}>{fmt(s.value)}</div>
                      <div style={{ fontSize: '.68rem', color: s.color, fontWeight: 600 }}>{s.label}</div>
                    </div>
                  ))}
                </div>
                {Object.keys(statusMap).length > 0 && (
                  <>
                    <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>DÉTAIL</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {Object.entries(statusMap).sort().map(([code, count]) => (
                        <span key={code} style={{ padding: '3px 8px', borderRadius: 6, fontSize: '.7rem', fontWeight: 700, background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>
                          {code}: {fmt(count)}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Top Countries */}
            <div className="card">
              <div className="card-header">🌍 Top pays</div>
              <div className="card-body">
                {topCountries.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>Aucune donnée pays disponible</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {topCountries.map(([country, info]) => (
                      <div key={country}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.78rem', marginBottom: 2 }}>
                          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{country || 'Inconnu'}</span>
                          <span style={{ color: 'var(--text-muted)' }}>{fmt(info.requests)} req{info.threats > 0 ? ` · 🛡 ${info.threats}` : ''}</span>
                        </div>
                        <MiniBar value={info.requests} max={topCountries[0][1].requests} color="#6366f1" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Timeseries */}
          {timeseries.length > 0 && (
            <div className="card mb-4">
              <div className="card-header">📈 Trafic — évolution</div>
              <div className="card-body">
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80 }}>
                  {timeseries.map((g, i) => {
                    const h = maxReq > 0 ? Math.max(4, Math.round((g.requests / maxReq) * 80)) : 4;
                    const cPct = g.requests > 0 ? Math.round(g.cachedRequests / g.requests * 100) : 0;
                    return (
                      <div key={i} title={`${g.date || ''}: ${fmt(g.requests)} req (${cPct}% cache)`}
                        style={{ flex: 1, minWidth: 4, height: h, borderRadius: '3px 3px 0 0', cursor: 'pointer', transition: 'opacity .2s',
                          background: `linear-gradient(to top, #6366f1, #f6821f)` }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                      />
                    );
                  })}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: '.65rem', color: 'var(--text-muted)' }}>
                  <span>{timeseries[0]?.date}</span>
                  <span>{timeseries[Math.floor(timeseries.length / 2)]?.date}</span>
                  <span>{timeseries[timeseries.length - 1]?.date}</span>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <Link href={`/cloudflare/zones/${zid}/dns`} className="btn btn-outline">📋 Gérer DNS</Link>
            <Link href={`/cloudflare/zones/${zid}/settings`} className="btn btn-outline">⚙ Paramètres</Link>
            <Link href="/cloudflare" className="btn btn-ghost">← Retour zones</Link>
          </div>
        </>
      )}
    </div>
  );
}
