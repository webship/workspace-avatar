import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { boardFolder, boardSave, BOARD_MAX_BYTES } from '../src/board';

const PKG = fs.existsSync(path.join(__dirname, '..', 'package.json')) ? path.join(__dirname, '..') : path.join(__dirname, '..', '..');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const core = require(path.join(PKG, 'public', 'board-core.js'));
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 1)]);

test('a shape is two points: inside the board, with a size, the smaller corner first', () => {
  assert.deepStrictEqual(core.shapeFrom('rect', 40, 30, 10, 10), { tag: 'rect', attrs: { x: 10, y: 10, width: 30, height: 20, rx: 0.6 } });
  assert.deepStrictEqual(core.shapeFrom('ellipse', 10, 10, 30, 20), { tag: 'ellipse', attrs: { cx: 20, cy: 15, rx: 10, ry: 5 } });
  assert.deepStrictEqual(core.shapeFrom('line', 10, 10, 30, 20), { tag: 'line', attrs: { x1: 10, y1: 10, x2: 30, y2: 20 } });
  assert.strictEqual(core.shapeFrom('arrow', 10, 10, 30, 20).attrs['marker-end'], 'url(#avatar-arrow)');
  assert.strictEqual(core.shapeFrom('diamond', 10, 10, 30, 30).attrs.d, 'M20 10 L30 20 L20 30 L10 20 Z');
  assert.deepStrictEqual(core.shapeFrom('rect', -20, -20, 500, 500).attrs, { x: 0, y: 0, width: 100, height: 60, rx: 0.6 }, 'never off the board');
  assert.strictEqual(core.shapeFrom('rect', 5, 5, 5.2, 40), null, 'a click is not a shape');
  assert.strictEqual(core.shapeFrom('line', 5, 5, 5.1, 5.1), null);
  assert.strictEqual(core.shapeFrom('star', 1, 1, 50, 50), null);
});

test('a picture is a PNG, JPEG, WebP or GIF of at most 3 MB, placed in the middle with its proportions kept', () => {
  assert.strictEqual(core.imageProblem('image/png', 1000), '');
  assert.strictEqual(core.imageProblem('IMAGE/JPEG', 1000), '');
  assert.match(core.imageProblem('image/svg+xml', 1000), /PNG, JPEG, WebP or GIF/, 'an SVG can carry a script: not a picture for the board');
  assert.match(core.imageProblem('text/html', 1000), /PNG/);
  assert.match(core.imageProblem('image/png', 4 * 1024 * 1024), /3 MB/);
  assert.match(core.imageProblem('image/png', 0), /3 MB/);
  const wide = core.fitImage(1920, 1080);
  assert.ok(Math.abs(wide.width / wide.height - 1920 / 1080) < 0.01);
  assert.ok(wide.width <= 66.01 && wide.height <= 39.61);
  assert.strictEqual(Math.round(wide.x + wide.width / 2), 50);
  const tall = core.fitImage(100, 1000);
  assert.ok(tall.height <= 39.61 && tall.width < 5);
});

test('a drawing is put back from an allow-list: no script, no link, no handler, no picture from elsewhere', () => {
  assert.strictEqual(core.cleanItem({ tag: 'script', attrs: {}, text: 'alert(1)' }), null);
  assert.strictEqual(core.cleanItem({ tag: 'foreignObject', attrs: {} }), null);
  assert.strictEqual(core.cleanItem({ tag: 'a', attrs: { href: 'https://example.com' } }), null);
  assert.deepStrictEqual(core.cleanItem({ tag: 'path', attrs: { d: 'M1 2 L3 4', onclick: 'x()', class: 'k', id: 'i' }, style: { stroke: '#ff0000', fill: 'url(#x)', 'stroke-width': '0.6', behavior: 'x' } }),
    { tag: 'path', attrs: { d: 'M1 2 L3 4' }, style: { stroke: '#ff0000', 'stroke-width': '0.6' } });
  assert.strictEqual(core.cleanItem({ tag: 'path', attrs: { d: 'M1 2"><script>' } }), null);
  assert.strictEqual(core.cleanItem({ tag: 'image', attrs: { href: 'https://example.com/a.png', x: 1, y: 1, width: 5, height: 5 } }), null, 'only a picture held in the page itself');
  assert.strictEqual(core.cleanItem({ tag: 'image', attrs: { href: 'data:image/svg+xml;base64,AAAA' } }), null);
  assert.strictEqual(core.cleanItem({ tag: 'image', attrs: { href: 'javascript:alert(1)' } }), null);
  assert.strictEqual(core.cleanItem({ tag: 'image', attrs: { href: 'data:image/png;base64,iVBORw0KGgo=', x: '10', y: '5', width: '20', height: '10' } }).attrs.href, 'data:image/png;base64,iVBORw0KGgo=');
  assert.deepStrictEqual(core.cleanItem({ tag: 'line', attrs: { x1: '1', y1: '2', x2: 'calc(3)', y2: '4', 'marker-end': 'url(https://x)' } }).attrs, { x1: '1', y1: '2', y2: '4' });
  const text = core.cleanItem({ tag: 'text', attrs: { x: '5', y: '6' }, text: `<b>Login</b>\u0007 ${'x'.repeat(400)}`, style: { fill: 'teal', 'font-size': '3.2px' }, move: 'translate(2.5 -3)' });
  assert.strictEqual(text.text.length, 200);
  assert.ok(text.text.startsWith('<b>Login</b>  x'), 'words stay words: they are set as text, never as markup');
  assert.strictEqual(text.move, 'translate(2.5 -3)');
  assert.strictEqual(core.cleanItem({ tag: 'rect', attrs: {}, move: 'matrix(1 0 0 1 0 0) rotate(9)' }).move, undefined);
});

