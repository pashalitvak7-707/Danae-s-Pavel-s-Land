/* Shared content API.
 *
 * The site always reads through loadContent(). It tries the live backend
 * first (so admin edits appear immediately for everyone) and falls back to
 * the bundled data/content.json, which means the map still works even on a
 * plain static host with no backend at all.
 */
window.MemoryAPI = (function () {
  const API = '/api/content';
  const SEED = 'data/content.json';
  const TOKEN_KEY = 'pd_admin_token';

  async function loadContent() {
    try {
      const res = await fetch(API + '?t=' + Date.now(), { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.memories)) return { data, live: true };
      }
    } catch (_) { /* no backend deployed — fall through */ }

    const res = await fetch(SEED + '?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('Could not load content');
    return { data: await res.json(), live: false };
  }

  async function saveContent(content, token) {
    const res = await fetch(API, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify(content)
    });
    if (res.status === 401) throw new Error('Wrong password — sign in again.');
    if (!res.ok) throw new Error('Save failed (' + res.status + '). Is the backend deployed?');
    return res.json();
  }

  async function login(password) {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    if (res.status === 401) throw new Error('Wrong password.');
    if (!res.ok) throw new Error('Login unavailable (' + res.status + '). Is the backend running?');
    return res.json();
  }

  const token = {
    get:   () => sessionStorage.getItem(TOKEN_KEY),
    set:   (v) => sessionStorage.setItem(TOKEN_KEY, v),
    clear: () => sessionStorage.removeItem(TOKEN_KEY)
  };

  return { loadContent, saveContent, login, token };
})();
