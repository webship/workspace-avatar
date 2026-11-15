import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { speechSettings, SPEECH_DEFAULTS } from '../src/speech-settings';
import { findStt, findVoice, listStt, listVoices, speechDir } from '../src/speech-models';
import { cleanTranscript, pcm16ToFloat } from '../src/speech-engine';
import { wav } from '../src/speech-worker';
import { hear, speak, speechConfig } from '../src/speech';

const PKG = fs.existsSync(path.join(__dirname, '..', 'package.json')) ? path.join(__dirname, '..') : path.join(__dirname, '..', '..');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const core = require(path.join(PKG, 'public', 'speech-core.js'));

const tone = (ms: number, level: number): Float32Array => {
  const out = new Float32Array(Math.round(16 * ms));
  for (let i = 0; i < out.length; i += 1) out[i] = level * Math.sin(i * 0.3);
  return out;
};
const feed = (vad: any, audio: Float32Array): string[] => {
  const seen: string[] = [];
  for (let i = 0; i < audio.length; i += 320) { const e = vad.push(audio.subarray(i, i + 320)); if (e) seen.push(e.type === 'end' ? `end:${e.speechMs}:${e.audio.length}` : e.type); }
  return seen;
};

/** A workspace with one Whisper model, one Moonshine model and two voices, as empty files. */
function workspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'avatar-speech-'));
  const put = (rel: string) => { const f = path.join(speechDir(root), rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, ''); };
  for (const f of ['base.en-encoder.int8.onnx', 'base.en-encoder.onnx', 'base.en-decoder.int8.onnx', 'base.en-tokens.txt']) put(`stt/whisper-base.en/${f}`);
  for (const f of ['preprocess.onnx', 'encode.int8.onnx', 'uncached_decode.int8.onnx', 'cached_decode.int8.onnx', 'tokens.txt']) put(`stt/moonshine-tiny-en/${f}`);
  put('stt/broken/tokens.txt');
  for (const v of ['en_US-ljspeech-medium', 'en_GB-alan-medium']) { put(`tts/${v}/${v}.onnx`); put(`tts/${v}/tokens.txt`); put(`tts/${v}/espeak-ng-data/phontab`); }
  put('tts/xx_XX-other-medium/xx_XX-other-medium.onnx'); put('tts/xx_XX-other-medium/tokens.txt'); put('tts/xx_XX-other-medium/espeak-ng-data/phontab');
  put('tts/en_US-half-medium/en_US-half-medium.onnx');
  return root;
}
const engineOn = { available: () => true };
const engineOff = { available: () => false };

test('voice activity: a phrase begins after a moment of sound, ends at a silence, and keeps the moment before it', () => {
  const vad = core.createVad({ silenceMs: 900 });
  const seen = feed(vad, Float32Array.from([...tone(500, 0.001), ...tone(1500, 0.2), ...tone(1200, 0.001)]));
  assert.deepStrictEqual(seen, ['start', 'end:1500:32000'], '1.5 s of speech, with 0.3 s before and 0.2 s after');
});

test('voice activity: a click is dropped, a steady noise is learnt and is not speech, and a boost asks for more', () => {
  assert.deepStrictEqual(feed(core.createVad(), Float32Array.from([...tone(500, 0.001), ...tone(100, 0.2), ...tone(1200, 0.001)])), ['start', 'drop']);
  const fan = core.createVad();
  feed(fan, tone(3000, 0.01));
  assert.deepStrictEqual(feed(fan, tone(1000, 0.011)), [], 'the room is as loud as it was');
  assert.deepStrictEqual(feed(fan, Float32Array.from([...tone(800, 0.2), ...tone(1000, 0.001)])).map((s) => s.split(':')[0]), ['start', 'end']);
  const speaking = core.createVad();
  speaking.setBoost(2.5);
  assert.deepStrictEqual(feed(speaking, tone(1000, 0.02)), [], 'what would be speech in a quiet room is not, over the voice');
  assert.deepStrictEqual(feed(speaking, tone(400, 0.3)), ['start']);
});

