/**
 * API client — all calls go through Next.js rewrites → Express :5050
 */
const BASE = '/api';

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export const api = {
  get: (path: string) => apiFetch(path),
  post: (path: string, body?: unknown) => apiFetch(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path: string, body?: unknown) => apiFetch(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (path: string, body?: unknown) => apiFetch(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path: string) => apiFetch(path, { method: 'DELETE' }),

  // File upload (multipart)
  upload: async (path: string, formData: FormData) => {
    const res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  },
};

export default api;
