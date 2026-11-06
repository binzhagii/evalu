// The evalU API. Every request to /api/* comes through handleApi().
//
//   POST /api/auth/login       sign in            { username, password }
//   GET  /api/auth/me          who am I?
//   POST /api/auth/logout      sign out
//   GET  /api/data             the data this user is allowed to see
//   POST /api/actions/<name>   make a change      (see server/actions.js)
//                              e.g. changePassword, createUser, resetPassword
//
// Used by the Vite dev server (vite.config.js) and the production server (server/index.js).
import { getDb, save } from './db.js';
import { ensureSeeded } from './seed.js';
import { handleAuthRoute, currentUser, sessionHash } from './auth.js';
import { actions } from './actions.js';
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
    if (action.replacesDb) return (await action.run(args, user)) ?? {};
    // ctx.afterSave: things to do only once the change is saved (e.g. sign a user out)
    const ctx = { sessionHash: sessionHash(req), afterSave: [] };
    const draft = structuredClone(getDb());          // change a copy...
    const result = await action.run(draft, args, user, ctx);
    save(draft);                                      // ...and save it only if nothing failed
    for (const f of ctx.afterSave) f();
    return result ?? {};
  });
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
      send(res, 200, viewFor(getDb(), user));
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
