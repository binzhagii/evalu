// evalU login backend: password check, session cookie, failed-attempt limit.
// No external packages: uses Node's built-in crypto, fs and http types.
//
// Used two ways:
//   - in development, mounted inside the Vite dev server (see vite.config.js)
//   - in production, by server/index.js
import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scryptAsync = promisify(scrypt);
const DATA_DIR = process.env.EVALU_DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

const COOKIE = 'evalu_sid';
const SESSION_MS = 8 * 60 * 60 * 1000; // 8 hours
const MAX_FAILS = 5;                    // failed attempts allowed...
const FAIL_WINDOW_MS = 15 * 60 * 1000;  // ...per 15 minutes, per username + IP
const MAX_BODY = 10 * 1024;

// ---------- passwords ----------
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}
async function verifyPassword(password, stored) {
  const [, salt, hash] = stored.split('$');
  const expected = Buffer.from(hash, 'base64');
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}

// ---------- users (server/data/users.json) ----------
// Created on first run from the same sample accounts the app uses (src/lib/seed.js).
async function createUsersFile() {
  const mem = {};
  globalThis.localStorage ??= { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
  const { buildSeed, DEMO_PASSWORD } = await import('../src/lib/seed.js');
  const db = await buildSeed();
  const users = [];
  for (const u of db.users) {
    users.push({ id: u.id, username: u.username, name: u.name, role: u.role, position: u.position, dept: u.dept, password: await hashPassword(DEMO_PASSWORD) });
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  console.log(`[evalU] Created ${users.length} sample accounts in ${USERS_FILE}`);
  return users;
}

let usersPromise = null;
function getUsers() {
  usersPromise ??= (async () => {
    if (fs.existsSync(USERS_FILE)) return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    return createUsersFile();
  })();
  return usersPromise;
}
const publicUser = ({ password: _pw, ...u }) => u; // never send the hash to the browser

// ---------- sessions & failed attempts (kept in memory) ----------
const sessions = new Map(); // token -> { userId, expires }
const fails = new Map();    // "ip|username" -> { count, first }

function getSession(req) {
  const token = parseCookies(req)[COOKIE];
  const s = token && sessions.get(token);
  if (!s) return null;
  if (s.expires < Date.now()) { sessions.delete(token); return null; }
  return { token, ...s };
}
function tooManyFails(key) {
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

// ---------- small http helpers ----------
function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function sessionCookie(value, maxAgeSec) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${secure}`;
}
function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('too large')); req.destroy(); } else chunks.push(c);
    });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new Error('bad json')); } });
    req.on('error', reject);
  });
}

// ---------- routes ----------
// Returns true when the request was an /api/auth/* request (handled here).
export async function handleAuth(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/auth/')) return false;
  const route = `${req.method} ${url.pathname}`;

  try {
    if (route === 'POST /api/auth/login') {
      let body;
      try { body = await readJson(req); } catch { send(res, 400, { error: 'Invalid request.' }); return true; }
      const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
      const password = typeof body.password === 'string' ? body.password : '';
      if (!username || !password) { send(res, 400, { error: 'Enter your username and password.' }); return true; }

      const key = `${req.socket.remoteAddress}|${username}`;
      const wait = tooManyFails(key);
      if (wait) {
        const mins = Math.ceil(wait / 60000);
        send(res, 429, { error: `Too many failed attempts. Try again in ${mins} minute${mins > 1 ? 's' : ''}.` }, { 'Retry-After': String(Math.ceil(wait / 1000)) });
        return true;
      }

      const users = await getUsers();
      const user = users.find((u) => u.username.toLowerCase() === username);
      // Check a dummy hash when the user doesn't exist, so response time doesn't reveal valid usernames.
      const ok = await verifyPassword(password, user ? user.password : DUMMY_HASH);
      if (!user || !ok) { recordFail(key); send(res, 401, { error: 'Incorrect username or password.' }); return true; }

      fails.delete(key);
      const token = randomBytes(32).toString('base64url');
      sessions.set(token, { userId: user.id, expires: Date.now() + SESSION_MS });
      send(res, 200, { user: publicUser(user) }, { 'Set-Cookie': sessionCookie(token, SESSION_MS / 1000) });
      return true;
    }

    if (route === 'GET /api/auth/me') {
      const s = getSession(req);
      const user = s && (await getUsers()).find((u) => u.id === s.userId);
      if (!user) { send(res, 401, { error: 'Not signed in.' }); return true; }
      send(res, 200, { user: publicUser(user) });
      return true;
    }

    if (route === 'POST /api/auth/logout') {
      const s = getSession(req);
      if (s) sessions.delete(s.token);
      send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookie('', 0) });
      return true;
    }

    send(res, 404, { error: 'Not found.' });
    return true;
  } catch (e) {
    console.error('[evalU] auth error:', e);
    send(res, 500, { error: 'Server error. Please try again.' });
    return true;
  }
}

const DUMMY_HASH = await hashPassword(randomBytes(16).toString('hex'));
