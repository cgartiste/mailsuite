'use client';
import { useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export default function GWConnect() {
  const [creds, setCreds] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ name: '', admin_email: '' });
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const load = () => api.get('/gworkspace/credentials').then(r => { if (r.ok) setCreds(r.data.credentials || []); setLoading(false); });
  useEffect(() => { load(); }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || !form.admin_email) return toast('Fichier et email requis', 'error');
    setUploading(true);
    const fd = new FormData();
    fd.append('json_file', file);
    fd.append('admin_email', form.admin_email);
    fd.append('name', form.name || form.admin_email.split('@')[1]);
    const r = await api.upload('/gworkspace/credentials', fd);
    toast(r.ok ? '✓ Compte connecté avec succès' : r.data?.error || 'Erreur', r.ok ? 'success' : 'error');
    setUploading(false);
    if (r.ok) { setForm({ name:'', admin_email:'' }); if (fileRef.current) fileRef.current.value = ''; load(); }
  };

  const activate = async (id: number) => {
    const r = await api.patch(`/gworkspace/credentials/${id}/activate`);
    toast(r.ok ? 'Activé' : r.data?.error, r.ok ? 'success' : 'error');
    if (r.ok) load();
  };

  const del = async (id: number) => {
    if (!confirm('Supprimer ce compte ?')) return;
    const r = await api.delete(`/gworkspace/credentials/${id}`);
    toast(r.ok ? 'Supprimé' : r.data?.error, r.ok ? 'success' : 'error');
    if (r.ok) setCreds(p => p.filter(c => c.id !== id));
  };

  const test = async (id: number) => {
    toast('Test en cours...', 'info');
    const r = await api.post(`/gworkspace/credentials/${id}/test`);
    toast(r.ok && r.data.success ? '✓ Connexion OK' : `✕ Échec: ${r.data?.error || 'Erreur'}`, r.data?.success ? 'success' : 'error');
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div><h1><i className="bi bi-plug text-google" /> Connexion Google Workspace</h1><p>Uploadez vos fichiers JSON de service account</p></div>
        </div>
      </div>

      <div className="grid-2 mb-6">
        {/* Upload form */}
        <div className="card">
          <div className="card-header"><i className="bi bi-cloud-upload" /> Ajouter un compte</div>
          <div className="card-body">
            <form onSubmit={handleUpload}>
              <div style={{ marginBottom:14 }}>
                <label className="form-label">Nom du compte</label>
                <input className="form-control" value={form.name} onChange={e => setForm(p => ({...p,name:e.target.value}))} placeholder="Mon compte GW" />
              </div>
              <div style={{ marginBottom:14 }}>
                <label className="form-label">Email admin (super admin) *</label>
                <input className="form-control" type="email" value={form.admin_email} onChange={e => setForm(p => ({...p,admin_email:e.target.value}))} required placeholder="admin@domaine.com" />
              </div>
              <div style={{ marginBottom:20 }}>
                <label className="form-label">Fichier JSON (service account) *</label>
                <div onClick={() => fileRef.current?.click()} style={{ border:'2px dashed var(--border-hover)',borderRadius:12,padding:'28px 20px',textAlign:'center',cursor:'pointer',transition:'border-color .2s',background:'rgba(255,255,255,0.02)' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor='var(--indigo)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor='var(--border-hover)')}>
                  <div style={{ fontSize:'2rem', marginBottom:8 }}>📄</div>
                  <div style={{ fontSize:'.82rem',color:'var(--text-muted)' }}>Cliquez ou glissez le fichier JSON</div>
                  <input ref={fileRef} type="file" accept=".json,application/json" style={{ display:'none' }} />
                </div>
              </div>
              <button className="btn btn-primary btn-full btn-lg" type="submit" disabled={uploading}>
                {uploading ? <span className="spin" style={{ width:16,height:16,border:'2px solid rgba(255,255,255,.3)',borderTopColor:'#fff',borderRadius:'50%',display:'inline-block' }} /> : <><i className="bi bi-plug" /> Connecter</>}
              </button>
            </form>
          </div>
        </div>

        {/* Guide */}
        <div className="card">
          <div className="card-header"><i className="bi bi-info-circle" /> Guide de configuration</div>
          <div className="card-body" style={{ fontSize:'.84rem',lineHeight:1.9,color:'var(--text-secondary)' }}>
            <strong style={{ color:'var(--text-primary)' }}>Étapes pour connecter Google Workspace :</strong>
            <ol style={{ marginLeft:18,marginTop:10 }}>
              <li>Créez un projet dans <a href="https://console.cloud.google.com" target="_blank" style={{ color:'var(--google-blue)' }}>Google Cloud Console</a></li>
              <li>Activez l'<strong>Admin SDK API</strong></li>
              <li>Créez un <strong>Service Account</strong> avec délégation de domaine</li>
              <li>Dans <a href="https://admin.google.com" target="_blank" style={{ color:'var(--google-blue)' }}>Google Admin</a>, autorisez les scopes OAuth</li>
              <li>Téléchargez la clé JSON et uploadez-la ici</li>
            </ol>
            <div style={{ marginTop:16, padding:'12px 14px', background:'rgba(66,133,244,0.08)', border:'1px solid rgba(66,133,244,0.2)', borderRadius:10, fontSize:'.78rem', color:'var(--text-muted)' }}>
              <strong style={{ color:'var(--google-blue)' }}>ℹ️ Important :</strong> L'email admin doit être un super-administrateur du domaine. Les scopes requis : Admin SDK, Directory API.
            </div>
          </div>
        </div>
      </div>

      {/* Credentials list */}
      <div className="card">
        <div className="card-header"><i className="bi bi-list-ul" /> Comptes enregistrés ({creds.length})</div>
        <div className="table-wrapper">
          {loading ? <div style={{ padding:32,textAlign:'center' }}><div className="spin" style={{ width:24,height:24,border:'3px solid rgba(66,133,244,.3)',borderTopColor:'#4285F4',borderRadius:'50%',display:'inline-block' }} /></div> : (
            <table>
              <thead><tr><th>Nom</th><th>Domaine</th><th>Admin</th><th>Project ID</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {creds.map((c: any) => (
                  <tr key={c.id}>
                    <td><strong style={{ color:'var(--text-primary)' }}>{c.name}</strong></td>
                    <td><span className="badge badge-google">{c.domain}</span></td>
                    <td style={{ fontSize:'.78rem' }}>{c.admin_email}</td>
                    <td><code style={{ fontSize:'.7rem' }}>{c.project_id || '—'}</code></td>
                    <td><span className={`badge badge-${c.is_active ? 'success' : 'gray'}`}>{c.is_active ? '● Actif' : '○ Inactif'}</span></td>
                    <td><div style={{ display:'flex',gap:6 }}>
                      {!c.is_active && <button className="btn btn-sm btn-success" onClick={() => activate(c.id)}>Activer</button>}
                      <button className="btn btn-sm btn-outline" onClick={() => test(c.id)} title="Tester"><i className="bi bi-wifi" /></button>
                      <button className="btn btn-sm btn-danger" onClick={() => del(c.id)}><i className="bi bi-trash" /></button>
                    </div></td>
                  </tr>
                ))}
                {!creds.length && <tr><td colSpan={6}><div className="empty-state" style={{ padding:24 }}><p>Aucun compte — uploadez votre premier JSON</p></div></td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
