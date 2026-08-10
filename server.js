/* Local server — same two endpoints as the Netlify function, but it keeps
 * content in a file on disk. Use it to preview the site and admin panel
 * before deploying, or to run the whole thing on any plain Node host.
 *
 *   ADMIN_PASSWORD=yourpassword node server.js
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(ROOT, 'web');
const STORE = path.join(ROOT, '.data', 'content.json');
const SEED = path.join(WEB, 'data', 'content.json');
const PORT = Number(process.env.PORT) || 8080;
const PASSWORD = process.env.ADMIN_PASSWORD || 'letmein';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.woff2': 'font/woff2'
};

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

function passwordOk(supplied) {
  const a = Buffer.from(String(supplied ?? ''));
  const b = Buffer.from(PASSWORD);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function validate(data) {
  if (!data || typeof data !== 'object') return 'Body must be an object.';
  if (!Array.isArray(data.memories)) return 'Missing "memories" array.';
  for (const m of data.memories) {
    if (!m || typeof m.id !== 'string' || !m.id) return 'Every memory needs an id.';
    if (typeof m.x !== 'number' || typeof m.y !== 'number') return 'Memory ' + m.id + ' has bad coordinates.';
  }
  if (new Set(data.memories.map((m) => m.id)).size !== data.memories.length) return 'Two memories share an id.';
  return null;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 8_000_000) throw new Error('Body too large');
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readStored() {
  try { return JSON.parse(await fs.readFile(STORE, 'utf8')); }
  catch { return JSON.parse(await fs.readFile(SEED, 'utf8')); }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);

  /* ---- API ---- */
  if (pathname === '/api/login') {
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
    let body = {};
    try { body = JSON.parse(await readBody(req)); } catch { /* empty */ }
    if (!passwordOk(body.password)) return send(res, 401, { error: 'Unauthorized' });
    return send(res, 200, { ok: true });
  }

  if (pathname === '/api/content') {
    if (req.method === 'GET') return send(res, 200, await readStored());

    if (req.method === 'PUT') {
      const auth = req.headers.authorization || '';
      if (!passwordOk(auth.startsWith('Bearer ') ? auth.slice(7) : '')) {
        return send(res, 401, { error: 'Unauthorized' });
      }
      let data;
      try { data = JSON.parse(await readBody(req)); }
      catch { return send(res, 400, { error: 'Invalid JSON' }); }

      const problem = validate(data);
      if (problem) return send(res, 400, { error: problem });

      data.updatedAt = new Date().toISOString();
      await fs.mkdir(path.dirname(STORE), { recursive: true });
      await fs.writeFile(STORE, JSON.stringify(data, null, 2));
      return send(res, 200, { ok: true, updatedAt: data.updatedAt });
    }
    return send(res, 405, { error: 'Method not allowed' });
  }

  /* ---- static files ---- */
  let rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.join(WEB, rel);
  if (!file.startsWith(WEB)) return send(res, 403, 'Forbidden', 'text/plain');

  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  } catch {
    send(res, 404, 'Not found', 'text/plain');
  }
});

server.listen(PORT, () => {
  console.log(`Map:   http://localhost:${PORT}/`);
  console.log(`Admin: http://localhost:${PORT}/admin.html  (password: ${PASSWORD})`);
});
