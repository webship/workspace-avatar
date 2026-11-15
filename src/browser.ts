/**
 * The reading window's tools, on the server: the workspace's own sites, a picture of one, its tests.
 *
 *   GET  /fragments/p/avatar/sites        the local sites of this workspace, as JSON
 *   POST /actions/p/avatar/site-snap      { url } in, a PNG picture of that page out (a local site only)
 *   POST /actions/p/avatar/site-test      url=… (a form): the project's Webship-js tests are started
 *
 * Only a site of this workspace: the dashboard says which host names are (api.lib.localSite), and a page
 * the reading window would refuse is refused here too. A site out on the web is read, in the reading
 * window, and nothing more: no picture is taken of it, nothing is tested on it, nothing is posted to it.
 * A picture is taken by the browser in the dashboard's own container, looking at that one site and
 * nothing else, signed in as nobody; it is handed to the page and kept nowhere.
 */

import { execFile } from 'child_process';
import dns from 'dns';
import fs from 'fs';
import os from 'os';
import path from 'path';

export interface Site { workspace: string; project: string; dir: string; host: string }
export interface BrowserLib {
  localSite: (urlOrHost: string) => Site | null;
  readerAllowed: (url: string) => Promise<string>;
  loadWorkspaces: () => Record<string, unknown>;
  workspaceDir: (key: string) => string;
  listProjects: (dir: string) => string[];
}

const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const BROWSERS = ['chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable'];

/** The local sites of this workspace, by folder and project: what the dashboard itself calls a local site. */
export function sitesList(lib: BrowserLib): Array<{ host: string; workspace: string; project: string }> {
  const out: Array<{ host: string; workspace: string; project: string }> = [];
  let keys: string[] = [];
  try { keys = Object.keys(lib.loadWorkspaces()); } catch (_) { return out; }
  for (const key of keys) {
    let dir = '';
    let projects: string[] = [];
    try { dir = lib.workspaceDir(key); projects = lib.listProjects(dir); } catch (_) { continue; }
    for (const project of projects) {
      let cfg = '';
      try { cfg = fs.readFileSync(path.join(dir, project, '.ddev', 'config.yaml'), 'utf8'); } catch (_) { continue; }
      const name = (cfg.match(/^name:\s*["']?([A-Za-z0-9][A-Za-z0-9-]*)["']?\s*$/m) || [])[1] || project;
      const tld = (cfg.match(/^project_tld:\s*"?([^"#\s]+)"?\s*$/m) || [])[1] || 'ddev.site';
      const site = lib.localSite(`${name}.${tld}`.toLowerCase());
      if (site && site.workspace === key && site.project === project) out.push({ host: site.host, workspace: key, project });
    }
  }
  return out.slice(0, 200);
}

/** The local site a URL is a page of, when the reading window would open it; else why not. */
export async function siteOf(raw: unknown, lib: BrowserLib): Promise<{ site: Site; url: URL } | { error: string }> {
  let url: URL;
  try { url = new URL(String(raw || '')); } catch (_) { return { error: 'That is not a link.' }; }
  if (url.protocol !== 'https:' || url.username || url.password || !HOST_RE.test(url.hostname.toLowerCase())) return { error: 'Only an https page of a site of this workspace.' };
  const site = lib.localSite(url.hostname);
  if (!site) return { error: 'That is not a site of this workspace: a site out on the web is only read.' };
  const why = await lib.readerAllowed(url.href);
  if (why) return { error: `The reading window would not open that page: ${why}.` };
  return { site, url };
}

/** A browser on the PATH of this process, or ''. */
export function findBrowser(dirs = String(process.env.PATH || '').split(path.delimiter)): string {
  for (const name of BROWSERS) {
    for (const d of dirs) { if (d && fs.existsSync(path.join(d, name))) return path.join(d, name); }
  }
  return '';
}

/** The arguments of one headless picture: this one site and nothing else, no profile kept, nobody signed in. */
export function snapArgs(url: URL, host: string, out: string, profile: string, router: string): string[] {
  return [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--disable-extensions', '--incognito',
    '--ignore-certificate-errors', `--user-data-dir=${profile}`, '--window-size=1280,800', '--virtual-time-budget=5000',
    // Only this site is looked at: every other name leads nowhere, so a page cannot make the browser fetch anything else.
    `--host-resolver-rules=${router ? `MAP ${host} ${router}, ` : `EXCLUDE ${host}, `}MAP * ~NOTFOUND`,
    `--screenshot=${out}`, url.href,
  ];
}

let snapping = false;
type Json = (o: unknown, status?: number) => void;

/** POST site-snap: a PNG picture of a page of a local site. */
export async function siteSnap(ctx: { body: Buffer; json: Json; res: import('http').ServerResponse }, lib: BrowserLib): Promise<void> {
  let asked: { url?: unknown } = {};
  try { asked = JSON.parse(ctx.body.toString('utf8') || '{}'); } catch (_) { return ctx.json({ error: 'This takes JSON.' }, 400); }
  const found = await siteOf(asked.url, lib);
  if ('error' in found) return ctx.json({ error: found.error }, 403);
  const browser = findBrowser();
  if (!browser) return ctx.json({ error: 'There is no browser where the dashboard runs, so a picture cannot be taken here.' }, 501);
  if (snapping) return ctx.json({ error: 'A picture is being taken: one at a time.' }, 429);
  snapping = true;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-snap-'));
  const out = path.join(dir, 'page.png');
  try {
    // Inside the dashboard's container a project's name does not lead to it: DDEV's router is asked, by its own name.
    const router = await dns.promises.lookup('ddev-router').then(() => 'ddev-router', () => '');
    await new Promise<void>((resolve) => { execFile(browser, snapArgs(found.url, found.site.host, out, path.join(dir, 'profile'), router), { timeout: 40000 }, () => resolve()); });
    const png = fs.readFileSync(out);
    ctx.res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'Content-Length': png.length });
    ctx.res.end(png);
  } catch (_) {
    ctx.json({ error: 'The picture could not be taken: is the site started?' }, 502);
  } finally {
    snapping = false;
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* gone */ }
  }
}

/** Whether a project has its testing stack: the suite's own configuration is there. */
export const hasTestingStack = (dir: string): boolean => fs.existsSync(path.join(dir, 'cucumber.js')) || fs.existsSync(path.join(dir, 'cucumber.cjs')) || fs.existsSync(path.join(dir, 'cucumber.mjs'));

/** What "Test this site" starts: the folder's own testing command, to run the suite or, first, to set it up. */
export function testPlan(site: Site, workspaceDir: string): { ok: false; why: string } | { ok: true; verb: 'tests' | 'tests-setup'; cmdLine: string; label: string } {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(site.project)) return { ok: false, why: 'That project has a name the testing command does not take.' };
  if (!fs.existsSync(path.join(workspaceDir, 'cmd-tools-testing.sh'))) return { ok: false, why: `The ${site.workspace}/ folder has no cmd-tools-testing.sh: its plugin does not test sites.` };
  return hasTestingStack(site.dir)
    ? { ok: true, verb: 'tests', cmdLine: `bash cmd-tools-testing.sh ${site.project} --run`, label: `The Webship-js tests of ${site.project}` }
    : { ok: true, verb: 'tests-setup', cmdLine: `bash cmd-tools-testing.sh ${site.project}`, label: `Setting up Webship-js testing in ${site.project}` };
}
