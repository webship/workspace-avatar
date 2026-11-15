import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import vm from 'vm';

const PKG = fs.existsSync(path.join(__dirname, '..', 'package.json')) ? path.join(__dirname, '..') : path.join(__dirname, '..', '..');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const core = require(path.join(PKG, 'public', 'speech-core.js'));

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The voice script in a page that is not there: a fake audio output, a fake server, a fake browser voice. */
function page({ local = true, browser = true, failAt = -1, clipMs = 30, avatarVoice = undefined as undefined | (() => string) } = {}) {
  const events: string[] = [];
  const fetched: string[] = [];
  const voices: string[] = [];
  const started: string[] = [];
  const uttered: string[] = [];
  let live: any = null;
  class Ctx {
    state = 'running'; destination = {};
    decodeAudioData(buf: { text: string }) { return Promise.resolve({ duration: clipMs / 1000, text: buf.text }); }
    createBufferSource() {
      const src: any = { buffer: null, onended: null, connect() {}, stop() { src.stopped = true; clearTimeout(src.timer); },
        start() { started.push(src.buffer.text); live = src; src.timer = setTimeout(() => { if (src.onended) src.onended(); }, clipMs); } };
      return src;
    }
  }
  const synth = { cancel() { uttered.push('(cancel)'); }, getVoices: () => [], speak(u: any) { uttered.push(u.text); setTimeout(() => { if (u.onstart) u.onstart(); setTimeout(() => { if (u.onend) u.onend(); }, 5); }, 1); } };
  class Utterance { text: string; constructor(t: string) { this.text = t; } }
  const window: any = { AudioContext: Ctx, ...(browser ? { speechSynthesis: synth, SpeechSynthesisUtterance: Utterance } : {}) };
  const sandbox: any = {
    window, performance, setInterval, clearInterval, setTimeout, clearTimeout, Promise, JSON, Math, Number, Boolean, String, Error,
    CustomEvent: class { type: string; detail: any; constructor(type: string, init: any) { this.type = type; this.detail = init.detail; } },
    document: { dispatchEvent: (e: any) => { if (e.type === 'ws-assistant-speech' && e.detail.type !== 'word') events.push(e.detail.type); return true; } },
    fetch: (url: string, init: any) => {
      const text = JSON.parse(init.body).text;
      fetched.push(text);
      voices.push(JSON.parse(init.body).voice || '');
      const n = fetched.filter((t) => t !== 'Ready.').length - 1;
      if (url !== '/actions/p/avatar/speak' || (failAt >= 0 && n >= failAt && text !== 'Ready.')) return Promise.resolve({ ok: false, status: 409 });
      return Promise.resolve({ ok: true, headers: { get: () => '12' }, arrayBuffer: () => Promise.resolve({ text }) });
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(PKG, 'public', 'speech-speak.js'), 'utf8'), sandbox);
  const marks: string[] = [];
  const shown: string[] = [];
  let done = 0;
  const cfg = { settings: { ttsEngine: 'auto', language: 'en-US', speed: 1 }, tts: { local } };
  const mouth = window.wsSpeechMouth.create({ cfg, core, mark: (ev: string) => marks.push(ev), audioContext: () => null, avatarVoice,
    onStart: (s: string) => shown.push(`start:${s}`), onSentence: (s: string) => shown.push(s), onDone: () => { done += 1; } });
  return { mouth, events, fetched, voices, started, uttered, marks, shown, stopLive: () => live, done: () => done };
}

test('the local voice says an answer sentence by sentence, each made while the one before it plays', async () => {
  const p = page();
  assert.strictEqual(p.mouth.engine, 'local');
  assert.strictEqual(p.mouth.speak('One is first. Two is next. Three is last.'), true);
  await wait(5);
  assert.deepStrictEqual(p.fetched, ['One is first.', 'Two is next.'], 'the second sentence is asked for as the first begins to play, the third is not yet');
  assert.deepStrictEqual(p.started, ['One is first.']);
  assert.strictEqual(p.mouth.rest(), 'Two is next. Three is last.', 'what is left to say, for a page that changes');
  await wait(150);
  assert.deepStrictEqual(p.started, ['One is first.', 'Two is next.', 'Three is last.']);
  assert.deepStrictEqual(p.events, ['start', 'end'], 'the mouth opens once and closes once');
  assert.strictEqual(p.done(), 1);
  assert.strictEqual(p.mouth.rest(), '');
  assert.deepStrictEqual(p.shown.slice(0, 2), ['start:One is first.', 'One is first.']);
  assert.ok(p.marks.includes('first-audio') && p.marks.includes('speak-end'));
  assert.deepStrictEqual(p.uttered.filter((u) => u !== '(cancel)'), [], 'the browser\'s voice said nothing');
});

test('stop cuts the voice at once: the sentence playing is stopped, the rest is never said, and it is not "done"', async () => {
  const p = page({ clipMs: 60 });
  p.mouth.speak('One is first. Two is next. Three is last.');
  await wait(10);
  p.mouth.stop();
  assert.strictEqual(p.stopLive().stopped, true);
  await wait(200);
  assert.deepStrictEqual(p.started, ['One is first.']);
  assert.deepStrictEqual(p.events, ['start', 'end']);
  assert.strictEqual(p.done(), 0, 'stopping is not finishing: the loop decides what comes next');
  assert.ok(p.marks.includes('speak-stopped'));
  assert.strictEqual(p.mouth.speaking, false);
});

