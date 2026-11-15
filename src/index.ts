/**
 * The Avatars plugin for Webship Workspace.
 *
 * Six things. The `avatars/` folder as a workspace: its settings file, its commands, its docs and its AI
 * items (each in the folder of its kind) are placed by the installer from the manifest. And speech for the AI Assistant: the person talks, the
 * words are transcribed, the assistant answers and the answer is spoken (public/speech-*.js in the
 * page, src/speech*.ts here). Each part of speech has a switch in the plugin's own settings file. And the
 * board's tools: shapes, text, pictures, pages, looks and saving, added to the dashboard's board
 * (public/board-*.js, src/board.ts). And the camera: one still
 * picture the person chooses to show the assistant with a turn (public/camera.js, src/camera.ts). And the reading window's tools: the workspace's own sites, a
 * section read aloud, a picture of a local page for the board, its tests (public/browser-*.js, src/browser.ts).
 * And the roles: what the assistant is told it can do here for development, testing, design, video,
 * audio and documents, as the commands that are in this workspace's folders right now (src/roles.ts).
 */

import type { ServerResponse } from 'http';
import type { PluginApi } from '@webship.co/workspace-plugin-api';

import { SpeechEngine } from './speech-engine';
import { hear, speak, speechConfig } from './speech';
import { boardSave, BOARD_MAX_BYTES } from './board';
import { Looks, cameraSettings, look, lookForget, lookTurn, LOOK_MAX_BYTES } from './camera';
import { sitesList, siteOf, siteSnap, testPlan, type BrowserLib } from './browser';
import { rolesContext, rolesEnabled, rolesHere } from './roles';

export const WORKSPACE_KEY = 'avatars';

/** The AI items the installer places, each in the workspace folder of its kind (ai/ in this package). */
export const AGENTS = ['avatars-character-maker'];
export const SKILLS = ['avatars-workflow'];
export const AI_COMMANDS = ['avatars-add-character'];
export const PROMPTS = ['avatars-build-a-character'];

// The hooks a newer dashboard offers, until the typed api package names them.
interface PageApi {
  addUpload?: (name: string, handler: (ctx: any) => unknown, opts?: { maxBytes?: number }) => void;
  addAssistantTurn?: (fn: (ctx: { body: Record<string, unknown>; message: string }) => string | Promise<string>) => void;
}

