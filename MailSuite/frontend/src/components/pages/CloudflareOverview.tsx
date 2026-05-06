'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

const STATUS_COLOR: Record<string, string> = {
  active: '#34d399', pending: '#f59e0b', paused: '#94a3b8', deactivated: '#fb7185',
};

export default function CloudflareOverview() {
  const [zonesByAccount, setZonesByAccount] = useState<Record<string, any[]>>({});
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [loadingAccount, setLoadingAccount] = useState<string|null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('all');
  const [showAdd, setShowAdd]   = useState(false);
  const [form, setForm]         = useState({ name: '', api_token: '', email: '' });
  const [adding, setAdding]     = useState(false);
  const [search, setSearch]     = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [purging, setPurging]   = useState<string | null>(null);
  const { toast } = useToast();

  const load = async (refresh = false) => {
    setLoading(true);
    const ar = await api.get('/cloudflare/accounts');
    const accts: any[] = ar.ok ? (ar.data.accounts || []) : [];
    setAccounts(accts);

    // Load zones for each account in parallel
    const entries = await Promise.all(
      accts.map(async (a: any) => {
        const r = await api.get(`/cloudflare/accounts/${a.id}/zones${refresh ? '?refresh=1' : ''}`);
        return [String(a.id), r.ok ? (r.data.result || []) : []];
      })
    );
    const map: Record<string, any[]> = {};
    entries.forEach(([id, zones]) => { map[id as string] = zones as any[]; });
    setZonesByAccount(map);
    setLoading(false);
  };

  const loadAccountZones = async (accountId: string, refresh = false) => {
    setLoadingAccount(accountId);
    const r = await api.get(`/cloudflare/accounts/${accountId}/zones${refresh ? '?refresh=1' : ''}`);
    if (r.ok) setZonesByAccount(prev => ({ ...prev, [accountId]: r.data.result || [] }));
    setLoadingAccount(null);
  };

  useEffect(() => { load(); }, []);

  // Compute current zone list based on selected account
  const allZones = Object.values(zonesByAccount).flat();
  const zones = selectedAccountId === 'all' ? allZones : (zonesByAccount[selectedAccountId] || []);

  const addAccount = async (e: React.FormEvent) => {
    e.preventDefault(); setAdding(true);
    const r = await api.post('/cloudflare/accounts', form);
    if (r.ok) { toast(`✓ Compte ajouté — ${r.data.zone_count} zones détectées`, 'success'); setShowAdd(false); setForm({ name: '', api_token: '', email: '' }); load(true); }
    else toast(r.data?.error || 'Erreur', 'error');
    setAdding(false);
  };

  const purgeZone = async (zid: string, name: string) => {
    if (!confirm(`Vider le cache de ${name} ?`)) return;
    setPurging(zid);
    const r = await api.post(`/cloudflare/zones/${zid}/purge`, { purge_everything: true });
    if (r.ok && r.data.success) toast(`Cache purgé — ${name}`, 'success');
    else toast(r.data?.errors?.[0]?.message || 'Erreur purge', 'error');
    setPurging(null);
  };

  const filteredZones = zones.filter(z => {
    const matchSearch = !search || z.name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || z.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const stats = {
    total:    zones.length,
    active:   zones.filter(z => z.status === 'active').length,
    paused:   zones.filter(z => z.status === 'paused').length,
    pending:  zones.filter(z => z.status === 'pending').length,
  };

  const selectedAccount = accounts.find((a: any) => String(a.id) === selectedAccountId);

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1><i className="bi bi-cloud-lightning" style={{ color: 'var(--cf-orange)' }} /> Cloudflare</h1>
            <p>DNS • Analytics • Sécurité • Cache — {zones.length} zone(s) au total</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-outline" onClick={() => load(true)} title="Forcer le rechargement depuis l'API">
              🔄 Sync
            </button>
            <Link href="/cloudflare/email-auth" className="btn btn-outline">
              <i className="bi bi-shield-lock" /> Email Auth
            </Link>
            <Link href="/cloudflare/email-routing" className="btn btn-outline">
              ✉ Routing
            </Link>
            <button className="btn btn-primary" onClick={() => setShowAdd(!showAdd)}>
              <i className="bi bi-plus-lg" /> Ajouter compte
            </button>
          </div>
        </div>
      </div>

      {/* Add Account Form */}
      {showAdd && (
        <div className="card mb-4">
          <div className="card-header"><i className="bi bi-cloud-plus" /> Connecter un compte Cloudflare</div>
          <div className="card-body">
            <form onSubmit={addAccount}>
              <div className="grid-3" style={{ gap: 12, marginBottom: 16 }}>
                <div><label className="form-label">Nom du compte</label><input className="form-control" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="ex: Main CF" required /></div>
                <div><label className="form-label">API Token</label><input className="form-control" type="password" value={form.api_token} onChange={e => setForm(p => ({ ...p, api_token: e.target.value }))} placeholder="cf_..." required /></div>
                <div><label className="form-label">Email (optionnel)</label><input className="form-control" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} /></div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" type="submit" disabled={adding}>{adding ? '⏳ Vérification...' : '✓ Connecter'}</button>
                <button className="btn btn-ghost" type="button" onClick={() => setShowAdd(false)}>Annuler</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total zones',  value: stats.total,   icon: '☁', color: '#f6821f' },
          { label: 'Actives',      value: stats.active,  icon: '✅', color: '#34d399' },
          { label: 'En attente',   value: stats.pending, icon: '⏳', color: '#f59e0b' },
          { label: 'Pausées',      value: stats.paused,  icon: '⏸', color: '#94a3b8' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '1.4rem' }}>{s.icon}</span>
            <div>
              <div style={{ fontSize: '1.6rem', fontWeight: 900, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Account tabs */}
      {accounts.length > 0 && (
        <div className="card mb-4" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', alignItems: 'stretch', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
            <button
              onClick={() => setSelectedAccountId('all')}
              style={{ padding: '12px 20px', border: 'none', cursor: 'pointer', fontSize: '.82rem', fontWeight: selectedAccountId === 'all' ? 700 : 400, background: selectedAccountId === 'all' ? 'rgba(246,130,31,0.1)' : 'transparent', color: selectedAccountId === 'all' ? '#f6821f' : 'var(--text-muted)', borderBottom: selectedAccountId === 'all' ? '2px solid #f6821f' : '2px solid transparent', whiteSpace: 'nowrap', transition: 'all .15s' }}
            >
              ☁ Tous les comptes ({allZones.length} zones)
            </button>
            {accounts.map((a: any) => {
              const azones = zonesByAccount[String(a.id)] || [];
              const isActive = String(a.id) === selectedAccountId;
              return (
                <button key={a.id}
                  onClick={() => setSelectedAccountId(String(a.id))}
                  style={{ padding: '12px 20px', border: 'none', cursor: 'pointer', fontSize: '.82rem', fontWeight: isActive ? 700 : 400, background: isActive ? 'rgba(246,130,31,0.1)' : 'transparent', color: isActive ? '#f6821f' : 'var(--text-muted)', borderBottom: isActive ? '2px solid #f6821f' : '2px solid transparent', whiteSpace: 'nowrap', transition: 'all .15s', display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <span>{a.name || a.email}</span>
                  <span style={{ background: isActive ? 'rgba(246,130,31,0.2)' : 'var(--bg-hover)', color: isActive ? '#f6821f' : 'var(--text-muted)', padding: '1px 8px', borderRadius: 10, fontSize: '.7rem', fontWeight: 600 }}>
                    {loadingAccount === String(a.id) ? '…' : azones.length}
                  </span>
                  {a.is_active && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', flexShrink: 0 }} />}
                </button>
              );
            })}
          </div>

          {/* Selected account actions */}
          {selectedAccountId !== 'all' && selectedAccount && (
            <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(246,130,31,0.04)', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{selectedAccount.email}</span>
              <span style={{ fontSize: '.72rem', color: selectedAccount.is_active ? '#34d399' : 'var(--text-muted)' }}>● {selectedAccount.is_active ? 'Actif' : 'Inactif'}</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => loadAccountZones(selectedAccountId, true)} disabled={loadingAccount === selectedAccountId}>
                  {loadingAccount === selectedAccountId ? '⏳' : '🔄'} Sync
                </button>
                {!selectedAccount.is_active && (
                  <button className="btn btn-sm btn-success" onClick={() => api.patch(`/cloudflare/accounts/${selectedAccount.id}/activate`).then(() => { load(); toast('Compte activé', 'success'); })}>Activer</button>
                )}
                <button className="btn btn-sm btn-danger" onClick={() => { if (confirm('Supprimer ce compte ?')) api.delete(`/cloudflare/accounts/${selectedAccount.id}`).then(() => { setSelectedAccountId('all'); load(true); toast('Supprimé', 'success'); }); }}>
                  <i className="bi bi-trash" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Filter bar */}
      {zones.length > 0 && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <input className="form-control" placeholder="🔍 Rechercher une zone..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 280, fontSize: '.82rem' }} />
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-card)', borderRadius: 10, padding: 4, border: '1px solid var(--border)' }}>
            {['all', 'active', 'pending', 'paused'].map(s => (
              <button key={s} onClick={() => setFilterStatus(s)} style={{
                padding: '5px 14px', borderRadius: 7, border: 'none', cursor: 'pointer',
                background: filterStatus === s ? 'rgba(246,130,31,0.2)' : 'transparent',
                color: filterStatus === s ? '#f6821f' : 'var(--text-muted)',
                fontWeight: filterStatus === s ? 700 : 400, fontSize: '.78rem', transition: 'all .15s',
              }}>
                {s === 'all' ? `Toutes (${zones.length})` : `${s} (${zones.filter(z => z.status === s).length})`}
              </button>
            ))}
          </div>
          <span style={{ marginLeft: 'auto', fontSize: '.75rem', color: 'var(--text-muted)' }}>
            {filteredZones.length} / {zones.length} zones
          </span>
        </div>
      )}

      {/* Zone Grid */}
      {loading ? (
        <div className="grid-3">{[...Array(9)].map((_, i) => <div key={i} className="skeleton" style={{ height: 180 }} />)}</div>
      ) : (
        <div className="grid-3">
          {filteredZones.map((z: any) => (
            <div key={z.id} className="card" style={{ padding: 0, overflow: 'hidden', border: `1px solid ${STATUS_COLOR[z.status] || '#444'}33`, transition: 'all .2s' }}
              onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-3px)', e.currentTarget.style.boxShadow = 'var(--shadow-lg)')}
              onMouseLeave={e => (e.currentTarget.style.transform = '', e.currentTarget.style.boxShadow = '')}>

              {/* Zone header */}
              <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 36, height: 36, background: 'rgba(246,130,31,0.12)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', color: '#f6821f', flexShrink: 0 }}>☁</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{z.name}</div>
                    <div style={{ fontSize: '.65rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{z.id?.slice(0, 16)}...</div>
                  </div>
                  <span style={{ marginLeft: 'auto', padding: '2px 8px', borderRadius: 20, fontSize: '.62rem', fontWeight: 700, background: `${STATUS_COLOR[z.status] || '#94a3b8'}22`, color: STATUS_COLOR[z.status] || '#94a3b8', flexShrink: 0 }}>
                    ● {z.status}
                  </span>
                </div>

                {/* Plan + NS */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {z.plan?.name && <span className="badge badge-gray" style={{ fontSize: '.6rem' }}>📦 {z.plan.name}</span>}
                  {z.original_registrar && <span className="badge badge-gray" style={{ fontSize: '.6rem' }}>🏷 {z.original_registrar}</span>}
                  {z.paused && <span className="badge badge-warning" style={{ fontSize: '.6rem' }}>⏸ PAUSÉ</span>}
                </div>
              </div>

              {/* Quick actions */}
              <div style={{ padding: '12px 18px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Link href={`/cloudflare/zones/${z.id}/dns`} className="btn btn-sm btn-outline" style={{ fontSize: '.7rem', flex: 1, textAlign: 'center' }}>
                  📋 DNS
                </Link>
                <Link href={`/cloudflare/zones/${z.id}/analytics`} className="btn btn-sm btn-outline" style={{ fontSize: '.7rem', flex: 1, textAlign: 'center' }}>
                  📊 Analytics
                </Link>
                <Link href={`/cloudflare/zones/${z.id}/settings`} className="btn btn-sm btn-outline" style={{ fontSize: '.7rem', flex: 1, textAlign: 'center' }}>
                  ⚙ Config
                </Link>
                <button
                  onClick={() => purgeZone(z.id, z.name)}
                  disabled={purging === z.id}
                  className="btn btn-sm"
                  style={{ fontSize: '.7rem', flex: 1, background: 'rgba(251,113,133,0.1)', color: '#fb7185', border: '1px solid rgba(251,113,133,0.3)' }}
                  title="Purger le cache Cloudflare"
                >
                  {purging === z.id ? '⏳' : '🗑 Cache'}
                </button>
              </div>
            </div>
          ))}

          {!filteredZones.length && (
            <div className="card" style={{ gridColumn: '1/-1' }}>
              <div className="empty-state" style={{ padding: 60 }}>
                <span style={{ fontSize: '2.5rem' }}>☁</span>
                <h3>{search || filterStatus !== 'all' ? 'Aucune zone correspondante' : 'Aucune zone Cloudflare'}</h3>
                <p>{search || filterStatus !== 'all' ? 'Modifiez le filtre ou la recherche' : 'Connectez un compte Cloudflare pour commencer'}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
