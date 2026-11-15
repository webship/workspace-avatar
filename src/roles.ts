/**
 * What the assistant is told it can do here, role by role: development, testing, design, video
 * production, audio production, documents.
 *
 * Not a list of promises. Each role is the folders of this workspace that serve it, and each line names
 * a command that is in one of those folders right now, with the name its own header gives it. A role
 * whose folders are not here says so, and how its folder is added. The list is read from the disk at
 * each turn, so a folder added a minute ago is in the next answer.
 */

import fs from 'fs';
import path from 'path';

export interface RolesLib {
  loadWorkspaces: () => Record<string, unknown>;
  workspaceDir: (key: string) => string;
}

interface Role { id: string; label: string; folders: string[]; pick?: RegExp; skip?: RegExp; plugins: string; also?: string }

const TESTING = /(^|-)(test|testing|tests|checks|automated-testing)(-|\.)/;
export const ROLES: Role[] = [
  { id: 'development', label: 'Development', folders: ['dev', 'sandboxes', 'demos', 'products', 'projects', 'modules', 'themes', 'profiles', 'recipes', 'libraries', 'site-templates'], skip: TESTING, plugins: 'dev, sandboxes, demos',
    also: 'A site is built, started, stopped, backed up and removed only through these commands.' },
  { id: 'testing', label: 'Testing', folders: ['test', 'dev', 'sandboxes', 'demos', 'products', 'projects'], pick: TESTING, plugins: 'test, dev',
    also: 'The suite is Webship-js. Set a project up with the testing command and its name, run it with --run; the report is in the project\'s Tests menu on its folder\'s page.' },
  { id: 'design', label: 'Design', folders: ['designs', 'images', 'graphs'], plugins: 'designs, images',
    also: 'The board is yours to draw on (BOARD: and DRAW: lines); the person keeps a page with "To the workspace", in designs/boards/.' },
  { id: 'video', label: 'Video production', folders: ['videos'], plugins: 'video' },
  { id: 'audio', label: 'Audio production', folders: ['audio'], plugins: 'audio' },
  { id: 'documents', label: 'Documents', folders: ['docs', 'specs', 'worklogs'], plugins: 'docs, specs, worklogs',
    also: 'A document is a Markdown file in one of these folders, written with your file tools.' },
];

const PER_ROLE = 8;

/** The commands of a folder: `{ file, name }`, the name being what its own header (`# workspace-name:`) or its --help says. */
export function commandsOf(dir: string): Array<{ file: string; name: string }> {
  let files: string[] = [];
  try { files = fs.readdirSync(dir).filter((f) => /^cmd-[a-z0-9.-]+\.sh$/.test(f)).sort(); } catch (_) { return []; }
  return files.map((file) => {
    let name = '';
    try {
      const head = fs.readFileSync(path.join(dir, file), 'utf8').slice(0, 4000);
      // What the command calls itself in the dashboard's lists, else what its own --help says it does.
      name = (head.match(/^# workspace-name:\s*(.+)$/m) || [])[1] || (head.match(/^ARGPARSE_DESCRIPTION="([^"$`\\]+)"/m) || [])[1]
        // Or the comment a script opens with, before its bootstrap.
        || (head.split('\n').slice(1, 6).map((l) => (l.match(/^# (?!Bootstrap|Find the workspace|Load workspace)(.{12,})$/) || [])[1]).find(Boolean) || '');
    } catch (_) { name = ''; }
    return { file, name: name.replace(/[`\r\n]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) };
  });
}

export interface RoleFound { id: string; label: string; folders: string[]; commands: Array<{ folder: string; file: string; name: string }>; more: number; plugins: string; also: string }

/** Each role with the folders that are workspaces here and the commands those folders hold. */
export function rolesHere(lib: RolesLib): RoleFound[] {
  let keys: string[] = [];
  try { keys = Object.keys(lib.loadWorkspaces()); } catch (_) { keys = []; }
  return ROLES.map((role) => {
    const folders = role.folders.filter((f) => keys.includes(f));
    const all: Array<{ folder: string; file: string; name: string }> = [];
    for (const folder of folders) {
      let dir = '';
      try { dir = lib.workspaceDir(folder); } catch (_) { continue; }
      for (const c of commandsOf(dir)) {
        if (role.pick && !role.pick.test(c.file)) continue;
        if (role.skip && role.skip.test(c.file)) continue;
        // The same command placed in several folders is said once, with the first folder it is in.
        if (!all.some((x) => x.file === c.file)) all.push({ folder, ...c });
      }
    }
    return { id: role.id, label: role.label, folders, commands: all.slice(0, PER_ROLE), more: Math.max(0, all.length - PER_ROLE), plugins: role.plugins, also: role.also || '' };
  });
}

/** The paragraph the assistant is given: what it can do here, by role, and the rules that go with it. */
export function rolesContext(lib: RolesLib): string {
  const lines = rolesHere(lib).map((r) => {
    if (!r.folders.length) return `- ${r.label}: no folder for it in this workspace. Say so; it is added with \`webship-workspace plugin require <name>\` (${r.plugins}) or in Settings, Plugins.`;
    const where = r.folders.map((f) => `${f}/`).join(', ');
    const cmds = r.commands.map((c) => `${c.folder}/${c.file}${c.name ? ` (${c.name})` : ''}`).join('; ');
    const more = r.more ? `; and ${r.more} more (list the cmd-*.sh files of the folder)` : '';
    return `- ${r.label} (${where}): ${cmds ? `${cmds}${more}.` : 'no command in it yet; work on its files with your file tools.'}${r.also ? ` ${r.also}` : ''}`;
  });
  return [
    'WHAT YOU CAN DO HERE, FOR THE TEAM: development, testing, design, video production, audio production and documents. Each command below is in this workspace right now. Run one from its folder, read `bash <command> --help` before you use a flag, and say what you ran and what it answered. Offer what fits what the person is doing; do not list all of this unasked.',
    ...lines,
    'The rules of the desk: a site is built, started and stopped only through its folder\'s commands, never by hand on the machine. While testing, and in any scenario you write, use the accounts a site has: a suite never creates or deletes a user account. A site out on the web is opened and read (BROWSE:), nothing more: no form, no sign-in, no going through its pages by yourself. A site of this workspace opens in the reading window by its own address. When the person shows you the camera, a picture comes with that one turn.',
  ].join('\n');
}

/** The `roles:` block of the plugin's settings: on unless it says otherwise. */
export function rolesEnabled(raw: unknown): boolean {
  const r = ((raw && typeof raw === 'object' ? (raw as Record<string, unknown>).roles : null) || {}) as Record<string, unknown>;
  return !(r.enabled === false || ['false', 'no', 'off', '0', 'none'].includes(String(r.enabled ?? '').trim().toLowerCase()));
}
