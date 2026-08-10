(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const api = window.MemoryAPI;

  let content = null;
  let currentId = null;
  let dirty = false;

  /* ---------------- login gate ---------------- */

  const gate = $('#gate');
  const app  = $('#app');

  if (api.token.get()) enter(api.token.get());

  $('#gateForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = $('#pw').value;
    $('#gateErr').textContent = '';
    try {
      await api.login(pw);
      api.token.set(pw);
      enter(pw);
    } catch (err) {
      $('#gateErr').textContent = err.message;
    }
  });

  async function enter() {
    gate.hidden = true;
    app.hidden = false;
    try {
      const { data, live } = await api.loadContent();
      content = data;
      if (!live) setStatus('No backend detected — edits cannot be saved live.', 'bad');
      render();
    } catch (err) {
      setStatus('Could not load content: ' + err.message, 'bad');
    }
  }

  $('#outBtn').addEventListener('click', () => {
    if (dirty && !confirm('You have unsaved changes. Sign out anyway?')) return;
    api.token.clear();
    location.reload();
  });

  /* ---------------- tabs ---------------- */

  document.querySelectorAll('#tabs button').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('is-on', x === b));
      ['text', 'place', 'site'].forEach((t) => {
        $('#tab-' + t).hidden = t !== b.dataset.tab;
      });
      if (b.dataset.tab === 'place') renderPlacement();
    });
  });

  /* ---------------- render ---------------- */

  function render() {
    renderList();
    renderSite();
    if (content.memories.length) select(currentId || content.memories[0].id);
  }

  function renderList() {
    const list = $('#listItems');
    list.innerHTML = '';
    content.memories.forEach((m) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'item' + (m.id === currentId ? ' is-on' : '');
      b.dataset.id = m.id;
      b.innerHTML =
        '<span class="item__num">' + m.number + '</span>' +
        '<span class="item__txt">' +
          '<span class="item__name"></span>' +
          '<span class="item__place"></span>' +
        '</span>';
      b.querySelector('.item__name').textContent  = m.name || '(no name)';
      b.querySelector('.item__place').textContent = m.place || '';
      b.addEventListener('click', () => select(m.id));
      list.appendChild(b);
    });
  }

  function select(id) {
    currentId = id;
    document.querySelectorAll('#list .item').forEach((el) =>
      el.classList.toggle('is-on', el.dataset.id === id));
    renderEditor();
  }

  function renderEditor() {
    const m = content.memories.find((x) => x.id === currentId);
    const box = $('#editor');
    if (!m) { box.innerHTML = '<p class="empty">Pick a memory on the left.</p>'; return; }

    box.innerHTML = '<div class="pane">' +
      '<label>Memory name <span class="note" style="font-weight:400">— this is what pops up above the dot</span>' +
        '<input type="text" id="eName"></label>' +
      '<label>Number <span class="note" style="font-weight:400">— the number you drew on the map, so you can match them up</span>' +
        '<input type="text" id="eNumber" inputmode="numeric"></label>' +
      '<label>Place <input type="text" id="ePlace"></label>' +
      '<label>Date <span class="note" style="font-weight:400">— optional, free text</span>' +
        '<input type="text" id="eDate"></label>' +
      '<label>The memory <span class="note" style="font-weight:400">— leave a blank line between paragraphs</span>' +
        '<textarea id="eBody"></textarea></label>' +
      '<span class="flabel">Photos</span>' +
      '<div id="drop" class="drop" tabindex="0" role="button">' +
        '<b>Drag photos here</b>' +
        '<span>or click to choose them from your computer</span>' +
      '</div>' +
      '<input type="file" id="filePick" accept="image/*" multiple hidden>' +
      '<p id="upStatus" class="upstatus"></p>' +
      '<div id="eThumbs" class="thumbs"></div>' +
      '<details class="adv"><summary>Or type filenames from web/photos/ by hand</summary>' +
        '<input type="text" id="ePhotos"></details>' +
      '<p class="coords">Dot position: <b id="eCoords"></b> — move it on the “Marker positions” tab.</p>' +
      '<hr class="rule">' +
      '<button type="button" id="eDelete" class="danger">Delete this memory</button>' +
    '</div>';

    $('#eName').value   = m.name || '';
    $('#eNumber').value = m.number ?? '';
    $('#ePlace').value  = m.place || '';
    $('#eDate').value   = m.date || '';
    $('#eBody').value   = m.body || '';
    $('#ePhotos').value = (m.photos || []).join(', ');
    $('#eCoords').textContent = fmtCoords(m);

    $('#eName').addEventListener('input',  (e) => { m.name = e.target.value; touch(); renderList(); });
    $('#ePlace').addEventListener('input', (e) => { m.place = e.target.value; touch(); renderList(); });
    $('#eDate').addEventListener('input',  (e) => { m.date = e.target.value; touch(); });
    $('#eBody').addEventListener('input',  (e) => { m.body = e.target.value; touch(); });
    $('#ePhotos').addEventListener('input', (e) => {
      m.photos = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
      touch();
      renderThumbs(m);
    });
    renderThumbs(m);
    wireDrop(m);
    $('#eNumber').addEventListener('input', (e) => {
      const n = parseInt(e.target.value, 10);
      m.number = Number.isFinite(n) ? n : e.target.value;
      touch();
      renderList();
    });
    $('#eDelete').addEventListener('click', () => removeMemory(m.id));
  }

  /* ---------------- add / delete ---------------- */

  function newId() {
    let id;
    do { id = 'm' + Math.random().toString(36).slice(2, 8); }
    while (content.memories.some((m) => m.id === id));
    return id;
  }

  function nextNumber() {
    const nums = content.memories
      .map((m) => parseInt(m.number, 10))
      .filter(Number.isFinite);
    return nums.length ? Math.max(...nums) + 1 : 1;
  }

  function addMemory() {
    const m = {
      id: newId(),
      number: nextNumber(),
      name: 'New memory',
      place: '',
      date: '',
      x: 50,
      y: 50,          // lands in open sea, easy to spot and drag into place
      body: '',
      photos: []
    };
    content.memories.push(m);
    currentId = m.id;
    touch();
    renderList();
    renderEditor();
    if (!$('#tab-place').hidden) renderPlacement();
    return m;
  }

  function removeMemory(id) {
    const i = content.memories.findIndex((m) => m.id === id);
    if (i === -1) return;
    const m = content.memories[i];
    if (!confirm('Delete “' + (m.name || 'this memory') + '”?\n\nIts dot disappears from the map. This cannot be undone once you save.')) return;

    content.memories.splice(i, 1);
    // Select a sensible neighbour so the editor is never left pointing at nothing.
    const next = content.memories[i] || content.memories[i - 1];
    currentId = next ? next.id : null;
    touch();
    renderList();
    renderEditor();
    if (!$('#tab-place').hidden) renderPlacement();
  }

  $('#addBtn').addEventListener('click', () => {
    addMemory();
    document.querySelector('#tabs button[data-tab="text"]').click();
    $('#eName').focus();
    $('#eName').select();
  });

  $('#addBtn2').addEventListener('click', () => {
    addMemory();
    setStatus('New dot added in the middle of the sea — drag it where you want it.', 'ok');
  });

  /* Show each named photo as it will appear, or say plainly that the file
     isn't there — a mistyped filename is otherwise invisible until the memory
     page is opened and silently shows nothing. */
  function renderThumbs(m) {
    const box = $('#eThumbs');
    if (!box) return;
    box.innerHTML = '';
    const list = m.photos || [];

    list.forEach((name, i) => {
      const fig = document.createElement('figure');
      fig.className = 'thumb';

      const img = document.createElement('img');
      img.src = /^(https?:|\/|data:)/.test(name) ? name : 'photos/' + encodeURIComponent(name);
      img.alt = name;

      const cap = document.createElement('figcaption');
      const uploaded = name.startsWith('/api/photo/');
      cap.textContent = uploaded ? 'Uploaded' : name;

      img.addEventListener('error', () => {
        fig.classList.add('is-missing');
        cap.textContent = uploaded
          ? 'This upload is missing from the server.'
          : name + ' — not found in web/photos/';
      });

      const bar = document.createElement('div');
      bar.className = 'thumb__bar';
      bar.append(
        mkBtn('‹', 'Move earlier', i === 0, () => { move(m, i, i - 1); }),
        mkBtn('›', 'Move later', i === list.length - 1, () => { move(m, i, i + 1); }),
        mkBtn('✕', 'Remove from this memory', false, () => { remove(m, i, name); })
      );

      fig.append(img, bar, cap);
      box.appendChild(fig);
    });
  }

  function mkBtn(label, title, disabled, fn) {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label; b.title = title; b.disabled = disabled;
    b.addEventListener('click', fn);
    return b;
  }

  function move(m, from, to) {
    const [item] = m.photos.splice(from, 1);
    m.photos.splice(to, 0, item);
    touch(); syncPhotoField(m); renderThumbs(m);
  }

  async function remove(m, i, name) {
    m.photos.splice(i, 1);
    touch(); syncPhotoField(m); renderThumbs(m);
    // Uploaded photos are only ours to delete, and only once nothing else uses them.
    if (name.startsWith('/api/photo/') && !usedAnywhere(name)) {
      const key = name.slice('/api/photo/'.length);
      try { await api.deletePhoto(key, api.token.get()); } catch { /* leave the orphan */ }
    }
  }

  function usedAnywhere(name) {
    return content.memories.some((mm) => (mm.photos || []).includes(name));
  }

  function syncPhotoField(m) {
    const f = $('#ePhotos');
    if (f) f.value = (m.photos || []).join(', ');
  }

  /* ---------------- uploading ---------------- */

  const HEIC = /\.(heic|heif)$/i;

  /* Shrink before upload: a phone photo is often 5-8MB, which is slow to send,
     slow to load, and close to the request size limit. */
  async function shrink(file, max = 1600, quality = 0.85) {
    if (file.type === 'image/gif') return file;          // resizing would kill the animation
    let bmp;
    try { bmp = await createImageBitmap(file); }
    catch { return file; }                                // let the server say what it can't take
    if (bmp.width <= max && bmp.height <= max && file.size < 900 * 1024) return file;

    const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s);
    c.height = Math.round(bmp.height * s);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', quality));
    if (!blob) return file;
    return new File([blob], (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg',
                    { type: 'image/jpeg' });
  }

  async function addFiles(m, files) {
    const imgs = [...files].filter((f) => f.type.startsWith('image/') || HEIC.test(f.name));
    if (!imgs.length) { upStatus('Those files are not images.', 'bad'); return; }

    let done = 0, failed = 0;
    for (const file of imgs) {
      upStatus(`Uploading ${done + failed + 1} of ${imgs.length}…`, '');
      try {
        if (HEIC.test(file.name) && !file.type.startsWith('image/')) {
          throw new Error(file.name + ' is a HEIC file — save it as JPG first.');
        }
        const small = await shrink(file);
        const { url } = await api.uploadPhoto(small, api.token.get());
        m.photos = m.photos || [];
        m.photos.push(url);
        done++;
        touch(); syncPhotoField(m); renderThumbs(m);
      } catch (err) {
        failed++;
        upStatus(err.message, 'bad');
        if (/password/i.test(err.message)) return;
      }
    }
    if (!failed) {
      upStatus(done + (done === 1 ? ' photo added' : ' photos added') +
               ' — press Save changes to publish.', 'ok');
    }
  }

  function upStatus(msg, kind) {
    const el = $('#upStatus');
    if (!el) return;
    el.textContent = msg;
    el.className = 'upstatus' + (kind ? ' is-' + kind : '');
  }

  function wireDrop(m) {
    const drop = $('#drop');
    const pick = $('#filePick');
    if (!drop || !pick) return;

    drop.addEventListener('click', () => pick.click());
    drop.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick.click(); }
    });
    pick.addEventListener('change', () => {
      if (pick.files.length) addFiles(m, pick.files);
      pick.value = '';
    });

    ['dragenter', 'dragover'].forEach((ev) =>
      drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
    ['dragleave', 'dragend'].forEach((ev) =>
      drop.addEventListener(ev, () => drop.classList.remove('is-over')));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('is-over');
      if (e.dataTransfer?.files?.length) addFiles(m, e.dataTransfer.files);
    });
  }

  function fmtCoords(m) {
    return m.x.toFixed(1) + '% across, ' + m.y.toFixed(1) + '% down';
  }

  function renderSite() {
    $('#fTitle').value = content.title || '';
    $('#fHint').value  = content.hint || '';
    $('#fDedic').value = content.dedication || '';
    $('#fTitle').oninput = (e) => { content.title = e.target.value; touch(); };
    $('#fHint').oninput  = (e) => { content.hint = e.target.value; touch(); };
    $('#fDedic').oninput = (e) => { content.dedication = e.target.value; touch(); };
  }

  /* ---------------- marker placement ---------------- */

  function renderPlacement() {
    const wrap = $('#placeMarkers');
    wrap.innerHTML = '';
    content.memories.forEach((m) => {
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'pin' + (m.id === currentId ? ' is-on' : '');
      pin.style.left = m.x + '%';
      pin.style.top  = m.y + '%';
      pin.textContent = m.number;
      pin.title = 'Click to select, or drag to move';
      pin.addEventListener('click', (e) => { e.stopPropagation(); });
      pin.addEventListener('pointerdown', (e) => startDrag(e, m));
      wrap.appendChild(pin);
    });

    const chips = $('#placeList');
    chips.innerHTML = '';
    content.memories.forEach((m) => {
      const c = document.createElement('button');
      c.type = 'button';
      c.className = 'chip' + (m.id === currentId ? ' is-on' : '');
      c.textContent = m.number + '. ' + (m.name || '');
      c.addEventListener('click', () => { select(m.id); renderPlacement(); });
      chips.appendChild(c);
    });
  }

  /* Drag a pin to move it — the only reliable way to separate dots that sit
     on top of each other in the tight clusters (St. Tropez, Corfu, Limassol). */
  function startDrag(e, memory) {
    e.stopPropagation();
    e.preventDefault();

    const pin = e.currentTarget;
    const canvas = $('#placeCanvas');
    let moved = false;

    // Capture first: re-rendering would detach this node and void the capture.
    try { pin.setPointerCapture(e.pointerId); } catch (_) { /* older browsers */ }
    if (memory.id !== currentId) selectWithoutRerender(memory.id);

    const onMove = (ev) => {
      moved = true;
      setPos(memory, ev.clientX, ev.clientY, canvas);
      pin.style.left = memory.x + '%';
      pin.style.top  = memory.y + '%';
    };

    const onUp = () => {
      pin.removeEventListener('pointermove', onMove);
      pin.removeEventListener('pointerup', onUp);
      pin.removeEventListener('pointercancel', onUp);
      if (moved) { touch(); renderPlacement(); syncCoords(); }
    };

    pin.addEventListener('pointermove', onMove);
    pin.addEventListener('pointerup', onUp);
    pin.addEventListener('pointercancel', onUp);
  }

  /* Move the selection without rebuilding the pins, so a pointer capture
     taken on a pin survives. */
  function selectWithoutRerender(id) {
    currentId = id;
    document.querySelectorAll('#list .item').forEach((el) =>
      el.classList.toggle('is-on', el.dataset.id === id));
    const idx = content.memories.findIndex((m) => m.id === id);
    document.querySelectorAll('#placeMarkers .pin').forEach((el, i) =>
      el.classList.toggle('is-on', i === idx));
    document.querySelectorAll('#placeList .chip').forEach((el, i) =>
      el.classList.toggle('is-on', i === idx));
    renderEditor();
  }

  function setPos(m, clientX, clientY, canvas) {
    const r = canvas.getBoundingClientRect();
    m.x = +Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)).toFixed(2);
    m.y = +Math.max(0, Math.min(100, ((clientY - r.top) / r.height) * 100)).toFixed(2);
  }

  function syncCoords() {
    const el = $('#eCoords');
    const m = content.memories.find((x) => x.id === currentId);
    if (el && m) el.textContent = fmtCoords(m);
  }

  // Clicking bare map moves the selected dot there.
  $('#placeCanvas').addEventListener('click', (e) => {
    if (!currentId || e.target.classList.contains('pin')) return;
    const m = content.memories.find((x) => x.id === currentId);
    if (!m) return;
    setPos(m, e.clientX, e.clientY, e.currentTarget);
    touch();
    renderPlacement();
    syncCoords();
  });

  /* The numbered drawing is loaded only when asked for, so the admin panel
     doesn't 404 on every visit while that file is still missing. */
  $('#showNumbers').addEventListener('change', (e) => {
    const img = $('#placeMapNum');
    if (!e.target.checked) { img.hidden = true; return; }
    if (!img.src) img.src = img.dataset.src;
    img.hidden = false;
  });

  $('#placeMapNum').addEventListener('error', () => {
    $('#placeMapNum').hidden = true;
    $('#showNumbers').checked = false;
    $('#showNumbers').disabled = true;
    const warn = $('#numWarn');
    warn.textContent = 'world-numbered.png is not in web/art/ yet — upload it to line the dots up against your numbers.';
    warn.hidden = false;
  });

  /* ---------------- save / backup ---------------- */

  function touch() {
    dirty = true;
    $('#saveBtn').disabled = false;
    setStatus('Unsaved changes', '');
  }

  function setStatus(msg, kind) {
    const el = $('#status');
    el.textContent = msg;
    el.className = kind || '';
  }

  $('#saveBtn').addEventListener('click', async () => {
    $('#saveBtn').disabled = true;
    setStatus('Saving…', '');
    try {
      await api.saveContent(content, api.token.get());
      dirty = false;
      setStatus('Saved — the site is updated.', 'ok');
    } catch (err) {
      $('#saveBtn').disabled = false;
      setStatus(err.message, 'bad');
      if (/password/i.test(err.message)) { api.token.clear(); setTimeout(() => location.reload(), 1500); }
    }
  });

  $('#dlBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'memories-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $('#upInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || !Array.isArray(data.memories)) throw new Error('That file is not a memories backup.');
      content = data;
      currentId = null;
      render();
      touch();
      setStatus('Restored from file — press Save to publish it.', 'ok');
    } catch (err) {
      setStatus(err.message, 'bad');
    }
    e.target.value = '';
  });

  window.addEventListener('beforeunload', (e) => {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });
})();
