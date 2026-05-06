'use client';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/components/AppLayout';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    const err = await login(username, password);
    if (err) { setError(err); setLoading(false); }
  };

  return (
    <AppLayout>
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'linear-gradient(135deg, #0c0f1a 0%, #111827 50%, #0c0f1a 100%)' }}>
        <div style={{ width:'100%', maxWidth:420, padding:'0 20px' }}>
          {/* Logo */}
          <div style={{ textAlign:'center', marginBottom:36 }}>
            <div style={{ width:56,height:56, background:'linear-gradient(135deg, #6366f1, #8b5cf6)', borderRadius:16, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px', fontSize:'1.6rem', boxShadow:'0 0 30px rgba(99,102,241,0.4)' }}>✉</div>
            <h1 style={{ fontSize:'1.4rem', fontWeight:900, letterSpacing:'-.03em', color:'var(--text-primary)' }}>MailSuite</h1>
            <p style={{ color:'var(--text-muted)', fontSize:'.82rem', marginTop:4 }}>Deliverability Platform</p>
          </div>

          {/* Card */}
          <div className="card" style={{ padding:'36px 32px' }}>
            <h2 style={{ fontSize:'.92rem', fontWeight:700, marginBottom:24, color:'var(--text-secondary)', textAlign:'center', letterSpacing:'.02em', textTransform:'uppercase' }}>Connexion</h2>

            {error && (
              <div style={{ background:'rgba(244,63,94,0.1)', border:'1px solid rgba(244,63,94,0.3)', borderRadius:10, padding:'10px 14px', marginBottom:18, fontSize:'.82rem', color:'#fb7185', display:'flex', alignItems:'center', gap:8 }}>
                ✕ {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom:16 }}>
                <label className="form-label">Utilisateur</label>
                <input className="form-control" value={username} onChange={e => setUsername(e.target.value)} required autoFocus autoComplete="username" />
              </div>
              <div style={{ marginBottom:24 }}>
                <label className="form-label">Mot de passe</label>
                <input className="form-control" type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" />
              </div>
              <button className="btn btn-primary btn-full btn-xl" type="submit" disabled={loading} style={{ position:'relative' }}>
                {loading ? <span className="spin" style={{ width:16,height:16,border:'2px solid rgba(255,255,255,.3)',borderTopColor:'#fff',borderRadius:'50%',display:'inline-block' }} /> : '→ Connexion'}
              </button>
            </form>
          </div>

          <p style={{ textAlign:'center', color:'var(--text-muted)', fontSize:'.72rem', marginTop:20 }}>
            MailSuite v2.0 · Node.js + Next.js
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
