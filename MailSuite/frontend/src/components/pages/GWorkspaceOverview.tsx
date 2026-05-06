'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export default function GWorkspaceOverview() {
  const [creds, setCreds] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    Promise.all([api.get('/gworkspace/credentials'), api.get('/dashboard')]).then(([cr, dr]) => {
      if (cr.ok) setCreds(cr.data.credentials || []);
      if (dr.ok) setStats(dr.data.stats || {});
      setLoading(false);
    });
  }, []);

  const activate = async (id: number) => {
    const r = await api.patch(`/gworkspace/credentials/${id}/activate`);
    toast(r.ok ? 'Compte activé' : r.data?.error, r.ok ? 'success' : 'error');
    if (r.ok) api.get('/gworkspace/credentials').then(cr => { if (cr.ok) setCreds(cr.data.credentials || []); });
  };

  const del = async (id: number) => {
    if (!confirm('Supprimer ce compte ?')) return;
    const r = await api.delete(`/gworkspace/credentials/${id}`);
    toast(r.ok ? 'Supprimé' : r.data?.error, r.ok ? 'success' : 'error');
    if (r.ok) setCreds(p => p.filter(c => c.id !== id));
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1><i className="bi bi-google text-google" /> Google Workspace</h1>
            <p>Gestion centralisée de vos comptes et domaines GW</p>
          </div>
          <Link href="/gworkspace/connect" className="btn btn-primary"><i className="bi bi-plug" /> Connecter JSON</Link>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid-4 mb-6">
        {[
          { v: creds.length, l: 'Comptes connectés', i: 'bi-plug', c: 'indigo' },
          { v: stats.gw_created_users || 0, l: 'Utilisateurs créés', i: 'bi-people-fill', c: 'emerald' },
          { v: stats.total_domains || 0, l: 'Domaines', i: 'bi-globe', c: 'sky' },
          { v: creds.filter(c => c.is_active).length, l: 'Actifs', i: 'bi-check-circle', c: 'violet' },
        ].map(s => (
          <div key={s.l} className="stat-card">
            <div className={`stat-icon ${s.c}`}><i className={`bi ${s.i}`} /></div>
            <div><div className="stat-value">{s.v}</div><div className="stat-label">{s.l}</div></div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid-3 mb-6">
        {[
          { href: '/gworkspace/users', icon: '👥', title: 'Utilisateurs', desc: 'Gérer les users GW', color: 'indigo' },
          { href: '/gworkspace/create-users', icon: '➕', title: 'Créer en masse', desc: 'Bulk user creation', color: 'emerald' },
          { href: '/gworkspace/domain-change', icon: '⇄', title: 'Changer domaine', desc: 'Migration de domaine', color: 'sky' },
          { href: '/gworkspace/2fa', icon: '🔐', title: '2FA & TOTP', desc: 'Gestionnaire OTP', color: 'violet' },
          { href: '/gworkspace/authenticator', icon: '📱', title: 'Authenticateur', desc: 'Codes en temps réel', color: 'amber' },
          { href: '/accounts-g', icon: '▣', title: 'Accounts G', desc: 'Vue multi-comptes', color: 'rose' },
        ].map(a => (
          <Link key={a.href} href={a.href} style={{ display:'block', background:'var(--bg-card)', border:'1px solid var(--border)', borderRadius:16, padding:20, textDecoration:'none', transition:'all .2s' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor=`var(--${a.color})`, e.currentTarget.style.transform='translateY(-2px)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor='var(--border)', e.currentTarget.style.transform='')}>
            <div style={{ fontSize:'1.5rem', marginBottom:10 }}>{a.icon}</div>
            <div style={{ fontWeight:700, color:'var(--text-primary)', marginBottom:4 }}>{a.title}</div>
            <div style={{ fontSize:'.75rem', color:'var(--text-muted)' }}>{a.desc}</div>
          </Link>
        ))}
      </div>

      {/* Credentials table */}
      <div className="card">
        <div className="card-header"><i className="bi bi-key" /> Credentials JSON ({creds.length})</div>
        <div className="table-wrapper">
          {loading ? <div style={{ padding:32,textAlign:'center' }}><div className="spin" style={{ width:24,height:24,border:'3px solid rgba(99,102,241,.3)',borderTopColor:'#6366f1',borderRadius:'50%',display:'inline-block' }} /></div> : (
            <table>
              <thead><tr><th>Nom</th><th>Domaine</th><th>Admin</th><th>Project ID</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {creds.map((c: any) => (
                  <tr key={c.id}>
                    <td><strong style={{ color:'var(--text-primary)' }}>{c.name}</strong></td>
                    <td><span className="badge badge-google">{c.domain}</span></td>
                    <td style={{ fontSize:'.78rem', color:'var(--text-secondary)' }}>{c.admin_email}</td>
                    <td><code style={{ fontSize:'.7rem' }}>{c.project_id || '—'}</code></td>
                    <td><span className={`badge badge-${c.is_active ? 'success' : 'gray'}`}>{c.is_active ? 'Actif' : 'Inactif'}</span></td>
                    <td><div style={{ display:'flex', gap:6 }}>
                      {!c.is_active && <button className="btn btn-sm btn-success" onClick={() => activate(c.id)}>Activer</button>}
                      <Link href={`/accounts-g/${c.id}`} className="btn btn-sm btn-outline"><i className="bi bi-eye" /></Link>
                      <button className="btn btn-sm btn-danger" onClick={() => del(c.id)}><i className="bi bi-trash" /></button>
                    </div></td>
                  </tr>
                ))}
                {!creds.length && <tr><td colSpan={6}><div className="empty-state" style={{ padding:24 }}><p>Aucun credential — <Link href="/gworkspace/connect" style={{ color:'var(--indigo)' }}>Connecter un compte</Link></p></div></td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
