/**
 * The Avatars workspace for Webship Workspace: the `avatars/` folder as a plugin.
 *
 * What the package carries is placed by the installer from the manifest (the folder's settings file,
 * its commands, its docs and its AI items, each in the folder of its kind) and listed by --activate; the dashboard draws the workspace from the
 * settings file like any other. Nothing to register at run time yet: this is where the folder's own
 * rail buttons, row menus or assistant context would go.
 */

import type { PluginApi } from '@webship.co/workspace-plugin-api';

export const WORKSPACE_KEY = 'avatars';

/** The AI items the installer places, each in the workspace folder of its kind (ai/ in this package). */
export const AGENTS = ['avatars-character-maker'];
export const SKILLS = ['avatars-workflow'];
export const AI_COMMANDS = ['avatars-add-character'];
export const PROMPTS = ['avatars-build-a-character'];

export function register(api: PluginApi): void {
  api.addAssistantContext(() => `The avatars/ workspace is the Avatars workspace (a plugin, @webship.co/workspace-avatar); its commands are the cmd-*.sh scripts in that folder. It comes with AI items for work in this folder: the agent \`avatars-character-maker\` (ai-agents/), the skill \`avatars-workflow\` (ai-skills/), the command \`/avatars-add-character\` (ai-commands/) and the prompt \`avatars-build-a-character\` (ai-prompts/).`);
}
