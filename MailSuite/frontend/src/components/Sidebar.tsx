'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

interface NavItem { label: string; href: string; icon: string; }
interface NavGroup { label: string; color?: string; icon?: string; items: NavItem[]; }

const NAV: NavGroup[] = [
  { label: 'Vue d\'ensemble', items: [
    { label: 'Dashboard',   href: '/',           icon: '⊞' },
    { label: 'Monitoring',  href: '/monitoring',  icon: '◈' },
  ]},
  { label: 'Infrastructure', items: [
    { label: 'Domaines & DNS', href: '/domains',    icon: '🌐' },
    { label: 'Accounts G',     href: '/accounts-g', icon: '▣' },
  ]},
  { label: 'Cloudflare', color: '#f6821f', items: [
    { label: 'Zones overview',  href: '/cloudflare',            icon: '☁' },
    { label: 'Email Auth',      href: '/cloudflare/email-auth', icon: '🛡' },
  ]},
  { label: 'Google Workspace', color: '#4285F4', items: [
    { label: 'Vue d\'ensemble', href: '/gworkspace',              icon: '⊡' },
    { label: 'Connexion JSON',  href: '/gworkspace/connect',      icon: '🔌' },
    { label: 'Utilisateurs',    href: '/gworkspace/users',        icon: '👥' },
    { label: 'Créer users',     href: '/gworkspace/create-users', icon: '➕' },
    { label: 'Changer domaine', href: '/gworkspace/domain-change',icon: '⇄' },
  ]},
  { label: 'Microsoft 365', color: '#00a4ef', items: [
    { label: 'Vue d\'ensemble', href: '/microsoft',       icon: '⊞' },
    { label: 'Utilisateurs',    href: '/microsoft/users', icon: '👥' },
  ]},
  { label: 'PipePass 2FA', color: '#8b5cf6', items: [
    { label: 'Résultats 2FA',   href: '/pipepass', icon: '🔐' },
  ]},
];

const ADMIN_NAV: NavItem[] = [
  { label: 'Paramètres', href: '/settings', icon: '⚙' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname.startsWith(href);
  const toggleGroup = (label: string) => setCollapsed(p => ({ ...p, [label]: !p[label] }));

  return (
    <aside className="sidebar">
      <Link href="/" className="sidebar-logo">
        <div className="sidebar-logo-icon">✉</div>
        <div>
          <div className="sidebar-logo-text">MailSuite</div>
          <div className="sidebar-logo-sub">Deliverability Platform</div>
        </div>
      </Link>

      <nav className="sidebar-nav">
        {NAV.map(group => (
          <div key={group.label}>
            <button className="sidebar-link sidebar-section-label" style={{ width:'100%', justifyContent:'space-between', cursor:'pointer' }}
              onClick={() => toggleGroup(group.label)}>
              <span style={{ color: group.color || undefined }}>{group.label}</span>
              <span style={{ fontSize: '.7rem', color: 'var(--text-muted)', transition:'transform .2s', transform: collapsed[group.label] ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▾</span>
            </button>

            {!collapsed[group.label] && group.items.map(item => (
              <Link key={item.href} href={item.href}
                className={`sidebar-link${isActive(item.href) ? ' active' : ''}`}>
                <span className="icon" style={{ color: group.color || undefined }}>{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>
        ))}

        {user?.role === 'admin' && (
          <>
            <div className="sidebar-section-label">Administration</div>
            {ADMIN_NAV.map(item => (
              <Link key={item.href} href={item.href} className={`sidebar-link${isActive(item.href) ? ' active' : ''}`}>
                <span className="icon">{item.icon}</span>{item.label}
              </Link>
            ))}
          </>
        )}
      </nav>

      <div style={{ borderTop: '1px solid var(--border)', padding: '12px 0' }}>
        <div className="sidebar-link" style={{ pointerEvents:'none', opacity:.7 }}>
          <span className="icon">👤</span>
          <span style={{ fontSize: '.78rem', color: 'var(--text-secondary)' }}>{user?.firstName} {user?.lastName}</span>
          <span className="badge badge-gray" style={{ marginLeft: 'auto', fontSize: '.6rem' }}>{user?.role}</span>
        </div>
        <button className="sidebar-link" onClick={logout} style={{ color: '#fb7185', width: '100%' }}>
          <span className="icon">←</span> Déconnexion
        </button>
      </div>
    </aside>
  );
}
