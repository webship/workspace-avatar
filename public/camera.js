// The camera, for the AI Assistant: show it something.
//
// The camera opens only when the person presses the camera button, after the browser's own permission
// question, and never by itself: not on a page load, not because the assistant asked. While it is on, its
// window says "Camera on" beside a red dot and the button is lit; "Turn off", closing the window, Escape
// or leaving the page each stop it at once.
//
// The preview is the browser's and goes nowhere. One still picture leaves the browser, and only when the
// person presses "Look at this": it is posted to this dashboard, which keeps it for the one turn it goes
// with (the next thing typed or said) and deletes it when the answer has come. "To the board" puts a
// still on the board, where it stays in the browser like any picture. Nothing is recorded.
(function () {
  if (window.wsCamera) return;
  const MAX_WIDTH = 640;
  const ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
  let stream = null; let win = null; let video = null; let button = null; let token = ''; let sentWith = ''; let watcher = null;
  const trace = [];
  const mark = (ev, more) => { trace.push({ t: Math.round(performance.now()), ev, ...(more || {}) }); if (trace.length > 100) trace.shift(); };

  fetch('/fragments/p/avatar/camera/config', { headers: { Accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((cfg) => { if (cfg && cfg.enabled) start(); })
    .catch(() => { /* no camera on this dashboard */ });

  function start() {
    const windows = () => window.wsAvatarWindows || null;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;   // a page that is not secure has no camera

    const tools = document.querySelector('.assistant-avatar-tools');
    if (!tools || !windows()) return;
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'assistant-avatar-btn ws-camera-btn';
    button.setAttribute('aria-pressed', 'false');
    button.innerHTML = ICON;
    tools.appendChild(button);
    const paint = () => {
      const on = Boolean(stream);
      button.setAttribute('aria-pressed', String(on));
      button.classList.toggle('is-on', on);
      button.title = on ? 'The camera is on: click to turn it off' : 'The camera: show the assistant something';
      button.setAttribute('aria-label', button.title);
      document.documentElement.dataset.camera = on ? 'on' : 'off';
    };
    const say = (text) => { const el = win && win.querySelector('.ws-camera-said'); if (el) el.textContent = text; };

    function forget() {
      if (!token) return;
      const t = token; token = '';
      fetch('/actions/p/avatar/look-forget', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: t }), keepalive: true }).catch(() => {});
      mark('forgotten');
      const thumb = win && win.querySelector('.ws-camera-thumb');
      if (thumb) { thumb.hidden = true; thumb.removeAttribute('src'); }
    }

    function off(why) {
      if (watcher) { watcher.disconnect(); watcher = null; }
      if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; mark('off', { why }); }
      if (video) { video.srcObject = null; video = null; }
      forget();
      const w = win; win = null;
      if (w && w.isConnected && windows()) windows().close('camera');
      paint();
    }

    /** One still from the preview, as a JPEG no wider than 640 pixels. */
    function still() {
      if (!video || !video.videoWidth) return Promise.reject(new Error('the camera has no picture yet'));
      const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve({ blob: b, url: canvas.toDataURL('image/jpeg', 0.72), width: canvas.width, height: canvas.height }) : reject(new Error('no picture'))), 'image/jpeg', 0.72));
    }

    async function on() {
      if (stream) return;
      let got = null;
      try { got = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }, audio: false }); }
      catch (err) {
        mark('blocked', { name: err && err.name });
        button.title = err && /NotFound|Overconstrained/.test(err.name) ? 'No camera was found.' : 'The browser blocked the camera for this site.';
        button.setAttribute('aria-label', button.title);
        button.classList.add('is-blocked');
        return;
      }
      stream = got;
      win = windows().open('camera', 'Camera');
      const body = win.querySelector('.avatar-window-body');
      body.innerHTML = '<div class="ws-camera"><p class="ws-camera-on" role="status"><span class="ws-camera-dot" aria-hidden="true"></span> Camera on <span class="ws-camera-note">Only you see this. Nothing is recorded.</span></p>'
        + '<video class="ws-camera-video" autoplay muted playsinline></video>'
        + '<div class="ws-camera-bar" role="toolbar" aria-label="Camera">'
        + '<button type="button" class="avatar-chip" data-camera="look" title="Send one still picture to the assistant with the next thing you ask">Look at this</button>'
        + '<button type="button" class="avatar-chip" data-camera="board" title="Put one still picture on the board. It stays in this browser">To the board</button>'
        + '<button type="button" class="avatar-chip" data-camera="off" title="Turn the camera off">Turn off</button>'
        + '<img class="ws-camera-thumb" alt="The picture the assistant will be shown" hidden></div>'
        + '<p class="ws-camera-said" role="status" aria-live="polite"></p></div>';
      video = body.querySelector('video');
      video.srcObject = stream;
      body.querySelector('.ws-camera-bar').addEventListener('click', (e) => {
        const b = e.target.closest('[data-camera]');
        if (!b) return;
        if (b.dataset.camera === 'off') off('button');
        else if (b.dataset.camera === 'look') lookAt();
        else if (b.dataset.camera === 'board') toBoard();
      });
      // The window was closed (its ×, Escape): the camera stops with it.
      const mine = win;
      watcher = new MutationObserver(() => { if (mine && !mine.isConnected) off('window closed'); });
      watcher.observe(document.body, { childList: true });
      stream.getVideoTracks().forEach((t) => t.addEventListener('ended', () => off('the camera stopped')));
      mark('on');
      paint();
    }

    function lookAt() {
      still().then((s) => fetch('/actions/p/avatar/look', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: s.blob })
        .then((r) => r.json().then((j) => (r.ok ? j : Promise.reject(new Error(j.error || String(r.status))))))
        .then((j) => {
          forget();
          token = j.token;
          const thumb = win.querySelector('.ws-camera-thumb');
          thumb.src = s.url; thumb.hidden = false;
          mark('look', { bytes: s.blob.size, width: s.width, height: s.height });
          say('This picture goes to the assistant with the next thing you ask, typed or said. It is deleted when the answer comes.');
        })).catch((err) => say(`The picture was not sent: ${err.message}`));
    }

    function toBoard() {
      still().then((s) => {
        const b = windows().board();
        const core = window.wsBoardCore;
        const item = core && core.cleanItem({ tag: 'image', attrs: { ...core.fitImage(s.width, s.height), href: s.url } });
        if (!item) return say('The board\'s tools are not here.');
        const el = document.createElementNS('http://www.w3.org/2000/svg', 'image');
        for (const [k, v] of Object.entries(item.attrs)) el.setAttribute(k, v);
        el.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        b.svg.appendChild(el);
        b.keep(el);
        // The board opens beside the camera, never over its Turn off button.
        if (win && b.window) win.style.zIndex = String((Number(getComputedStyle(b.window).zIndex) || 0) + 1);
        mark('to-board');
        return say('The picture is on the board. It stays in this browser until you save the board.');
      }).catch((err) => say(`No picture: ${err.message}`));
    }

    button.addEventListener('click', () => (stream ? off('button') : on()));
    // The turn that carries the picture, and the answer that ends it.
    if (window.wsAssistantHooks && Array.isArray(window.wsAssistantHooks.beforeSend)) {
      window.wsAssistantHooks.beforeSend.push((body) => { if (!token) return undefined; sentWith = token; mark('sent-with-turn'); return { ...body, look: token }; });
    }
    document.addEventListener('ws-assistant-answer', () => { if (token && sentWith === token) { forget(); say('The assistant has answered. The picture is deleted.'); } });
    document.addEventListener('ws-assistant-working', (e) => { if (e.detail && e.detail.failed) forget(); });
    window.addEventListener('pagehide', () => off('page left'));
    // Other scripts may turn the camera off and ask whether it is on. Turning it on is the button's alone.
    window.wsCamera = { off: () => off('asked'), isOn: () => Boolean(stream), holding: () => Boolean(token), trace };
    paint();
  }
}());