test('voice activity: a phrase held open is cut at the limit, and flush gives what was heard', () => {
  const vad = core.createVad({ maxMs: 2000 });
  const seen = feed(vad, tone(2600, 0.2));
  assert.strictEqual(seen[0], 'start');
  assert.match(seen[1], /^end:/);
  const held = core.createVad();
  feed(held, tone(600, 0.2));
  assert.ok(held.current().length > 0);
  assert.ok(held.flush().length >= 16 * 600 - 320);
  assert.strictEqual(held.current(), null);
});

test('audio: any rate becomes 16 kHz, and samples become 16-bit PCM that the server reads back', () => {
  const at48 = new Float32Array(48000).fill(0.5);
  const down = core.downsample(at48, 48000);
  assert.strictEqual(down.length, 16000);
  assert.ok(Math.abs(down[100] - 0.5) < 1e-6);
  assert.strictEqual(core.downsample(new Float32Array(441), 44100).length, 160);
  const pcm = core.toPcm16(Float32Array.from([0, 1, -1, 0.5, 2, -2]));
  assert.deepStrictEqual([...pcm], [0, 32767, -32768, 16383, 32767, -32768]);
  const back = pcm16ToFloat(Buffer.from(pcm.buffer));
  assert.ok(Math.abs(back[3] - 0.5) < 0.001);
});

test('the wake word is the first thing said, never a word further in', () => {
  assert.deepStrictEqual(core.wake('Workspace, start the demo site.', 'workspace'), { called: true, rest: 'start the demo site.' });
  assert.deepStrictEqual(core.wake('Hey workspace what is running', 'workspace'), { called: true, rest: 'what is running' });
  assert.deepStrictEqual(core.wake('ok hey workspace go', 'hey workspace'), { called: true, rest: 'go' });
  assert.strictEqual(core.wake('The workspace folder is big', 'workspace').called, false);
  assert.strictEqual(core.wake('I like my workspace', 'workspace').called, false);
  assert.deepStrictEqual(core.wake('Workspace', 'workspace'), { called: true, rest: '' });
  assert.deepStrictEqual(core.wake('anything at all', ''), { called: true, rest: 'anything at all' });
});

test('the stop word is said on its own', () => {
  for (const yes of ['Stop.', 'stop', ' STOP! ', 'stop please', 'Okay, stop.']) assert.strictEqual(core.isStop(yes, 'stop'), true, yes);
  for (const no of ['stop the demo site', 'do not stop', '', 'stopped']) assert.strictEqual(core.isStop(no, 'stop'), false, no);
  assert.strictEqual(core.isStop('that is all', 'that is all'), true);
});

test('what is spoken: no code, tables or buttons, a link is "a link", and it is cut into sentences', () => {
  const html = '<div class="dc-reply"><p>Done: see <a href="x">https://example.com/a/b</a></p><pre>rm -rf x</pre><table><tr><td>1</td></tr></table><ul><li>one</li><li>two.</li></ul><p>[wave] It is <code>up</code>.</p></div>';
  assert.strictEqual(core.speakable(html), 'Done: see a link. one. two. It is up.');
  assert.deepStrictEqual(core.sentences('The test workspace has 3 projects. Two are running! Shall I start the third? e.g. now'), ['The test workspace has 3 projects.', 'Two are running!', 'Shall I start the third? e.g. now']);
  const long = core.sentences(`${'word '.repeat(80)}end.`, 100);
  assert.ok(long.length > 3 && long.every((s: string) => s.length <= 101));
  assert.ok(core.speakable(`<p>${'A sentence here. '.repeat(100)}</p>`, 200).length <= 200);
});

