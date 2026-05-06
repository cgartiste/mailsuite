'use client';
import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';

interface Toast { id: number; type: 'success' | 'error' | 'warning' | 'info'; message: string; }
interface ToastCtx { toast: (msg: string, type?: Toast['type']) => void; }

const ToastCtx = createContext<ToastCtx>({ toast: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: Toast['type'] = 'success') => {
    const id = Date.now();
    setToasts(p => [...p, { id, type, message }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  }, []);

  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            <span style={{ fontSize: '1rem', flexShrink: 0 }}>{icons[t.type]}</span>
            <span style={{ flex: 1 }}>{t.message}</span>
            <button onClick={() => setToasts(p => p.filter(x => x.id !== t.id))}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1rem', padding: 0, lineHeight: 1 }}>✕</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
