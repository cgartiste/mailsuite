'use client';
import React, { useState, useRef, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveGW } from '@/contexts/ActiveGWContext';
import { usePathname } from 'next/navigation';

function GWSwitcher() {
  const { accounts, active, switching, switchAccount } = useActiveGW();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!accounts.length) return null;

  return (
    <div ref={ref} style={{ position: 'relative', userSelect: 'none' }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 9,
          padding: '7px 13px 7px 9px',
          background: open ? 'rgba(66,133,244,0.15)' : 'rgba(66,133,244,0.08)',
          border: '1px solid rgba(66,133,244,0.3)',
          borderRadius: 10, cursor: 'pointer', transition: 'all .15s',
          color: 'var(--text-primary)',
        }}
        title="Changer de compte Google Workspace"
      >
        {/* G avatar */}
        <div style={{
          width: 26, height: 26, borderRadius: 7,
          background: 'linear-gradient(135deg,#4285F4,#34a853)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 900, fontSize: '.82rem', color: '#fff', flexShrink: 0,
        }}>G</div>

        <div style={{ lineHeight: 1.25, textAlign: 'left' }}>
          <div style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--text-primary)', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {active?.domain || active?.name || 'Aucun compte'}
          </div>
          <div style={{ fontSize: '.65rem', color: 'var(--text-muted)' }}>
            {switching ? 'Changement...' : `${accounts.length} compte${accounts.length > 1 ? 's' : ''}`}
          </div>
        </div>

        <i className="bi bi-chevron-down" style={{ fontSize: '.65rem', color: 'var(--text-muted)', marginLeft: 2, transform: open ? 'rotate(180deg)' : '', transition: 'transform .2s' }} />
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 12, boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
          minWidth: 260, zIndex: 9999, overflow: 'hidden',
        }}>
          <div style={{ padding: '10px 14px 8px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
              Compte Google Workspace actif
            </span>
          </div>

          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {accounts.map(acct => {
              const isActive = acct.is_active === 1;
              return (
                <div
                  key={acct.id}
                  onClick={async () => {
                    if (!isActive && !switching) {
                      await switchAccount(acct.id);
                      setOpen(false);
                    }
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 11,
                    padding: '11px 14px',
                    background: isActive ? 'rgba(66,133,244,0.1)' : 'transparent',
                    cursor: isActive ? 'default' : 'pointer',
                    transition: 'background .12s',
                    borderBottom: '1px solid rgba(255,255,255,.04)',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,.05)'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  {/* Avatar */}
                  <div style={{
                    width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                    background: isActive ? 'linear-gradient(135deg,#4285F4,#34a853)' : 'rgba(255,255,255,.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 900, fontSize: '.85rem', color: isActive ? '#fff' : 'var(--text-muted)',
                    border: isActive ? 'none' : '1px solid var(--border)',
                  }}>
                    {acct.domain?.[0]?.toUpperCase() || 'G'}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '.82rem', fontWeight: isActive ? 700 : 500, color: isActive ? '#4285F4' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {acct.domain || acct.name}
                    </div>
                    <div style={{ fontSize: '.68rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {acct.admin_email} · {acct.total_users || 0} users
                    </div>
                  </div>

                  {/* Status */}
                  {isActive ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#34a853' }} />
                      <span style={{ fontSize: '.65rem', color: '#34a853', fontWeight: 700 }}>ACTIF</span>
                    </div>
                  ) : (
                    <span style={{ fontSize: '.65rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                      {switching ? '⏳' : 'Activer →'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)', background: 'rgba(0,0,0,.15)' }}>
            <a href="/accounts-g" style={{ fontSize: '.72rem', color: 'var(--text-muted)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
               onClick={() => setOpen(false)}>
              <i className="bi bi-gear" /> Gérer les comptes GW
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const isPublic = pathname === '/login';

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', gap:12 }}>
      <div className="spin" style={{ width:24,height:24,border:'3px solid rgba(99,102,241,.3)',borderTopColor:'#6366f1',borderRadius:'50%' }} />
      <span className="text-muted">Chargement...</span>
    </div>
  );

  if (isPublic || !user) return <>{children}</>;

  return (
    <div className="layout">
      <Sidebar />
      <div className="main-area">
        {/* Global topbar with GW switcher */}
        <div style={{
          height: 52, display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          padding: '0 24px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-card)', gap: 12, flexShrink: 0,
          position: 'sticky', top: 0, zIndex: 100,
        }}>
          <GWSwitcher />
        </div>
        <div className="page-content">{children}</div>
      </div>
    </div>
  );
}
