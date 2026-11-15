import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { ROLES, commandsOf, rolesContext, rolesEnabled, rolesHere } from '../src/roles';

const PKG = fs.existsSync(path.join(__dirname, '..', 'package.json')) ? path.join(__dirname, '..') : path.join(__dirname, '..', '..');

function workspace(keys: string[]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'roles-'));
  const cmd = (rel: string, header = '') => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, `#!/usr/bin/env bash\n${header}\n`); };
  cmd('dev/cmd-drupal11-recommended-project.sh', '# workspace-name: Drupal 11 (latest)');
  cmd('dev/cmd-tools-testing.sh', 'ARGPARSE_DESCRIPTION="Configure the automated-testing environment of a dev project, or run its suite"');
  cmd('dev/cmd-tools-checks.sh', '\n# Bootstrap.\n# Find the workspace tooling from this script, so a fresh clone needs no setup.');
  cmd('dev/cmd-tools-remove.sh', '# workspace-name: Remove a project');
  cmd('dev/notes.sh', '# workspace-name: not a command');
  cmd('sandboxes/cmd-tools-testing.sh', 'ARGPARSE_DESCRIPTION="Configure the automated-testing environment of a dev project, or run its suite"');
  cmd('sandboxes/cmd-tools-remove.sh', '# workspace-name: Remove a project');
  cmd('audio/cmd-tools-voice.sh', 'ARGPARSE_DESCRIPTION="Generate a voice from a text, with the engines this machine has"');
  cmd('videos/cmd-tools-video-edit.sh', '# workspace-name: Edit a `video`');
  cmd('docs/cmd-tool-backup-doc.sh', '\n# Back up one document folder: a dated archive beside it.\n\n# Bootstrap.');
  for (let i = 0; i < 12; i += 1) cmd(`designs/cmd-design-${String(i).padStart(2, '0')}.sh`, `# workspace-name: Design ${i}`);
  const lib = { loadWorkspaces: () => Object.fromEntries(keys.map((k) => [k, {}])), workspaceDir: (k: string) => path.join(root, k) };
  return { root, lib };
}

test('a command is named by its own header, else by what its --help says', () => {
  const t = workspace(['dev']);
  assert.deepStrictEqual(commandsOf(path.join(t.root, 'dev')), [
    { file: 'cmd-drupal11-recommended-project.sh', name: 'Drupal 11 (latest)' },
    { file: 'cmd-tools-checks.sh', name: '' },
    { file: 'cmd-tools-remove.sh', name: 'Remove a project' },
    { file: 'cmd-tools-testing.sh', name: 'Configure the automated-testing environment of a dev project, or run its suite' },
  ]);
  assert.deepStrictEqual(commandsOf(path.join(t.root, 'nowhere')), []);
  assert.strictEqual(commandsOf(path.join(t.root, 'videos'))[0].name, 'Edit a video', 'no mark of its own in a name');
  assert.strictEqual(commandsOf(path.join(t.root, 'docs'))[0].name, 'Back up one document folder: a dated archive beside it.', 'or the comment it opens with, never its bootstrap line');
});

test('each role is the folders that are here and the commands that are in them: testing apart from development, a command said once', () => {
  const t = workspace(['dev', 'sandboxes', 'audio', 'designs']);
  const roles = rolesHere(t.lib);
  assert.deepStrictEqual(roles.map((r) => r.id), ['development', 'testing', 'design', 'video', 'audio', 'documents']);
  const by = Object.fromEntries(roles.map((r) => [r.id, r]));
  assert.deepStrictEqual(by.development.folders, ['dev', 'sandboxes']);
  assert.deepStrictEqual(by.development.commands.map((c) => `${c.folder}/${c.file}`), ['dev/cmd-drupal11-recommended-project.sh', 'dev/cmd-tools-remove.sh'], 'no testing command, and the same command of two folders once');
  assert.deepStrictEqual(by.testing.commands.map((c) => c.file), ['cmd-tools-checks.sh', 'cmd-tools-testing.sh']);
  assert.deepStrictEqual(by.audio.commands.map((c) => c.file), ['cmd-tools-voice.sh']);
  assert.deepStrictEqual({ shown: by.design.commands.length, more: by.design.more }, { shown: 8, more: 4 });
  assert.deepStrictEqual({ folders: by.video.folders, commands: by.video.commands }, { folders: [], commands: [] }, 'videos/ is on the disk and is not a workspace here');
  assert.deepStrictEqual(by.documents.folders, []);
});

