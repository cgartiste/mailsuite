'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export default function GW2FA() {
  const [items, setItems] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', totp_secret: '', app_password: '', notes: '' });
  const { toast } = useToast();

  const load = () => api.get(`/gworkspace/totp${search ? `?search=${search}` : ''}`).then(r => { if (r.ok) setItems(r.data.items || []); });
  useEffect(() => { load(); }, [search]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await api.post('/gworkspace/totp', form);
    toast(r.ok ? 'Secret TOTP ajouté' : r.data?.error, r.ok ? 'success' : 'error');
    if (r.ok) { setShowAdd(false); setForm({ email:'',password:'',totp_secret:'',app_password:'',notes:'' }); load(); }
  };

  const del = async (id: number, email: string) => {
    if (!confirm(`Supprimer ${email} ?`)) return;
    const r = await api.delete(`/gworkspace/totp/${id}`);
    toast(r.ok ? 'Supprimé' : r.data?.error, r.ok ? 'success' : 'error');
    if (r.ok) setItems(p => p.filter(i => i.id !== id));
  };

  const getOtpColor = (rem: number) => rem > 15 ? '#34d399' : rem > 8 ? '#fbbf24' : '#fb7185';

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div><h1><i className="bi bi-shield-lock" style={{ color: '#818cf8' }} /> 2FA & TOTP</h1><p>Gestionnaire de secrets — {items.length} compte(s)</p></div>
          <button className="btn btn-primary" onClick={() => setShowAdd(!showAdd)}><i className="bi bi-plus-lg" /> Ajouter</button>
        </div>
      </div>

      {showAdd && (
        <div className="card mb-4">
          <div className="card-header"><i className="bi bi-plus-circle" /> Nouveau secret TOTP</div>
          <div className="card-body">
            <form onSubmit={add}>
              <div className="grid-3" style={{ gap:12,marginBottom:12 }}>
                <div><label className="form-label">Email *</label><input className="form-control" value={form.email} onChange={e => setForm(p => ({...p,email:e.target.value}))} required /></div>
                <div><label className="form-label">Mot de passe</label><input className="form-control" value={form.password} onChange={e => setForm(p => ({...p,password:e.target.value}))} /></div>
                <div><label className="form-label">Secret TOTP (Base32)</label><input className="form-control" value={form.totp_secret} onChange={e => setForm(p => ({...p,totp_secret:e.target.value}))} placeholder="JBSWY3DPEHPK3PXP..." /></div>
                <div><label className="form-label">App Password</label><input className="form-control" value={form.app_password} onChange={e => setForm(p => ({...p,app_password:e.target.value}))} /></div>
                <div style={{ gridColumn:'span 2' }}><label className="form-label">Notes</label><input className="form-control" value={form.notes} onChange={e => setForm(p => ({...p,notes:e.target.value}))} /></div>
              </div>
              <div style={{ display:'flex',gap:8 }}>
                <button className="btn btn-primary" type="submit">Ajouter</button>
                <button className="btn btn-ghost" type="button" onClick={() => setShowAdd(false)}>Annuler</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card mb-4">
        <div className="card-body" style={{ padding:'12px 20px' }}>
          <input className="form-control" style={{ maxWidth:320 }} placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="card">
        <div className="table-wrapper">
          <table>
            <thead><tr><th>Email</th><th>Mot de passe</th><th>OTP</th><th>Temps</th><th>App Password</th><th>Notes</th><th>Actions</th></tr></thead>
            <tbody>
              {items.map((i: any) => (
                <tr key={i.id}>
                  <td style={{ fontWeight:600,color:'var(--text-primary)' }}>{i.email}</td>
                  <td><code style={{ fontSize:'.72rem' }}>{i.password || '—'}</code></td>
                  <td>{i.otp_code ? <span style={{ fontFamily:'monospace',fontWeight:900,fontSize:'1.1rem',letterSpacing:'.2em',color:getOtpColor(i.otp_remaining||30) }}>{i.otp_code}</span> : <span className="text-muted">—</span>}</td>
                  <td>{i.otp_remaining ? <span className="badge" style={{ background:getOtpColor(i.otp_remaining)+'22',color:getOtpColor(i.otp_remaining),border:`1px solid ${getOtpColor(i.otp_remaining)}44` }}>{i.otp_remaining}s</span> : '—'}</td>
                  <td><code style={{ fontSize:'.72rem' }}>{i.app_password || '—'}</code></td>
                  <td style={{ fontSize:'.75rem',color:'var(--text-muted)' }}>{i.notes || '—'}</td>
                  <td><button className="btn btn-sm btn-danger" onClick={() => del(i.id, i.email)}><i className="bi bi-trash" /></button></td>
                </tr>
              ))}
              {!items.length && <tr><td colSpan={7}><div className="empty-state" style={{ padding:32 }}><span style={{ fontSize:'2rem' }}>🔐</span><p>Aucun secret TOTP</p></div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
