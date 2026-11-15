// The reading window, as a working browser for the AI Assistant: the workspace's own sites, a page's
// sections, a section read aloud or put on the board, a picture of a local page, and its tests.
//
// The reading window itself is the dashboard's: a page is fetched by the dashboard and shown with no
// script and no form, so it is read and never acted on. This adds a second row of tools to it through
// window.wsAvatarWindows. A site out on the web is only read. A picture and the tests are for a site of
// this workspace, and both are done by the dashboard, not by this page.
(function () {
  const core = window.wsBrowserCore;
  if (!core || window.wsBrowserTools) return;
  const GLOBE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></svg>';
  let win = null; let bar = null; let sites = []; let sections = []; let blocks = [];
  const windows = () => window.wsAvatarWindows || null;
  const doc = () => (windows() ? windows().readerDocument() : null);
  const say = (text, link) => {
    const el = bar && bar.querySelector('.ws-browser-said');
    if (!el) return;
    el.textContent = text;
    if (link) { const a = document.createElement('a'); a.href = link.href; a.textContent = link.text; el.append(' ', a); }
  };
  const address = () => { const a = win && win.querySelector('.avatar-browser-address'); return a ? a.value.trim() : ''; };
  /** The local site the page that is shown belongs to, as the dashboard marked it ("dev/blog1"), or ''. */
  const localOf = () => { const d = doc(); const mark = d && d.querySelector('[data-local-site]'); return mark ? mark.getAttribute('data-local-site') : ''; };

  function readPage() {
    const d = doc();
    blocks = d && d.body ? [...d.body.querySelectorAll('h1, h2, h3, h4, h5, h6, p, li, pre, td, blockquote')].filter((el) => !el.classList.contains('hint')) : [];
    sections = core.sectionsOf(blocks.map((el) => ({ tag: el.tagName, text: el.textContent })));
    const select = bar.querySelector('.ws-browser-section');
    select.replaceChildren(new Option(sections.length ? `Sections (${sections.length})` : 'No sections on this page', ''));
    sections.forEach((s, i) => select.add(new Option(`${'  '.repeat(Math.max(0, s.level - 1))}${s.title}`, String(i))));
    select.disabled = !sections.length;
    const local = Boolean(localOf());
    bar.querySelectorAll('[data-local]').forEach((b) => { b.hidden = !local; });
    say(local ? `A site of this workspace (${localOf()}): read without signing in.` : '');
  }
  const chosen = () => { const v = bar.querySelector('.ws-browser-section').value; return v === '' ? null : sections[Number(v)]; };
  function goTo(section) {
    const el = section && section.index >= 0 ? blocks[section.index] : (blocks[0] || null);
    if (!el) return;
    el.scrollIntoView({ block: 'start' });
    blocks.forEach((b) => { b.style.outline = ''; });
    el.style.outline = '2px solid #0074e0';
    el.style.outlineOffset = '4px';
  }

  function readAloud() {
    const section = chosen() || sections[0];
    const text = core.spoken(section);
    if (!text) return say('There is nothing to read on this page.');
    goTo(section);
    // The local voice says it sentence by sentence when it is there; otherwise the avatar's summary voice.
    if (window.wsSpeech && window.wsSpeech.engines && window.wsSpeech.engines.tts) { window.wsSpeech.speak(text); return say(`Reading "${section.title}".`); }
    if (windows().speak(text.slice(0, 900))) return say(`Reading "${section.title}".`);
    return say('The voice is off: turn it on with the loudspeaker button under the conversation.');
  }
  function hush() {
    if (window.wsSpeech && window.wsSpeech.quiet) window.wsSpeech.quiet();
    if (window.wsAssistantVoice && window.wsAssistantVoice.cancel) window.wsAssistantVoice.cancel();
    say('');
  }
  function sectionToBoard() {
    const section = chosen() || sections[0];
    const b = core.forBoard(section);
    if (!b.line && !b.note) return say('There is nothing to put on the board.');
    if (b.line) windows().write([b.line]);
    if (b.note) windows().note(b.note);
    raise();
    return say('The section is on the board.');
  }
  // The board opens beside the reading window, never over it.
  function raise() { const board = windows().isOpen('board') && windows().board().window; if (win && board) win.style.zIndex = String((Number(getComputedStyle(board).zIndex) || 0) + 1); }

  function pictureToBoard() {
    const url = address();
    say('Taking a picture of the page…');
    fetch('/actions/p/avatar/site-snap', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })
      .then((r) => (r.ok ? r.blob() : r.json().then((j) => Promise.reject(new Error(j.error || String(r.status))))))
      .then((blob) => new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(String(fr.result)); fr.onerror = () => reject(new Error('the picture could not be read')); fr.readAsDataURL(blob); }))
      .then((href) => {
        const boardCore = window.wsBoardCore;
        const item = boardCore && boardCore.cleanItem({ tag: 'image', attrs: { ...boardCore.fitImage(1280, 800), href } });
        if (!item) throw new Error('the board\'s tools are not here');
        const b = windows().board();
        const el = document.createElementNS('http://www.w3.org/2000/svg', 'image');
        for (const [k, v] of Object.entries(item.attrs)) el.setAttribute(k, v);
        el.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        b.svg.appendChild(el);
        b.keep(el);
        raise();
        say('A picture of the page is on the board. It stays in this browser until you save the board.');
      })
      .catch((err) => say(`No picture: ${err.message}`));
  }

  function testSite() {
    const url = address();
    say('Starting the tests…');
    fetch('/actions/p/avatar/site-test', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ url }).toString() })
      .then((r) => r.text().then((html) => ({ ok: r.ok, html })))
      .then(({ ok, html }) => {
        // The dashboard's answer is read as a document of its own: nothing in it runs or loads.
        const box = new DOMParser().parseFromString(html, 'text/html').body;
        const text = box.textContent.replace(/\s+/g, ' ').trim().slice(0, 400);
        const report = box.querySelector('[data-report]');
        say(text || (ok ? 'Started.' : 'Not started.'), report && /^\/[a-z0-9_-]+$/.test(report.getAttribute('data-report')) ? { href: report.getAttribute('data-report'), text: 'Open that page' } : null);
        document.body.dispatchEvent(new CustomEvent('refresh-projects'));
      })
      .catch((err) => say(`The tests were not started: ${err.message}`));
  }

  function mount() {
    if (!windows() || !windows().isOpen('browser')) return;
    win = document.querySelector('.avatar-window-browser');
    if (!win || win.querySelector('.ws-browser-tools')) return;
    const base = win.querySelector('.avatar-browser-bar');
    const frame = win.querySelector('.avatar-reader');
    if (!base || !frame) return;
    bar = document.createElement('div');
    bar.className = 'ws-browser-tools';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Reading tools');
    bar.innerHTML = '<select class="ws-browser-site" aria-label="A site of this workspace" hidden></select>'
      + '<select class="ws-browser-section" aria-label="A section of this page" disabled><option value="">No sections on this page</option></select>'
      + '<button type="button" class="avatar-chip" data-read="aloud" title="Read the chosen section aloud">Read section</button>'
      + '<button type="button" class="avatar-chip" data-read="hush" title="Stop reading">Stop reading</button>'
      + '<button type="button" class="avatar-chip" data-read="board" title="Put the section on the board: its title as a line, its words as a note">Section to the board</button>'
      + '<button type="button" class="avatar-chip" data-read="picture" data-local hidden title="A picture of this page, on the board. For a site of this workspace">Picture to the board</button>'
      + '<button type="button" class="avatar-chip" data-read="test" data-local hidden title="Run this project\'s Webship-js tests. For a site of this workspace">Test this site</button>'
      + '<span class="ws-browser-said" role="status" aria-live="polite"></span>';
    base.parentNode.insertBefore(bar, frame);
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-read]');
      if (!b) return;
      ({ aloud: readAloud, hush, board: sectionToBoard, picture: pictureToBoard, test: testSite })[b.dataset.read]();
    });
    bar.querySelector('.ws-browser-section').addEventListener('change', () => goTo(chosen()));
    const siteSelect = bar.querySelector('.ws-browser-site');
    siteSelect.addEventListener('change', () => { const to = core.siteAddress(siteSelect.value); if (to) windows().browse(to); siteSelect.value = ''; });
    paintSites();
    frame.addEventListener('load', readPage);
    readPage();
  }
  function paintSites() {
    const select = bar && bar.querySelector('.ws-browser-site');
    if (!select) return;
    select.replaceChildren(new Option(`Sites of this workspace (${sites.length})`, ''));
    sites.forEach((s) => select.add(new Option(`${s.workspace}/${s.project}`, s.host)));
    select.hidden = !sites.length;
  }

  window.wsBrowserTools = { sections: () => sections.map((s) => ({ title: s.title, level: s.level })), sites: () => sites.slice(), local: () => localOf() };
  document.addEventListener('ws-avatar-window', (e) => { if (e.detail && e.detail.kind === 'browser') setTimeout(mount, 0); });
  if (windows() && windows().isOpen('browser')) mount();

  // The workspace's own sites: a button in the avatar's tools opens the first one in the reading window.
  fetch('/fragments/p/avatar/sites', { headers: { Accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((j) => {
      sites = Array.isArray(j.sites) ? j.sites.filter((s) => core.siteAddress(s.host)) : [];
      paintSites();
      const tools = document.querySelector('.assistant-avatar-tools');
      if (!sites.length || !tools || !windows() || tools.querySelector('.ws-browser-btn')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'assistant-avatar-btn ws-browser-btn';
      button.title = 'The sites of this workspace, in the reading window';
      button.setAttribute('aria-label', button.title);
      button.innerHTML = GLOBE;
      button.addEventListener('click', () => windows().browse(core.siteAddress(sites[0].host)));
      tools.appendChild(button);
    })
    .catch(() => { /* no site tools on this dashboard */ });
}());
