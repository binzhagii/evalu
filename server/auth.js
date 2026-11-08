// Sign-in: password check, session cookie, failed-attempt limit.
// Users and sessions are stored in the database (server/db.js).
import { randomBytes } from 'node:crypto';
import { isInstitutionalEmail, INSTITUTION_DOMAIN } from '../src/lib/logic.js';
import { findUserByUsername, findUserByEmail, addAudit, findUserById, createSession, findSession, deleteSession, deleteExpiredSessions } from './db.js';
import { verifyPassword, hashPassword, sha256 } from './secrets.js';
import { send, readJson, parseCookies } from './http.js';

const COOKIE = 'evalu_sid';
const SESSION_MS = 8 * 60 * 60 * 1000; // 8 hours
const MAX_FAILS = 5;                    // failed attempts allowed...
const FAIL_WINDOW_MS = 15 * 60 * 1000;  // ...per 15 minutes, per username + IP

// The browser only ever holds the random token; the database stores its SHA-256 hash.
function sessionCookie(value, maxAgeSec) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${secure}`;
}

/** SHA-256 of this request's session token ('' if none). */
export function sessionHash(req) {
  const token = parseCookies(req)[COOKIE];
  return token ? sha256(token) : '';
}

/** The signed-in user for this request, or null. */
export function currentUser(req) {
  const hash = sessionHash(req);
  if (!hash) return null;
  const s = findSession(hash);
  if (!s) return null;
  if (s.expires < Date.now()) { deleteSession(s.token_hash); return null; }
  const user = findUserById(s.user_id);
  return user?.active ? user : null;
}

// failed attempts (memory is fine: it only needs to last 15 minutes)
const fails = new Map(); // "ip|username" -> { count, first }
function lockedFor(key) {
  const f = fails.get(key);
  if (!f) return 0;
  const left = f.first + FAIL_WINDOW_MS - Date.now();
  if (left <= 0) { fails.delete(key); return 0; }
  return f.count >= MAX_FAILS ? left : 0;
}
function recordFail(key) {
  const f = fails.get(key);
  if (!f || f.first + FAIL_WINDOW_MS < Date.now()) fails.set(key, { count: 1, first: Date.now() });
  else f.count++;
}

const DUMMY_HASH = await hashPassword(randomBytes(16).toString('hex'));

/** Handles /api/auth/* routes. Returns true if the route matched. */
export async function handleAuthRoute(req, res, route) {
  if (route === 'POST /api/auth/login') {
    let body;
    try { body = await readJson(req); } catch { send(res, 400, { error: 'Invalid request.' }); return true; }
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!username || !password) { send(res, 400, { error: 'Enter your UB email (or username) and password.' }); return true; }
    // FR1: sign in with the official institutional email; any other email address is refused
    if (username.includes('@') && !isInstitutionalEmail(username)) {
      send(res, 403, { error: `Only official UB email addresses (…@${INSTITUTION_DOMAIN}) can sign in.` });
      return true;
    }

    const key = `${req.socket.remoteAddress}|${username}`;
    const wait = lockedFor(key);
    if (wait) {
      const mins = Math.ceil(wait / 60000);
      send(res, 429, { error: `Too many failed attempts. Try again in ${mins} minute${mins > 1 ? 's' : ''}.` }, { 'Retry-After': String(Math.ceil(wait / 1000)) });
      return true;
    }

    const user = username.includes('@') ? findUserByEmail(username) : findUserByUsername(username);
    // Check a dummy hash when the user doesn't exist, so response time doesn't reveal valid usernames.
    const ok = await verifyPassword(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) { recordFail(key); send(res, 401, { error: 'Incorrect email/username or password.' }); return true; }
    if (!user.active) { send(res, 403, { error: 'This account is deactivated. Please contact the HRMC office.' }); return true; }

    fails.delete(key);
    deleteExpiredSessions();
    const token = randomBytes(32).toString('base64url');
    createSession(sha256(token), user.id, Date.now() + SESSION_MS);
    addAudit({ id: user.id, name: user.name }, 'signIn', '');
    send(res, 200, { user: findUserById(user.id) }, { 'Set-Cookie': sessionCookie(token, SESSION_MS / 1000) });
    return true;
  }

  if (route === 'GET /api/auth/me') {
    const user = currentUser(req);
    if (!user) send(res, 401, { error: 'Not signed in.' });
    else send(res, 200, { user });
    return true;
  }

  if (route === 'POST /api/auth/logout') {
    const token = parseCookies(req)[COOKIE];
    const who = currentUser(req);
    if (who) addAudit(who, 'signOut', '');
    if (token) deleteSession(sha256(token));
    send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
    return true;
  }

  return false;
}
