import { createContext, useContext, useEffect, useState, useCallback } from 'react';

// All data now lives on the server (server/api.js). This file:
//  - signs in/out (session is an HttpOnly cookie the browser sends automatically)
//  - loads the data this user may see:  GET /api/data
//  - makes changes through server actions:  act('submitEvaluation', {...})
const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

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
  const [user, setUser] = useState(null);
  const [db, setDb] = useState(null);
  const [checking, setChecking] = useState(true); // asking the server "am I still signed in?"
  const [error, setError] = useState('');

  const signedOut = useCallback((msg = '') => { setUser(null); setDb(null); setError(msg); }, []);

  const loadData = useCallback(async () => {
    const r = await api('/api/data');
    if (r.ok) setDb(r.data);
    else if (r.status === 401) signedOut('Your session has ended. Please sign in again.');
    else setError(r.data.error || 'Could not load data.');
  }, [signedOut]);

  useEffect(() => {
    (async () => {
      try {
        const r = await api('/api/auth/me');
        if (r.ok) { setUser(r.data.user); if (!r.data.user.mustChangePassword) await loadData(); }
      } catch { /* server offline: show the login screen */ }
      setChecking(false);
    })();
  }, [loadData]);

  // Returns { ok: true } or { ok: false, error: 'message to show' }
  const login = async (username, password) => {
    try {
      const r = await api('/api/auth/login', { username, password });
      if (!r.ok) return { ok: false, error: r.data.error || 'Sign-in failed. Please try again.' };
      setError('');
      setUser(r.data.user);
      if (!r.data.user.mustChangePassword) await loadData(); // otherwise: choose a new password first
      return { ok: true };
    } catch {
      return { ok: false, error: "Can't reach the server. Check that it is running." };
    }
  };

  // Returns { ok: true } or { ok: false, error }. Errors are shown in the form, not the page banner.
  const changePassword = async (currentPassword, newPassword) => {
    try {
      const r = await api('/api/actions/changePassword', { currentPassword, newPassword });
      if (r.status === 401) { signedOut('Your session has ended. Please sign in again.'); return { ok: false, error: '' }; }
      if (!r.ok) return { ok: false, error: r.data.error || 'Could not change the password.' };
      setUser((u) => ({ ...u, mustChangePassword: false }));
      setDb(r.data.data);
      return { ok: true };
    } catch {
      return { ok: false, error: "Can't reach the server. Your password was not changed." };
    }
  };

  const logout = async () => {
    signedOut();
    try { await api('/api/auth/logout', {}); } catch { /* ignore */ }
  };

  /**
   * Ask the server to make a change. On success the page data is refreshed and
   * the action's result is returned (an object). On failure the error is shown
   * at the top of the page and null is returned.
   */
  const act = useCallback(async (name, args = {}) => {
    try {
      const r = await api(`/api/actions/${name}`, args);
      if (r.ok) { setError(''); setDb(r.data.data); return r.data.result; }
      if (r.status === 401) signedOut('Your session has ended. Please sign in again.');
      else setError(r.data.error || 'Something went wrong. Please try again.');
    } catch {
      setError("Can't reach the server. Your change was not saved.");
    }
    return null;
  }, [signedOut]);

  return (
    <Ctx.Provider value={{ db, user, checking, error, clearError: () => setError(''), act, login, logout, changePassword, reload: loadData }}>
      {children}
    </Ctx.Provider>
  );
}