test('a page keeps its drawing, its lines and its notes, each within a limit', () => {
  const page = core.cleanPage({
    items: [{ tag: 'rect', attrs: { x: 1, y: 1, width: 5, height: 5 } }, { tag: 'iframe', attrs: {} }, null],
    lines: ['one', 2, 'x'.repeat(900)], notes: [{ text: 'call the client', left: '26.5%', top: '56%' }, { text: 'x', left: 'expression(1)', top: '9999px' }, 'no'],
  });
  assert.strictEqual(page.items.length, 1);
  assert.deepStrictEqual(page.lines.map((l: string) => l.length), [3, 1, 300]);
  assert.deepStrictEqual(page.notes, [{ text: 'call the client', left: '26.5%', top: '56%' }, { text: 'x', left: '2%', top: '56%' }]);
  assert.deepStrictEqual(core.cleanPage(null), { items: [], lines: [], notes: [] });
  assert.strictEqual(core.cleanPage({ items: Array.from({ length: 900 }, () => ({ tag: 'circle', attrs: { cx: 1, cy: 1, r: 1 } })) }).items.length, 600);
});

test('pages: a new one comes after the one shown, removing shows the one before, and the last page is emptied, never removed', () => {
  let s = core.pagesOf(null);
  assert.deepStrictEqual({ n: s.pages.length, at: s.at }, { n: 1, at: 0 });
  s = core.add(s); s = core.add(s);
  assert.deepStrictEqual({ n: s.pages.length, at: s.at }, { n: 3, at: 2 });
  s = core.go(s, 0); s.pages[0].lines.push('first');
  s = core.add(s);
  assert.deepStrictEqual({ n: s.pages.length, at: s.at, first: s.pages[0].lines }, { n: 4, at: 1, first: ['first'] });
  s = core.remove(s);
  assert.deepStrictEqual({ n: s.pages.length, at: s.at }, { n: 3, at: 1 });
  assert.strictEqual(core.go(s, 99).at, 2);
  assert.strictEqual(core.go(s, -5).at, 0);
  let one = core.pagesOf({ pages: [{ lines: ['only'] }], at: 7 });
  assert.strictEqual(one.at, 0);
  one = core.remove(one);
  assert.deepStrictEqual(one, { pages: [{ items: [], lines: [], notes: [] }], at: 0 });
  let many = core.pagesOf({ pages: Array.from({ length: 50 }, () => ({})) });
  assert.strictEqual(many.pages.length, core.MAX_PAGES);
  many = core.add(many);
  assert.strictEqual(many.pages.length, core.MAX_PAGES, 'twenty pages at most');
  assert.strictEqual(core.fileName(new Date(2026, 10, 15, 9, 31), 2, 'png'), 'board-2026-11-15-0931-page-2.png');
});