test('the engine in use: this machine\'s when it is there, the browser\'s otherwise, none when neither', () => {
  assert.strictEqual(core.pickEngine('auto', { local: true, browser: true }), 'local');
  assert.strictEqual(core.pickEngine('auto', { local: false, browser: true }), 'browser');
  assert.strictEqual(core.pickEngine('browser', { local: true, browser: true }), 'browser');
  assert.strictEqual(core.pickEngine('browser', { local: true, browser: false }), 'local');
  assert.strictEqual(core.pickEngine('local', { local: false, browser: true }), 'browser');
  assert.strictEqual(core.pickEngine('local', { local: false, browser: false }), '');
});

test('settings: every key has a default, strings from bash are read, and nothing out of range gets through', () => {
  assert.deepStrictEqual(speechSettings({}), SPEECH_DEFAULTS);
  assert.deepStrictEqual(speechSettings(null), SPEECH_DEFAULTS);
  const s = speechSettings({ speech: { microphone: 'false', hands_free: 'no', wake_word: 'true', wake_phrase: 'Hey, Workspace!', stop_word: '', stt_engine: 'LOCAL', tts_engine: 'paid', stt_model: '../etc', voice: 'en_GB-alan-medium', speed: '9', silence_ms: '10', follow_up_seconds: 'x', language: 'en-GB' } });
  assert.strictEqual(s.microphone, false);
  assert.strictEqual(s.handsFree, false);
  assert.strictEqual(s.wakeWord, true);
  assert.strictEqual(s.wakePhrase, 'hey workspace');
  assert.strictEqual(s.stopWord, 'stop');
  assert.strictEqual(s.sttEngine, 'local');
  assert.strictEqual(s.ttsEngine, 'auto', 'no paid engine can be named');
  assert.strictEqual(s.sttModel, 'whisper-base.en', 'a path is not a model name');
  assert.strictEqual(s.voice, 'en_GB-alan-medium');
  assert.strictEqual(s.speed, 2);
  assert.strictEqual(s.silenceMs, 300);
  assert.strictEqual(s.followUpSeconds, 12);
  assert.strictEqual(s.language, 'en-GB');
  assert.strictEqual(speechSettings({ speech: { language: 'ar-JO' } }).language, 'en-US', 'English only');
});

test('models: what is in avatars/.speech is found by kind, the 8-bit files first, and only English voices are offered', () => {
  const root = workspace();
  const dir = speechDir(root);
  assert.ok(dir.endsWith(path.join('avatars', '.speech')));
  const whisper = findStt(dir, 'whisper-base.en')!;
  assert.strictEqual(whisper.kind, 'whisper');
  assert.ok(whisper.files.encoder.endsWith('base.en-encoder.int8.onnx'));
  assert.strictEqual(findStt(dir, 'moonshine-tiny-en')!.kind, 'moonshine');
  assert.strictEqual(findStt(dir, 'broken'), null);
  assert.strictEqual(findStt(dir, '../stt/whisper-base.en'), null);
  assert.deepStrictEqual(listStt(dir).map((m) => m.name), ['moonshine-tiny-en', 'whisper-base.en']);
  assert.deepStrictEqual(listVoices(dir).map((v) => v.id), ['en_GB-alan-medium', 'en_US-ljspeech-medium']);
  assert.strictEqual(findVoice(dir, 'en_US-half-medium'), null, 'a voice without its tokens and data is not a voice');
  assert.deepStrictEqual(listStt(speechDir('/nowhere')), []);
});

