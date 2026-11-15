// Speech for the AI Assistant: its voice. The answer is spoken sentence by sentence.
//
// Two engines, both free. `local` is a Piper voice run by this dashboard: a sentence is posted to
// /actions/p/avatar/speak and comes back as audio, made while the sentence before it is playing, so the
// first word comes after one sentence's work and there is no gap between the rest. `browser` is a voice
// the browser has. When the local voice cannot answer, the same words are said in the browser's voice.
//
// The page's avatar moves its mouth with the `ws-assistant-speech` events this sends (start, word, end),
// as it does with the summary voice. speech-loop.js creates the mouth and tells it when to stop.
(function () {
  if (window.wsSpeechMouth) return;

  function create({ cfg, core, mark, audioContext, avatarVoice, onStart, onSentence, onDone }) {
    const s = cfg.settings;
    const engine = core.pickEngine(s.ttsEngine, { local: cfg.tts.local, browser: Boolean(window.speechSynthesis && window.SpeechSynthesisUtterance) });
    let gen = 0; let playing = null; let outCtx = null; let left = []; let wordTimer = null; let speaking = false;
    const said = (detail) => document.dispatchEvent(new CustomEvent('ws-assistant-speech', { detail }));

    // The microphone's own audio context when it is open (one clock for hearing and speaking), else one of its own.
    const out = () => {
      const shared = audioContext && audioContext();
      if (shared && shared.state !== 'closed') return shared;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!outCtx || outCtx.state === 'closed') outCtx = new Ctx();
      if (outCtx.state === 'suspended') outCtx.resume().catch(() => {});
      return outCtx;
    };
    // The voice of the avatar that is shown, when its character file names a free local one and it is
    // installed here (the dashboard checks); otherwise the voice of the settings.
    const voiceNow = () => { try { return (typeof avatarVoice === 'function' && avatarVoice()) || ''; } catch (_) { return ''; } };
    const fetchClip = (text) => fetch('/actions/p/avatar/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, ...(voiceNow() ? { voice: voiceNow() } : {}) }) })
      .then((r) => (r.ok ? r.arrayBuffer().then((buf) => ({ buf, ms: Number(r.headers.get('X-Speech-Ms')) || 0 })) : Promise.reject(new Error(String(r.status)))));

    function stop() {
      gen += 1;
      clearInterval(wordTimer); wordTimer = null;
      left = [];
      if (playing) { const p = playing; playing = null; try { p.onended = null; p.stop(); } catch (_) { /* ended */ } }
      try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (_) { /* silent */ }
      if (speaking) { speaking = false; said({ type: 'end' }); mark('speak-stopped'); }
    }

    /** Speak a text. Answers false when there is nothing to say or no voice to say it in. */
    function speak(text) {
      const list = core.sentences(text);
      if (!list.length || !engine) return false;
      stop();
      const mine = gen;
      left = list.slice();
      speaking = true;
      const began = performance.now();
      mark('speak-begin', { sentences: list.length, engine });
      onStart(list[0]);
      let first = true;
      const finished = () => {
        if (mine !== gen) return;
        left = []; speaking = false;
        said({ type: 'end' });
        mark('speak-end', { ms: Math.round(performance.now() - began) });
        onDone();
      };
      const pace = (sentence, seconds) => {
        const w = sentence.split(/\s+/);
        let i = 0;
        clearInterval(wordTimer);
        wordTimer = setInterval(() => { if (mine !== gen || i >= w.length) { clearInterval(wordTimer); return; } said({ type: 'word', word: w[i] }); i += 1; }, Math.max(90, (seconds * 1000) / w.length));
      };
      const browserSay = (i) => {
        if (mine !== gen) return;
        if (i >= list.length || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return finished();
        const u = new window.SpeechSynthesisUtterance(list[i]);
        u.lang = s.language; u.rate = s.speed;
        const all = window.speechSynthesis.getVoices() || [];
        const best = window.wsNarration && window.wsNarration.bestVoice ? window.wsNarration.bestVoice(all, s.language) : null;
        if (best) u.voice = best;
        u.onstart = () => {
          if (mine !== gen) return;
          if (first) { first = false; said({ type: 'start' }); mark('first-audio', { ms: Math.round(performance.now() - began), engine: 'browser' }); }
          onSentence(list[i]); left = list.slice(i + 1);
        };
        u.onboundary = (e) => { if (mine === gen && (!e || e.name === undefined || e.name === 'word')) said({ type: 'word', word: list[i].slice((e && e.charIndex) || 0).split(/\s/)[0] }); };
        u.onend = () => browserSay(i + 1);
        u.onerror = () => browserSay(i + 1);
        window.speechSynthesis.speak(u);
        return undefined;
      };
      if (engine === 'browser') { browserSay(0); return true; }

      const clips = [];
      const make = (i) => {
        if (i < list.length && !clips[i]) clips[i] = fetchClip(list[i]).then((c) => out().decodeAudioData(c.buf).then((audio) => ({ audio, ms: c.ms })));
        return clips[i];
      };
      const play = (i) => {
        if (mine !== gen) return;
        if (i >= list.length) { finished(); return; }
        make(i).then((clip) => {
          if (mine !== gen) return;
          const next = make(i + 1);
          if (next) next.catch(() => {});
          const ctx = out();
          const src = ctx.createBufferSource();
          src.buffer = clip.audio;
          src.connect(ctx.destination);
          src.onended = () => { if (playing === src) playing = null; play(i + 1); };
          playing = src;
          onSentence(list[i]); left = list.slice(i + 1);
          if (first) { first = false; said({ type: 'start' }); mark('first-audio', { ms: Math.round(performance.now() - began), synthMs: clip.ms, engine: 'local' }); }
          mark('sentence', { i, seconds: Math.round(clip.audio.duration * 100) / 100, synthMs: clip.ms, text: list[i] });
          pace(list[i], clip.audio.duration);
          src.start();
        }).catch(() => { if (mine !== gen) return; mark('speak-fallback', { i }); browserSay(i); });
      };
      play(0);
      return true;
    }

    // Load the voice before it is needed (while the assistant thinks), so the first sentence does not wait for it.
    let warmed = false;
    const warm = () => { if (engine !== 'local' || warmed) return; warmed = true; fetchClip('Ready.').catch(() => { warmed = false; }); };

    return { engine, speak, stop, warm, rest: () => left.join(' '), get speaking() { return speaking; } };
  }

  window.wsSpeechMouth = { create };
}());
