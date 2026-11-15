// Speech for the AI Assistant: the parts with rules, kept apart from the page so they run under test.
//
// Loaded by the page (window.wsSpeechCore) and required by the unit tests. Nothing here touches the
// microphone, the network or the document: it is given numbers and text and answers with numbers and text.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.wsSpeechCore = factory();
}(typeof self !== 'undefined' ? self : this, () => {
  const RATE = 16000;   // what the recogniser hears: 16 kHz, one channel

  /** Audio at any rate, as 16 kHz: each output sample is the mean of the input samples it covers. */
  function downsample(samples, fromRate, toRate = RATE) {
    if (!samples || !samples.length || !(fromRate > 0)) return new Float32Array(0);
    if (fromRate === toRate) return Float32Array.from(samples);
    const ratio = fromRate / toRate;
    const out = new Float32Array(Math.floor(samples.length / ratio));
    for (let i = 0; i < out.length; i += 1) {
      const from = Math.floor(i * ratio);
      const to = Math.min(samples.length, Math.max(from + 1, Math.floor((i + 1) * ratio)));
      let sum = 0;
      for (let j = from; j < to; j += 1) sum += samples[j];
      out[i] = sum / (to - from);
    }
    return out;
  }

  /** Samples from -1 to 1, as 16-bit little-endian PCM: what is posted to be transcribed. */
  function toPcm16(samples) {
    const out = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i += 1) {
      const v = Math.max(-1, Math.min(1, samples[i]));
      out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
    }
    return out;
  }

  const rms = (frame) => {
    let sum = 0;
    for (let i = 0; i < frame.length; i += 1) sum += frame[i] * frame[i];
    return frame.length ? Math.sqrt(sum / frame.length) : 0;
  };

  /**
   * Voice activity: where a phrase begins and ends in a stream of 16 kHz frames.
   *
   * The room's own noise is learnt as it goes, so a fan does not read as speech; a phrase begins after
   * `onsetMs` of sound above it and ends after `silenceMs` of quiet (or at `maxMs`). The moment before the
   * first sound is kept (`preRollMs`), or the first syllable would be cut. A sound shorter than
   * `minSpeechMs` is a cough or a click and is dropped.
   *
   * push(frame) answers null, or { type: 'start' }, or { type: 'end', audio, speechMs }, or { type: 'drop' }.
   */
  function createVad(options = {}) {
    const o = { rate: RATE, onsetMs: 90, silenceMs: 900, minSpeechMs: 300, maxMs: 30000, preRollMs: 300, minLevel: 0.012, ratio: 3, ...options };
    let floor = 0.004;
    let boost = 1;
    let speaking = false;
    let loudMs = 0; let quietMs = 0; let totalMs = 0; let gapMs = 0;
    let pre = []; let preMs = 0;
    let kept = [];
    let level = 0;
    const ms = (frame) => (frame.length / o.rate) * 1000;
    const join = (frames) => {
      const out = new Float32Array(frames.reduce((n, f) => n + f.length, 0));
      let at = 0;
      for (const f of frames) { out.set(f, at); at += f.length; }
      return out;
    };
    function reset() { speaking = false; loudMs = 0; quietMs = 0; totalMs = 0; gapMs = 0; pre = []; preMs = 0; kept = []; }
    function push(frame) {
      if (!frame || !frame.length) return null;
      const dur = ms(frame);
      level = rms(frame);
      const loud = level > Math.max(o.minLevel, floor * o.ratio) * boost;
      if (!speaking) {
        // Learn the room: quickly down, slowly up, and never from a loud frame.
        if (!loud) floor = Math.max(0.0005, Math.min(0.05, level < floor ? floor * 0.9 + level * 0.1 : floor * 0.98 + level * 0.02));
        pre.push(frame); preMs += dur;
        while (pre.length > 1 && preMs - ms(pre[0]) >= o.preRollMs + o.onsetMs) { preMs -= ms(pre[0]); pre.shift(); }
        if (loud) { loudMs += dur; gapMs = 0; } else { gapMs += dur; if (gapMs > 60) loudMs = 0; }
        if (loudMs >= o.onsetMs) {
          speaking = true; kept = pre; pre = []; preMs = 0;
          totalMs = kept.reduce((n, f) => n + ms(f), 0); quietMs = 0;
          return { type: 'start' };
        }
        return null;
      }
      kept.push(frame); totalMs += dur;
      quietMs = loud ? 0 : quietMs + dur;
      if (quietMs >= o.silenceMs || totalMs >= o.maxMs) {
        const speechMs = totalMs - quietMs - Math.min(o.preRollMs, totalMs);
        // Leave a fifth of a second of the quiet at the end: a recogniser hears the last word better with it.
        let trim = Math.max(0, quietMs - 200);
        const frames = kept.slice();
        while (frames.length > 1 && trim >= ms(frames[frames.length - 1])) { trim -= ms(frames[frames.length - 1]); frames.pop(); }
        const audio = join(frames);
        reset();
        return speechMs >= o.minSpeechMs ? { type: 'end', audio, speechMs: Math.round(speechMs) } : { type: 'drop' };
      }
      return null;
    }
    return {
      push, reset,
      /** What has been said so far in the phrase being heard (for a live partial text), or null. */
      current: () => (speaking ? join(kept) : null),
      /** End the phrase now (the button was let go): the audio heard, or null when there was none. */
      flush: () => { const audio = speaking ? join(kept) : (pre.length ? join(pre) : null); reset(); return audio && audio.length ? audio : null; },
      /** Ask for more than the room's noise before a sound counts: used while the voice is speaking. */
      setBoost: (b) => { boost = Math.max(1, Number(b) || 1); },
      get speaking() { return speaking; },
      get level() { return level; },
      get floor() { return floor; },
    };
  }

  const words = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').split(/\s+/).filter(Boolean);

  /**
   * Was the assistant called? `phrase` is the wake word ("workspace", "hey workspace"), looked for as
   * whole words among the first words of what was said; `rest` is what was said after it.
   */
  function wake(text, phrase) {
    const want = words(phrase);
    const said = String(text || '').trim();
    if (!want.length) return { called: true, rest: said };
    const tokens = [...said.matchAll(/[\p{L}\p{N}']+/gu)].map((m) => ({ word: m[0].toLowerCase(), end: m.index + m[0].length }));
    // At the start, or after one word of greeting: "workspace, …", "hey workspace …". Never further in,
    // or every sentence about a workspace would call it.
    const first = tokens.length && ['hey', 'hi', 'hello', 'ok', 'okay', 'yo'].includes(tokens[0].word) ? 1 : 0;
    for (const i of first ? [0, 1] : [0]) {
      if (i + want.length <= tokens.length && want.every((w, k) => tokens[i + k].word === w)) {
        const rest = said.slice(tokens[i + want.length - 1].end).replace(/^[\s,.:;!?-]+/, '').trim();
        return { called: true, rest };
      }
    }
    return { called: false, rest: '' };
  }

  /** Is this the one word that stops everything ("stop", "Stop.", "stop please")? Never a longer sentence. */
  function isStop(text, word = 'stop') {
    const want = words(word);
    const said = words(text).filter((w) => !['please', 'now', 'ok', 'okay'].includes(w));
    return want.length > 0 && said.length === want.length && want.every((w, i) => said[i] === w);
  }

  const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ' };

  /** What of a rendered answer is said aloud: no code, tables, buttons or cards; a link is "a link". */
  function speakable(html, max = 900) {
    const text = String(html || '')
      .replace(/<div class="plan-card"[\s\S]*$/, ' ')
      .replace(/<(pre|table|button|script|style|svg)\b[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\/(p|li|h[1-6]|div|tr)>|<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => ENTITIES[m])
      .replace(/https?:\/\/[^\s<>"')]+/g, 'a link');
    const lines = text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).map((l) => (/[.!?:;]$/.test(l) ? l : `${l}.`));
    let out = lines.join(' ').replace(/\[[a-z-]+\]/g, ' ').replace(/[`*_#>|~]/g, ' ').replace(/\s+/g, ' ').trim();
    if (out.length > max) out = out.slice(0, max).replace(/[^.!?]*$/, '').trim() || out.slice(0, max).replace(/\s+\S*$/, '');
    return out;
  }

  /** A text as the sentences it is spoken in, one at a time; a very long one is cut at a comma or a space. */
  function sentences(text, maxChars = 220) {
    const out = [];
    for (const raw of String(text || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+(?=[\p{Lu}\p{N}"'(])/u)) {
      let s = raw.trim();
      while (s.length > maxChars) {
        let cut = s.lastIndexOf(', ', maxChars);
        if (cut < maxChars / 3) cut = s.lastIndexOf(' ', maxChars);
        if (cut < 1) cut = maxChars;
        out.push(s.slice(0, cut + 1).trim());
        s = s.slice(cut + 1).trim();
      }
      if (s) out.push(s);
    }
    return out;
  }

  /** The engine that is used: the one asked for when it is there, else the other, else none. `auto` prefers this machine's. */
  function pickEngine(asked, have) {
    const want = String(asked || 'auto').toLowerCase();
    if (want === 'local') return have.local ? 'local' : (have.browser ? 'browser' : '');
    if (want === 'browser') return have.browser ? 'browser' : (have.local ? 'local' : '');
    return have.local ? 'local' : (have.browser ? 'browser' : '');
  }

  return { RATE, downsample, toPcm16, rms, createVad, wake, isStop, speakable, sentences, pickEngine };
}));
