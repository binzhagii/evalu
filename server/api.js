// The evalU API. Every request to /api/* comes through handleApi().
//
//   POST /api/auth/login       sign in            { username, password }
//   GET  /api/auth/me          who am I?
//   POST /api/auth/logout      sign out
//   GET  /api/data             the data this user is allowed to see
//   GET  /api/audit            audit log (HR only): who viewed, changed or released results
//   POST /api/actions/<name>   make a change      (see server/actions.js)
//                              e.g. changePassword, createUser, resetPassword
//
// Used by the Vite dev server (vite.config.js) and the production server (server/index.js).
import { getDb, save, addAudit, readAudit } from './db.js';
import { ensureSeeded } from './seed.js';
import { handleAuthRoute, currentUser, sessionHash } from './auth.js';
import { actions, describeAction } from './actions.js';
import { runDailyAutomation, canSeeAll, canSeeOwn, canSeeDept } from '../src/lib/logic.js';
import { viewFor } from './view.js';
import { send, readJson, HttpError } from './http.js';

// Run changes one at a time, so two requests never edit the data at the same moment.
let queue = Promise.resolve();
const oneAtATime = (fn) => { const p = queue.then(fn); queue = p.catch(() => {}); return p; };

async function runAction(name, args, user, req) {
  const action = Object.hasOwn(actions, name) ? actions[name] : null;
  if (!action) throw new HttpError(404, 'Unknown action.');
  if (action.roles && !action.roles.includes(user.role)) throw new HttpError(403, 'You are not allowed to do this.');
  return oneAtATime(async () => {
    if (action.readOnly) return (await action.run(getDb(), args, user)) ?? {};
    if (action.replacesDb) { const r = (await action.run(args, user)) ?? {}; addAudit(user, name, 'All data reset to the sample dataset'); return r; }
    // ctx.afterSave: things to do only once the change is saved (e.g. sign a user out)
    const ctx = { sessionHash: sessionHash(req), afterSave: [] };
    const draft = structuredClone(getDb());          // change a copy...
    const result = await action.run(draft, args, user, ctx);
    save(draft);                                      // ...and save it only if nothing failed
    for (const f of ctx.afterSave) f();
    if (action.audit !== false) addAudit(user, name, describeAction(name, args, draft, result)); // FR20
    return result ?? {};
  });
}

/** FR10: automatic reminders, run at most once a day per open period (on the first request of the day). */
function dailyAutomation() {
  return oneAtATime(() => {
    const draft = structuredClone(getDb());
    if (runDailyAutomation(draft)) { save(draft); addAudit(null, 'automaticReminders', 'Daily reminders and participation alerts sent'); }
  });
}

/** FR20: log when someone receives results they may see (at most once per person and period every 30 minutes). */
const lastView = new Map();
function logResultViews(db, user) {
  const now = Date.now();
  for (const p of db.periods) {
    const what = canSeeAll(user, p) ? 'all results' : canSeeDept(user, p) ? 'department results' : canSeeOwn(user, p) ? 'own results' : null;
    if (!what || (user.role === 'HR' && p.status === 'open')) continue;
    const k = `${user.id}|${p.id}`;
    if (now - (lastView.get(k) || 0) < 30 * 60 * 1000) continue;
    lastView.set(k, now);
    addAudit(user, 'view', `Opened ${what} for ${p.name}`);
  }
}

/** Returns true if the request was an /api/* request (handled here). */
export async function handleApi(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return false;
  const route = `${req.method} ${url.pathname}`;

  try {
    await ensureSeeded();
    // Changes must be sent as JSON: a plain HTML form on another site can't do that.
    if (req.method === 'POST' && !(req.headers['content-type'] || '').startsWith('application/json')) {
      throw new HttpError(415, 'Requests must be JSON.');
    }
    if (await handleAuthRoute(req, res, route)) return true;

    const user = currentUser(req);
    if (!user) throw new HttpError(401, 'Your session has ended. Please sign in again.');
    // A temporary password must be replaced before anything else can be done.
    if (user.mustChangePassword && route !== 'POST /api/actions/changePassword') {
      throw new HttpError(403, 'Please choose a new password first.');
    }

    if (route === 'GET /api/data') {
      await dailyAutomation();
      logResultViews(getDb(), user);
      send(res, 200, viewFor(getDb(), user));
      return true;
    }
    if (route === 'GET /api/audit') {
      if (user.role !== 'HR') throw new HttpError(403, 'You are not allowed to do this.');
      send(res, 200, { entries: readAudit(1000) });
      return true;
    }

    const m = url.pathname.match(/^\/api\/actions\/([A-Za-z]+)$/);
    if (req.method === 'POST' && m) {
      let args;
      try { args = await readJson(req); } catch { throw new HttpError(400, 'Invalid request.'); }
      const result = await runAction(m[1], args, user, req);
      send(res, 200, { result, data: viewFor(getDb(), user) });
      return true;
    }

    throw new HttpError(404, 'Not found.');
  } catch (e) {
    if (e instanceof HttpError) send(res, e.status, { error: e.message });
    else { console.error('[evalU] server error:', e); send(res, 500, { error: 'Server error. Please try again.' }); }
    return true;
  }
}
