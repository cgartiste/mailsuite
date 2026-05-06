'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

export default function GWDomainChange() {
  const [domains, setDomains] = useState<any[]>([]);
  const [srcDomain, setSrcDomain] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [targetDomain, setTargetDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [changing, setChanging] = useState(false);
  const { toast } = useToast();

  useEffect(() => { api.get('/gworkspace/domains').then(r => { if (r.ok) setDomains(r.data.domains || []); }); }, []);

  useEffect(() => {
    if (!srcDomain) { setUsers([]); setSelected(new Set()); return; }
    setLoading(true);
    api.get(`/gworkspace/users?domain=${srcDomain}`).then(r => {
      if (r.ok) { setUsers(r.data.users || []); setSelected(new Set(r.data.users?.map((u: any) => u.primaryEmail) || [])); }
      setLoading(false);
    });
  }, [srcDomain]);

  const toggle = (email: string) => setSelected(p => { const s = new Set(p); s.has(email) ? s.delete(email) : s.add(email); return s; });
  const toggleAll = () => setSelected(selected.size === users.length ? new Set() : new Set(users.map(u => u.primaryEmail)));

  const migrate = async () => {
    if (!targetDomain) return toast('Sélectionnez un domaine cible', 'warning');
    if (!selected.size) return toast('Sélectionnez des utilisateurs', 'warning');
    setChanging(true);
    // Batch migrate
    let ok = 0, fail = 0;
    for (const email of selected) {
      const newEmail = email.replace(`@${srcDomain}`, `@${targetDomain}`);
      const r = await api.patch(`/gworkspace/users/${encodeURIComponent(email)}/reset-password`, { primaryEmail: newEmail });
      r.ok ? ok++ : fail++;
    }
    toast(`Migration: ${ok} réussis, ${fail} échoués`, ok > 0 ? 'success' : 'error');
    setChanging(false);
  };

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div><h1><i className="bi bi-arrow-left-right text-google" /> Changer de domaine</h1><p>Migration d'utilisateurs entre domaines GW</p></div>
        </div>
      </div>

      {/* Source domain */}
      <div className="card mb-4">
        <div className="card-body" style={{ padding:'16px 20px',display:'flex',alignItems:'center',gap:12 }}>
          <label className="form-label" style={{ margin:0,whiteSpace:'nowrap' }}>Domaine source:</label>
          <select className="form-select" style={{ maxWidth:280 }} value={srcDomain} onChange={e => setSrcDomain(e.target.value)}>
            <option value="">Sélectionner...</option>
            {domains.map((d: any) => <option key={d.domainName} value={d.domainName}>{d.domainName}</option>)}
          </select>
          {srcDomain && <span className="text-muted" style={{ fontSize:'.78rem' }}>{users.length} utilisateur(s)</span>}
        </div>
      </div>

      {srcDomain && (
        <>
          {loading ? <div style={{ padding:40,textAlign:'center' }}><div className="spin" style={{ width:28,height:28,border:'3px solid rgba(66,133,244,.3)',borderTopColor:'#4285F4',borderRadius:'50%',display:'inline-block' }} /></div> : (
            <div className="card mb-4">
              <div className="card-header" style={{ justifyContent:'space-between' }}>
                <span><i className="bi bi-people" /> Utilisateurs sur {srcDomain}</span>
                <label style={{ display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:'.8rem',fontWeight:400,color:'var(--text-secondary)' }}>
                  <input type="checkbox" checked={selected.size === users.length && users.length > 0} onChange={toggleAll} />
                  Tout sélectionner
                </label>
              </div>
              <div className="table-wrapper" style={{ maxHeight:360,overflowY:'auto' }}>
                <table><thead><tr><th style={{ width:40 }}></th><th>Email</th><th>Nom</th><th>Status</th></tr></thead>
                <tbody>{users.map((u: any) => (
                  <tr key={u.primaryEmail} style={{ cursor:'pointer' }} onClick={() => toggle(u.primaryEmail)}>
                    <td><input type="checkbox" checked={selected.has(u.primaryEmail)} onChange={() => {}} /></td>
                    <td style={{ fontWeight:500,color:'var(--text-primary)' }}>{u.primaryEmail}</td>
                    <td>{u.name?.fullName || '—'}</td>
                    <td><span className={`badge badge-${u.suspended ? 'danger' : 'success'}`}>{u.suspended ? 'Suspendu' : 'Actif'}</span></td>
                  </tr>
                ))}</tbody></table>
              </div>

              {/* Target + action */}
              <div style={{ padding:'14px 20px',borderTop:'1px solid var(--border)',display:'flex',gap:10,alignItems:'center',flexWrap:'wrap' }}>
                <select className="form-select" style={{ width:240 }} value={targetDomain} onChange={e => setTargetDomain(e.target.value)}>
                  <option value="">Domaine cible...</option>
                  {domains.filter((d: any) => d.domainName !== srcDomain).map((d: any) => <option key={d.domainName} value={d.domainName}>{d.domainName}</option>)}
                </select>
                <button className="btn btn-primary" disabled={changing || !selected.size || !targetDomain} onClick={migrate}>
                  {changing ? 'Migration...' : `Migrer ${selected.size} utilisateur(s) →`}
                </button>
                <span className="text-muted" style={{ fontSize:'.75rem' }}>{selected.size} sélectionné(s)</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
