// Prototype-grade encryption for restricted comments (AES-GCM via WebCrypto).
// The key is kept in this browser's localStorage. A production deployment would
// keep the key server-side; this only demonstrates the "encrypted + restricted" requirement.
const KEY = 'evalu_comment_key_v1';
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function getKey() {
  let raw = localStorage.getItem(KEY);
  if (!raw) {
    const k = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    raw = b64(await crypto.subtle.exportKey('raw', k));
    localStorage.setItem(KEY, raw);
  }
  return crypto.subtle.importKey('raw', unb64(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptText(text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await getKey(), new TextEncoder().encode(text));
  return { iv: b64(iv), ct: b64(ct) };
}
export async function decryptText(p) {
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(p.iv) }, await getKey(), unb64(p.ct));
    return new TextDecoder().decode(pt);
  } catch {
    return '[unable to decrypt on this browser]';
  }
}
export async function sha256(s) {
  return b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}
