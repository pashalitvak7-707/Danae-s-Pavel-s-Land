(function () {
  'use strict';

  const canvas   = document.getElementById('canvas');
  const mapImg   = document.getElementById('map');
  const layer    = document.getElementById('markers');
  const hintEl   = document.getElementById('hint');
  const card     = document.getElementById('card');
  const page     = document.getElementById('page');
  const loader   = document.getElementById('loader');
  const scroller = document.getElementById('scroller');

  const SEEN_KEY = 'pd_seen';
  let content = null;
  let openId  = null;          // memory whose name-card is showing
  let seen    = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'));

  /* ---------------- boot ---------------- */

  init();

  async function init() {
    try {
      const { data } = await window.MemoryAPI.loadContent();
      content = data;
    } catch (err) {
      showFatal('Could not load the memories.');
      return;
    }

    document.title = content.title || 'Our map';
    hintEl.textContent = content.hint || '';

    buildMarkers();
    wire();
    await imageSettled();
    loader.classList.add('is-done');
    openFromHash();
    setTimeout(() => hintEl.classList.add('is-gone'), 6000);
  }

  // Resolve once the artwork has loaded (or failed) so the loader never sticks.
  function imageSettled() {
    if (mapImg.complete) { checkArt(); return Promise.resolve(); }
    return new Promise((resolve) => {
      mapImg.addEventListener('load',  () => { checkArt(); resolve(); }, { once: true });
      mapImg.addEventListener('error', () => { artMissing(); resolve(); }, { once: true });
      setTimeout(resolve, 8000);
    });
  }

  function checkArt() {
    if (!mapImg.naturalWidth) artMissing();
  }

  function artMissing() {
    if (document.getElementById('missing')) return;
    const note = document.createElement('div');
    note.id = 'missing';
    note.innerHTML =
      'The map artwork is not here yet.<br>' +
      'Drop <b>world.png</b> into <b>web/art/</b> and refresh.';
    canvas.appendChild(note);
  }

  function showFatal(msg) {
    loader.classList.add('is-done');
    canvas.innerHTML = '<div id="missing">' + msg + '</div>';
  }

  /* ---------------- markers ---------------- */

  function buildMarkers() {
    layer.innerHTML = '';
    content.memories.forEach((m) => {
      const btn = document.createElement('button');
      btn.className = 'marker' + (seen.has(m.id) ? ' is-seen' : '');
      btn.type = 'button';
      btn.style.left = m.x + '%';
      btn.style.top  = m.y + '%';
      btn.dataset.id = m.id;
      btn.setAttribute('aria-label', m.name || ('Memory ' + m.number));
      btn.innerHTML = '<span class="marker__halo"></span><span class="marker__dot"></span>';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleCard(m, btn);
      });
      layer.appendChild(btn);
    });
  }

  /* ---------------- name card ---------------- */

  function toggleCard(memory, btn) {
    if (openId === memory.id) { closeCard(); return; }
    closeCard();

    openId = memory.id;
    btn.classList.add('is-open');

    card.querySelector('.card__place').textContent = memory.place || '';
    card.querySelector('.card__name').textContent  = memory.name || ('Memory ' + memory.number);
    card.hidden = false;

    // Re-run the entry animation on every open.
    card.style.animation = 'none';
    void card.offsetWidth;
    card.style.animation = '';

    positionCard(btn);
    hintEl.classList.add('is-gone');

    card.querySelector('.card__open').onclick = () => openMemory(memory, btn);
  }

  function positionCard(btn) {
    const r  = btn.getBoundingClientRect();
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    const pad = 10;

    let left = r.left + r.width / 2 - cw / 2;
    left = Math.max(pad, Math.min(left, window.innerWidth - cw - pad));

    let top  = r.top - ch - 16;             // preferred: above the marker
    let below = false;
    if (top < pad) { top = r.bottom + 16; below = true; }

    card.style.left = left + 'px';
    card.style.top  = top + 'px';

    // Point the tail at the marker, flipping it when the card sits below.
    const tail = card.querySelector('.card__tail');
    const tx = Math.max(14, Math.min(r.left + r.width / 2 - left, cw - 14));
    tail.style.left = tx + 'px';
    tail.style.marginLeft = '-9px';
    if (below) {
      tail.style.bottom = 'auto';
      tail.style.top = '-11px';
      tail.style.transform = 'rotate(225deg)';
    } else {
      tail.style.top = 'auto';
      tail.style.bottom = '-11px';
      tail.style.transform = 'rotate(45deg)';
    }
  }

  function closeCard() {
    if (!openId) return;
    const prev = layer.querySelector('.marker.is-open');
    if (prev) prev.classList.remove('is-open');
    card.hidden = true;
    openId = null;
  }

  /* ---------------- memory page ---------------- */

  function openMemory(memory, btn) {
    // Grow the page out of the marker that was clicked.
    if (btn) {
      const r = btn.getBoundingClientRect();
      page.style.setProperty('--ox', (r.left + r.width / 2) + 'px');
      page.style.setProperty('--oy', (r.top + r.height / 2) + 'px');
    } else {
      page.style.setProperty('--ox', '50%');
      page.style.setProperty('--oy', '50%');
    }

    page.querySelector('.page__place').textContent = memory.place || '';
    page.querySelector('.page__title').textContent = memory.name || ('Memory ' + memory.number);
    page.querySelector('.page__date').textContent  = memory.date || '';
    page.querySelector('.page__sign').textContent  = content.dedication || '';

    const body = page.querySelector('.page__body');
    body.innerHTML = '';
    String(memory.body || '')
      .split(/\n{2,}/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((para) => {
        const p = document.createElement('p');
        p.textContent = para;
        body.appendChild(p);
      });

    const photos = page.querySelector('.page__photos');
    photos.innerHTML = '';
    (memory.photos || []).forEach((src, i) => {
      const fig = document.createElement('figure');
      fig.className = 'polaroid';
      fig.style.setProperty('--tilt', (i % 2 ? 1.6 : -1.8) + 'deg');
      fig.style.animationDelay = (0.35 + i * 0.09) + 's';
      const img = document.createElement('img');
      img.src = /^(https?:|\/|data:)/.test(src) ? src : 'photos/' + encodeURIComponent(src);
      img.alt = memory.name || '';
      img.loading = 'lazy';
      img.addEventListener('error', () => fig.remove());
      img.addEventListener('click', () => lightbox(img.src, img.alt));
      fig.appendChild(img);
      photos.appendChild(fig);
    });

    closeCard();
    page.hidden = false;
    page.classList.remove('is-leaving');
    page.querySelector('.page__scroll').scrollTop = 0;
    document.body.style.overflow = 'hidden';
    page.querySelector('.page__back').focus({ preventScroll: true });

    if (location.hash !== '#/' + memory.id) {
      history.pushState({ id: memory.id }, '', '#/' + memory.id);
    }

    markSeen(memory.id);
  }

  function closeMemory(fromPop) {
    if (page.hidden) return;
    page.classList.add('is-leaving');
    setTimeout(() => {
      page.hidden = true;
      page.classList.remove('is-leaving');
      document.body.style.overflow = '';
    }, 340);
    if (!fromPop && location.hash) history.pushState(null, '', location.pathname);
  }

  function markSeen(id) {
    if (seen.has(id)) return;
    seen.add(id);
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
    const btn = layer.querySelector('.marker[data-id="' + id + '"]');
    if (btn) btn.classList.add('is-seen');
  }

  function lightbox(src, alt) {
    const box = document.createElement('div');
    box.id = 'lightbox';
    const img = document.createElement('img');
    img.src = src; img.alt = alt || '';
    box.appendChild(img);
    box.addEventListener('click', () => box.remove());
    document.body.appendChild(box);
  }

  /* ---------------- routing & wiring ---------------- */

  function openFromHash() {
    const id = (location.hash || '').replace('#/', '');
    if (!id) return;
    const m = content.memories.find((x) => x.id === id);
    if (m) openMemory(m, layer.querySelector('.marker[data-id="' + id + '"]'));
  }

  function wire() {
    card.querySelector('.card__close').addEventListener('click', closeCard);
    page.querySelector('.page__back').addEventListener('click', () => closeMemory(false));

    document.addEventListener('click', (e) => {
      if (!card.hidden && !card.contains(e.target)) closeCard();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (document.getElementById('lightbox')) { document.getElementById('lightbox').remove(); return; }
      if (!page.hidden) { closeMemory(false); return; }
      closeCard();
    });

    window.addEventListener('popstate', () => {
      const id = (location.hash || '').replace('#/', '');
      if (!id) { closeMemory(true); return; }
      const m = content.memories.find((x) => x.id === id);
      if (m) openMemory(m, layer.querySelector('.marker[data-id="' + id + '"]'));
    });

    // Keep the card pinned to its marker while things move.
    const reposition = () => {
      if (openId) {
        const btn = layer.querySelector('.marker.is-open');
        if (btn) positionCard(btn);
      }
    };
    window.addEventListener('resize', reposition);
    scroller.addEventListener('scroll', reposition, { passive: true });

    // Start the mobile view centred rather than at the far west.
    requestAnimationFrame(() => {
      if (scroller.scrollWidth > scroller.clientWidth) {
        scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) / 2;
      }
    });

    // Pick up admin edits without needing a manual reload.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refresh();
    });
    window.addEventListener('focus', refresh);
  }

  let refreshing = false;
  async function refresh() {
    // Never yank content out from under someone mid-read.
    if (refreshing || !page.hidden) return;
    refreshing = true;
    try {
      const { data } = await window.MemoryAPI.loadContent();
      if (JSON.stringify(data) !== JSON.stringify(content)) {
        content = data;
        hintEl.textContent = content.hint || '';
        closeCard();
        buildMarkers();
      }
    } catch (_) { /* offline — keep showing what we have */ }
    finally { refreshing = false; }
  }
})();
