/**
 * The board's "To the workspace": the page that is shown, as a PNG, written into a folder of the workspace.
 *
 *   POST /actions/p/avatar/board-save?name=board-2026-11-15-0931-page-1.png   a PNG in, { saved } out
 *
 * It is written only when a person presses the button. The folder is the first of designs/, images/
 * and docs/ that is a workspace here, in its `boards/` folder; with none of them the board can still be
 * downloaded. A file that is there is never replaced.
 */

import fs from 'fs';
import path from 'path';

const NAME_RE = /^board-\d{4}-\d{2}-\d{2}-\d{4}-page-\d{1,2}\.png$/;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const BOARD_MAX_BYTES = 8 * 1024 * 1024;
export const BOARD_FOLDERS = ['designs', 'images', 'docs'];

export interface BoardLib { isValidWorkspace: (key: string) => boolean; workspaceDir: (key: string) => string }

/** Where a board is kept: `{ key, dir }` of the first folder that is a workspace here, or null. */
export function boardFolder(lib: BoardLib): { key: string; dir: string } | null {
  for (const key of BOARD_FOLDERS) {
    try { if (lib.isValidWorkspace(key)) return { key, dir: lib.workspaceDir(key) }; } catch (_) { /* not here */ }
  }
  return null;
}

type Json = (o: unknown, status?: number) => void;

export function boardSave(ctx: { body: Buffer; searchParams: URLSearchParams; json: Json }, lib: BoardLib): void {
  const name = String(ctx.searchParams.get('name') || '');
  if (!NAME_RE.test(name)) return ctx.json({ error: 'A board is saved under a name the board gives it.' }, 400);
  if (ctx.body.length < 100 || ctx.body.length > BOARD_MAX_BYTES || !ctx.body.subarray(0, 8).equals(PNG)) return ctx.json({ error: 'That is not a PNG picture of a board.' }, 400);
  const folder = boardFolder(lib);
  if (!folder) return ctx.json({ error: 'There is no designs, images or docs folder in this workspace: use Save picture.' }, 409);
  const dir = path.join(folder.dir, 'boards');
  fs.mkdirSync(dir, { recursive: true });
  // Never over a file that is there: board-…-page-1.png, then …-page-1-2.png.
  let file = name;
  for (let n = 2; fs.existsSync(path.join(dir, file)) && n < 100; n += 1) file = name.replace(/\.png$/, `-${n}.png`);
  fs.writeFileSync(path.join(dir, file), ctx.body, { flag: 'wx' });
  return ctx.json({ saved: `${folder.key}/boards/${file}` });
}
