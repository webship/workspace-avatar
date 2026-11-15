import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { sitesList, siteOf, snapArgs, testPlan, hasTestingStack, findBrowser, type BrowserLib, type Site } from '../src/browser';

const PKG = fs.existsSync(path.join(__dirname, '..', 'package.json')) ? path.join(__dirname, '..') : path.join(__dirname, '..', '..');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const core = require(path.join(PKG, 'public', 'browser-core.js'));

/** A workspace with two sites folders; `blog1` is a site, `notes` is a plain folder, `ghost` is one the dashboard does not know. */
function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'browser-'));
  const put = (rel: string, text = '') => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
  put('dev/blog1/.ddev/config.yaml', 'name: blog1\ntype: drupal\n');
  put('dev/shop/.ddev/config.yaml', 'name: my-shop\nproject_tld: example.site\n');
  put('dev/ghost/.ddev/config.yaml', 'name: ghost\n');
  put('dev/notes/README.md', 'x');
  put('dev/cmd-tools-testing.sh', '#!/usr/bin/env bash\n');
  put('dev/blog1/cucumber.js', 'module.exports = {};');
  put('docs/readme.md', 'x');
  const known: Record<string, Site> = {
    'blog1.ddev.site': { workspace: 'dev', project: 'blog1', dir: path.join(root, 'dev', 'blog1'), host: 'blog1.ddev.site' },
    'my-shop.example.site': { workspace: 'dev', project: 'shop', dir: path.join(root, 'dev', 'shop'), host: 'my-shop.example.site' },
  };
  const lib: BrowserLib = {
    localSite: (u) => { let h = String(u).toLowerCase(); try { if (h.includes('://')) h = new URL(h).hostname; } catch (_) { return null; } return known[h] || null; },
    readerAllowed: async (url) => (new URL(url).pathname.startsWith('/refused') ? 'only the standard https port' : ''),
    loadWorkspaces: () => ({ dev: {}, docs: {} }),
    workspaceDir: (key) => path.join(root, key),
    listProjects: (dir) => { try { return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch (_) { return []; } },
  };
  return { root, lib, known };
}

test('a page is its sections: each heading with what follows it, up to the next heading of its level', () => {
  const blocks = [{ tag: 'P', text: ' Intro   words. ' }, { tag: 'H1', text: 'Site' }, { tag: 'p', text: 'Welcome.' }, { tag: 'h2', text: 'Opening hours' }, { tag: 'p', text: 'Nine to five.' },
    { tag: 'h3', text: 'Saturday' }, { tag: 'li', text: 'Closes at noon.' }, { tag: 'h2', text: 'Delivery' }, { tag: 'p', text: 'Same day.' }, { tag: 'p', text: '   ' }];
  const s = core.sectionsOf(blocks);
  assert.deepStrictEqual(s.map((x: any) => [x.title, x.level, x.index]), [['The top of the page', 0, -1], ['Site', 1, 1], ['Opening hours', 2, 3], ['Saturday', 3, 5], ['Delivery', 2, 7]]);
  assert.strictEqual(s[2].text, 'Nine to five. Saturday. Closes at noon.', 'a smaller heading inside it is part of it');
  assert.strictEqual(s[4].text, 'Same day.');
  assert.strictEqual(core.spoken(s[2]), 'Opening hours. Nine to five. Saturday. Closes at noon.');
  assert.strictEqual(core.spoken(s[0]), 'Intro words.', 'the top of the page has no title to read');
  assert.deepStrictEqual(core.sectionsOf([]), []);
  assert.deepStrictEqual(core.sectionsOf(null), []);
  const long = core.spoken({ title: 'Long', level: 2, text: 'A sentence here. '.repeat(200) }, 300);
  assert.ok(long.length <= 300 && long.endsWith('.'), 'a long section is cut at a sentence');
  assert.deepStrictEqual(core.forBoard(s[3]), { line: 'Saturday', note: 'Closes at noon.' });
  assert.ok(core.forBoard({ title: 'T', text: 'word '.repeat(200) }).note.endsWith('…'));
  assert.strictEqual(core.siteAddress('Blog1.ddev.site'), 'https://blog1.ddev.site/');
  for (const bad of ['', 'a b', 'https://x.y', 'x', '../etc', 'a.b/c']) assert.strictEqual(core.siteAddress(bad), '', bad);
});

test('the sites of this workspace are the ones the dashboard says are, by folder and project', () => {
  const t = workspace();
  assert.deepStrictEqual(sitesList(t.lib), [{ host: 'blog1.ddev.site', workspace: 'dev', project: 'blog1' }, { host: 'my-shop.example.site', workspace: 'dev', project: 'shop' }]);
  assert.deepStrictEqual(sitesList({ ...t.lib, loadWorkspaces: () => { throw new Error('no'); } }), []);
});

test('a picture and the tests are for a page the reading window would open of a site of this workspace, and for nothing else', async () => {
  const t = workspace();
  const ok = await siteOf('https://blog1.ddev.site/node/1', t.lib);
  assert.ok('site' in ok && ok.site.project === 'blog1' && ok.url.pathname === '/node/1');
  for (const [bad, why] of [['https://example.com/', /out on the web is only read/], ['https://ghost.ddev.site/', /not a site of this workspace/], ['http://blog1.ddev.site/', /Only an https page/],
    ['https://user:pass@blog1.ddev.site/', /Only an https page/], ['file:///etc/passwd', /Only an https page/], ['javascript:alert(1)', /Only an https page/], ['not a link', /not a link/],
    ['https://172.18.0.5/', /Only an https page|not a site/], ['https://blog1.ddev.site/refused', /would not open that page/]] as Array<[string, RegExp]>) {
    const r = await siteOf(bad, t.lib);
    assert.ok('error' in r && why.test(r.error), `${bad}: ${'error' in r ? r.error : 'allowed'}`);
  }
});

