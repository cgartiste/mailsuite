'use client';
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';

interface GWAccount {
  id: number;
  name: string;
  admin_email: string;
  domain: string;
  is_active: number;
  total_users: number;
  status: string;
}

interface ActiveGWContextType {
  accounts: GWAccount[];
  active: GWAccount | null;
  loading: boolean;
  switching: boolean;
  switchAccount: (id: number) => Promise<void>;
  reload: () => Promise<void>;
}

const ActiveGWContext = createContext<ActiveGWContextType>({
  accounts: [], active: null, loading: true, switching: false,
  switchAccount: async () => {}, reload: async () => {},
});

export function ActiveGWProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = useState<GWAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);

  const reload = useCallback(async () => {
    const r = await api.get('/gworkspace/credentials');
    if (r.ok) setAccounts(r.data.credentials || []);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const switchAccount = useCallback(async (id: number) => {
    setSwitching(true);
    const r = await api.patch(`/gworkspace/credentials/${id}/activate`);
    if (r.ok) {
      setAccounts(prev => prev.map(a => ({ ...a, is_active: a.id === id ? 1 : 0 })));
    }
    setSwitching(false);
  }, []);

  const active = accounts.find(a => a.is_active === 1) || accounts[0] || null;

  return (
    <ActiveGWContext.Provider value={{ accounts, active, loading, switching, switchAccount, reload }}>
      {children}
    </ActiveGWContext.Provider>
  );
}

export const useActiveGW = () => useContext(ActiveGWContext);