export function register(api: PluginApi): void {
  const more = api as PluginApi & PageApi;
  const root = api.lib.ROOT;
  const settings = () => { try { return api.settings.read(); } catch (_) { return {}; } };
  const engine = new SpeechEngine();
  const looks = new Looks();
  // The dashboard's say on which host names are sites of this workspace: on an older one there is none, and so no site tool.
  const sites = api.lib as unknown as BrowserLib;
  const knowsSites = typeof sites.localSite === 'function' && typeof sites.readerAllowed === 'function';
  const sitesOrNone = () => (knowsSites ? sitesList(sites) : []);

  api.addAssistantContext(() => {
    const speech = speechConfig(settings(), root, engine);
    const on = speech.settings.microphone || speech.settings.speaking;
    return 'The avatars/ workspace is the Avatars workspace (a plugin, @webship.co/workspace-avatar); its commands are the cmd-*.sh scripts in that folder. It comes with AI items for work in this folder: the agent `avatars-character-maker` (ai-agents/), the skill `avatars-workflow` (ai-skills/), the command `/avatars-add-character` (ai-commands/) and the prompt `avatars-build-a-character` (ai-prompts/).'
      + (on ? ' The person may be talking to you and hearing you (speech to speech): when VOICE IS ON, the SUMMARY line is what they hear, so make it a full, natural answer in one to three short sentences, with no paths, commands or symbols read out.'
        + ` Speech is set up with \`${speech.install}\` and switched part by part in core/config/plugin.avatar.settings.yml.` : '');
  });

  api.addFragment(({ rest, res }) => {
    if (!['speech/config', 'camera/config', 'sites', 'roles'].includes(rest)) return (res as ServerResponse).writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    // `roles` is what the assistant is told it can do here, for a person to read too.
    const body = JSON.stringify(rest === 'roles' ? { enabled: rolesEnabled(settings()), roles: rolesHere(api.lib) }
      : rest === 'sites' ? { sites: sitesOrNone() } : rest === 'camera/config' ? cameraSettings(settings()) : speechConfig(settings(), root, engine));
    (res as ServerResponse).writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(body);
    return undefined;
  });

  // What the assistant can do here, role by role, read from the folders and commands that are here now.
  api.addAssistantContext(() => (rolesEnabled(settings()) ? rolesContext(api.lib) : ''));

  // "Test this site": the folder's own Webship-js testing command, started the way the Tests menu starts it.
  api.addAction('site-test', async ({ form, send }) => {
    const found = knowsSites ? await siteOf(form.url, sites) : { error: 'This dashboard does not say which sites are its own.' };
    if ('error' in found) return send(`<div class="msg error">${api.lib.esc(found.error)}</div>`, 403);
    const dir = api.lib.workspaceDir(found.site.workspace);
    const plan = testPlan(found.site, dir);
    if (!plan.ok) return send(`<div class="msg error">${api.lib.esc(plan.why)}</div>`, 409);
    // In a session on the machine, like the Tests menu's, or not at all: a suite is never run inside the
    // dashboard's own container, whose tools are not the machine's.
    const started = await api.lib.startInScreen({ workspace: found.site.workspace, project: found.site.project, projectDir: dir, ownerDir: found.site.dir, verb: plan.verb, cmdLine: plan.cmdLine, label: plan.label, page: false } as Parameters<typeof api.lib.startInScreen>[0]);
    if (started && (started as { needsRunner?: boolean }).needsRunner) {
      return send(`<div class="msg error" data-site-test="no-runner">The dashboard has no runner on this machine to start it. In a terminal, from the ${api.lib.esc(found.site.workspace)}/ folder: <code>${api.lib.esc(plan.cmdLine)}</code></div>`, 409);
    }
    return send(`${api.lib.screenStartedHtml(started, plan.label, found.site.project)}<div class="msg assistant" data-site-test="${plan.verb}" data-report="/${api.lib.esc(found.site.workspace)}">${plan.verb === 'tests'
      ? `The report is in the Tests menu of ${api.lib.esc(found.site.project)}, on the ${api.lib.esc(found.site.workspace)} page, when the run ends.`
      : `${api.lib.esc(found.site.project)} had no testing stack: it is being set up. Press Test this site again when that ends.`}</div>`);
  });

  // A dashboard without the upload hook cannot take an utterance: the page then offers the browser's own speech only.
  if (typeof more.addUpload === 'function' && api.capabilities && api.capabilities.has('uploads')) {
    more.addUpload('hear', (ctx) => hear(ctx, settings(), root, engine), { maxBytes: 16000 * 2 * 60 });
    more.addUpload('speak', (ctx) => speak(ctx, settings(), root, engine), { maxBytes: 8 * 1024 });
    // The board's "To the workspace": written only when a person presses the button.
    more.addUpload('board-save', (ctx) => boardSave(ctx, api.lib), { maxBytes: BOARD_MAX_BYTES });
    // The camera: one still picture the person chose to show, kept for the one turn it goes with.
    more.addUpload('look', (ctx) => look(ctx, settings(), looks), { maxBytes: LOOK_MAX_BYTES });
    more.addUpload('look-forget', (ctx) => lookForget(ctx, looks), { maxBytes: 1024 });
    if (typeof more.addAssistantTurn === 'function') more.addAssistantTurn(({ body }) => lookTurn(body, settings(), looks));
    // The reading window: a picture of a page of a site of this workspace, for the board.
    if (knowsSites) more.addUpload('site-snap', (ctx) => siteSnap(ctx, sites), { maxBytes: 4096 });
  }
}
