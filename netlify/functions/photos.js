import { getStore } from '@netlify/blobs';
import { timingSafeEqual, randomBytes } from 'node:crypto';

/* Photo storage.
 *
 *   POST   /api/photo         upload (auth)      -> { url, key, name }
 *   GET    /api/photo/:key    serve (public)     -> the image bytes
 *   DELETE /api/photo/:key    remove (auth)
 *   GET    /api/photos        list (auth)        -> { photos: [...] }
 *
 * Images live in Netlify Blobs, not in the repository, so uploading one shows
 * up on the site immediately without a commit or a redeploy.
 */

const EXT = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/gif':  'gif',
  'image/avif': 'avif'
};
const MAX_BYTES = 8 * 1024 * 1024;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });

const store = () => getStore({ name: 'photos', consistency: 'strong' });

function passwordOk(supplied) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const a = Buffer.from(String(supplied ?? ''));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function authed(req) {
  const h = req.headers.get('authorization') || '';
  return h.startsWith('Bearer ') && passwordOk(h.slice(7));
}

// Keys are generated here, never taken from the client, so an upload can't
// reach outside the store or overwrite an existing photo.
function newKey(ext) {
  return 'p_' + randomBytes(8).toString('hex') + '.' + ext;
}

const KEY_RE = /^p_[0-9a-f]{16}\.(jpg|png|webp|gif|avif)$/;

export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname;

  /* ---------- list ---------- */
  if (path === '/api/photos') {
    if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
    if (!authed(req)) return json({ error: 'Unauthorized' }, 401);
    const { blobs } = await store().list();
    return json({
      photos: blobs
        .filter((b) => KEY_RE.test(b.key))
        .map((b) => ({ key: b.key, url: '/api/photo/' + b.key }))
    });
  }

  /* ---------- upload ---------- */
  if (path === '/api/photo' && req.method === 'POST') {
    if (!authed(req)) return json({ error: 'Unauthorized' }, 401);

    const type = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const ext = EXT[type];
    if (!ext) {
      return json({
        error: 'That file type is not supported. Use JPG, PNG, WebP, GIF or AVIF' +
               (type ? ' (received "' + type + '")' : '') + '.'
      }, 415);
    }

    const buf = new Uint8Array(await req.arrayBuffer());
    if (!buf.byteLength) return json({ error: 'The upload was empty.' }, 400);
    if (buf.byteLength > MAX_BYTES) {
      return json({ error: 'That image is larger than 8MB even after shrinking.' }, 413);
    }

    let name = 'photo';
    try { name = decodeURIComponent(req.headers.get('x-filename') || 'photo'); } catch { /* keep default */ }

    const key = newKey(ext);
    await store().set(key, buf, {
      metadata: { contentType: type, name: name.slice(0, 200), uploadedAt: new Date().toISOString() }
    });
    return json({ key, url: '/api/photo/' + key, name });
  }

  /* ---------- serve / delete ---------- */
  const key = path.startsWith('/api/photo/') ? decodeURIComponent(path.slice('/api/photo/'.length)) : '';
  if (key) {
    if (!KEY_RE.test(key)) return json({ error: 'Not found' }, 404);

    if (req.method === 'GET') {
      const res = await store().getWithMetadata(key, { type: 'arrayBuffer' });
      if (!res) return json({ error: 'Not found' }, 404);
      return new Response(res.data, {
        headers: {
          'Content-Type': res.metadata?.contentType || 'application/octet-stream',
          // The key is random and never reused, so the bytes behind it never change.
          'Cache-Control': 'public, max-age=31536000, immutable'
        }
      });
    }

    if (req.method === 'DELETE') {
      if (!authed(req)) return json({ error: 'Unauthorized' }, 401);
      await store().delete(key);
      return json({ ok: true });
    }
  }

  return json({ error: 'Method not allowed' }, 405);
};

export const config = {
  path: ['/api/photo', '/api/photo/:key', '/api/photos']
};
