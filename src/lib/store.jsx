import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { buildSeed } from './seed';
import { sha256 } from './crypto';

const DB_KEY = 'evalu_db_v1';
const SESSION_KEY = 'evalu_session_v1';
const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const read = (k, store = localStorage) => { try { return JSON.parse(store.getItem(k)); } catch { return null; } };
const write = (k, v, store = localStorage) => { try { store.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };

export function AppProvider({ children }) {
  const [db, setDb] = useState(null);
  const [userId, setUserId] = useState(() => read(SESSION_KEY, sessionStorage));

  useEffect(() => {
    (async () => {
      let d = read(DB_KEY);
      if (!d || d.version !== 1) { d = await buildSeed(); write(DB_KEY, d); }
      setDb(d);
    })();
  }, []);

  const update = useCallback((fn) => {
    setDb((cur) => {
      const draft = structuredClone(cur);
      fn(draft);
      write(DB_KEY, draft);
      return draft;
    });
  }, []);

  const login = async (username, password) => {
    const u = db.users.find((x) => x.username === username.trim());
    if (!u || u.pw !== (await sha256(password))) return false;
    setUserId(u.id); write(SESSION_KEY, u.id, sessionStorage);
    return true;
  };
  const logout = () => { setUserId(null); try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ } };
  const reset = async () => { const d = await buildSeed(); write(DB_KEY, d); setDb(d); };

  const user = db && userId ? db.users.find((u) => u.id === userId) || null : null;
  return <Ctx.Provider value={{ db, user, update, login, logout, reset }}>{children}</Ctx.Provider>;
}
