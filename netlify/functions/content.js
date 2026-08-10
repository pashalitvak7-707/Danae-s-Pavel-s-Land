import { getStore } from '@netlify/blobs';
import { timingSafeEqual } from 'node:crypto';
import seed from '../../web/data/content.json' with { type: 'json' };

const KEY = 'content';
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });

function store() {
  return getStore({ name: 'memories', consistency: 'strong' });
}

/** Constant-time password check so the response time leaks nothing. */
function passwordOk(supplied) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const a = Buffer.from(String(supplied ?? ''));
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function bearer(req) {
  const h = req.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7) : '';
}

/** Reject anything that would corrupt the site if it were saved. */
function validate(data) {
  if (!data || typeof data !== 'object') return 'Body must be an object.';
  if (!Array.isArray(data.memories)) return 'Missing "memories" array.';
  if (data.memories.length > 500) return 'Too many memories.';
  for (const m of data.memories) {
    if (!m || typeof m.id !== 'string' || !m.id) return 'Every memory needs an id.';
    if (typeof m.x !== 'number' || typeof m.y !== 'number') return 'Memory ' + m.id + ' has bad coordinates.';
    if (m.x < -20 || m.x > 120 || m.y < -20 || m.y > 120) return 'Memory ' + m.id + ' is off the map.';
  }
  const ids = new Set(data.memories.map((m) => m.id));
  if (ids.size !== data.memories.length) return 'Two memories share an id.';
  if (JSON.stringify(data).length > 4_000_000) return 'Content is too large.';
  return null;
}

export default async (req) => {
  const { pathname } = new URL(req.url);

  /* ----- POST /api/login ----- */
  if (pathname === '/api/login') {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    let body = {};
    try { body = await req.json(); } catch { /* empty */ }
    if (!process.env.ADMIN_PASSWORD) {
      return json({ error: 'ADMIN_PASSWORD is not set on the server.' }, 500);
    }
    if (!passwordOk(body.password)) return json({ error: 'Unauthorized' }, 401);
    return json({ ok: true });
  }

  /* ----- GET /api/content ----- */
  if (req.method === 'GET') {
    const saved = await store().get(KEY, { type: 'json' });
    return json(saved ?? seed);
  }

  /* ----- PUT /api/content ----- */
  if (req.method === 'PUT') {
    if (!passwordOk(bearer(req))) return json({ error: 'Unauthorized' }, 401);

    let data;
    try { data = await req.json(); }
    catch { return json({ error: 'Invalid JSON' }, 400); }

    const problem = validate(data);
    if (problem) return json({ error: problem }, 400);

    data.updatedAt = new Date().toISOString();
    await store().setJSON(KEY, data);
    return json({ ok: true, updatedAt: data.updatedAt });
  }

  return json({ error: 'Method not allowed' }, 405);
};

export const config = {
  path: ['/api/content', '/api/login']
};
