// Speech for the AI Assistant, in the page: talk to it and hear it answer.
//
//   Hold to talk (or hold the Space bar)   what you say while you hold is transcribed and sent
//   Keep listening                         hands-free: each phrase is cut at a short silence and sent;
//                                          with speech-speak.js the answer is spoken and it listens again
//   Talk over the voice                    it stops and listens (barge-in)
//   "stop", the Stop button, Escape        the voice stops and the microphone closes
//
// The microphone opens only on a press of one of those buttons, after the browser's own permission
// question, and a red dot shows for as long as it is open. Nothing is recorded or kept: a phrase lives
// in this page's memory until it is transcribed. With the local engine it is posted to this dashboard,
// on this machine; with the browser's engine the browser sends it to its vendor's speech service.
//
// The rules (voice activity, the wake word, the stop word, sentences) are in speech-core.js. What is
// switched on comes from the plugin's settings file, through /fragments/p/avatar/speech/config.
(function () {
  const core = window.wsSpeechCore;
  const chat = document.getElementById('ws-deep-chat');
  if (!core || !chat || window.wsSpeech) return;

  const KEEP = 'ws-speech-keep';
  const REST = 'ws-speech-rest';
  const store = {
    get: (k) => { try { return window.sessionStorage.getItem(k); } catch (_) { return null; } },
    set: (k, v) => { try { if (v === null) window.sessionStorage.removeItem(k); else window.sessionStorage.setItem(k, v); } catch (_) { /* not kept */ } },
  };
  const trace = [];
  const mark = (ev, more) => { trace.push({ t: Math.round(performance.now()), ev, ...(more || {}) }); if (trace.length > 200) trace.shift(); };

  const LABEL = {
    off: '', listening: 'Listening', hearing: 'Hearing you', transcribing: 'Transcribing', thinking: 'Thinking', speaking: 'Speaking',
  };

  fetch('/fragments/p/avatar/speech/config', { headers: { Accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then(start)
    .catch(() => { /* no speech on this dashboard: the page stays as it was */ });

  function start(cfg) {
    const s = cfg.settings;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const canCapture = Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && (window.AudioContext || window.webkitAudioContext));
    const stt = s.microphone ? core.pickEngine(s.sttEngine, { local: cfg.stt.local && canCapture, browser: Boolean(Recognition) }) : '';

    // ---- What is shown: the state, the words, Stop --------------------------------------------
    const body = chat.parentNode;
    let dock = document.querySelector('.assistant-dock');
    if (!dock && stt) {
      // No avatar, so no dock of the dashboard's: the two talk buttons are drawn here.
      dock = document.createElement('div');
      dock.className = 'assistant-dock ws-speech-dock';
      dock.setAttribute('role', 'group');
      dock.setAttribute('aria-label', 'Voice');
      dock.innerHTML = '<button type="button" class="dock-btn dock-talk"><span>Hold to talk</span></button>'
        + '<button type="button" class="dock-btn dock-mic" aria-pressed="false">Keep listening</button>';
      body.appendChild(dock);
      const talk = dock.querySelector('.dock-talk');
      talk.addEventListener('pointerdown', (e) => { e.preventDefault(); hold(true); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => talk.addEventListener(ev, () => hold(false)));
      talk.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); hold(true); } });
      talk.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') hold(false); });
      dock.querySelector('.dock-mic').addEventListener('click', () => keep(!keeping()));
    }
    const talkBtn = dock && dock.querySelector('.dock-talk');
    const keepBtn = dock && dock.querySelector('.dock-mic');
    const bar = document.createElement('div');
    bar.className = 'ws-speech';
    bar.dataset.state = 'off';
    bar.hidden = true;
    bar.innerHTML = '<span class="ws-speech-dot" role="img" aria-label="The microphone is off"></span>'
      + '<span class="ws-speech-state" role="status" aria-live="polite"></span>'
      + '<span class="ws-speech-text"></span>'
      + '<button type="button" class="ws-speech-stop" title="Stop: the voice stops and the microphone closes (Escape)">Stop</button>';
    if (dock) dock.parentNode.insertBefore(bar, dock); else body.appendChild(bar);
    const dot = bar.querySelector('.ws-speech-dot');
    const stateEl = bar.querySelector('.ws-speech-state');
    const textEl = bar.querySelector('.ws-speech-text');
    const panel = chat.closest('.assistant-panel');

    let state = 'off';
    let mode = 'off';            // off | hold | keep
    let expecting = false;       // a turn that was spoken is on its way: its answer is spoken too
    let followUpUntil = 0;
    let silenceNext = false;     // Stop was pressed while an answer was on its way
    let noticeTimer = null;

    function setState(next, text) {
      state = next;
      bar.dataset.state = next;
      bar.hidden = next === 'off' && !text;
      stateEl.textContent = LABEL[next] || '';
      if (text !== undefined) { textEl.textContent = text; textEl.classList.remove('is-interim'); }
      if (panel) panel.dataset.speech = next;
      document.documentElement.dataset.speech = next;
      if (keepBtn) {
        keepBtn.setAttribute('aria-pressed', String(mode === 'keep'));
        keepBtn.classList.toggle('is-listening', mode === 'keep');
        const t = mode === 'keep' ? 'The microphone is on: click to turn it off' : 'Keep listening: talk, and hear the answer';
        keepBtn.title = t; keepBtn.setAttribute('aria-label', t);
      }
      if (talkBtn) talkBtn.classList.toggle('is-held', mode === 'hold');
      const open = Boolean(stream || rec);
      bar.classList.toggle('is-open', open);
      dot.title = open ? 'The microphone is on' : 'The microphone is off';
      dot.setAttribute('aria-label', dot.title);
      mark('state', { state: next });
      document.dispatchEvent(new CustomEvent('ws-speech-state', { detail: { state: next, mode } }));
    }
    function notice(text, ms = 4000) {
      clearTimeout(noticeTimer);
      if (state === 'off') setState('off', text); else { textEl.textContent = text; textEl.classList.remove('is-interim'); }
      noticeTimer = setTimeout(() => { if (textEl.textContent === text) { textEl.textContent = ''; if (state === 'off') bar.hidden = true; } }, ms);
    }
    const interim = (text) => { textEl.textContent = text; textEl.classList.add('is-interim'); };

    // ---- The microphone ------------------------------------------------------------------------
    let stream = null; let ctx = null; let node = null;
    let rec = null;                       // the browser's recogniser, when that is the engine
    let held = [];                        // the frames of a held phrase
    let partialTimer = null; let partialBusy = false; let phrase = 0;
    const vad = core.createVad({ silenceMs: s.silenceMs });

    async function openMic() {
      if (stream) return true;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
      } catch (err) {
        stream = null;
        mark('blocked', { name: err && err.name });
        notice(err && /NotFound|Overconstrained/.test(err.name) ? 'No microphone was found.' : 'The browser blocked the microphone for this site.', 8000);
        if (keepBtn) keepBtn.classList.add('is-blocked');
        return false;
      }
      const Ctx = window.AudioContext || window.webkitAudioContext;
      ctx = new Ctx();
      const source = ctx.createMediaStreamSource(stream);
      node = ctx.createScriptProcessor(2048, 1, 1);
      const silent = ctx.createGain();
      silent.gain.value = 0;              // the microphone is heard by the recogniser, never by the loudspeakers
      source.connect(node); node.connect(silent); silent.connect(ctx.destination);
      node.onaudioprocess = (e) => onFrame(core.downsample(e.inputBuffer.getChannelData(0), ctx.sampleRate));
      mark('mic-open', { rate: ctx.sampleRate });
      return true;
    }
    function closeMic() {
      clearInterval(partialTimer); partialTimer = null;
      if (node) { node.onaudioprocess = null; try { node.disconnect(); } catch (_) { /* gone */ } node = null; }
      if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; mark('mic-closed'); }
      if (ctx) { const c = ctx; ctx = null; c.close().catch(() => {}); }
      if (rec) { const r = rec; rec = null; try { r.abort(); } catch (_) { /* stopped */ } }
      held = []; vad.reset();
    }

    function onFrame(frame) {
      if (mode === 'hold') { if (held.length < 1500) held.push(frame); return; }
      if (mode !== 'keep') return;
      // While the assistant thinks, nothing is heard: a second turn would cross the first.
      if (state === 'thinking' || state === 'transcribing') { vad.reset(); return; }
      if (state === 'speaking' && !s.bargeIn) { vad.reset(); return; }
      // The page's own summary voice is speaking (no sentence-by-sentence voice here): it must not hear itself.
      if (narrating && state !== 'speaking') { vad.reset(); return; }
      const ev = vad.push(frame);
      if (!ev) return;
      if (ev.type === 'start') {
        if (state === 'speaking') { mark('barge-in'); stopSpeaking(); }
        phrase += 1;
        setState('hearing', '');
        startPartials();
      } else if (ev.type === 'end') {
        clearInterval(partialTimer); partialTimer = null;
        mark('phrase-end', { speechMs: ev.speechMs });
        transcribe(ev.audio);
      } else {
        clearInterval(partialTimer); partialTimer = null;
        if (state === 'hearing') setState('listening', '');
      }
    }

    const joined = (frames) => {
      const out = new Float32Array(frames.reduce((n, f) => n + f.length, 0));
      let at = 0;
      for (const f of frames) { out.set(f, at); at += f.length; }
      return out;
    };
    const post = (audio, partial) => fetch(`/actions/p/avatar/hear${partial ? '?partial=1' : ''}`, {
      method: 'POST', headers: { 'Content-Type': 'audio/L16;rate=16000;channels=1' }, body: core.toPcm16(audio).buffer,
    }).then((r) => r.json().then((j) => (r.ok ? j : Promise.reject(new Error(j.error || String(r.status))))));

    // A live partial text while someone is still talking: what has been said so far, transcribed again.
    function startPartials() {
      clearInterval(partialTimer);
      const mine = phrase;
      partialTimer = setInterval(() => {
        if (partialBusy || state !== 'hearing' || mine !== phrase) return;
        const audio = mode === 'hold' ? joined(held) : vad.current();
        if (!audio || audio.length < core.RATE * 0.7) return;
        partialBusy = true;
        post(audio, true).then((j) => { if (j.text && state === 'hearing' && mine === phrase) { interim(j.text); mark('partial', { text: j.text, ms: j.ms }); } })
          .catch(() => {}).finally(() => { partialBusy = false; });
      }, 700);
    }

    function transcribe(audio) {
      setState('transcribing');
      const began = performance.now();
      post(audio, false).then((j) => {
        mark('transcript', { text: j.text, engineMs: j.ms, roundMs: Math.round(performance.now() - began), seconds: j.seconds, model: j.model });
        heard(j.text);
      }).catch((err) => { mark('hear-failed', { error: String(err.message || err) }); notice(`That was not transcribed: ${err.message || 'the recogniser did not answer'}`, 6000); settle(); });
    }

    // After a phrase, an answer or a mishap: back to listening, or off.
    function settle(text) {
      if (mode === 'keep') { vad.setBoost(1); vad.reset(); setState('listening', text); }
      else { if (mode === 'off') closeMic(); setState('off', text); }
    }

    let narrating = false;
    document.addEventListener('ws-assistant-speech', (e) => { const t = e.detail && e.detail.type; if (t === 'start') narrating = true; else if (t === 'end') narrating = false; });

    // ---- What was said --------------------------------------------------------------------------
    function heard(raw) {
      let text = String(raw || '').trim();
      if (!text) return settle('');
      if (core.isStop(text, s.stopWord)) { mark('stop-word'); return allOff('Stopped.'); }
      if (s.wakeWord && mode === 'keep' && Date.now() > followUpUntil) {
        const w = core.wake(text, s.wakePhrase);
        if (!w.called) { mark('not-called'); return settle(`Say "${s.wakePhrase}" first.`); }
        followUpUntil = Date.now() + s.followUpSeconds * 1000;
        if (!w.rest) return settle('Yes?');
        text = w.rest;
      }
      expecting = true; silenceNext = false;
      mark('sent', { text });
      if (!window.wsAssistantSend || !window.wsAssistantSend(text)) { expecting = false; return settle('The assistant is not on this page.'); }
      if (mode === 'keep' && !s.conversation) { mode = 'off'; store.set(KEEP, null); closeMic(); }
      setState('thinking', text);
      if (mouth && mouth.warm) mouth.warm();
    }

    // ---- The browser's own recogniser, when it is the engine --------------------------------------
    function browserListen(continuous) {
      if (!Recognition || rec) return;
      const r = rec = new Recognition();
      r.lang = s.language;
      r.continuous = true;
      r.interimResults = true;
      let said = '';
      r.onresult = (ev) => {
        let live = '';
        for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
          const t = ev.results[i][0].transcript;
          if (!ev.results[i].isFinal) { live += t; continue; }
          if (state === 'thinking' || state === 'transcribing') continue;
          if (continuous) { if (state === 'speaking') { if (!s.bargeIn) continue; mark('barge-in'); stopSpeaking(); } mark('transcript', { text: t.trim(), engine: 'browser' }); heard(t); } else said += ` ${t}`;
        }
        if (live && state !== 'thinking') {
          if (state === 'speaking') { if (s.bargeIn && live.trim().split(/\s+/).length > 1) { mark('barge-in'); stopSpeaking(); setState('hearing', ''); } else return; }
          if (state === 'listening') setState('hearing', '');
          interim(`${said} ${live}`.trim());
        }
      };
      r.onerror = (ev) => { if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') { rec = null; allOff('The browser blocked the microphone for this site.'); if (keepBtn) keepBtn.classList.add('is-blocked'); } };
      r.onend = () => {
        if (rec !== r) return;
        rec = null;
        if (continuous && mode === 'keep') { setTimeout(() => { if (mode === 'keep') browserListen(true); }, 250); return; }
        if (!continuous) { mode = 'off'; if (said.trim()) { mark('transcript', { text: said.trim(), engine: 'browser' }); heard(said); } else settle(''); }
      };
      try { r.start(); mark('recogniser-open'); } catch (_) { rec = null; }
    }

    // ---- The buttons -------------------------------------------------------------------------------
    const keeping = () => mode === 'keep';

    async function hold(on) {
      if (!stt || mode === 'keep') return;
      if (on && mode === 'off') {
        stopSpeaking();
        mode = 'hold'; phrase += 1; held = [];
        if (stt === 'browser') { browserListen(false); setState('hearing', ''); return; }
        setState('hearing', '');
        if (!(await openMic())) { mode = 'off'; return; }
        if (mode !== 'hold') { finishHold(); return; }      // let go before the microphone opened
        startPartials();
      } else if (!on && mode === 'hold') {
        if (stt === 'browser') { if (rec) { try { rec.stop(); } catch (_) { rec = null; mode = 'off'; settle(''); } } else { mode = 'off'; settle(''); } return; }
        finishHold();
      }
    }
    function finishHold() {
      clearInterval(partialTimer); partialTimer = null;
      const audio = joined(held);
      held = []; mode = 'off';
      if (stream) { stream.getTracks().forEach((t) => t.stop()); }
      const done = () => closeMic();
      if (audio.length < core.RATE * 0.3) { done(); return setState('off', ''); }
      done();
      mark('phrase-end', { speechMs: Math.round((audio.length / core.RATE) * 1000), held: true });
      transcribe(audio);
    }

    async function keep(on) {
      if (!stt || !s.handsFree) return;
      if (!on) return allOff('');
      if (mode === 'keep') return;
      if (mode === 'hold') return;
      if (stt === 'browser') { mode = 'keep'; store.set(KEEP, '1'); browserListen(true); return setState('listening', ''); }
      if (!(await openMic())) return;
      mode = 'keep'; store.set(KEEP, '1');
      vad.reset(); vad.setBoost(state === 'speaking' ? 2.5 : 1);
      if (state !== 'speaking' && state !== 'thinking') setState('listening', s.wakeWord ? `Say "${s.wakePhrase}" first.` : '');
      else setState(state);
    }

    function allOff(text) {
      // An answer still on its way after Stop is not spoken, by this voice or by the page's summary voice.
      if (expecting) silenceNext = true;
      stopSpeaking();
      mode = 'off'; expecting = false; store.set(KEEP, null); store.set(REST, null);
      closeMic();
      setState('off', text || '');
      if (text) notice(text, 3000);
    }

    // The free local voice of the avatar that is shown, from the cast the dashboard drew (its character
    // file names it); '' when the avatar is hidden, is the Druplicon, or names none.
    function avatarVoice() {
      if (!window.wsAssistantAvatarOn || !window.wsAssistantAvatarOn() || !window.wsAvatarId) return '';
      const stage = document.querySelector('.assistant-avatar-stage');
      let cast = null;
      try { cast = JSON.parse((stage && stage.dataset.cast) || 'null'); } catch (_) { cast = null; }
      const who = cast && Array.isArray(cast.avatars) ? cast.avatars.find((a) => a.id === window.wsAvatarId()) : null;
      return who && /^en_[A-Z]{2}-[a-z0-9_]+-(x_low|low|medium|high)$/.test(String(who.voice || '')) ? who.voice : '';
    }

    // ---- Speaking the answer: speech-speak.js, when it is loaded and a voice is there ------------------
    const mouth = s.speaking && window.wsSpeechMouth ? window.wsSpeechMouth.create({
      cfg, core, mark,
      audioContext: () => ctx,
      avatarVoice,
      onStart: (sentence) => { setState('speaking', sentence); vad.reset(); vad.setBoost(2.5); },
      onSentence: (sentence) => { textEl.textContent = sentence; },
      onDone: () => { followUpUntil = Date.now() + s.followUpSeconds * 1000; settle(''); },
    }) : null;
    const tts = mouth ? mouth.engine : '';
    const stopSpeaking = () => { if (mouth) mouth.stop(); if (window.wsAssistantVoice && window.wsAssistantVoice.cancel) window.wsAssistantVoice.cancel(); };
    const speakText = (text) => { if (!mouth || !mouth.speak(text)) settle(''); };

    // ---- The assistant's turn -------------------------------------------------------------------------
    const active = () => mode !== 'off' || expecting;
    if (window.wsAssistantHooks && Array.isArray(window.wsAssistantHooks.beforeSend)) {
      // A spoken turn asks for an answer that can be said aloud (the SUMMARY line).
      window.wsAssistantHooks.beforeSend.push((b) => (active() && tts ? { ...b, voice: true } : undefined));
    }
    document.addEventListener('ws-assistant-answer', (e) => {
      if (silenceNext) { silenceNext = false; e.preventDefault(); mark('answer-silenced'); return; }
      if (!active()) return;                 // a typed turn: the page's own summary voice, as before
      expecting = false;
      mark('answer', { spoken: Boolean(e.detail && e.detail.spoken) });
      if (!tts) return settle('');
      e.preventDefault();
      const d = e.detail || {};
      speakText(d.spoken || core.speakable(d.html));
    });
    document.addEventListener('ws-assistant-working', (e) => {
      if (e.detail && e.detail.failed && expecting) { expecting = false; settle('The assistant did not answer.'); }
    });

    bar.querySelector('.ws-speech-stop').addEventListener('click', () => allOff(''));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state !== 'off') allOff(''); });
    // What was being said when the page changed (the assistant took you somewhere) is finished on the next page.
    window.addEventListener('pagehide', () => {
      const left = mouth ? mouth.rest() : '';
      if (state === 'speaking' && left) store.set(REST, JSON.stringify({ at: Date.now(), text: left }));
      closeMic();
    });

    // ---- Ready -----------------------------------------------------------------------------------------
    if (stt) {
      window.wsAssistantEar = { hold, keep, keeping };
      if (talkBtn) talkBtn.hidden = false;
      if (keepBtn) keepBtn.hidden = !s.handsFree;
    } else if (!s.microphone) {
      // Switched off in the settings: the talk buttons go, and the Space bar and the dock listen to nothing
      // (an ear that does nothing, so the browser's own recogniser is not used in its place).
      window.wsAssistantEar = { hold() {}, keep() {}, keeping: () => false };
      if (talkBtn) talkBtn.hidden = true;
      if (keepBtn) keepBtn.hidden = true;
    } else if (talkBtn && keepBtn && talkBtn.hidden) {
      notice(`To talk to the assistant, install the local recogniser: ${cfg.install}`, 12000);
    }
    window.wsSpeech = {
      config: cfg, engines: { stt, tts }, trace,
      state: () => state, mode: () => mode,
      stop: () => allOff(''), speak: (text) => { expecting = false; speakText(String(text || '')); },
      // Stop the voice and leave the microphone as it is.
      quiet: () => { stopSpeaking(); if (state === 'speaking') settle(''); },
    };
    setState('off');
    mark('ready', { stt, tts });

    // The same tab, the microphone already allowed, and it was on a moment ago: it stays on across pages.
    let rest = null;
    try { rest = JSON.parse(store.get(REST) || 'null'); } catch (_) { rest = null; }
    store.set(REST, null);
    const resume = () => {
      if (store.get(KEEP) === '1' && stt && s.handsFree) keep(true).then(() => { if (rest && Date.now() - rest.at < 20000 && tts) speakText(rest.text); });
      else if (rest && Date.now() - rest.at < 20000 && tts) speakText(rest.text);
    };
    if (store.get(KEEP) === '1' || rest) {
      if (stt === 'local' && navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'microphone' }).then((p) => { if (p.state === 'granted') resume(); else store.set(KEEP, null); }).catch(() => store.set(KEEP, null));
      } else resume();
    }
  }
}());
