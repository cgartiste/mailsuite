'use client';
import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

const TABS = ['overview', 'users', 'groups', 'domains', 'licenses', 'audit', 'mailboxes'] as const;
type Tab = typeof TABS[number];

function Skeleton({ h = 16, w = '100%', mb = 0 }: { h?: number; w?: string | number; mb?: number }) {
  return <div style={{ height: h, width: w, background: 'rgba(255,255,255,0.06)', borderRadius: 6, marginBottom: mb, animation: 'pulse 1.5s ease-in-out infinite' }} />;
}

function SkeletonRow({ cols }: { cols: number }) {
  return <tr>{Array.from({ length: cols }).map((_, i) => <td key={i}><Skeleton h={14} /></td>)}</tr>;
}

export default function MicrosoftOverview() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('overview');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', tenant_id: '', client_id: '', client_secret: '' });
  const [adding, setAdding] = useState(false);

  const [users, setUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [showBulkCreate, setShowBulkCreate] = useState(false);
  const [bulkForm, setBulkForm] = useState({ domain: '', count: '10', password: 'Azerty@123' });
  const [bulkCreating, setBulkCreating] = useState(false);
  const [showResetPwd, setShowResetPwd] = useState<string | null>(null);
  const [newPwd, setNewPwd] = useState('');
  const [skus, setSkus] = useState<any[]>([]);
  const [showAssignLicense, setShowAssignLicense] = useState<string | null>(null);
  const [selectedSku, setSelectedSku] = useState('');
  const [showBulkLicense, setShowBulkLicense] = useState(false);
  const [bulkSku, setBulkSku] = useState('');

  const [groups, setGroups] = useState<any[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupForm, setGroupForm] = useState({ displayName: '', description: '', securityEnabled: true });
  const [groupMembers, setGroupMembers] = useState<{ [id: string]: any[] }>({});
  const [showGroupMembers, setShowGroupMembers] = useState<string | null>(null);
  const [addMemberUserId, setAddMemberUserId] = useState('');

  const [domains, setDomains] = useState<any[]>([]);
  const [domainsLoading, setDomainsLoading] = useState(false);
  const [domainsLoaded, setDomainsLoaded] = useState(false);
  const [dnsRecords, setDnsRecords] = useState<{ [id: string]: any[] }>({});
  const [showDns, setShowDns] = useState<string | null>(null);

  const [licensesLoaded, setLicensesLoaded] = useState(false);
  const [licensesLoading, setLicensesLoading] = useState(false);

  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [signInLogs, setSignInLogs] = useState<any[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditLoaded, setAuditLoaded] = useState(false);

  const [mailboxes, setMailboxes] = useState<any[]>([]);
  const [mailboxesLoading, setMailboxesLoading] = useState(false);
  const [mailboxesLoaded, setMailboxesLoaded] = useState(false);
  const [showCreateMailbox, setShowCreateMailbox] = useState(false);
  const [mailboxForm, setMailboxForm] = useState({ displayName: '', email: '' });

  const loadBase = useCallback(async () => {
    setStatsLoading(true);
    const [ar, sr] = await Promise.all([api.get('/microsoft/accounts'), api.get('/microsoft/stats/fast')]);
    if (ar.ok) setAccounts(ar.data.accounts || []);
    if (sr.ok) setStats(sr.data);
    setStatsLoading(false);
  }, []);

  useEffect(() => { loadBase(); }, [loadBase]);

  useEffect(() => {
    if (tab === 'users' && !usersLoaded) {
      setUsersLoading(true);
      Promise.all([api.get('/microsoft/users'), api.get('/microsoft/licenses')]).then(([ur, lr]) => {
        if (ur.ok) setUsers(ur.data.users || []);
        if (lr.ok) setSkus(lr.data.skus || []);
        setUsersLoaded(true);
        setUsersLoading(false);
      });
    }
    if (tab === 'groups' && !groupsLoaded) {
      setGroupsLoading(true);
      api.get('/microsoft/groups').then(r => {
        if (r.ok) setGroups(r.data.groups || []);
        setGroupsLoaded(true);
        setGroupsLoading(false);
      });
    }
    if (tab === 'domains' && !domainsLoaded) {
      setDomainsLoading(true);
      api.get('/microsoft/domains').then(r => {
        if (r.ok) setDomains(r.data.domains || []);
        setDomainsLoaded(true);
        setDomainsLoading(false);
      });
    }
    if (tab === 'licenses' && !licensesLoaded) {
      setLicensesLoading(true);
      api.get('/microsoft/licenses').then(r => {
        if (r.ok) setSkus(r.data.skus || []);
        setLicensesLoaded(true);
        setLicensesLoading(false);
      });
    }
    if (tab === 'audit' && !auditLoaded) {
      setAuditLoading(true);
      Promise.all([api.get('/microsoft/audit-logs'), api.get('/microsoft/sign-in-logs')]).then(([ar2, sr2]) => {
        if (ar2.ok) setAuditLogs(ar2.data.logs || []);
        if (sr2.ok) setSignInLogs(sr2.data.logs || []);
        setAuditLoaded(true);
        setAuditLoading(false);
      });
    }
    if (tab === 'mailboxes' && !mailboxesLoaded) {
      setMailboxesLoading(true);
      api.get('/microsoft/mailboxes').then(r => {
        if (r.ok) setMailboxes(r.data.mailboxes || []);
        setMailboxesLoaded(true);
        setMailboxesLoading(false);
      });
    }
  }, [tab]);

  const addAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    const r = await api.post('/microsoft/accounts', form);
    toast(r.ok ? 'Compte MS365 connecté' : r.data?.error || 'Erreur', r.ok ? 'success' : 'error');
    if (r.ok) { setShowAdd(false); setForm({ name: '', tenant_id: '', client_id: '', client_secret: '' }); loadBase(); }
    setAdding(false);
  };

  const activate = async (id: number) => {
    const r = await api.patch(`/microsoft/accounts/${id}/activate`);
    if (r.ok) { toast('Compte activé', 'success'); loadBase(); setUsersLoaded(false); setGroupsLoaded(false); setDomainsLoaded(false); }
    else toast(r.data?.error || 'Erreur', 'error');
  };

  const delAccount = async (id: number) => {
    if (!confirm('Supprimer ce compte ?')) return;
    const r = await api.delete(`/microsoft/accounts/${id}`);
    toast(r.ok ? 'Supprimé' : r.data?.error || 'Erreur', r.ok ? 'success' : 'error');
    if (r.ok) loadBase();
  };

  const filteredUsers = users.filter(u =>
    !userSearch || u.userPrincipalName?.toLowerCase().includes(userSearch.toLowerCase()) || u.displayName?.toLowerCase().includes(userSearch.toLowerCase())
  );

  const toggleUser = (id: string) => {
    setSelectedUsers(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };

  const toggleAll = () => {
    setSelectedUsers(prev => prev.size === filteredUsers.length ? new Set() : new Set(filteredUsers.map(u => u.id)));
  };

  const userAction = async (userId: string, action: string) => {
    const ep = action === 'enable' ? `/microsoft/users/${userId}/enable`
      : action === 'disable' ? `/microsoft/users/${userId}/disable`
      : `/microsoft/users/${userId}`;
    const r = action === 'delete' ? await api.delete(ep) : await api.post(ep, {});
    toast(r.ok ? 'OK' : r.data?.error || 'Erreur', r.ok ? 'success' : 'error');
    if (r.ok) { api.get('/microsoft/users').then(ur => { if (ur.ok) setUsers(ur.data.users || []); }); }
  };

  const resetPassword = async () => {
    if (!showResetPwd || !newPwd) return;
    const r = await api.post(`/microsoft/users/${showResetPwd}/reset-password`, { password: newPwd, forceChange: true });
    toast(r.ok ? 'Mot de passe réinitialisé' : r.data?.error || 'Erreur', r.ok ? 'success' : 'error');
    if (r.ok) { setShowResetPwd(null); setNewPwd(''); }
  };

  const assignLicense = async () => {
    if (!showAssignLicense || !selectedSku) return;
    const r = await api.post(`/microsoft/users/${showAssignLicense}/assign-license`, { skuId: selectedSku });
    toast(r.ok ? 'Licence assignée' : r.data?.error || 'Erreur', r.ok ? 'success' : 'error');
    if (r.ok) { setShowAssignLicense(null); setSelectedSku(''); api.get('/microsoft/users').then(ur => { if (ur.ok) setUsers(ur.data.users || []); }); }
  };

  const bulkLicense = async () => {
    if (!selectedUsers.size || !bulkSku) return;
    const r = await api.post('/microsoft/users/bulk-license', { userIds: Array.from(selectedUsers), skuId: bulkSku });
    toast(r.ok ? `Licences assignées (${selectedUsers.size})` : r.data?.error || 'Erreur', r.ok ? 'success' : 'error');
    if (r.ok) { setShowBulkLicense(false); setBulkSku(''); setSelectedUsers(new Set()); api.get('/microsoft/users').then(ur => { if (ur.ok) setUsers(ur.data.users || []); }); }
  };

  const bulkCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBulkCreating(true);
    const r = await api.post('/microsoft/users/bulk', { domain: bulkForm.domain, count: parseInt(bulkForm.count), password: bulkForm.password });
    toast(r.ok ? `Créés: ${r.data.createdCount}, Échecs: ${r.data.failedCount}` : r.data?.error || 'Erreur', r.ok ? 'success' : 'error');
    if (r.ok) { setShowBulkCreate(false); api.get('/microsoft/users').then(ur => { if (ur.ok) setUsers(ur.data.users || []); }); }
    setBulkCreating(false);
  };

  const exportUsers = () => {
    window.open('/api/microsoft/export/users', '_blank');
  };

  const createGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await api.post('/microsoft/groups', groupForm);
    toast(r.ok ? 'Groupe créé' : r.data?.error || 'Erreur', r.ok ? 'success' : 'error');
    if (r.ok) { setShowCreateGroup(false); setGroupForm({ displayName: '', description: '', securityEnabled: true }); api.get('/microsoft/groups').then(gr => { if (gr.ok) setGroups(gr.data.groups || []); }); }
  };

  const deleteGroup = async (id: string) => {
    if (!confirm('Supprimer ce groupe ?')) return;
    const r = await api.delete(`/microsoft/groups/${id}`);
    toast(r.ok ? 'Groupe supprimé' : r.data?.error || 'Erreur', r.ok ? 'success' : 'error');
    if (r.ok) setGroups(p => p.filter(g => g.id !== id));
  };

  const loadGroupMembers = async (groupId: string) => {
    setShowGroupMembers(groupId);
    if (groupMembers[groupId]) return;
    const r = await api.get(`/microsoft/groups/${groupId}/members`);
    if (r.ok) setGroupMembers(p => ({ ...p, [groupId]: r.data.members || [] }));
  };

  const addMember = async (groupId: string) => {
    if (!addMemberUserId) return;
    const r = await api.post(`/microsoft/groups/${groupId}/members`, { userId: addMemberUserId });
    toast(r.ok ? 'Membre ajouté' : r.data?.error || 'Erreur', r.ok ? 'success' : 'error');
    if (r.ok) { setAddMemberUserId(''); const gr = await api.get(`/microsoft/groups/${groupId}/members`); if (gr.ok) setGroupMembers(p => ({ ...p, [groupId]: gr.data.members || [] })); }
  };

  const removeMember = async (groupId: string, userId: string) => {
    const r = await api.delete(`/microsoft/groups/${groupId}/members/${userId}`);
    toast(r.ok ? 'Membre retiré' : r.data?.error || 'Erreur', r.ok ? 'success' : 'error');
    if (r.ok) setGroupMembers(p => ({ ...p, [groupId]: (p[groupId] || []).filter(m => m.id !== userId) }));
  };

  const loadDns = async (domainId: string) => {
    setShowDns(domainId);
    if (dnsRecords[domainId]) return;
    const r = await api.get(`/microsoft/domains/${encodeURIComponent(domainId)}/dns`);
    if (r.ok) setDnsRecords(p => ({ ...p, [domainId]: r.data.records || [] }));
  };

  const createMailbox = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await api.post('/microsoft/mailboxes', mailboxForm);
    toast(r.ok ? 'Mailbox créée' : r.data?.error || 'Erreur', r.ok ? 'success' : 'error');
    if (r.ok) { setShowCreateMailbox(false); setMailboxForm({ displayName: '', email: '' }); api.get('/microsoft/mailboxes').then(mr => { if (mr.ok) setMailboxes(mr.data.mailboxes || []); }); }
  };

  const hasActive = accounts.some(a => a.is_active);

  const tabLabel: Record<Tab, { icon: string; label: string }> = {
    overview: { icon: 'bi-house', label: 'Vue d\'ensemble' },
    users: { icon: 'bi-people', label: 'Utilisateurs' },
    groups: { icon: 'bi-diagram-3', label: 'Groupes' },
    domains: { icon: 'bi-globe', label: 'Domaines' },
    licenses: { icon: 'bi-award', label: 'Licences' },
    audit: { icon: 'bi-journal-text', label: 'Audit' },
    mailboxes: { icon: 'bi-inbox', label: 'Mailboxes' },
  };

  return (
    <div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}`}</style>

      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1><i className="bi bi-microsoft" style={{ color: 'var(--ms-blue)' }} /> Microsoft 365</h1>
            <p>Gestion complète Azure AD · Graph API</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {hasActive && <button className="btn btn-ghost btn-sm" onClick={() => { setStatsLoading(true); loadBase(); }}><i className="bi bi-arrow-clockwise" /> Rafraîchir</button>}
            <button className="btn btn-primary" onClick={() => setShowAdd(!showAdd)}><i className="bi bi-plus-lg" /> Ajouter compte</button>
          </div>
        </div>
      </div>

      {showAdd && (
        <div className="card mb-4">
          <div className="card-header"><i className="bi bi-microsoft" style={{ color: 'var(--ms-blue)' }} /> Connecter un tenant Microsoft 365</div>
          <div className="card-body">
            <form onSubmit={addAccount}>
              <div className="grid-2" style={{ gap: 12, marginBottom: 14 }}>
                <div><label className="form-label">Nom du compte *</label><input className="form-control" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required /></div>
                <div><label className="form-label">Tenant ID *</label><input className="form-control" value={form.tenant_id} onChange={e => setForm(p => ({ ...p, tenant_id: e.target.value }))} required placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" /></div>
                <div><label className="form-label">Client ID *</label><input className="form-control" value={form.client_id} onChange={e => setForm(p => ({ ...p, client_id: e.target.value }))} required /></div>
                <div><label className="form-label">Client Secret *</label><input className="form-control" type="password" value={form.client_secret} onChange={e => setForm(p => ({ ...p, client_secret: e.target.value }))} required /></div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" type="submit" disabled={adding}>{adding ? 'Connexion...' : 'Connecter'}</button>
                <button className="btn btn-ghost" type="button" onClick={() => setShowAdd(false)}>Annuler</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid-4 mb-6">
        {statsLoading ? Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="stat-card"><div className="stat-icon ms"><Skeleton h={24} w={24} /></div><div style={{ flex: 1 }}><Skeleton h={28} w={60} mb={6} /><Skeleton h={12} w={80} /></div></div>
        )) : [
          { v: stats?.totalUsers ?? 0, l: 'Total users', i: 'bi-people-fill', c: 'ms' },
          { v: stats?.active ?? 0, l: 'Actifs', i: 'bi-person-check', c: 'emerald' },
          { v: stats?.disabled ?? 0, l: 'Désactivés', i: 'bi-person-x', c: 'rose' },
          { v: stats?.licensed ?? 0, l: 'Licenciés', i: 'bi-award', c: 'violet' },
        ].map(s => (
          <div key={s.l} className="stat-card">
            <div className={`stat-icon ${s.c}`}><i className={`bi ${s.i}`} /></div>
            <div><div className="stat-value">{s.v}</div><div className="stat-label">{s.l}</div></div>
          </div>
        ))}
      </div>

      {/* Accounts selector */}
      {accounts.length > 0 && (
        <div className="card mb-4">
          <div className="card-header"><i className="bi bi-microsoft" style={{ color: 'var(--ms-blue)' }} /> Comptes connectés ({accounts.length})</div>
          <div className="card-body" style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '12px 16px' }}>
            {accounts.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: a.is_active ? 'rgba(0,164,239,0.12)' : 'var(--bg-secondary)', border: `1px solid ${a.is_active ? 'rgba(0,164,239,0.4)' : 'var(--border)'}`, borderRadius: 10, padding: '6px 12px' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: a.is_active ? '#10b981' : '#6b7280', flexShrink: 0 }} />
                <span style={{ fontSize: '.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{a.name}</span>
                <span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{a.domain || a.tenant_id?.slice(0, 8)}</span>
                {!a.is_active && <button className="btn btn-sm btn-success" style={{ padding: '2px 8px', fontSize: '.7rem' }} onClick={() => activate(a.id)}>Activer</button>}
                <button className="btn btn-sm btn-danger" style={{ padding: '2px 6px', fontSize: '.7rem' }} onClick={() => delAccount(a.id)}><i className="bi bi-trash" /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasActive && !showAdd && (
        <div className="card"><div className="empty-state"><span style={{ fontSize: '2.5rem' }}>⊞</span><h3>Aucun compte Microsoft 365</h3><p>Connectez votre tenant Azure AD pour commencer</p><button className="btn btn-primary" onClick={() => setShowAdd(true)}><i className="bi bi-plus-lg" /> Connecter</button></div></div>
      )}

      {hasActive && (
        <>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20, overflowX: 'auto' }}>
            {TABS.map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ background: 'none', border: 'none', padding: '10px 16px', cursor: 'pointer', color: tab === t ? 'var(--indigo)' : 'var(--text-muted)', fontWeight: tab === t ? 700 : 400, borderBottom: tab === t ? '2px solid var(--indigo)' : '2px solid transparent', marginBottom: -1, whiteSpace: 'nowrap', fontSize: '.85rem' }}>
                <i className={`bi ${tabLabel[t].icon}`} style={{ marginRight: 6 }} />{tabLabel[t].label}
              </button>
            ))}
          </div>

          {/* ── Overview ── */}
          {tab === 'overview' && (
            <div className="grid-3">
              {[
                { t: 'users', icon: '👥', title: 'Utilisateurs', desc: `${stats?.totalUsers ?? '...'} comptes` },
                { t: 'groups', icon: '🏷️', title: 'Groupes', desc: 'Teams & groupes de sécurité' },
                { t: 'domains', icon: '🌐', title: 'Domaines', desc: `${stats?.domainCount ?? '...'} domaines` },
                { t: 'licenses', icon: '🏅', title: 'Licences', desc: `${stats?.licensed ?? '...'} assignées` },
                { t: 'audit', icon: '📋', title: 'Audit logs', desc: 'Logs de connexion & audit' },
                { t: 'mailboxes', icon: '📬', title: 'Mailboxes', desc: 'Boîtes partagées' },
              ].map(a => (
                <button key={a.t} onClick={() => setTab(a.t as Tab)} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 20, textAlign: 'left', cursor: 'pointer', transition: 'all .2s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--indigo)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.transform = ''; }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: 10 }}>{a.icon}</div>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{a.title}</div>
                  <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{a.desc}</div>
                </button>
              ))}
            </div>
          )}

          {/* ── Users ── */}
          {tab === 'users' && (
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <input className="form-control" style={{ maxWidth: 260 }} placeholder="Rechercher..." value={userSearch} onChange={e => setUserSearch(e.target.value)} />
                <button className="btn btn-primary" onClick={() => setShowBulkCreate(true)}><i className="bi bi-plus-lg" /> Créer en masse</button>
                <button className="btn btn-outline" onClick={exportUsers}><i className="bi bi-download" /> Export CSV</button>
                {selectedUsers.size > 0 && (
                  <>
                    <span className="badge badge-info">{selectedUsers.size} sélectionnés</span>
                    <button className="btn btn-sm btn-outline" onClick={() => setShowBulkLicense(true)}><i className="bi bi-award" /> Licence</button>
                    <button className="btn btn-sm btn-danger" onClick={async () => { if (!confirm(`Supprimer ${selectedUsers.size} users ?`)) return; for (const id of selectedUsers) await api.delete(`/microsoft/users/${id}`); setSelectedUsers(new Set()); api.get('/microsoft/users').then(r => { if (r.ok) setUsers(r.data.users || []); }); toast('Supprimés', 'success'); }}>
                      <i className="bi bi-trash" /> Supprimer
                    </button>
                  </>
                )}
              </div>

              {showBulkCreate && (
                <div className="card mb-4">
                  <div className="card-header">Créer des utilisateurs en masse</div>
                  <div className="card-body">
                    <form onSubmit={bulkCreate}>
                      <div className="grid-3" style={{ gap: 10, marginBottom: 12 }}>
                        <div><label className="form-label">Domaine *</label><input className="form-control" value={bulkForm.domain} onChange={e => setBulkForm(p => ({ ...p, domain: e.target.value }))} placeholder="contoso.com" required /></div>
                        <div><label className="form-label">Nombre (max 200)</label><input className="form-control" type="number" min={1} max={200} value={bulkForm.count} onChange={e => setBulkForm(p => ({ ...p, count: e.target.value }))} /></div>
                        <div><label className="form-label">Mot de passe</label><input className="form-control" value={bulkForm.password} onChange={e => setBulkForm(p => ({ ...p, password: e.target.value }))} /></div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-primary" type="submit" disabled={bulkCreating}>{bulkCreating ? 'Création...' : 'Créer'}</button>
                        <button className="btn btn-ghost" type="button" onClick={() => setShowBulkCreate(false)}>Annuler</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {showBulkLicense && (
                <div className="card mb-4">
                  <div className="card-header">Assigner une licence à {selectedUsers.size} utilisateurs</div>
                  <div className="card-body" style={{ display: 'flex', gap: 10 }}>
                    <select className="form-control" value={bulkSku} onChange={e => setBulkSku(e.target.value)}>
                      <option value="">Choisir une licence...</option>
                      {skus.map(s => <option key={s.skuId} value={s.skuId}>{s.skuPartNumber} ({s.consumedUnits}/{s.prepaidUnits?.enabled ?? '?'})</option>)}
                    </select>
                    <button className="btn btn-primary" onClick={bulkLicense} disabled={!bulkSku}>Assigner</button>
                    <button className="btn btn-ghost" onClick={() => setShowBulkLicense(false)}>Annuler</button>
                  </div>
                </div>
              )}

              {showResetPwd && (
                <div className="card mb-4">
                  <div className="card-header">Réinitialiser le mot de passe</div>
                  <div className="card-body" style={{ display: 'flex', gap: 10 }}>
                    <input className="form-control" type="password" placeholder="Nouveau mot de passe" value={newPwd} onChange={e => setNewPwd(e.target.value)} style={{ maxWidth: 300 }} />
                    <button className="btn btn-primary" onClick={resetPassword}>Réinitialiser</button>
                    <button className="btn btn-ghost" onClick={() => { setShowResetPwd(null); setNewPwd(''); }}>Annuler</button>
                  </div>
                </div>
              )}

              {showAssignLicense && (
                <div className="card mb-4">
                  <div className="card-header">Assigner une licence</div>
                  <div className="card-body" style={{ display: 'flex', gap: 10 }}>
                    <select className="form-control" value={selectedSku} onChange={e => setSelectedSku(e.target.value)}>
                      <option value="">Choisir une licence...</option>
                      {skus.map(s => <option key={s.skuId} value={s.skuId}>{s.skuPartNumber}</option>)}
                    </select>
                    <button className="btn btn-primary" onClick={assignLicense} disabled={!selectedSku}>Assigner</button>
                    <button className="btn btn-ghost" onClick={() => { setShowAssignLicense(null); setSelectedSku(''); }}>Annuler</button>
                  </div>
                </div>
              )}

              <div className="card">
                <div className="card-header"><i className="bi bi-people" /> Utilisateurs ({filteredUsers.length}{userSearch ? ` / ${users.length}` : ''})</div>
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: 36 }}><input type="checkbox" checked={selectedUsers.size === filteredUsers.length && filteredUsers.length > 0} onChange={toggleAll} /></th>
                        <th>Email</th><th>Nom</th><th>Statut</th><th>Licences</th><th>Créé le</th><th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usersLoading ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} cols={7} />) :
                        filteredUsers.length === 0 ? <tr><td colSpan={7}><div className="empty-state" style={{ padding: 24 }}><p>Aucun utilisateur</p></div></td></tr> :
                        filteredUsers.map(u => (
                          <tr key={u.id}>
                            <td><input type="checkbox" checked={selectedUsers.has(u.id)} onChange={() => toggleUser(u.id)} /></td>
                            <td style={{ fontSize: '.78rem' }}>{u.userPrincipalName}</td>
                            <td><strong style={{ color: 'var(--text-primary)' }}>{u.displayName}</strong></td>
                            <td><span className={`badge badge-${u.accountEnabled ? 'success' : 'danger'}`}>{u.accountEnabled ? 'Actif' : 'Désactivé'}</span></td>
                            <td><span className={`badge badge-${(u.assignedLicenses?.length || 0) > 0 ? 'info' : 'gray'}`}>{u.assignedLicenses?.length || 0}</span></td>
                            <td style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{u.createdDateTime ? new Date(u.createdDateTime).toLocaleDateString('fr-FR') : '—'}</td>
                            <td>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button className={`btn btn-sm btn-${u.accountEnabled ? 'warning' : 'success'}`} onClick={() => userAction(u.id, u.accountEnabled ? 'disable' : 'enable')} title={u.accountEnabled ? 'Désactiver' : 'Activer'}>
                                  <i className={`bi bi-${u.accountEnabled ? 'pause' : 'play'}`} />
                                </button>
                                <button className="btn btn-sm btn-outline" onClick={() => { setShowResetPwd(u.id); setShowAssignLicense(null); }} title="Reset password"><i className="bi bi-key" /></button>
                                <button className="btn btn-sm btn-outline" onClick={() => { setShowAssignLicense(u.id); setShowResetPwd(null); }} title="Assigner licence"><i className="bi bi-award" /></button>
                                <button className="btn btn-sm btn-danger" onClick={() => { if (confirm(`Supprimer ${u.userPrincipalName} ?`)) userAction(u.id, 'delete'); }} title="Supprimer"><i className="bi bi-trash" /></button>
                              </div>
                            </td>
                          </tr>
                        ))
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Groups ── */}
          {tab === 'groups' && (
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <button className="btn btn-primary" onClick={() => setShowCreateGroup(true)}><i className="bi bi-plus-lg" /> Créer un groupe</button>
              </div>

              {showCreateGroup && (
                <div className="card mb-4">
                  <div className="card-header">Nouveau groupe</div>
                  <div className="card-body">
                    <form onSubmit={createGroup}>
                      <div className="grid-2" style={{ gap: 10, marginBottom: 12 }}>
                        <div><label className="form-label">Nom *</label><input className="form-control" value={groupForm.displayName} onChange={e => setGroupForm(p => ({ ...p, displayName: e.target.value }))} required /></div>
                        <div><label className="form-label">Description</label><input className="form-control" value={groupForm.description} onChange={e => setGroupForm(p => ({ ...p, description: e.target.value }))} /></div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-primary" type="submit">Créer</button>
                        <button className="btn btn-ghost" type="button" onClick={() => setShowCreateGroup(false)}>Annuler</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {showGroupMembers && (
                <div className="card mb-4">
                  <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    Membres du groupe <button className="btn btn-sm btn-ghost" onClick={() => setShowGroupMembers(null)}>✕</button>
                  </div>
                  <div className="card-body">
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <input className="form-control" placeholder="User ID à ajouter" value={addMemberUserId} onChange={e => setAddMemberUserId(e.target.value)} style={{ maxWidth: 360 }} />
                      <button className="btn btn-primary" onClick={() => addMember(showGroupMembers)}>Ajouter</button>
                    </div>
                    <div className="table-wrapper">
                      <table>
                        <thead><tr><th>Email</th><th>Nom</th><th></th></tr></thead>
                        <tbody>
                          {(groupMembers[showGroupMembers] || []).map(m => (
                            <tr key={m.id}>
                              <td style={{ fontSize: '.78rem' }}>{m.userPrincipalName || m.mail}</td>
                              <td>{m.displayName}</td>
                              <td><button className="btn btn-sm btn-danger" onClick={() => removeMember(showGroupMembers, m.id)}><i className="bi bi-trash" /></button></td>
                            </tr>
                          ))}
                          {!(groupMembers[showGroupMembers]?.length) && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 16 }}>Aucun membre</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              <div className="card">
                <div className="card-header"><i className="bi bi-diagram-3" /> Groupes ({groups.length})</div>
                <div className="table-wrapper">
                  <table>
                    <thead><tr><th>Nom</th><th>Type</th><th>Description</th><th>Créé le</th><th>Actions</th></tr></thead>
                    <tbody>
                      {groupsLoading ? Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} cols={5} />) :
                        groups.length === 0 ? <tr><td colSpan={5}><div className="empty-state" style={{ padding: 24 }}><p>Aucun groupe</p></div></td></tr> :
                        groups.map(g => (
                          <tr key={g.id}>
                            <td><strong style={{ color: 'var(--text-primary)' }}>{g.displayName}</strong></td>
                            <td>
                              {g.groupTypes?.includes('Unified') ? <span className="badge badge-info">Team</span>
                                : g.securityEnabled ? <span className="badge badge-warning">Sécurité</span>
                                : <span className="badge badge-gray">Distribution</span>}
                            </td>
                            <td style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{g.description || '—'}</td>
                            <td style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{g.createdDateTime ? new Date(g.createdDateTime).toLocaleDateString('fr-FR') : '—'}</td>
                            <td>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button className="btn btn-sm btn-outline" onClick={() => loadGroupMembers(g.id)}><i className="bi bi-people" /></button>
                                <button className="btn btn-sm btn-danger" onClick={() => deleteGroup(g.id)}><i className="bi bi-trash" /></button>
                              </div>
                            </td>
                          </tr>
                        ))
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Domains ── */}
          {tab === 'domains' && (
            <div>
              {showDns && (
                <div className="card mb-4">
                  <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    DNS Records — {showDns} <button className="btn btn-sm btn-ghost" onClick={() => setShowDns(null)}>✕</button>
                  </div>
                  <div className="table-wrapper">
                    <table>
                      <thead><tr><th>Type</th><th>Nom</th><th>Valeur</th><th>TTL</th></tr></thead>
                      <tbody>
                        {(dnsRecords[showDns] || []).length === 0
                          ? <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>Aucun enregistrement DNS</td></tr>
                          : (dnsRecords[showDns] || []).map((r, i) => (
                            <tr key={i}>
                              <td><span className="badge badge-info">{r.recordType}</span></td>
                              <td style={{ fontSize: '.75rem' }}>{r.label || r.canonicalName || '—'}</td>
                              <td style={{ fontSize: '.72rem', wordBreak: 'break-all' }}>{r.text || r.mailExchange || r.nameServer || '—'}</td>
                              <td style={{ fontSize: '.72rem' }}>{r.ttl ?? '—'}</td>
                            </tr>
                          ))
                        }
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="card">
                <div className="card-header"><i className="bi bi-globe" /> Domaines ({domains.length})</div>
                <div className="table-wrapper">
                  <table>
                    <thead><tr><th>Domaine</th><th>Type</th><th>Vérifié</th><th>Actions</th></tr></thead>
                    <tbody>
                      {domainsLoading ? Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} cols={4} />) :
                        domains.length === 0 ? <tr><td colSpan={4}><div className="empty-state" style={{ padding: 24 }}><p>Aucun domaine</p></div></td></tr> :
                        domains.map(d => (
                          <tr key={d.id}>
                            <td><strong style={{ color: 'var(--text-primary)' }}>{d.id}</strong></td>
                            <td><span className={`badge badge-${d.isDefault ? 'success' : d.isInitial ? 'info' : 'gray'}`}>{d.isDefault ? 'Défaut' : d.isInitial ? 'Initial' : 'Custom'}</span></td>
                            <td><span className={`badge badge-${d.isVerified ? 'success' : 'warning'}`}>{d.isVerified ? 'Vérifié' : 'Non vérifié'}</span></td>
                            <td><button className="btn btn-sm btn-outline" onClick={() => loadDns(d.id)}><i className="bi bi-server" /> DNS</button></td>
                          </tr>
                        ))
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Licenses ── */}
          {tab === 'licenses' && (
            <div className="card">
              <div className="card-header"><i className="bi bi-award" /> Licences abonnées</div>
              <div className="table-wrapper">
                <table>
                  <thead><tr><th>Produit</th><th>SKU ID</th><th>Consommées</th><th>Disponibles</th><th>Statut</th></tr></thead>
                  <tbody>
                    {licensesLoading ? Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} cols={5} />) :
                      skus.length === 0 ? <tr><td colSpan={5}><div className="empty-state" style={{ padding: 24 }}><p>Aucune licence</p></div></td></tr> :
                      skus.map(s => {
                        const total = s.prepaidUnits?.enabled ?? 0;
                        const used = s.consumedUnits ?? 0;
                        const pct = total > 0 ? Math.round((used / total) * 100) : 0;
                        return (
                          <tr key={s.skuId}>
                            <td><strong style={{ color: 'var(--text-primary)' }}>{s.skuPartNumber}</strong></td>
                            <td><code style={{ fontSize: '.68rem' }}>{s.skuId}</code></td>
                            <td>{used}</td>
                            <td>{total - used} / {total}</td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ flex: 1, height: 6, background: 'var(--bg-secondary)', borderRadius: 3, minWidth: 60 }}>
                                  <div style={{ width: `${pct}%`, height: '100%', background: pct > 90 ? 'var(--rose)' : pct > 70 ? '#f59e0b' : 'var(--emerald)', borderRadius: 3 }} />
                                </div>
                                <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{pct}%</span>
                                <span className={`badge badge-${s.capabilityStatus === 'Enabled' ? 'success' : 'warning'}`}>{s.capabilityStatus}</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    }
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Audit ── */}
          {tab === 'audit' && (
            <div>
              <div className="card mb-4">
                <div className="card-header"><i className="bi bi-box-arrow-in-right" /> Logs de connexion ({signInLogs.length})</div>
                <div className="table-wrapper">
                  <table>
                    <thead><tr><th>Utilisateur</th><th>App</th><th>Date</th><th>IP</th><th>Résultat</th></tr></thead>
                    <tbody>
                      {auditLoading ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={5} />) :
                        signInLogs.length === 0 ? <tr><td colSpan={5}><div className="empty-state" style={{ padding: 20 }}><p>Aucun log (permissions Graph beta requises)</p></div></td></tr> :
                        signInLogs.map((l, i) => (
                          <tr key={i}>
                            <td style={{ fontSize: '.78rem' }}>{l.userPrincipalName}</td>
                            <td style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{l.appDisplayName}</td>
                            <td style={{ fontSize: '.72rem' }}>{l.createdDateTime ? new Date(l.createdDateTime).toLocaleString('fr-FR') : '—'}</td>
                            <td style={{ fontSize: '.72rem' }}>{l.ipAddress || '—'}</td>
                            <td><span className={`badge badge-${l.status?.errorCode === 0 ? 'success' : 'danger'}`}>{l.status?.errorCode === 0 ? 'OK' : 'Échec'}</span></td>
                          </tr>
                        ))
                      }
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card">
                <div className="card-header"><i className="bi bi-journal-text" /> Audit logs ({auditLogs.length})</div>
                <div className="table-wrapper">
                  <table>
                    <thead><tr><th>Activité</th><th>Initié par</th><th>Cible</th><th>Date</th><th>Résultat</th></tr></thead>
                    <tbody>
                      {auditLoading ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={5} />) :
                        auditLogs.length === 0 ? <tr><td colSpan={5}><div className="empty-state" style={{ padding: 20 }}><p>Aucun log (permissions Graph beta requises)</p></div></td></tr> :
                        auditLogs.map((l, i) => (
                          <tr key={i}>
                            <td style={{ fontSize: '.78rem' }}>{l.activityDisplayName}</td>
                            <td style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{l.initiatedBy?.user?.userPrincipalName || '—'}</td>
                            <td style={{ fontSize: '.72rem' }}>{l.targetResources?.[0]?.displayName || '—'}</td>
                            <td style={{ fontSize: '.72rem' }}>{l.activityDateTime ? new Date(l.activityDateTime).toLocaleString('fr-FR') : '—'}</td>
                            <td><span className={`badge badge-${l.result === 'success' ? 'success' : 'danger'}`}>{l.result}</span></td>
                          </tr>
                        ))
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Mailboxes ── */}
          {tab === 'mailboxes' && (
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <button className="btn btn-primary" onClick={() => setShowCreateMailbox(true)}><i className="bi bi-plus-lg" /> Créer mailbox partagée</button>
              </div>

              {showCreateMailbox && (
                <div className="card mb-4">
                  <div className="card-header">Nouvelle mailbox partagée</div>
                  <div className="card-body">
                    <form onSubmit={createMailbox}>
                      <div className="grid-2" style={{ gap: 10, marginBottom: 12 }}>
                        <div><label className="form-label">Nom affiché *</label><input className="form-control" value={mailboxForm.displayName} onChange={e => setMailboxForm(p => ({ ...p, displayName: e.target.value }))} required /></div>
                        <div><label className="form-label">Email *</label><input className="form-control" type="email" value={mailboxForm.email} onChange={e => setMailboxForm(p => ({ ...p, email: e.target.value }))} required placeholder="support@contoso.com" /></div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn btn-primary" type="submit">Créer</button>
                        <button className="btn btn-ghost" type="button" onClick={() => setShowCreateMailbox(false)}>Annuler</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              <div className="card">
                <div className="card-header"><i className="bi bi-inbox" /> Boîtes aux lettres partagées ({mailboxes.length})</div>
                <div className="table-wrapper">
                  <table>
                    <thead><tr><th>Nom</th><th>Email</th><th>UPN</th></tr></thead>
                    <tbody>
                      {mailboxesLoading ? Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} cols={3} />) :
                        mailboxes.length === 0 ? <tr><td colSpan={3}><div className="empty-state" style={{ padding: 24 }}><p>Aucune mailbox partagée détectée</p></div></td></tr> :
                        mailboxes.map(m => (
                          <tr key={m.id}>
                            <td><strong style={{ color: 'var(--text-primary)' }}>{m.displayName}</strong></td>
                            <td style={{ fontSize: '.78rem' }}>{m.mail || '—'}</td>
                            <td style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{m.userPrincipalName}</td>
                          </tr>
                        ))
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
