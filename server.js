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
import { timingSafeEqual, randomBytes } from 'node:crypto';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(ROOT, 'web');
const STORE = path.join(ROOT, '.data', 'content.json');
const PHOTOS = path.join(ROOT, '.data', 'photos');
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

async function readRaw(req, limit = 9_000_000) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error('Body too large');
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

async function readBody(req) {
  return (await readRaw(req)).toString('utf8');
}

/* ---- photos: same contract as netlify/functions/photos.js ---- */
const PHOTO_EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/gif': 'gif', 'image/avif': 'avif'
};
const EXT_TYPE = Object.fromEntries(Object.entries(PHOTO_EXT).map(([t, e]) => [e, t]));
const KEY_RE = /^p_[0-9a-f]{16}\.(jpg|png|webp|gif|avif)$/;
const MAX_PHOTO = 8 * 1024 * 1024;

function isAuthed(req) {
  const a = req.headers.authorization || '';
  return a.startsWith('Bearer ') && passwordOk(a.slice(7));
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

  if (pathname === '/api/photos') {
    if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
    if (!isAuthed(req)) return send(res, 401, { error: 'Unauthorized' });
    let files = [];
    try { files = (await fs.readdir(PHOTOS)).filter((f) => KEY_RE.test(f)); } catch { /* none yet */ }
    return send(res, 200, { photos: files.map((k) => ({ key: k, url: '/api/photo/' + k })) });
  }

  if (pathname === '/api/photo' && req.method === 'POST') {
    if (!isAuthed(req)) return send(res, 401, { error: 'Unauthorized' });
    const type = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const ext = PHOTO_EXT[type];
    if (!ext) {
      return send(res, 415, { error: 'That file type is not supported. Use JPG, PNG, WebP, GIF or AVIF'
        + (type ? ' (received "' + type + '")' : '') + '.' });
    }
    let buf;
    try { buf = await readRaw(req); }
    catch { return send(res, 413, { error: 'That image is too large.' }); }
    if (!buf.length) return send(res, 400, { error: 'The upload was empty.' });
    if (buf.length > MAX_PHOTO) return send(res, 413, { error: 'That image is larger than 8MB even after shrinking.' });

    const key = 'p_' + randomBytes(8).toString('hex') + '.' + ext;
    await fs.mkdir(PHOTOS, { recursive: true });
    await fs.writeFile(path.join(PHOTOS, key), buf);
    let name = 'photo';
    try { name = decodeURIComponent(req.headers['x-filename'] || 'photo'); } catch { /* keep default */ }
    return send(res, 200, { key, url: '/api/photo/' + key, name });
  }

  if (pathname.startsWith('/api/photo/')) {
    const key = decodeURIComponent(pathname.slice('/api/photo/'.length));
    if (!KEY_RE.test(key)) return send(res, 404, { error: 'Not found' });

    if (req.method === 'GET') {
      try {
        const data = await fs.readFile(path.join(PHOTOS, key));
        res.writeHead(200, {
          'Content-Type': EXT_TYPE[key.split('.').pop()] || 'application/octet-stream',
          'Cache-Control': 'public, max-age=31536000, immutable'
        });
        return res.end(data);
      } catch { return send(res, 404, { error: 'Not found' }); }
    }
    if (req.method === 'DELETE') {
      if (!isAuthed(req)) return send(res, 401, { error: 'Unauthorized' });
      try { await fs.unlink(path.join(PHOTOS, key)); } catch { /* already gone */ }
      return send(res, 200, { ok: true });
    }
    return send(res, 405, { error: 'Method not allowed' });
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
