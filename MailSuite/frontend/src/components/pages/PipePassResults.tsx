'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export default function PipePassResults() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'jobs' | 'results'>('jobs');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    loadData();
    // Poll for running jobs
    const interval = setInterval(() => { if (jobs.some(j => j.status === 'running')) loadData(); }, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    const [jobsR, resultsR] = await Promise.all([
      api.get('/pipepass/jobs'),
      api.get('/pipepass/results'),
    ]);
    if (jobsR.ok) setJobs(jobsR.data.jobs || []);
    if (resultsR.ok) setResults(resultsR.data.results || []);
    setLoading(false);
  };

  const downloadJob = (jobId: number) => window.open(`/api/pipepass/results/download/${jobId}`, '_blank');
  const downloadAll = () => window.open('/api/pipepass/results/download-all', '_blank');

  const filteredResults = results.filter(r =>
    !search || r.email?.toLowerCase().includes(search.toLowerCase())
  );

  const statusColor = (s: string) => ({
    running: '#f59e0b', done: '#34d399', error: '#fb7185',
    pending: '#94a3b8', sending: '#6366f1',
  }[s] || '#94a3b8');

  const statusLabel = (s: string) => ({
    running: '⚙️ En cours', done: '✅ Terminé', error: '❌ Erreur',
    pending: '⏳ En attente', sending: '📤 Envoi',
  }[s] || s);

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <h1>
              <span style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', borderRadius: 12, width: 36, height: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', marginRight: 10 }}>🔐</span>
              PipePass — Résultats 2FA
            </h1>
            <p>Fichiers 2FA + App Password générés par PipePass</p>
          </div>
          {results.length > 0 && (
            <button
              onClick={downloadAll}
              style={{
                padding: '10px 20px', borderRadius: 12, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: '#fff', fontWeight: 800, fontSize: '.82rem',
                boxShadow: '0 4px 20px rgba(16,185,129,0.4)',
              }}
            >
              ⬇️ Télécharger tout ({results.length})
            </button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Jobs total', value: jobs.length, icon: '📋', color: '#6366f1' },
          { label: 'En cours', value: jobs.filter(j => j.status === 'running').length, icon: '⚙️', color: '#f59e0b' },
          { label: 'Terminés', value: jobs.filter(j => j.status === 'done').length, icon: '✅', color: '#10b981' },
          { label: 'Résultats 2FA', value: results.length, icon: '🔐', color: '#8b5cf6' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontSize: '1.6rem' }}>{s.icon}</div>
            <div>
              <div style={{ fontSize: '1.5rem', fontWeight: 900, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--bg-card)', borderRadius: 12, padding: 4, width: 'fit-content', border: '1px solid var(--border)' }}>
        {(['jobs', 'results'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '8px 20px', borderRadius: 9, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: '.82rem',
            background: activeTab === tab ? 'rgba(99,102,241,0.15)' : 'transparent',
            color: activeTab === tab ? '#818cf8' : 'var(--text-muted)',
            transition: 'all .15s',
          }}>
            {tab === 'jobs' ? `📋 Jobs (${jobs.length})` : `🔐 Résultats 2FA (${results.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div className="spin" style={{ width: 32, height: 32, border: '3px solid rgba(99,102,241,.2)', borderTopColor: '#6366f1', borderRadius: '50%', display: 'inline-block' }} />
        </div>
      ) : activeTab === 'jobs' ? (
        /* ── Jobs tab ── */
        <div className="card">
          <div className="table-wrapper">
            {jobs.length === 0 ? (
              <div className="empty-state" style={{ padding: 60 }}>
                <span style={{ fontSize: '2.5rem' }}>📭</span>
                <p>Aucun job PipePass pour l'instant</p>
                <p style={{ fontSize: '.78rem' }}>Exportez des utilisateurs depuis la page "Créer users"</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>#</th><th>Batch</th><th>Serveur</th><th>Utilisateurs</th><th>Status</th><th>Créé le</th><th>Terminé</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job: any) => (
                    <tr key={job.id}>
                      <td style={{ color: 'var(--text-muted)', fontSize: '.75rem' }}>#{job.id}</td>
                      <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{job.batch_name || '—'}</td>
                      <td style={{ fontSize: '.72rem', color: 'var(--text-secondary)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {job.server_url}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>{job.user_count}</td>
                      <td>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '3px 10px', borderRadius: 20, fontSize: '.72rem', fontWeight: 700,
                          background: `${statusColor(job.status)}22`, color: statusColor(job.status),
                        }}>
                          {job.status === 'running' && <span className="spin" style={{ width: 10, height: 10, border: '2px solid rgba(245,158,11,.3)', borderTopColor: '#f59e0b', borderRadius: '50%', display: 'inline-block' }} />}
                          {statusLabel(job.status)}
                        </span>
                      </td>
                      <td style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
                        {job.created_at ? new Date(job.created_at).toLocaleString('fr') : '—'}
                      </td>
                      <td style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
                        {job.finished_at ? new Date(job.finished_at).toLocaleString('fr') : '—'}
                      </td>
                      <td>
                        {job.status === 'done' && (
                          <button className="btn btn-sm btn-success" onClick={() => downloadJob(job.id)} style={{ fontSize: '.7rem' }}>
                            ⬇️ CSV
                          </button>
                        )}
                        {job.status === 'running' && (
                          <span style={{ fontSize: '.7rem', color: '#f59e0b' }}>En traitement...</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
        /* ── Results tab ── */
        <div className="card">
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>🔐 Résultats 2FA &amp; App Password</span>
            <input
              className="form-control"
              placeholder="Rechercher un email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: 240, fontSize: '.8rem' }}
            />
          </div>
          <div className="table-wrapper" style={{ maxHeight: 500, overflowY: 'auto' }}>
            {filteredResults.length === 0 ? (
              <div className="empty-state" style={{ padding: 60 }}>
                <span style={{ fontSize: '2.5rem' }}>🔐</span>
                <p>Aucun résultat 2FA reçu</p>
                <p style={{ fontSize: '.78rem' }}>Les résultats apparaissent ici après que PipePass termine le traitement</p>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Email</th><th>Password</th><th>Secret 2FA (TOTP)</th><th>App Password</th><th>Batch</th><th>Importé</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResults.map((r: any) => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{r.email}</td>
                      <td><code style={{ fontSize: '.72rem' }}>{r.password}</code></td>
                      <td>
                        <code style={{ fontSize: '.7rem', color: '#a78bfa', background: 'rgba(139,92,246,0.1)', padding: '2px 6px', borderRadius: 4 }}>
                          {r.fa_secret || '—'}
                        </code>
                      </td>
                      <td>
                        <code style={{ fontSize: '.7rem', color: '#34d399', background: 'rgba(16,185,129,0.1)', padding: '2px 6px', borderRadius: 4 }}>
                          {r.app_password || '—'}
                        </code>
                      </td>
                      <td style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{r.batch_name || '—'}</td>
                      <td style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>
                        {r.imported_at ? new Date(r.imported_at).toLocaleString('fr') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
