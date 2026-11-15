import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { Looks, cameraSettings, look, lookForget, lookTurn, LOOK_MAX_BYTES } from '../src/camera';

const PKG = fs.existsSync(path.join(__dirname, '..', 'package.json')) ? path.join(__dirname, '..') : path.join(__dirname, '..', '..');
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(400, 7)]);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const base = () => fs.mkdtempSync(path.join(os.tmpdir(), 'camera-test-'));

test('the camera is on unless the settings say otherwise', () => {
  assert.deepStrictEqual(cameraSettings({}), { enabled: true });
  assert.deepStrictEqual(cameraSettings(null), { enabled: true });
  for (const off of [false, 'false', 'no', 'off', '0']) assert.strictEqual(cameraSettings({ camera: { enabled: off } }).enabled, false, String(off));
  assert.strictEqual(cameraSettings({ camera: { enabled: 'true' } }).enabled, true);
});

test('a picture is kept for one turn in a private file, and is gone when it is forgotten', () => {
  const looks = new Looks(base());
  const token = looks.keep(JPEG);
  assert.match(token, /^[0-9a-f]{24}$/);
  const file = looks.fileOf(token);
  assert.ok(fs.readFileSync(file).equals(JPEG));
  assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600, 'this user only');
  assert.strictEqual(fs.statSync(path.dirname(file)).mode & 0o077, 0, 'in a folder of its own that nobody else can open');
  assert.strictEqual(looks.fileOf('0'.repeat(24)), '');
  assert.strictEqual(looks.fileOf('../../etc/passwd'), '');
  assert.strictEqual(looks.forget(token), true);
  assert.ok(!fs.existsSync(file), 'the file is deleted');
  assert.strictEqual(looks.fileOf(token), '');
  assert.strictEqual(looks.forget(token), false);
});

test('a picture nobody asked about is deleted by itself, and no more than three wait at once', async () => {
  const quick = new Looks(base(), 30);
  const token = quick.keep(JPEG);
  const file = quick.fileOf(token);
  await wait(80);
  assert.ok(!fs.existsSync(file), 'deleted when its time is up');
  assert.strictEqual(quick.waiting, 0);
  const looks = new Looks(base());
  const tokens = [1, 2, 3, 4, 5].map(() => looks.keep(JPEG));
  assert.strictEqual(looks.waiting, 3);
  assert.strictEqual(looks.fileOf(tokens[0]), '', 'the oldest went');
  assert.ok(looks.fileOf(tokens[4]));
  tokens.forEach((t) => looks.forget(t));
});

test('look takes a JPEG and nothing else, and refuses when the camera is switched off', () => {
  const looks = new Looks(base());
  const answers: Array<{ o: any; status?: number }> = [];
  const ctx = (body: Buffer) => ({ body, json: (o: any, status?: number) => { answers.push({ o, status }); } });
  look(ctx(JPEG), { camera: { enabled: false } }, looks);
  assert.strictEqual(answers.pop()!.status, 403);
  for (const bad of [Buffer.from('<svg onload="x()">'.padEnd(400)), Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(400)]), JPEG.subarray(0, 50), Buffer.concat([JPEG, Buffer.alloc(LOOK_MAX_BYTES)])]) {
    look(ctx(bad), {}, looks);
    assert.strictEqual(answers.pop()!.status, 400);
  }
  assert.strictEqual(looks.waiting, 0, 'nothing was kept by a refused request');
  look(ctx(JPEG), {}, looks);
  const token = answers.pop()!.o.token;
  assert.ok(looks.fileOf(token));
  lookForget(ctx(Buffer.from(JSON.stringify({ token }))), looks);
  assert.deepStrictEqual(answers.pop()!.o, { forgotten: true });
  lookForget(ctx(Buffer.from('not json')), looks);
  assert.deepStrictEqual(answers.pop()!.o, { forgotten: false });
});

test('the assistant is told of a picture only for the turn that carries it, with the rules', () => {
  const looks = new Looks(base());
  const token = looks.keep(JPEG);
  const told = lookTurn({ look: token }, {}, looks);
  assert.ok(told.includes(looks.fileOf(token)), 'where the picture is');
  for (const rule of ['one still picture', 'pressing "Look at this"', 'do not copy, move or keep the file', 'do not guess who a person in it is']) assert.ok(told.includes(rule), rule);
  assert.strictEqual(lookTurn({}, {}, looks), '', 'a turn without a picture says nothing');
  assert.strictEqual(lookTurn({ look: 'f'.repeat(24) }, {}, looks), '');
  assert.strictEqual(lookTurn({ look: token }, { camera: { enabled: false } }, looks), '', 'nor does a camera that is switched off');
  looks.forget(token);
  assert.strictEqual(lookTurn({ look: token }, {}, looks), '');
});

test('privacy, as code: one place opens the camera, on a press; no sound, no recording; it stops with its window', () => {
  const src = fs.readFileSync(path.join(PKG, 'public', 'camera.js'), 'utf8');
  assert.strictEqual(src.match(/getUserMedia\(\{/g)!.length, 1, 'the camera is opened in one place');
  assert.match(src, /getUserMedia\(\{ video: \{[^}]*\}[^)]*audio: false \}\)/, 'video only: never the microphone');
  assert.match(src, /button\.addEventListener\('click', \(\) => \(stream \? off\('button'\) : on\(\)\)\);/, 'opened by the button');
  assert.strictEqual((src.match(/[^.\w]on\(\)/g) || []).length, 2, 'its definition and the button: nothing else in the page calls it');
  assert.match(src, /window\.wsCamera = \{ off: /, 'and other scripts are not handed a way to turn it on');
  for (const never of ['MediaRecorder', 'localStorage', 'sessionStorage', 'indexedDB', 'setInterval', 'captureStream']) assert.ok(!src.includes(never), `no ${never}`);
  assert.match(src, /if \(mine && !mine\.isConnected\) off\('window closed'\);/);
  assert.match(src, /window\.addEventListener\('pagehide', \(\) => off\('page left'\)\);/);
  assert.match(src, /stream\.getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\)/);
  // A picture leaves the browser from one place, the Look at this button, and is forgotten when the answer comes.
  assert.strictEqual((src.match(/fetch\('\/actions\/p\/avatar\/look'/g) || []).length, 1);
  assert.match(src, /else if \(b\.dataset\.camera === 'look'\) lookAt\(\);/);
  assert.match(src, /if \(token && sentWith === token\) \{ forget\(\);/);
  assert.match(src, /Camera on/);
  const server = fs.readFileSync(path.join(PKG, 'src', 'camera.ts'), 'utf8');
  assert.match(server, /mode: 0o600/);
  assert.ok(!server.includes('console.log'));
  const doc = fs.readFileSync(path.join(PKG, 'docs', 'camera.md'), 'utf8');
  for (const s of ['never opens by itself', 'goes where your prompts go', 'Then it is deleted', 'camera.enabled', 'Nowhere: it is drawn by the browser']) assert.ok(doc.includes(s), `camera.md says "${s}"`);
  const m = JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf8')).workspacePlugin;
  assert.ok(m.js.includes('public/camera.js') && m.css.includes('public/camera.css'));
  assert.match(fs.readFileSync(path.join(PKG, m.settingsTemplate), 'utf8'), /^camera:\n  #[^\n]*\n  enabled: true$/m);
  assert.match(fs.readFileSync(path.join(PKG, m.labels), 'utf8'), /^camera\.enabled:$/m);
});