test('when the local voice cannot answer, the same words are said in the browser\'s voice from that sentence on', async () => {
  const p = page({ failAt: 1 });
  p.mouth.speak('One is first. Two is next. Three is last.');
  await wait(200);
  assert.deepStrictEqual(p.started, ['One is first.']);
  assert.deepStrictEqual(p.uttered.filter((u) => u !== '(cancel)'), ['Two is next.', 'Three is last.']);
  assert.ok(p.marks.includes('speak-fallback'));
  assert.strictEqual(p.done(), 1);
  assert.deepStrictEqual(p.events, ['start', 'end']);
});

test('with no local voice the browser\'s is used, with neither there is no voice, and nothing to say is not spoken', async () => {
  const b = page({ local: false });
  assert.strictEqual(b.mouth.engine, 'browser');
  assert.strictEqual(b.mouth.speak('Hello there. How are you?'), true);
  await wait(60);
  assert.deepStrictEqual(b.uttered.filter((u) => u !== '(cancel)'), ['Hello there.', 'How are you?']);
  assert.deepStrictEqual(b.fetched, [], 'the dashboard was not asked');
  assert.strictEqual(b.done(), 1);
  const none = page({ local: false, browser: false });
  assert.strictEqual(none.mouth.engine, '');
  assert.strictEqual(none.mouth.speak('Hello.'), false);
  assert.strictEqual(page().mouth.speak('   '), false);
});

test('warming the voice loads it once, ahead of the first sentence', async () => {
  const p = page();
  p.mouth.warm(); p.mouth.warm();
  await wait(5);
  assert.deepStrictEqual(p.fetched, ['Ready.']);
  assert.deepStrictEqual(p.started, [], 'the warm-up is never played');
  const b = page({ local: false });
  b.mouth.warm();
  assert.deepStrictEqual(b.fetched, []);
});

test('the loop wires the voice in: a spoken turn asks for a speakable answer, takes the answer from the summary voice, and barge-in stops it', () => {
  const loop = fs.readFileSync(path.join(PKG, 'public', 'speech-loop.js'), 'utf8');
  assert.match(loop, /window\.wsSpeechMouth \? window\.wsSpeechMouth\.create\(/);
  assert.match(loop, /beforeSend\.push\(\(b\) => \(active\(\) && tts \? \{ \.\.\.b, voice: true \} : undefined\)\)/);
  assert.match(loop, /if \(!active\(\)\) return;\s+\/\/ a typed turn/);
  assert.match(loop, /e\.preventDefault\(\);\s+const d = e\.detail \|\| \{\};\s+speakText\(d\.spoken \|\| core\.speakable\(d\.html\)\);/);
  assert.match(loop, /if \(state === 'speaking'\) \{ mark\('barge-in'\); stopSpeaking\(\); \}/);
  assert.match(loop, /if \(state === 'speaking' && !s\.bargeIn\) \{ vad\.reset\(\); return; \}/);
  assert.match(loop, /vad\.setBoost\(2\.5\)/, 'over the voice, more than the room\'s noise is asked for before a sound counts');
  assert.match(loop, /if \(state === 'thinking' \|\| state === 'transcribing'\) \{ vad\.reset\(\); return; \}/, 'nothing is heard while the assistant thinks');
  assert.match(loop, /if \(silenceNext\) \{ silenceNext = false; e\.preventDefault\(\);/, 'an answer that arrives after Stop is not spoken');
  assert.match(loop, /if \(mode === 'keep'\) \{ vad\.setBoost\(1\); vad\.reset\(\); setState\('listening', text\); \}/, 'after the answer it listens again');
});

test('the avatar that is shown speaks in the free voice its character file names; otherwise the voice of the settings is used', async () => {
  const named = page({ avatarVoice: () => 'en_GB-alba-medium' });
  named.mouth.speak('Hello there.');
  await wait(5);
  assert.deepStrictEqual(named.voices, ['en_GB-alba-medium']);
  const none = page({ avatarVoice: () => '' });
  none.mouth.speak('Hello there.');
  await wait(5);
  assert.deepStrictEqual(none.voices, [''], 'no voice is named: the dashboard uses the one in the settings');
  const broken = page({ avatarVoice: () => { throw new Error('no cast'); } });
  assert.strictEqual(broken.mouth.speak('Hello there.'), true);
  const loop = fs.readFileSync(path.join(PKG, 'public', 'speech-loop.js'), 'utf8');
  assert.match(loop, /if \(!window\.wsAssistantAvatarOn \|\| !window\.wsAssistantAvatarOn\(\) \|\| !window\.wsAvatarId\) return '';/, 'only the avatar that is shown');
  assert.match(loop, /\^en_\[A-Z\]\{2\}-\[a-z0-9_\]\+-\(x_low\|low\|medium\|high\)\$/, 'and only an English Piper voice by name');
});
