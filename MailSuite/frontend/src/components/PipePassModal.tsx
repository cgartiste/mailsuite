'use client';
import { useEffect, useState, useRef } from 'react';
import api from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

interface Server { id: number; name: string; url: string; status: string; last_seen: string; }

interface ExportModalProps {
  users: { email: string; password: string }[];
  onClose: () => void;
}

export default function PipePassExportModal({ users, onClose }: ExportModalProps) {
  const [servers, setServers] = useState<Server[]>([]);
  const [selectedServer, setSelectedServer] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [addingServer, setAddingServer] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [pingResult, setPingResult] = useState<{online: boolean; data?: any} | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadServers();
    // Auto-refresh every 5s: new PipePass servers appear as soon as they register
    const interval = setInterval(loadServers, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadServers = async () => {
    const r = await api.get('/pipepass/servers');
    if (r.ok) setServers(r.data.servers || []);
  };

  const pingAll = async () => {
    setPinging(true);
    await api.post('/pipepass/servers/ping', {});
    await loadServers();
    setPinging(false);
    toast('Serveurs vérifiés', 'success');
  };

  const pingCustom = async () => {
    if (!customUrl) return;
    setPinging(true);
    const r = await api.post('/pipepass/ping-url', { url: customUrl });
    setPingResult(r.data);
    setPinging(false);
  };

  const addServer = async () => {
    if (!newName || !newUrl) return;
    const r = await api.post('/pipepass/servers', { name: newName, url: newUrl });
    if (r.ok) { toast('Serveur ajouté', 'success'); setNewName(''); setNewUrl(''); setAddingServer(false); await loadServers(); }
    else toast(r.data?.error || 'Erreur', 'error');
  };

  const doExport = async () => {
    const targetUrl = useCustom ? customUrl : selectedServer;
    if (!targetUrl) return toast('Sélectionnez un serveur PipePass', 'warning');
    if (!users.length) return toast('Aucun utilisateur à exporter', 'warning');
    setExporting(true);
    const r = await api.post('/pipepass/export', {
      server_url: targetUrl,
      users,
      batch_name: `batch_${new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', 'h')}`,
    });
    if (r.ok) {
      toast(`✓ ${users.length} utilisateurs envoyés à PipePass — Job #${r.data.job_db_id}`, 'success');
      onClose();
    } else {
      toast(r.data?.error || 'Erreur lors de l\'export', 'error');
    }
    setExporting(false);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 20, padding: 32, width: '100%', maxWidth: 580,
        boxShadow: '0 25px 80px rgba(0,0,0,0.5)',
        animation: 'fadeInScale .2s ease',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>🔐</span>
              Exporter pour 2FA &amp; App Password
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '.78rem', margin: '4px 0 0 46px' }}>
              {users.length} utilisateur{users.length > 1 ? 's' : ''} · PipePass / BulkApp 2.0
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.3rem', padding: 4 }}>✕</button>
        </div>

        {/* Users preview */}
        <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 12, padding: '10px 14px', marginBottom: 20 }}>
          <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '.05em' }}>
            Utilisateurs à traiter
          </div>
          <div style={{ maxHeight: 100, overflowY: 'auto', fontSize: '.75rem', color: 'var(--text-secondary)' }}>
            {users.slice(0, 8).map(u => (
              <div key={u.email} style={{ padding: '2px 0', borderBottom: '1px solid rgba(99,102,241,0.1)', display: 'flex', justifyContent: 'space-between' }}>
                <span>{u.email}</span>
                <code style={{ opacity: 0.5 }}>{u.password}</code>
              </div>
            ))}
            {users.length > 8 && <div style={{ textAlign: 'center', padding: '4px 0', opacity: 0.5 }}>+ {users.length - 8} autres</div>}
          </div>
        </div>

        {/* Server selection mode */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button onClick={() => setUseCustom(false)} style={{
            flex: 1, padding: '8px 0', borderRadius: 10, border: `2px solid ${!useCustom ? '#6366f1' : 'var(--border)'}`,
            background: !useCustom ? 'rgba(99,102,241,0.1)' : 'transparent', color: !useCustom ? '#6366f1' : 'var(--text-muted)',
            cursor: 'pointer', fontWeight: 700, fontSize: '.78rem',
          }}>📋 Serveurs enregistrés</button>
          <button onClick={() => setUseCustom(true)} style={{
            flex: 1, padding: '8px 0', borderRadius: 10, border: `2px solid ${useCustom ? '#6366f1' : 'var(--border)'}`,
            background: useCustom ? 'rgba(99,102,241,0.1)' : 'transparent', color: useCustom ? '#6366f1' : 'var(--text-muted)',
            cursor: 'pointer', fontWeight: 700, fontSize: '.78rem',
          }}>🔗 URL personnalisée</button>
        </div>

        {!useCustom ? (
          <div>
            {/* Server list header with live indicator */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label className="form-label" style={{ margin: 0 }}>Serveurs PipePass détectés</label>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '.68rem', color: '#34d399', background: 'rgba(16,185,129,0.1)', padding: '2px 8px', borderRadius: 20 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#34d399', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
                  Détection auto
                </span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-sm btn-outline" onClick={pingAll} disabled={pinging} style={{ fontSize: '.72rem' }}>
                  {pinging ? '⏳' : '🔄'} Vérifier
                </button>
                <button className="btn btn-sm btn-outline" onClick={() => setAddingServer(p => !p)} style={{ fontSize: '.72rem' }}>
                  ➕ Ajouter manuellement
                </button>
              </div>
            </div>

            {addingServer && (
              <div style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input className="form-control" placeholder="Nom (ex: Serveur maison)" value={newName} onChange={e => setNewName(e.target.value)} style={{ flex: 1, fontSize: '.8rem' }} />
                  <input className="form-control" placeholder="URL (ex: http://192.168.1.50:5000)" value={newUrl} onChange={e => setNewUrl(e.target.value)} style={{ flex: 2, fontSize: '.8rem' }} />
                </div>
                <button className="btn btn-success btn-sm" onClick={addServer} style={{ width: '100%', fontSize: '.78rem' }}>Enregistrer</button>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16, maxHeight: 180, overflowY: 'auto' }}>
              {servers.length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px 10px', color: 'var(--text-muted)', fontSize: '.8rem', border: '2px dashed rgba(99,102,241,0.2)', borderRadius: 10 }}>
                  <div style={{ fontSize: '2rem', marginBottom: 8 }}>🔍</div>
                  <div style={{ fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>En attente d'un PipePass...</div>
                  <div style={{ fontSize: '.72rem', lineHeight: 1.6 }}>
                    Démarrez PipePass sur votre VPS avec<br />
                    <code style={{ background: 'rgba(99,102,241,0.1)', padding: '2px 6px', borderRadius: 4, color: '#818cf8' }}>
                      MAILSUITE_URLS=http://{typeof window !== 'undefined' ? window.location.hostname : '..'}:5050
                    </code><br />
                    Il apparaîtra automatiquement ici ✨
                  </div>
                </div>
              )}
              {servers.map(srv => (
                <div key={srv.id} onClick={() => setSelectedServer(srv.url)} style={{
                  padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                  border: `2px solid ${selectedServer === srv.url ? '#6366f1' : 'var(--border)'}`,
                  background: selectedServer === srv.url ? 'rgba(99,102,241,0.1)' : 'var(--bg-hover)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'all .15s',
                }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '.82rem', color: 'var(--text-primary)' }}>{srv.name}</div>
                    <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{srv.url}</div>
                  </div>
                  <span style={{
                    fontSize: '.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                    background: srv.status === 'online' ? 'rgba(16,185,129,0.15)' : srv.status === 'offline' ? 'rgba(244,63,94,0.15)' : 'rgba(148,163,184,0.15)',
                    color: srv.status === 'online' ? '#34d399' : srv.status === 'offline' ? '#fb7185' : 'var(--text-muted)',
                  }}>
                    {srv.status === 'online' ? '🟢 En ligne' : srv.status === 'offline' ? '🔴 Hors ligne' : '⚪ Inconnu'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: 16 }}>
            <label className="form-label">URL du serveur PipePass</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="form-control" placeholder="http://192.168.1.100:5000" value={customUrl} onChange={e => setCustomUrl(e.target.value)} />
              <button className="btn btn-outline btn-sm" onClick={pingCustom} disabled={pinging} style={{ whiteSpace: 'nowrap' }}>
                {pinging ? '⏳' : '🔄'} Tester
              </button>
            </div>
            {pingResult !== null && (
              <div style={{ marginTop: 8, fontSize: '.75rem', padding: '6px 10px', borderRadius: 8, background: pingResult.online ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)', color: pingResult.online ? '#34d399' : '#fb7185' }}>
                {pingResult.online ? `✅ En ligne — PipePass ${pingResult.data?.version || ''}` : '❌ Serveur non joignable'}
              </div>
            )}
          </div>
        )}

        {/* Export button */}
        <button className="btn btn-primary btn-full" onClick={doExport} disabled={exporting || (!selectedServer && !customUrl)} style={{
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          border: 'none', padding: '14px', fontSize: '.9rem', fontWeight: 800,
          borderRadius: 12, transition: 'all .2s',
          opacity: exporting || (!selectedServer && !customUrl) ? 0.6 : 1,
        }}>
          {exporting ? (
            <><span className="spin" style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', marginRight: 8 }} />Envoi en cours...</>
          ) : `🚀 Exporter ${users.length} utilisateurs vers PipePass`}
        </button>

        <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '.7rem', marginTop: 12 }}>
          PipePass activera le 2FA et créera les app-passwords automatiquement · Résultats reçus par callback
        </p>
      </div>
    </div>
  );
}
