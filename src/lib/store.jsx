import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { buildSeed } from './seed';

const DB_KEY = 'evalu_db_v1';
const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };

// Calls the login backend (server/auth.js). The session lives in an HttpOnly cookie.
async function api(path, body) {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export function AppProvider({ children }) {
  const [db, setDb] = useState(null);
  const [userId, setUserId] = useState(null);
  const [checking, setChecking] = useState(true); // asking the server "am I still signed in?"

  useEffect(() => {
    (async () => {
      let d = read(DB_KEY);
      if (!d || d.version !== 1) { d = await buildSeed(); write(DB_KEY, d); }
      setDb(d);
    })();
    api('/api/auth/me')
      .then((r) => { if (r.ok) setUserId(r.data.user.id); })
      .catch(() => { /* server offline: show the login screen */ })
      .finally(() => setChecking(false));
  }, []);

  const update = useCallback((fn) => {
    setDb((cur) => {
      const draft = structuredClone(cur);
      fn(draft);
      write(DB_KEY, draft);
      return draft;
    });
  }, []);

  // Returns { ok: true } or { ok: false, error: 'message to show' }
  const login = async (username, password) => {
    try {
      const r = await api('/api/auth/login', { username, password });
      if (!r.ok) return { ok: false, error: r.data.error || 'Sign-in failed. Please try again.' };
      setUserId(r.data.user.id);
      return { ok: true };
    } catch {
      return { ok: false, error: "Can't reach the server. Check that it is running." };
    }
  };
  const logout = async () => {
    setUserId(null);
    try { await api('/api/auth/logout', {}); } catch { /* ignore */ }
  };
  const reset = async () => { const d = await buildSeed(); write(DB_KEY, d); setDb(d); };

  const user = db && userId ? db.users.find((u) => u.id === userId) || null : null;
  return <Ctx.Provider value={{ db, user, checking, update, login, logout, reset }}>{children}</Ctx.Provider>;
}
