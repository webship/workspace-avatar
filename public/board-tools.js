// The board, as a working board: shapes, text, pictures, moving and erasing, pages, looks, and saving.
//
// The board itself is the dashboard's (the pen, the notes, what the assistant writes and draws on it);
// this adds a second row of tools to it through window.wsAvatarWindows. What is drawn is the same SVG,
// 100 wide and 60 high, and everything this adds is under the board's own Undo and Clear.
//
// A board stays in this browser (its pages are kept in the browser's own storage, so a reload brings
// them back) until someone saves it: "Save picture" downloads a PNG, "To the workspace" writes that PNG
// into a folder of the workspace. A picture put on the board is read by the browser and goes nowhere.
(function () {
  const core = window.wsBoardCore;
  if (!core || window.wsBoardTools) return;
  const NS = 'http://www.w3.org/2000/svg';
  const KEY = 'ws-board-pages';
  const COLOURS = { ink: '#2b447c', blue: '#0074e0', sky: '#34ade2', teal: '#0f9d8a', green: '#3fa34d', amber: '#e5a00d', coral: '#ef6a5a', purple: '#7a5cc7' };
  const LOOKS = { whiteboard: 'Whiteboard', chalkboard: 'Chalkboard', grid: 'Grid paper', dots: 'Dotted paper' };
  const TOOLS = [['move', 'Move', 'Drag something on the board'], ['erase', 'Erase', 'Click something to remove it'],
    ['rect', 'Rectangle', 'Drag to draw a rectangle'], ['ellipse', 'Ellipse', 'Drag to draw an ellipse'], ['diamond', 'Diamond', 'Drag to draw a diamond (a decision)'],
    ['line', 'Line', 'Drag to draw a line'], ['arrow', 'Arrow', 'Drag to draw an arrow'], ['text', 'Text', 'Click where the words go']];
  const STYLE_KEYS = { stroke: 'stroke', fill: 'fill', 'stroke-width': 'strokeWidth', 'fill-opacity': 'fillOpacity', 'font-size': 'fontSize' };

  let b = null;            // the board: { svg, area, lines, window, keep, clear }
  let bar = null;
  let tool = '';
  let state = core.pagesOf(read());
  let saveTimer = null;

  function read() { try { return JSON.parse(window.localStorage.getItem(KEY) || 'null'); } catch (_) { return null; } }
  function store() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!b) return;
      state.pages[state.at] = snapshot();
      try { window.localStorage.setItem(KEY, JSON.stringify(state)); }
      catch (_) {
        // Too large for the browser's storage (pictures): the pages are kept without their pictures.
        try { window.localStorage.setItem(KEY, JSON.stringify({ at: state.at, pages: state.pages.map((p) => ({ ...p, items: p.items.filter((i) => i.tag !== 'image') })) })); } catch (__) { /* not kept */ }
      }
    }, 400);
  }

  const items = () => [...b.svg.children].filter((el) => el.tagName.toLowerCase() !== 'defs');
  /** The page that is shown, as a plain list: what the drawing is made of, the lines, the notes. */
  function snapshot() {
    const list = items().map((el) => {
      const tag = el.tagName.toLowerCase();
      const attrs = {};
      for (const a of el.attributes) attrs[a.name] = a.value;
      const style = {};
      for (const [name, prop] of Object.entries(STYLE_KEYS)) { const v = el.style[prop] || el.getAttribute(name); if (v) style[name] = String(v).replace(/px$/, name === 'font-size' ? 'px' : ''); }
      // A stroke that is being drawn carries its own length as a dash: only a real dashed line is kept.
      if (el.style.strokeDasharray && !el.style.animation && /^1(px)? 1(px)?$/.test(el.style.strokeDasharray.replace(/,/g, ' ').replace(/\s+/g, ' '))) style['stroke-dasharray'] = '1 1';
      return { tag, attrs, style, text: tag === 'text' ? el.textContent : undefined, move: el.getAttribute('transform') || undefined };
    });
    return core.cleanPage({
      items: list,
      lines: [...b.lines.querySelectorAll('li')].map((li) => li.textContent),
      notes: [...b.area.querySelectorAll('.avatar-note')].map((n) => ({ text: (n.querySelector('.avatar-note-text') || n).innerText || '', left: n.style.left, top: n.style.top })),
    });
  }
  function build(item) {
    const el = document.createElementNS(NS, item.tag);
    for (const [k, v] of Object.entries(item.attrs)) el.setAttribute(k, v);
    for (const [name, v] of Object.entries(item.style)) el.style.setProperty(name, v);
    if (item.tag === 'text') { el.setAttribute('class', 'avatar-board-label'); el.textContent = item.text || ''; }
    else if (item.tag === 'image') el.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    else el.setAttribute('class', 'avatar-stroke');
    if (item.move) el.setAttribute('transform', item.move);
    b.svg.appendChild(el);
    b.keep(el);
    return el;
  }
  /** Put a page on the board: after `clear`, or added to what is there. */
  function put(page, { clear = true } = {}) {
    // The board's own Clear, then whatever it leaves on the drawing (it knows fewer shapes than a board can hold).
    if (clear) { b.clear(); items().forEach((el) => el.remove()); }
    for (const item of page.items) build(item);
    if (page.lines.length) window.wsAvatarWindows.write(page.lines);
    for (const n of page.notes) { const el = window.wsAvatarWindows.note(n.text || ' '); if (el && el.style) { el.style.left = n.left; el.style.top = n.top; } }
    if (document.activeElement && document.activeElement.blur && b.area.contains(document.activeElement)) document.activeElement.blur();
  }

  const pen = () => {
    const base = b.window.querySelector('.avatar-board-bar');
    const c = base && base.querySelector('[data-colour][aria-pressed="true"]');
    const w = base && base.querySelector('[data-width][aria-pressed="true"]');
    // The first colour is the board's own ink: it is left to the look (dark on a whiteboard, chalk on a chalkboard).
    const name = (c && c.dataset.colour) || 'ink';
    return { colour: name === 'ink' ? '' : (COLOURS[name] || ''), width: Math.max(0.1, Math.min(3, Number(w && w.dataset.width) || 0.3)) };
  };
  // Where the pointer is, in the board's own units. The drawing keeps its proportions inside the window
  // (it is letterboxed when the window is not 5 by 3), so the browser's own matrix is asked, not the box.
  const point = (e) => {
    const m = b.svg.getScreenCTM();
    if (m) { const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()); return [pt.x, pt.y]; }
    const r = b.svg.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * core.W, ((e.clientY - r.top) / r.height) * core.H];
  };

  function setTool(next) {
    tool = tool === next ? '' : next;
    bar.querySelectorAll('[data-tool]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.tool === tool)));
    b.area.dataset.tool = tool;
    // One tool at a time: the board's own pen steps aside.
    const penBtn = b.window.querySelector('[data-board="pen"]');
    if (tool && penBtn && penBtn.getAttribute('aria-pressed') === 'true') penBtn.click();
  }

  function say(text) { const el = bar.querySelector('.ws-board-said'); el.textContent = text; clearTimeout(say.t); say.t = setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, 5000); }

  // ---- Drawing, moving, erasing ------------------------------------------------------------------
  function wire() {
    let drag = null;
    b.svg.addEventListener('pointerdown', (e) => {
      if (!tool) return;
      const [x, y] = point(e);
      const hit = e.target !== b.svg && e.target.closest && !e.target.closest('defs') ? e.target : null;
      if (tool === 'erase') { if (hit) { hit.remove(); store(); } return; }
      if (tool === 'text') { e.preventDefault(); return askText(x, y, e); }
      e.preventDefault();
      b.svg.setPointerCapture(e.pointerId);
      if (tool === 'move') {
        if (!hit) return;
        const m = (hit.getAttribute('transform') || '').match(/translate\((-?[\d.]+)[ ,](-?[\d.]+)\)/);
        drag = { el: hit, x, y, dx: m ? Number(m[1]) : 0, dy: m ? Number(m[2]) : 0 };
        return;
      }
      drag = { x, y, el: null };
    });
    b.svg.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const [x, y] = point(e);
      if (tool === 'move') { drag.el.setAttribute('transform', `translate(${(drag.dx + x - drag.x).toFixed(2)} ${(drag.dy + y - drag.y).toFixed(2)})`); return; }
      const shape = core.shapeFrom(tool, drag.x, drag.y, x, y);
      if (!shape) return;
      if (!drag.el || drag.el.tagName.toLowerCase() !== shape.tag) {
        if (drag.el) drag.el.remove();
        const p = pen();
        drag.el = document.createElementNS(NS, shape.tag);
        drag.el.setAttribute('class', 'avatar-stroke');
        if (p.colour) drag.el.style.stroke = p.colour;
        drag.el.style.strokeWidth = String(p.width);
        b.svg.appendChild(drag.el);
      }
      for (const [k, v] of Object.entries(shape.attrs)) drag.el.setAttribute(k, v);
    });
    ['pointerup', 'pointercancel'].forEach((ev) => b.svg.addEventListener(ev, () => {
      if (!drag) return;
      if (tool !== 'move' && drag.el) b.keep(drag.el);
      drag = null;
      store();
    }));
    // What the board's own tools and the assistant put on it is kept too.
    new MutationObserver(store).observe(b.svg, { childList: true });
    new MutationObserver(store).observe(b.lines, { childList: true });
    b.area.addEventListener('input', store);
    b.area.addEventListener('pointerup', store);
  }

  function askText(x, y, e) {
    const old = b.area.querySelector('.ws-board-typing');
    if (old) old.remove();
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'ws-board-typing';
    input.maxLength = 120;
    input.setAttribute('aria-label', 'Words for the board');
    const r = b.area.getBoundingClientRect();
    input.style.left = `${Math.max(0, Math.min(r.width - 160, e.clientX - r.left - 80))}px`;
    input.style.top = `${Math.max(0, e.clientY - r.top - 14)}px`;
    const p = pen();
    let finished = false;
    const done = (keep) => {
      if (finished) return;        // Enter removes the field, and removing it blurs it: once is enough
      finished = true;
      const words = input.value.trim();
      input.remove();
      if (!keep || !words) return;
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', x.toFixed(2));
      t.setAttribute('y', y.toFixed(2));
      t.setAttribute('class', 'avatar-board-label');
      if (p.colour) t.style.fill = p.colour;
      t.style.fontSize = `${(2.2 + p.width * 2).toFixed(1)}px`;
      t.textContent = words;
      b.svg.appendChild(t);
      b.keep(t);
      store();
    };
    input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); done(true); } else if (ev.key === 'Escape') { ev.stopPropagation(); done(false); } });
    input.addEventListener('blur', () => done(true));
    b.area.appendChild(input);
    input.focus();
  }

  // ---- Pictures ------------------------------------------------------------------------------------
  function addPicture(file) {
    const why = core.imageProblem(file && file.type, file && file.size);
    if (why) return say(why);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const item = core.cleanItem({ tag: 'image', attrs: { ...core.fitImage(img.naturalWidth, img.naturalHeight), href: String(reader.result) } });
        if (!item) return say('That picture could not be read.');
        build(item);
        store();
        say('The picture is on the board. It stays in this browser until you save the board.');
      };
      img.onerror = () => say('That picture could not be read.');
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
    return undefined;
  }

  // ---- Pages -----------------------------------------------------------------------------------------
  function paintPages() {
    bar.querySelector('.ws-board-page').textContent = `Page ${state.at + 1} of ${state.pages.length}`;
    bar.querySelector('[data-page="previous"]').disabled = state.at === 0;
    bar.querySelector('[data-page="next"]').disabled = state.at === state.pages.length - 1;
    bar.querySelector('[data-page="add"]').disabled = state.pages.length >= core.MAX_PAGES;
  }
  function turn(change) {
    state.pages[state.at] = snapshot();
    state = change(state);
    put(state.pages[state.at]);
    paintPages();
    store();
  }

  // ---- Saving ----------------------------------------------------------------------------------------
  const BACKGROUND = { whiteboard: '#ffffff', chalkboard: '#23402f', grid: '#ffffff', dots: '#ffffff' };
  /** The page that is shown, as a PNG: the drawing with its lines of text above it, on the board's own colour. */
  function png() {
    const look = b.area.dataset.look || 'whiteboard';
    const copy = b.svg.cloneNode(true);
    copy.setAttribute('xmlns', NS);
    copy.setAttribute('width', '2000');
    copy.setAttribute('height', '1200');
    const ink = look === 'chalkboard' ? '#f4f1e8' : '#2b447c';
    copy.setAttribute('style', `color:${ink}`);     // an arrow's head takes the board's ink
    const style = document.createElementNS(NS, 'style');
    style.textContent = `.avatar-stroke{fill:none;stroke:${ink};stroke-width:.45;stroke-linecap:round;stroke-linejoin:round}.avatar-ink{stroke-width:.5}.avatar-board-label{font:2.6px sans-serif;fill:${ink};text-anchor:middle;dominant-baseline:middle}`;
    copy.insertBefore(style, copy.firstChild);
    copy.querySelectorAll('*').forEach((el) => { el.style.animation = ''; if (el.style.strokeDashoffset) { el.style.strokeDashoffset = ''; if (!/^1(px)? 1/.test(el.style.strokeDasharray)) el.style.strokeDasharray = ''; } });
    const back = document.createElementNS(NS, 'rect');
    back.setAttribute('width', '100'); back.setAttribute('height', '60'); back.setAttribute('fill', BACKGROUND[look] || '#ffffff');
    copy.insertBefore(back, style.nextSibling);
    [...b.lines.querySelectorAll('li')].slice(0, 8).forEach((li, i) => {
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', '2'); t.setAttribute('y', String(3.5 + i * 3.2));
      t.setAttribute('style', `font:2.4px sans-serif;fill:${ink};text-anchor:start`);
      t.textContent = `${i + 1}. ${li.textContent}`.slice(0, 110);
      copy.appendChild(t);
    });
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: 'image/svg+xml' }));
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 2000; canvas.height = 1200;
        canvas.getContext('2d').drawImage(img, 0, 0, 2000, 1200);
        URL.revokeObjectURL(url);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('no picture'))), 'image/png');
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('the board could not be drawn')); };
      img.src = url;
    });
  }
  function savePicture() {
    png().then((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = core.fileName(new Date(), state.at + 1, 'png');
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      say(`Saved ${a.download}.`);
    }).catch((err) => say(`Not saved: ${err.message}.`));
  }
  function saveToWorkspace() {
    const name = core.fileName(new Date(), state.at + 1, 'png');
    png().then((blob) => fetch(`/actions/p/avatar/board-save?name=${encodeURIComponent(name)}`, { method: 'POST', headers: { 'Content-Type': 'image/png' }, body: blob }))
      .then((r) => r.json().then((j) => (r.ok ? j : Promise.reject(new Error(j.error || String(r.status))))))
      .then((j) => say(`Saved in the workspace: ${j.saved}`))
      .catch((err) => say(`Not saved: ${err.message}`));
  }

  // ---- The row of tools ---------------------------------------------------------------------------------
  function mount() {
    const windowsApi = window.wsAvatarWindows;
    if (!windowsApi || !windowsApi.isOpen('board')) return;
    b = windowsApi.board();
    if (!b || !b.window || b.window.querySelector('.ws-board-tools')) return;
    bar = document.createElement('div');
    bar.className = 'ws-board-tools';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'More board tools');
    bar.innerHTML = `${TOOLS.map(([id, label, title]) => `<button type="button" class="avatar-chip" data-tool="${id}" aria-pressed="false" title="${title}">${label}</button>`).join('')}
      <button type="button" class="avatar-chip" data-do="picture" title="Put a picture from this computer on the board">Picture</button>
      <input type="file" class="ws-board-file" accept="${core.IMAGE_TYPES.join(',')}" hidden aria-hidden="true" tabindex="-1">
      <label class="ws-board-look"><span>Look</span> <select aria-label="The board's look">${Object.entries(LOOKS).map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}</select></label>
      <span class="ws-board-pages" role="group" aria-label="Pages">
        <button type="button" class="avatar-chip" data-page="previous" title="The page before" aria-label="The page before">&lsaquo;</button>
        <span class="ws-board-page" aria-live="polite"></span>
        <button type="button" class="avatar-chip" data-page="next" title="The next page" aria-label="The next page">&rsaquo;</button>
        <button type="button" class="avatar-chip" data-page="add" title="A new page after this one">New page</button>
        <button type="button" class="avatar-chip" data-page="remove" title="Remove this page">Remove page</button>
      </span>
      <button type="button" class="avatar-chip" data-do="png" title="Download this page as a PNG picture">Save picture</button>
      <button type="button" class="avatar-chip" data-do="workspace" title="Write this page as a PNG into a folder of the workspace">To the workspace</button>
      <span class="ws-board-said" role="status" aria-live="polite"></span>`;
    const base = b.window.querySelector('.avatar-board-bar');
    base.parentNode.insertBefore(bar, base.nextSibling);
    const file = bar.querySelector('.ws-board-file');
    bar.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tool], [data-do], [data-page]');
      if (!t) return;
      if (t.dataset.tool) setTool(t.dataset.tool);
      else if (t.dataset.do === 'picture') file.click();
      else if (t.dataset.do === 'png') savePicture();
      else if (t.dataset.do === 'workspace') saveToWorkspace();
      else if (t.dataset.page === 'previous') turn((s) => core.go(s, s.at - 1));
      else if (t.dataset.page === 'next') turn((s) => core.go(s, s.at + 1));
      else if (t.dataset.page === 'add') turn(core.add);
      else if (t.dataset.page === 'remove') turn(core.remove);
    });
    file.addEventListener('change', () => { if (file.files[0]) addPicture(file.files[0]); file.value = ''; });
    // A picture copied elsewhere can be pasted on the board while the pointer is over it.
    b.window.addEventListener('paste', (e) => {
      const f = [...((e.clipboardData && e.clipboardData.files) || [])].find((x) => /^image\//.test(x.type));
      if (f) { e.preventDefault(); addPicture(f); }
    });
    const look = bar.querySelector('.ws-board-look select');
    let kept = 'whiteboard';
    try { kept = window.localStorage.getItem('ws-board-look') || 'whiteboard'; } catch (_) { /* default */ }
    look.value = LOOKS[kept] ? kept : 'whiteboard';
    b.area.dataset.look = look.value;
    look.addEventListener('change', () => { b.area.dataset.look = look.value; try { window.localStorage.setItem('ws-board-look', look.value); } catch (_) { /* not kept */ } });
    // The board's own pen was picked: this row's tool steps aside.
    base.addEventListener('click', (e) => { if (e.target.closest('[data-board="pen"]') && tool) setTool(tool); });

    // What was on the board when it was last open comes back, under whatever has just been put on it.
    const fresh = snapshot();
    const saved = state.pages[state.at];
    if (saved.items.length || saved.lines.length || saved.notes.length) { put(saved); put(fresh, { clear: false }); }
    wire();
    paintPages();
    window.wsBoardTools.mounted = true;
  }

  window.wsBoardTools = { mounted: false, state: () => state, snapshot: () => (b ? snapshot() : null), png: () => (b ? png() : Promise.reject(new Error('the board is closed'))) };
  document.addEventListener('ws-avatar-window', (e) => { if (e.detail && e.detail.kind === 'board') setTimeout(mount, 0); });
  window.addEventListener('pagehide', () => { if (b && b.window.isConnected) { state.pages[state.at] = snapshot(); try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) { /* not kept */ } } });
  if (window.wsAvatarWindows && window.wsAvatarWindows.isOpen('board')) mount();
}());