test('the picture is taken looking at that one site and nothing else, with no profile kept and nobody signed in', () => {
  const args = snapArgs(new URL('https://blog1.ddev.site/node/1?x=1'), 'blog1.ddev.site', '/tmp/x/page.png', '/tmp/x/profile', 'ddev-router');
  assert.strictEqual(args[args.length - 1], 'https://blog1.ddev.site/node/1?x=1', 'the address is the last argument, and is an https address: never read as an option');
  assert.ok(args.includes('--host-resolver-rules=MAP blog1.ddev.site ddev-router, MAP * ~NOTFOUND'), 'every other name leads nowhere');
  assert.ok(snapArgs(new URL('https://blog1.ddev.site/'), 'blog1.ddev.site', '/o.png', '/p', '').includes('--host-resolver-rules=EXCLUDE blog1.ddev.site, MAP * ~NOTFOUND'));
  for (const flag of ['--headless=new', '--incognito', '--user-data-dir=/tmp/x/profile', '--screenshot=/tmp/x/page.png', '--window-size=1280,800']) assert.ok(args.includes(flag), flag);
  assert.ok(!args.some((a) => /remote-debugging|load-extension|disable-web-security/.test(a)));
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'bin-'));
  assert.strictEqual(findBrowser([bin]), '');
  fs.writeFileSync(path.join(bin, 'chromium'), '');
  assert.strictEqual(findBrowser(['', '/nowhere', bin]), path.join(bin, 'chromium'));
  const src = fs.readFileSync(path.join(PKG, 'src', 'browser.ts'), 'utf8');
  assert.match(src, /execFile\(browser, snapArgs\(/, 'the browser is started with a list of arguments, never through a shell');
  assert.match(src, /fs\.rmSync\(dir, \{ recursive: true, force: true \}\)/, 'and what it wrote is removed');
});

test('Test this site starts the folder\'s own testing command: the suite when the project has one, its setup first when it has none', () => {
  const t = workspace();
  const dev = path.join(t.root, 'dev');
  assert.strictEqual(hasTestingStack(t.known['blog1.ddev.site'].dir), true);
  assert.deepStrictEqual(testPlan(t.known['blog1.ddev.site'], dev), { ok: true, verb: 'tests', cmdLine: 'bash cmd-tools-testing.sh blog1 --run', label: 'The Webship-js tests of blog1' });
  assert.deepStrictEqual(testPlan(t.known['my-shop.example.site'], dev), { ok: true, verb: 'tests-setup', cmdLine: 'bash cmd-tools-testing.sh shop', label: 'Setting up Webship-js testing in shop' });
  const noCommand = testPlan({ ...t.known['blog1.ddev.site'], workspace: 'docs' }, path.join(t.root, 'docs'));
  assert.ok(!noCommand.ok && /no cmd-tools-testing\.sh/.test(noCommand.why));
  const odd = testPlan({ ...t.known['blog1.ddev.site'], project: 'x; rm -rf ~' }, dev);
  assert.ok(!odd.ok, 'a project name that is not a plain name never reaches a command line');
});

test('the reading tools: on the dashboard\'s own reading window, and only a local site gets a picture and its tests', () => {
  const tools = fs.readFileSync(path.join(PKG, 'public', 'browser-tools.js'), 'utf8');
  assert.match(tools, /windows\(\)\.readerDocument\(\)/);
  assert.match(tools, /bar\.querySelectorAll\('\[data-local\]'\)\.forEach\(\(b\) => \{ b\.hidden = !local; \}\);/);
  assert.match(tools, /data-read="picture" data-local hidden/);
  assert.match(tools, /data-read="test" data-local hidden/);
  assert.deepStrictEqual([...tools.matchAll(/fetch\('([^']+)'/g)].map((m) => m[1]).sort(), ['/actions/p/avatar/site-snap', '/actions/p/avatar/site-test', '/fragments/p/avatar/sites']);
  assert.ok(!/\.submit\(|\.click\(\)|contentWindow|innerHTML = html/.test(tools), 'it reads a page: it never clicks, submits or scripts one');
  assert.match(tools, /new DOMParser\(\)\.parseFromString\(html, 'text\/html'\)/);
  const index = fs.readFileSync(path.join(PKG, 'src', 'index.ts'), 'utf8');
  assert.match(index, /api\.lib\.startInScreen\(\{ workspace: found\.site\.workspace, project: found\.site\.project, projectDir: dir, ownerDir: found\.site\.dir, verb: plan\.verb, cmdLine: plan\.cmdLine/);
  assert.match(index, /label: plan\.label, page: false \}/, 'a suite is started in a session on the machine, never inside the dashboard\'s own container');
  assert.match(index, /data-site-test="no-runner"/);
  const m = JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf8')).workspacePlugin;
  assert.ok(m.js.indexOf('public/browser-core.js') >= 0 && m.js.indexOf('public/browser-core.js') < m.js.indexOf('public/browser-tools.js'));
  for (const f of [...m.js, ...m.css, ...m.features]) assert.ok(fs.existsSync(path.join(PKG, f)), `${f} is in the package`);
  const doc = fs.readFileSync(path.join(PKG, 'docs', 'browser.md'), 'utf8');
  for (const s of ['read and never acted on', 'A site out on the web', 'signed in as nobody', 'cmd-tools-testing.sh <project> --run', 'Fill in a form, sign in, follow links by itself']) assert.ok(doc.includes(s), `browser.md says "${s}"`);
});
