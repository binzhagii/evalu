// Login backend tests: run with `node tests/auth.test.mjs` (or `npm test`).
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evalu-auth-'));
process.env.EVALU_DATA_DIR = dir;
const { handleAuth } = await import('../server/auth.js');
const { DEMO_PASSWORD } = await import('../src/lib/seed.js');

const server = http.createServer(async (req, res) => { if (!(await handleAuth(req, res))) { res.writeHead(404); res.end(); } });
await new Promise((r) => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;

const call = async (p, { body, cookie } = {}) => {
  const res = await fetch(base + p, {
    method: body ? 'POST' : 'GET',
    headers: { ...(body && { 'Content-Type': 'application/json' }), ...(cookie && { Cookie: cookie }) },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, data: await res.json(), setCookie: res.headers.get('set-cookie') };
};

try {
  // 1. not signed in
  assert.equal((await call('/api/auth/me')).status, 401);

  // 2. users file is created with hashed passwords only
  await call('/api/auth/login', { body: { username: 'x', password: 'y' } });
  const users = JSON.parse(fs.readFileSync(path.join(dir, 'users.json'), 'utf8'));
  assert.ok(users.length > 10);
  assert.ok(users.every((u) => u.password.startsWith('scrypt$') && !u.password.includes(DEMO_PASSWORD)));

  // 3. wrong password / unknown user / empty fields
  assert.equal((await call('/api/auth/login', { body: { username: 'hr', password: 'nope' } })).status, 401);
  assert.equal((await call('/api/auth/login', { body: { username: 'ghost', password: DEMO_PASSWORD } })).status, 401);
  assert.equal((await call('/api/auth/login', { body: { username: '', password: '' } })).status, 400);

  // 4. correct login sets an HttpOnly cookie and never returns the hash
  const ok = await call('/api/auth/login', { body: { username: 'HR ', password: DEMO_PASSWORD } });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.user.id, 'hr');
  assert.equal(ok.data.user.password, undefined);
  assert.match(ok.setCookie, /HttpOnly/);
  assert.match(ok.setCookie, /SameSite=Strict/);
  const cookie = ok.setCookie.split(';')[0];

  // 5. session works, then logout ends it
  assert.equal((await call('/api/auth/me', { cookie })).data.user.id, 'hr');
  assert.equal((await call('/api/auth/logout', { body: {}, cookie })).status, 200);
  assert.equal((await call('/api/auth/me', { cookie })).status, 401);

  // 6. forged cookie is rejected
  assert.equal((await call('/api/auth/me', { cookie: 'evalu_sid=forged' })).status, 401);

  // 7. lockout after 5 failures, even with the right password
  for (let i = 0; i < 5; i++) await call('/api/auth/login', { body: { username: 'dean_a', password: 'bad' } });
  const locked = await call('/api/auth/login', { body: { username: 'dean_a', password: DEMO_PASSWORD } });
  assert.equal(locked.status, 429);
  assert.match(locked.data.error, /Too many failed attempts/);
  // ...other accounts are unaffected
  assert.equal((await call('/api/auth/login', { body: { username: 'fac_a1', password: DEMO_PASSWORD } })).status, 200);

  console.log('auth tests passed');
} finally {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
}