test('To the workspace writes a PNG into the first of designs, images, docs that is a workspace, and never over a file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'board-'));
  const lib = (keys: string[]) => ({ isValidWorkspace: (k: string) => keys.includes(k), workspaceDir: (k: string) => path.join(root, k) });
  assert.strictEqual(boardFolder(lib([])), null);
  assert.strictEqual(boardFolder(lib(['docs', 'images']))!.key, 'images');
  assert.strictEqual(boardFolder(lib(['docs', 'images', 'designs']))!.key, 'designs');
  const answers: Array<{ o: any; status?: number }> = [];
  const ctx = (name: string, body: Buffer) => ({ body, searchParams: new URLSearchParams({ name }), json: (o: any, status?: number) => { answers.push({ o, status }); } });
  const name = 'board-2026-11-15-0931-page-1.png';
  boardSave(ctx(name, PNG), lib([]));
  assert.strictEqual(answers.pop()!.status, 409);
  for (const bad of ['../../etc/passwd', 'board.png', 'board-2026-11-15-0931-page-1.svg', 'board-2026-11-15-0931-page-1.png/../x', '']) { boardSave(ctx(bad, PNG), lib(['designs'])); assert.strictEqual(answers.pop()!.status, 400, bad); }
  boardSave(ctx(name, Buffer.from('<svg onload="x()">'.padEnd(300, ' '))), lib(['designs']));
  assert.strictEqual(answers.pop()!.status, 400, 'only a PNG');
  boardSave(ctx(name, Buffer.concat([PNG.subarray(0, 8), Buffer.alloc(BOARD_MAX_BYTES)])), lib(['designs']));
  assert.strictEqual(answers.pop()!.status, 400);
  assert.ok(!fs.existsSync(path.join(root, 'designs')), 'nothing was written by a refused request');
  boardSave(ctx(name, PNG), lib(['designs']));
  assert.deepStrictEqual(answers.pop()!.o, { saved: `designs/boards/${name}` });
  assert.ok(fs.readFileSync(path.join(root, 'designs', 'boards', name)).equals(PNG));
  boardSave(ctx(name, PNG), lib(['designs']));
  assert.deepStrictEqual(answers.pop()!.o, { saved: 'designs/boards/board-2026-11-15-0931-page-1-2.png' }, 'a file that is there is never replaced');
});

test('the board tools: on the dashboard\'s own board, under its Undo and Clear, nothing leaves the browser unasked', () => {
  const tools = fs.readFileSync(path.join(PKG, 'public', 'board-tools.js'), 'utf8');
  assert.match(tools, /b = windowsApi\.board\(\);/, 'the dashboard\'s board, not one of its own');
  assert.ok((tools.match(/b\.keep\(/g) || []).length >= 3, 'a shape, a text and a picture are each under Undo');
  assert.match(tools, /if \(clear\) \{ b\.clear\(\); items\(\)\.forEach\(\(el\) => el\.remove\(\)\); \}/);
  assert.match(tools, /b\.svg\.getScreenCTM\(\)/, 'the pointer is read in the drawing\'s own units, also when the window is not 5 by 3');
  assert.strictEqual((tools.match(/fetch\(/g) || []).length, 1, 'one request, and only from the To the workspace button');
  assert.match(tools, /function saveToWorkspace\(\) \{[\s\S]{0,300}fetch\(`\/actions\/p\/avatar\/board-save/);
  assert.match(tools, /else if \(t\.dataset\.do === 'workspace'\) saveToWorkspace\(\);/);
  assert.ok(!/innerHTML = [^`'"]*(item|page|saved|state)/.test(tools), 'a kept page is rebuilt element by element, never as markup');
  assert.match(tools, /const why = core\.imageProblem\(file && file\.type, file && file\.size\);/);
  assert.match(tools, /core\.cleanItem\(\{ tag: 'image'/);
  for (const never of ['eval(', 'document.write', 'outerHTML']) assert.ok(!tools.includes(never), `no ${never}`);
  const m = JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf8')).workspacePlugin;
  assert.ok(m.js.indexOf('public/board-core.js') >= 0 && m.js.indexOf('public/board-core.js') < m.js.indexOf('public/board-tools.js'), 'the rules load before the tools');
  assert.ok(m.css.includes('public/board.css'));
  for (const f of [...m.js, ...m.css]) assert.ok(fs.existsSync(path.join(PKG, f)), `${f} is in the package`);
  const doc = fs.readFileSync(path.join(PKG, 'docs', 'board.md'), 'utf8');
  for (const s of ['To the workspace', 'designs/boards/', 'stays in this browser', 'New page', 'Chalkboard']) assert.ok(doc.includes(s), `board.md says "${s}"`);
});
