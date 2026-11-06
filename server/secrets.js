// Password hashing (scrypt) and comment encryption (AES-256-GCM).
// The encryption key lives on the server only: server/data/secret.key
// (or set EVALU_SECRET to a base64 32-byte key).
import { scrypt, randomBytes, timingSafeEqual, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';

const scryptAsync = promisify(scrypt);

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}
export async function verifyPassword(password, stored) {
  const [, salt, hash] = stored.split('$');
  const expected = Buffer.from(hash, 'base64');
  const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(actual, expected);
}
export const sha256 = (s) => createHash('sha256').update(s).digest('base64url');

function loadKey() {
  if (process.env.EVALU_SECRET) return Buffer.from(process.env.EVALU_SECRET, 'base64');
  const file = path.join(DATA_DIR, 'secret.key');
  if (!fs.existsSync(file)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(file, randomBytes(32).toString('base64'), { mode: 0o600 });
  }
  return Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64');
}
const KEY = loadKey();

export function encryptText(text) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return { iv: iv.toString('base64'), ct: ct.toString('base64'), tag: c.getAuthTag().toString('base64') };
}
export function decryptText(p) {
  try {
    const d = createDecipheriv('aes-256-gcm', KEY, Buffer.from(p.iv, 'base64'));
    d.setAuthTag(Buffer.from(p.tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(p.ct, 'base64')), d.final()]).toString('utf8');
  } catch {
    return '[comment could not be decrypted]';
  }
}
