'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { useToast } from '@/contexts/ToastContext';

// Paramètres que l'on veut mettre en avant
const HIGHLIGHT_SETTINGS = ['always_use_https', 'brotli', 'minification', 'ssl', 'security_level', 'rocket_loader'];

function SettingToggle({ id, setting, onChange, disabled }: { id: string, setting: any, onChange: (val: any) => void, disabled: boolean }) {
  if (id === 'ssl') {
    return (
      <select className="form-control" value={setting.value} onChange={e => onChange(e.target.value)} disabled={disabled || !setting.editable}>
        <option value="off">Off</option>
        <option value="flexible">Flexible</option>
        <option value="full">Full</option>
        <option value="strict">Full (Strict)</option>
      </select>
    );
  }
  
  if (id === 'security_level') {
    return (
      <select className="form-control" value={setting.value} onChange={e => onChange(e.target.value)} disabled={disabled || !setting.editable}>
        <option value="essentially_off">Essentially Off</option>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
        <option value="under_attack">Under Attack</option>
      </select>
    );
  }

  // Booleans (on/off)
  if (setting.value === 'on' || setting.value === 'off') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: disabled || !setting.editable ? 'not-allowed' : 'pointer' }}>
        <input 
          type="checkbox" 
          checked={setting.value === 'on'} 
          onChange={e => onChange(e.target.checked ? 'on' : 'off')}
          disabled={disabled || !setting.editable}
        />
        <span style={{ fontSize: '.8rem', color: setting.value === 'on' ? '#34d399' : 'var(--text-muted)', fontWeight: setting.value === 'on' ? 700 : 400 }}>
          {setting.value === 'on' ? 'Activé' : 'Désactivé'}
        </span>
      </label>
    );
  }

  // Fallback text
  return (
    <input 
      className="form-control" 
      value={typeof setting.value === 'string' ? setting.value : JSON.stringify(setting.value)} 
      disabled 
      title="Modification via API non supportée pour ce type complexe" 
    />
  );
}

export default function CfZoneSettings() {
  const { zid } = useParams<{ zid: string }>();
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [rawSettings, setRawSettings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const r = await api.get(`/cloudflare/zones/${zid}/settings`);
    if (r.ok && r.data.success) {
      setSettings(r.data.settings);
      setRawSettings(r.data.raw || []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updateSetting = async (id: string, value: any) => {
    setUpdating(id);
    const r = await api.patch(`/cloudflare/zones/${zid}/settings/${id}`, { value });
    if (r.ok && r.data.success) {
      toast(`Paramètre ${id} mis à jour`, 'success');
      setSettings(prev => ({ ...prev, [id]: { ...prev[id], value } }));
    } else {
      toast(r.data?.errors?.[0]?.message || 'Erreur mise à jour', 'error');
    }
    setUpdating(null);
  };

  const filteredRaw = rawSettings.filter(s => s.id.includes(search.toLowerCase()));

  return (
    <div>
      <div className="page-header">
        <div className="page-header-row">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Link href="/cloudflare" className="btn btn-ghost btn-sm" style={{ padding: '4px 10px', fontSize: '.78rem' }}>← Zones</Link>
              <h1>⚙ Paramètres Cloudflare</h1>
            </div>
            <p style={{ fontFamily: 'monospace', fontSize: '.75rem', color: 'var(--text-muted)' }}>{zid}</p>
          </div>
          <div>
            <button className="btn btn-outline" onClick={load} disabled={loading}>🔄 Actualiser</button>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80 }}>
          <div className="spin" style={{ width: 36, height: 36, border: '3px solid rgba(246,130,31,.2)', borderTopColor: '#f6821f', borderRadius: '50%', display: 'inline-block' }} />
        </div>
      ) : (
        <>
          <div className="grid-2 mb-4">
            <div className="card">
              <div className="card-header">🔒 Sécurité & SSL</div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {['ssl', 'always_use_https', 'security_level'].map(id => (
                  settings[id] && (
                    <div key={id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{id.replace(/_/g, ' ').toUpperCase()}</div>
                        <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{!settings[id].editable && '(Lecture seule)'}</div>
                      </div>
                      <div style={{ minWidth: 150 }}>
                        <SettingToggle id={id} setting={settings[id]} onChange={(val) => updateSetting(id, val)} disabled={updating === id} />
                      </div>
                    </div>
                  )
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card-header">⚡ Performance & Cache</div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {['brotli', 'rocket_loader', 'early_hints'].map(id => (
                  settings[id] && (
                    <div key={id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
                      <div>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{id.replace(/_/g, ' ').toUpperCase()}</div>
                        <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{!settings[id].editable && '(Lecture seule)'}</div>
                      </div>
                      <div style={{ minWidth: 150 }}>
                        <SettingToggle id={id} setting={settings[id]} onChange={(val) => updateSetting(id, val)} disabled={updating === id} />
                      </div>
                    </div>
                  )
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Tous les paramètres avancés</span>
              <input className="form-control" placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 250, fontSize: '.8rem' }} />
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Paramètre</th>
                    <th>Valeur</th>
                    <th>Modifiable</th>
                    <th>Dernière modif</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRaw.map(s => (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.id}</td>
                      <td>
                        <span style={{ fontSize: '.8rem', fontFamily: 'monospace', background: 'var(--bg-hover)', padding: '2px 6px', borderRadius: 4 }}>
                          {typeof s.value === 'object' ? JSON.stringify(s.value) : String(s.value)}
                        </span>
                      </td>
                      <td>{s.editable ? <span className="badge badge-success">Oui</span> : <span className="badge badge-gray">Non</span>}</td>
                      <td style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{new Date(s.modified_on).toLocaleString()}</td>
                    </tr>
                  ))}
                  {filteredRaw.length === 0 && (
                    <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Aucun paramètre trouvé.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
