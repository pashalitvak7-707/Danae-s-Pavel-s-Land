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
      '<label>Photo files <span class="note" style="font-weight:400">— filenames from web/photos/, separated by commas</span>' +
        '<input type="text" id="ePhotos"></label>' +
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
    });
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