test('what the page is told: local only with the engine and a model, and why not otherwise', () => {
  const root = workspace();
  const on = speechConfig({ speech: { voice: 'en_GB-alan-medium' } }, root, engineOn);
  assert.deepStrictEqual({ local: on.stt.local, model: on.stt.model, why: on.stt.why }, { local: true, model: 'whisper-base.en', why: '' });
  assert.deepStrictEqual({ local: on.tts.local, voice: on.tts.voice }, { local: true, voice: 'en_GB-alan-medium' });
  assert.strictEqual(speechConfig({ speech: { stt_model: 'whisper-tiny.en' } }, root, engineOn).stt.model, 'moonshine-tiny-en', 'a model that is not installed falls to one that is');
  const off = speechConfig({}, root, engineOff);
  assert.strictEqual(off.stt.local, false);
  assert.match(off.stt.why, /engine is not installed/);
  const empty = speechConfig({}, '/nowhere', engineOn);
  assert.strictEqual(empty.tts.local, false);
  assert.match(empty.tts.why, /No voice is installed/);
  assert.match(empty.install, /cmd-tools-avatar-speech\.sh -a install/);
  assert.ok(!JSON.stringify(on).includes(root), 'no path of this machine is sent to the page');
});

test('hear: refused when the microphone is off, when the engine is the browser\'s, and for anything that is not an utterance', async () => {
  const root = workspace();
  const answers: Array<{ o: any; status?: number }> = [];
  const asked: number[] = [];
  const engine: any = { available: () => true, working: false, transcribe: async (samples: Float32Array) => { asked.push(samples.length); return { text: ' [BLANK_AUDIO] Open the  test workspace. ', ms: 7 }; } };
  const ctx = (body: Buffer, query = '') => ({ body, searchParams: new URLSearchParams(query), json: (o: any, status?: number) => { answers.push({ o, status }); }, res: {} as any });
  const second = Buffer.alloc(32000);
  await hear(ctx(second), { speech: { microphone: false } }, root, engine);
  assert.strictEqual(answers.pop()!.status, 403);
  await hear(ctx(second), { speech: { stt_engine: 'browser' } }, root, engine);
  assert.strictEqual(answers.pop()!.status, 409);
  await hear(ctx(second), {}, '/nowhere', engine);
  assert.strictEqual(answers.pop()!.status, 409);
  for (const bad of [Buffer.alloc(100), Buffer.alloc(32001), Buffer.alloc(16000 * 2 * 61)]) { await hear(ctx(bad), {}, root, engine); assert.strictEqual(answers.pop()!.status, 400); }
  assert.deepStrictEqual(asked, [], 'nothing reached the engine');
  await hear(ctx(second), {}, root, engine);
  assert.deepStrictEqual(answers.pop()!.o, { text: 'Open the test workspace.', ms: 7, seconds: 1, engine: 'local', model: 'whisper-base.en' });
  assert.deepStrictEqual(asked, [16000]);
  engine.working = true;
  await hear(ctx(second, 'partial=1'), {}, root, engine);
  assert.deepStrictEqual(answers.pop()!.o, { busy: true }, 'a partial text never waits behind other work');
});

test('speak: refused when speaking is off, takes only an installed voice, and answers a WAV file', async () => {
  const root = workspace();
  const answers: Array<{ o: any; status?: number }> = [];
  const said: Array<{ text: string; voice: string; speed: number }> = [];
  const engine: any = { available: () => true, speak: async (text: string, voice: any, speed: number) => { said.push({ text, voice: voice.id, speed }); return { wav: wav(new Float32Array(2205), 22050), seconds: 0.1, ms: 3 }; } };
  let head: any = null; let sent: Buffer | null = null;
  const ctx = (o: unknown) => ({ body: Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)), searchParams: new URLSearchParams(), json: (a: any, status?: number) => { answers.push({ o: a, status }); },
    res: { writeHead: (status: number, h: any) => { head = { status, ...h }; }, end: (b: Buffer) => { sent = b; } } as any });
  await speak(ctx({ text: 'Hello.' }), { speech: { speaking: false } }, root, engine);
  assert.strictEqual(answers.pop()!.status, 403);
  await speak(ctx({ text: 'Hello.' }), { speech: { tts_engine: 'browser' } }, root, engine);
  assert.strictEqual(answers.pop()!.status, 409);
  await speak(ctx('not json'), {}, root, engine);
  assert.strictEqual(answers.pop()!.status, 400);
  await speak(ctx({ text: '   ' }), {}, root, engine);
  assert.strictEqual(answers.pop()!.status, 400);
  await speak(ctx({ text: `Hello   there. ${'x'.repeat(900)}`, voice: '../../etc/passwd', speed: 99 }), {}, root, engine);
  assert.strictEqual(said[0].voice, 'en_US-ljspeech-medium', 'a voice that is not installed is the default one');
  assert.strictEqual(said[0].speed, 2);
  assert.ok(said[0].text.startsWith('Hello there. ') && said[0].text.length === 600);
  assert.strictEqual(head.status, 200);
  assert.strictEqual(head['Content-Type'], 'audio/wav');
  assert.strictEqual(head['Cache-Control'], 'no-store');
  assert.strictEqual(sent!.subarray(0, 4).toString(), 'RIFF');
  await speak(ctx({ text: 'Hi.', voice: 'en_GB-alan-medium' }), {}, root, engine);
  assert.strictEqual(said[1].voice, 'en_GB-alan-medium');
});

