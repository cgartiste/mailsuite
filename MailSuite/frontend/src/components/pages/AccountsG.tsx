'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

interface GWAccount {
  id: number;
  name: string;
  domain: string;
  admin_email: string;
  status: string;
  is_active: number;
  connected: boolean;
  activeUsers: number;
  suspendedUsers: number;
  totalUsers: number;
  domain_count: number;
  last_sync: string | null;
  domains: { domainName: string }[];
}

function DomainsAccordion({ domains }: { domains: { domainName: string }[] }) {
  const [open, setOpen] = useState(false);
  if (!domains?.length) return <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>Aucun domaine</span>;

  const preview = domains.slice(0, 3);
  const rest = domains.slice(3);

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {preview.map((d: any) => (
          <span key={d.domainName} style={{
            background: 'rgba(66,133,244,0.08)', color: '#4285F4',
            border: '1px solid rgba(66,133,244,0.2)', borderRadius: 6,
            padding: '2px 8px', fontSize: '.65rem', fontWeight: 600
          }}>{d.domainName}</span>
        ))}
        {rest.length > 0 && (
          <button onClick={() => setOpen(o => !o)} style={{
            background: open ? 'rgba(66,133,244,0.15)' : 'rgba(66,133,244,0.05)',
            color: '#4285F4', border: '1px solid rgba(66,133,244,0.2)',
            borderRadius: 6, padding: '2px 8px', fontSize: '.65rem',
            fontWeight: 700, cursor: 'pointer', transition: 'all .15s'
          }}>
            {open ? `▲ Masquer` : `▼ +${rest.length} autres`}
          </button>
        )}
      </div>
      {open && rest.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6, padding: '10px', background: 'rgba(66,133,244,0.04)', borderRadius: 8, border: '1px solid rgba(66,133,244,0.1)' }}>
          {rest.map((d: any) => (
            <span key={d.domainName} style={{
              background: 'rgba(66,133,244,0.08)', color: '#4285F4',
              border: '1px solid rgba(66,133,244,0.2)', borderRadius: 6,
              padding: '2px 8px', fontSize: '.65rem', fontWeight: 600
            }}>{d.domainName}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AccountsG() {
  const [accounts, setAccounts] = useState<GWAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<number | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    // Use the fast cached endpoint (no live GW calls)
    const r = await api.get('/accounts-g?cached=1');
    if (r.ok) setAccounts(r.data.accounts || []);
    else toast('Erreur chargement comptes', 'error');
    setLoading(false);
  }, []);

  const syncAccount = async (id: number) => {
    setSyncing(id);
    toast('Synchronisation en cours...', 'info');
    const r = await api.post(`/accounts-g/${id}/sync`, {});
    if (r.ok) {
      toast(`✓ Sync OK — ${r.data.total || 0} users, ${r.data.domain_count || 0} domaines`, 'success');
      load();
    } else {
      toast(r.data?.error || 'Erreur de synchronisation', 'error');
    }
    setSyncing(null);
  };

  useEffect(() => { load(); }, [load]);

  const totalActive = accounts.reduce((s, a) => s + (a.activeUsers || 0), 0);
  const totalDomains = accounts.reduce((s, a) => s + (a.domain_count || 0), 0);
  const totalUsers = accounts.reduce((s, a) => s + (a.totalUsers || 0), 0);

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1><i className="bi bi-google text-google" /> Accounts G</h1>
            <p>Gestion multi-comptes Google Workspace — Tous vos domaines centralisés</p>
          </div>
          <Link href="/gworkspace/connect" className="btn btn-primary">
            <i className="bi bi-plus-lg" /> Connecter un compte
          </Link>
        </div>
      </div>

      {/* Global summary bar */}
      {!loading && accounts.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Comptes', value: accounts.length, icon: 'bi-building', color: '#4285F4', bg: 'rgba(66,133,244,0.08)' },
            { label: 'Utilisateurs', value: totalUsers, icon: 'bi-people-fill', color: '#34d399', bg: 'rgba(52,211,153,0.08)' },
            { label: 'Actifs', value: totalActive, icon: 'bi-person-check-fill', color: '#34A853', bg: 'rgba(52,168,83,0.08)' },
            { label: 'Domaines', value: totalDomains, icon: 'bi-globe', color: '#FBBC04', bg: 'rgba(251,188,4,0.08)' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: s.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.color, fontSize: '1.1rem' }}>
                <i className={`bi ${s.icon}`} />
              </div>
              <div>
                <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em' }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="grid-2">{[...Array(2)].map((_, i) => <div key={i} className="skeleton" style={{ height: 260 }} />)}</div>
      ) : accounts.length === 0 ? (
        <div className="card"><div className="empty-state">
          <span style={{ fontSize: '2.5rem' }}>🌐</span>
          <h3>Aucun compte Google Workspace</h3>
          <p>Connectez votre premier compte via JSON de service account</p>
          <Link href="/gworkspace/connect" className="btn btn-primary mt-3">Connecter un compte</Link>
        </div></div>
      ) : (
        <div className="grid-2">
          {accounts.map(acc => (
            <div key={acc.id} style={{
              background: 'var(--bg-card)',
              border: `1px solid ${acc.is_active ? 'rgba(66,133,244,0.3)' : 'var(--border)'}`,
              borderRadius: 20, padding: 24, position: 'relative', overflow: 'hidden',
              transition: 'all .2s', boxShadow: '0 2px 12px rgba(0,0,0,0.04)'
            }}>
              {/* Google gradient top bar */}
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'linear-gradient(90deg,#4285F4,#34A853,#FBBC04,#EA4335)' }} />

              {/* Status badge */}
              <div style={{ position: 'absolute', top: 18, right: 18 }}>
                <span className={`badge badge-${acc.connected || acc.status === 'connected' ? 'success' : 'danger'}`}>
                  <i className={`bi bi-${acc.connected || acc.status === 'connected' ? 'check-circle-fill' : 'x-circle-fill'}`} />{' '}
                  {acc.connected || acc.status === 'connected' ? 'Connecté' : 'Hors ligne'}
                </span>
              </div>

              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18, marginTop: 4 }}>
                <div style={{
                  width: 48, height: 48, background: 'linear-gradient(135deg,rgba(66,133,244,.15),rgba(52,168,83,.1))',
                  borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.5rem', fontWeight: 900, color: '#4285F4', border: '1px solid rgba(66,133,244,.2)'
                }}>G</div>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>{acc.domain}</div>
                  <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: 2 }}>{acc.name} · {acc.admin_email}</div>
                </div>
              </div>

              {/* Stats row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16 }}>
                <div style={{ background: 'rgba(52,211,153,0.08)', borderRadius: 10, padding: '10px 12px', textAlign: 'center', border: '1px solid rgba(52,211,153,0.15)' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#34d399', lineHeight: 1 }}>{acc.active_users ?? 0}</div>

                  <div style={{ fontSize: '.6rem', fontWeight: 700, color: '#34d399', textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 2 }}>Actifs</div>
                </div>
                <div style={{ background: 'rgba(244,63,94,0.08)', borderRadius: 10, padding: '10px 12px', textAlign: 'center', border: '1px solid rgba(244,63,94,0.15)' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#fb7185', lineHeight: 1 }}>{acc.suspended_users ?? 0}</div>
                  <div style={{ fontSize: '.6rem', fontWeight: 700, color: '#fb7185', textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 2 }}>Suspendus</div>
                </div>
                <div style={{ background: 'rgba(99,102,241,0.08)', borderRadius: 10, padding: '10px 12px', textAlign: 'center', border: '1px solid rgba(99,102,241,0.15)' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#818cf8', lineHeight: 1 }}>{acc.domain_count ?? (acc.domains || []).length}</div>
                  <div style={{ fontSize: '.6rem', fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 2 }}>Domaines</div>
                </div>
              </div>

              {/* Domains accordion */}
              <DomainsAccordion domains={acc.domains || []} />

              {/* Last sync */}
              {acc.last_sync && (
                <div style={{ fontSize: '.67rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                  <i className="bi bi-clock" /> Sync: {new Date(acc.last_sync).toLocaleString('fr-FR')}
                </div>
              )}

              {/* Footer */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <button
                  onClick={() => syncAccount(acc.id)}
                  disabled={syncing === acc.id}
                  style={{
                    background: 'rgba(66,133,244,0.08)', color: '#4285F4',
                    border: '1px solid rgba(66,133,244,0.2)', borderRadius: 8,
                    padding: '5px 12px', fontSize: '.72rem', fontWeight: 700,
                    cursor: syncing === acc.id ? 'not-allowed' : 'pointer', opacity: syncing === acc.id ? .6 : 1, transition: 'all .15s'
                  }}>
                  <i className={`bi bi-${syncing === acc.id ? 'arrow-repeat spin' : 'arrow-clockwise'}`} />{' '}
                  {syncing === acc.id ? 'Sync...' : 'Actualiser'}
                </button>
                <Link href={`/accounts-g/${acc.id}`} className="btn btn-primary btn-sm">Détails →</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
