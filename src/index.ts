/**
 * The Avatars plugin for Webship Workspace.
 *
 * Four things. The `avatars/` folder as a workspace: its settings file, its commands, its docs and its AI
 * items (each in the folder of its kind) are placed by the installer from the manifest. And speech for the AI Assistant: the person talks, the
 * words are transcribed, the assistant answers and the answer is spoken (public/speech-*.js in the
 * page, src/speech*.ts here). Each part of speech has a switch in the plugin's own settings file. And the
 * board's tools: shapes, text, pictures, pages, looks and saving, added to the dashboard's board
 * (public/board-*.js, src/board.ts). And the camera: one still
 * picture the person chooses to show the assistant with a turn (public/camera.js, src/camera.ts).
 */

import type { ServerResponse } from 'http';
import type { PluginApi } from '@webship.co/workspace-plugin-api';

import { SpeechEngine } from './speech-engine';
import { hear, speak, speechConfig } from './speech';
import { boardSave, BOARD_MAX_BYTES } from './board';
import { Looks, cameraSettings, look, lookForget, lookTurn, LOOK_MAX_BYTES } from './camera';

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

  api.addAssistantContext(() => {
    const speech = speechConfig(settings(), root, engine);
    const on = speech.settings.microphone || speech.settings.speaking;
    return 'The avatars/ workspace is the Avatars workspace (a plugin, @webship.co/workspace-avatar); its commands are the cmd-*.sh scripts in that folder. It comes with AI items for work in this folder: the agent `avatars-character-maker` (ai-agents/), the skill `avatars-workflow` (ai-skills/), the command `/avatars-add-character` (ai-commands/) and the prompt `avatars-build-a-character` (ai-prompts/).'
      + (on ? ' The person may be talking to you and hearing you (speech to speech): when VOICE IS ON, the SUMMARY line is what they hear, so make it a full, natural answer in one to three short sentences, with no paths, commands or symbols read out.'
        + ` Speech is set up with \`${speech.install}\` and switched part by part in core/config/plugin.avatar.settings.yml.` : '');
  });

  api.addFragment(({ rest, res }) => {
    if (rest !== 'speech/config' && rest !== 'camera/config') return (res as ServerResponse).writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    const body = JSON.stringify(rest === 'camera/config' ? cameraSettings(settings()) : speechConfig(settings(), root, engine));
    (res as ServerResponse).writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(body);
    return undefined;
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
  }
}