test('a WAV file in memory has a true header, and a transcript loses the recogniser\'s own marks', () => {
  const file = wav(Float32Array.from([0, 0.5, -0.5, 1]), 22050);
  assert.strictEqual(file.length, 44 + 8);
  assert.strictEqual(file.subarray(8, 12).toString(), 'WAVE');
  assert.strictEqual(file.readUInt32LE(24), 22050);
  assert.strictEqual(file.readUInt16LE(22), 1);
  assert.strictEqual(file.readInt16LE(44 + 6), 32767);
  assert.strictEqual(cleanTranscript(' [BLANK_AUDIO] (silence)  Start   the demo. [Music]'), 'Start the demo.');
});

test('the manifest ships the speech files, every setting has a label, and the command parses', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf8'));
  const m = pkg.workspacePlugin;
  for (const f of [...m.js, ...m.css, ...m.scripts.functions, ...m.scripts.args, m.settingsTemplate, m.labels]) assert.ok(fs.existsSync(path.join(PKG, f)), `${f} is in the package`);
  for (const dir of ['public', 'scripts', 'config']) assert.ok(pkg.files.includes(dir), `${dir}/ ships`);
  assert.deepStrictEqual(m.js.slice(0, 3), ['public/speech-core.js', 'public/speech-speak.js', 'public/speech-loop.js'], 'the rules, then the voice, then the loop that uses both');
  assert.ok(m.workspace.files.includes('commands/cmd-tools-avatar-speech.sh'));
  assert.strictEqual(pkg.optionalDependencies['sherpa-onnx-node'], '1.13.8', 'the engine is optional and pinned');
  assert.ok(!pkg.dependencies || !pkg.dependencies['sherpa-onnx-node']);
  const template = fs.readFileSync(path.join(PKG, m.settingsTemplate), 'utf8');
  const keys = [...template.matchAll(/^  ([a-z_]+):/gm)].map((x) => `speech.${x[1]}`);
  const labels = fs.readFileSync(path.join(PKG, m.labels), 'utf8');
  for (const k of keys) assert.match(labels, new RegExp(`^${k.replace('.', '\\.')}:$`, 'm'), `${k} has a label`);
  assert.strictEqual(keys.length, 16);
  // The template's values are the defaults the code has.
  const d = speechSettings({});
  assert.match(template, new RegExp(`stt_model: ${d.sttModel.replace('.', '\\.')}$`, 'm'));
  assert.match(template, new RegExp(`voice: ${d.voice}$`, 'm'));
  assert.match(template, /wake_word: false$/m);
});

