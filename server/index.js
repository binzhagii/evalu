// Production server: serves the built app (dist/) and the login API.
// Run `npm run build` first, then `npm start`.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleAuth } from './auth.js';

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = Number(process.env.PORT) || 3000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon' };

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  let file = path.normalize(path.join(DIST, urlPath));
  if (!file.startsWith(DIST)) { res.writeHead(403); res.end(); return; } // block ../ paths
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('[evalU] dist/ not found. Run "npm run build" first.');
  process.exit(1);
}

http.createServer(async (req, res) => {
  if (await handleAuth(req, res)) return;
  serveStatic(req, res);
}).listen(PORT, () => console.log(`[evalU] Running at http://localhost:${PORT}`));
