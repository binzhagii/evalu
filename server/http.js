// Small helpers for reading requests and sending JSON replies.
const MAX_BODY = 64 * 1024;

export function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
}

/**
 * Reads a JSON body of at most `limit` bytes. A body that is too large is read to the end (up to 4x the
 * limit) so the caller can still answer with a clear message, then rejected with err.code = 'TOO_LARGE'.
 */
export function readJson(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    const tooLarge = () => Object.assign(new Error('too large'), { code: 'TOO_LARGE', limit });
    req.on('data', (c) => {
      size += c.length;
      if (size > limit * 4) { reject(tooLarge()); req.destroy(); } else if (size <= limit) chunks.push(c);
    });
    req.on('end', () => {
      if (size > limit) { reject(tooLarge()); return; }
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error('not an object');
        resolve(v);
      } catch { reject(new Error('bad json')); }
    });
    req.on('error', reject);
  });
}

export function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** Error with an HTTP status, thrown by actions and caught by the API router. */
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