test('what the assistant is told names only what is here, says what is not, and carries the rules', () => {
  const t = workspace(['dev', 'audio', 'designs']);
  const told = rolesContext(t.lib);
  assert.match(told, /^WHAT YOU CAN DO HERE, FOR THE TEAM/);
  assert.match(told, /- Development \(dev\/\): dev\/cmd-drupal11-recommended-project\.sh \(Drupal 11 \(latest\)\); dev\/cmd-tools-remove\.sh \(Remove a project\)\./);
  assert.match(told, /- Testing \(dev\/\): dev\/cmd-tools-checks\.sh; dev\/cmd-tools-testing\.sh \(Configure the automated-testing environment/);
  assert.match(told, /- Audio production \(audio\/\): audio\/cmd-tools-voice\.sh \(Generate a voice from a text/);
  assert.match(told, /- Design \(designs\/\): .*and 4 more \(list the cmd-\*\.sh files of the folder\)\./);
  assert.match(told, /- Video production: no folder for it in this workspace\. Say so; it is added with `webship-workspace plugin require <name>` \(video\)/);
  assert.match(told, /- Documents: no folder for it in this workspace\./);
  assert.ok(!told.includes('cmd-tools-video-edit.sh'), 'a command of a folder that is not a workspace here is never named');
  for (const rule of ['only through its folder\'s commands', 'a suite never creates or deletes a user account', 'opened and read (BROWSE:), nothing more', 'read `bash <command> --help` before you use a flag', 'do not list all of this unasked']) assert.ok(told.includes(rule), rule);
  assert.ok(!told.includes(t.root), 'no path of this machine');
  assert.ok(told.length < 6000);
  const none = rolesContext({ loadWorkspaces: () => { throw new Error('no'); }, workspaceDir: () => '' });
  assert.strictEqual((none.match(/no folder for it in this workspace/g) || []).length, ROLES.length);
});

test('the roles have a switch, a label, a page to read them on, and nothing in them is for one AI tool only', () => {
  assert.strictEqual(rolesEnabled({}), true);
  assert.strictEqual(rolesEnabled({ roles: { enabled: 'false' } }), false);
  assert.strictEqual(rolesEnabled({ roles: { enabled: false } }), false);
  const m = JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf8')).workspacePlugin;
  assert.match(fs.readFileSync(path.join(PKG, m.settingsTemplate), 'utf8'), /^roles:\n  #[^\n]*\n  enabled: true$/m);
  assert.match(fs.readFileSync(path.join(PKG, m.labels), 'utf8'), /^roles\.enabled:$/m);
  const index = fs.readFileSync(path.join(PKG, 'src', 'index.ts'), 'utf8');
  assert.match(index, /api\.addAssistantContext\(\(\) => \(rolesEnabled\(settings\(\)\) \? rolesContext\(api\.lib\) : ''\)\);/);
  assert.match(index, /rest === 'roles' \? \{ enabled: rolesEnabled\(settings\(\)\), roles: rolesHere\(api\.lib\) \}/);
  const src = fs.readFileSync(path.join(PKG, 'src', 'roles.ts'), 'utf8');
  for (const tool of ['Claude', 'claude', 'Anthropic', 'GPT', 'Gemini', 'Copilot']) assert.ok(!src.includes(tool), `the roles name no ${tool}`);
  const doc = fs.readFileSync(path.join(PKG, 'docs', 'roles.md'), 'utf8');
  for (const s of ['right now', 'a suite never creates', '/fragments/p/avatar/roles', 'roles.enabled', 'any agent with a shell']) assert.ok(doc.includes(s), `roles.md says "${s}"`);
});