test('privacy, as code: one place opens the microphone, nothing records or stores audio, and no key or paid engine is named', () => {
  const loop = fs.readFileSync(path.join(PKG, 'public', 'speech-loop.js'), 'utf8');
  assert.strictEqual(loop.match(/getUserMedia\(/g)!.length, 1, 'the microphone is opened in one place');
  assert.match(loop, /async function openMic\(\) \{[\s\S]{0,200}getUserMedia\(/);
  // openMic is reached from the two buttons, and from the same-tab resume once the browser says the permission stands.
  assert.deepStrictEqual([...loop.matchAll(/await openMic\(\)/g)].length, 2);
  assert.match(loop, /p\.state === 'granted'\) resume\(\)/);
  for (const never of ['MediaRecorder', 'localStorage', 'indexedDB', 'video:', 'xi-api-key', 'elevenlabs', 'api_key']) {
    for (const f of ['speech-loop.js', 'speech-core.js', 'speech-speak.js']) assert.ok(!fs.readFileSync(path.join(PKG, 'public', f), 'utf8').includes(never), `${f} has no ${never}`);
  }
  assert.match(loop, /silent\.gain\.value = 0/, 'the microphone is never played back');
  const server = ['speech.ts', 'speech-engine.ts', 'speech-worker.ts'].map((f) => fs.readFileSync(path.join(PKG, 'src', f), 'utf8')).join('\n');
  for (const never of ['writeFile', 'appendFile', 'createWriteStream', 'console.log']) assert.ok(!server.includes(never), `the server side has no ${never}: nothing said is written`);
  assert.match(server, /'Cache-Control': 'no-store'/);
});

test('English only: no other script in anything that ships, and the docs say where the audio goes', () => {
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  for (const dir of ['public', 'src', 'config', 'docs', 'commands', 'scripts', 'features']) {
    for (const f of walk(path.join(PKG, dir))) assert.ok(!/[֐-ࣿיִ-﻿]/.test(fs.readFileSync(f, 'utf8')), `${path.relative(PKG, f)} is in English`);
  }
  const doc = fs.readFileSync(path.join(PKG, 'docs', 'speech.md'), 'utf8');
  for (const s of ['## Where the audio goes', 'browser vendor', 'Nothing: a phrase is transcribed in memory', 'GPL-3.0', 'MIT (OpenAI Whisper)', 'speech.microphone', 'speech.wake_word']) assert.ok(doc.includes(s), `speech.md says "${s}"`);
});

test('each switch is honoured in the page as well as on the server', () => {
  const loop = fs.readFileSync(path.join(PKG, 'public', 'speech-loop.js'), 'utf8');
  // microphone: no engine is picked, the buttons go, and an ear that does nothing keeps the browser's recogniser out.
  assert.match(loop, /const stt = s\.microphone \? core\.pickEngine\(/);
  assert.match(loop, /\} else if \(!s\.microphone\) \{[\s\S]{0,400}window\.wsAssistantEar = \{ hold\(\) \{\}, keep\(\) \{\}, keeping: \(\) => false \};\s+if \(talkBtn\) talkBtn\.hidden = true;\s+if \(keepBtn\) keepBtn\.hidden = true;/);
  // hands_free: Keep listening is hidden and refuses.
  assert.match(loop, /if \(keepBtn\) keepBtn\.hidden = !s\.handsFree;/);
  assert.match(loop, /async function keep\(on\) \{\s+if \(!stt \|\| !s\.handsFree\) return;/);
  // conversation: off closes the microphone after one phrase.
  assert.match(loop, /if \(mode === 'keep' && !s\.conversation\) \{ mode = 'off'; store\.set\(KEEP, null\); closeMic\(\); \}/);
  // speaking: no voice is created.
  assert.match(loop, /const mouth = s\.speaking && window\.wsSpeechMouth \?/);
  // wake_word and stop_word.
  assert.match(loop, /if \(s\.wakeWord && mode === 'keep' && Date\.now\(\) > followUpUntil\)/);
  assert.match(loop, /if \(core\.isStop\(text, s\.stopWord\)\)/);
  // silence_ms reaches the detector, the language the browser's engines.
  assert.match(loop, /core\.createVad\(\{ silenceMs: s\.silenceMs \}\)/);
  assert.match(loop, /r\.lang = s\.language;/);
});
