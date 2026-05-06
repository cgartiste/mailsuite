'use client';
import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export default function GWAuthenticator() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = useCallback(async () => {
    const r = await api.get('/gworkspace/totp');
    if (r.ok) setItems(r.data.items?.filter((i: any) => i.totp_secret) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load]);

  const getBarWidth = (remaining: number) => Math.round((remaining / 30) * 100) + '%';
  const getColor = (remaining: number) => remaining > 15 ? '#34d399' : remaining > 8 ? '#fbbf24' : '#fb7185';

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><div className="spin" style={{ width: 32, height: 32, border: '3px solid rgba(99,102,241,.3)', borderTopColor: '#6366f1', borderRadius: '50%', display: 'inline-block' }} /></div>;

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div><h1><i className="bi bi-phone" style={{ color: '#818cf8' }} /> Authenticateur OTP</h1><p>Codes en temps réel — Refresh automatique toutes les 5s</p></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 8px #34d399', animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: '.78rem', color: '#34d399' }}>Live</span>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card"><div className="empty-state"><span style={{ fontSize: '2.5rem' }}>📱</span><h3>Aucun secret TOTP</h3><p>Ajoutez des comptes dans la section 2FA & TOTP</p></div></div>
      ) : (
        <div className="grid-4">
          {items.map((item: any) => {
            const color = getColor(item.otp_remaining || 30);
            return (
              <div key={item.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${color}, transparent)` }} />
                <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.email}</div>
                <div className="otp-code" style={{ color, fontSize: '2.2rem', letterSpacing: '.25em', margin: '12px 0' }}>{item.otp_code || '——'}</div>
                <div style={{ marginTop: 10 }}>
                  <div className="otp-bar-bg" style={{ width: '80%', margin: '0 auto 6px' }}>
                    <div className="otp-bar-fill" style={{ width: getBarWidth(item.otp_remaining || 30), background: color }} />
                  </div>
                  <span style={{ fontSize: '.68rem', color: 'var(--text-muted)' }}>{item.otp_remaining || 30}s restantes</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
