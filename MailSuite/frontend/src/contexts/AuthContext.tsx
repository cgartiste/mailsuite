'use client';
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { useRouter, usePathname } from 'next/navigation';

interface User { username: string; role: string; firstName: string; lastName: string; }
interface AuthCtx { user: User | null; loading: boolean; login: (u: string, p: string) => Promise<string | null>; logout: () => void; }

const AuthContext = createContext<AuthCtx>({ user: null, loading: true, login: async () => null, logout: () => {} });

const PUBLIC_PATHS = ['/login'];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const checkAuth = useCallback(async () => {
    const { ok, data } = await api.get('/auth/me');
    if (ok) setUser(data.user);
    else setUser(null);
    setLoading(false);
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  useEffect(() => {
    if (!loading && !user && !PUBLIC_PATHS.includes(pathname)) {
      router.push('/login');
    }
  }, [loading, user, pathname, router]);

  const login = async (username: string, password: string): Promise<string | null> => {
    const { ok, data } = await api.post('/auth/login', { username, password });
    if (ok) { setUser(data.user); router.push('/'); return null; }
    return data.error || 'Erreur de connexion';
  };

  const logout = async () => {
    await api.post('/auth/logout');
    setUser(null);
    router.push('/login');
  };

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
