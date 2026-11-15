/**
 * The camera, on the server: one picture the person chose to show the assistant, for one turn.
 *
 *   POST /actions/p/avatar/look          a JPEG in, { token } out
 *   POST /actions/p/avatar/look-forget   { token } in: the picture is deleted
 *
 * The camera itself is the browser's: its preview never comes here. A picture comes only when the
 * person presses "Look at this". It is kept in a private temporary file (this user only) for as long as
 * the assistant needs to read it: until the page says the answer has come, and five minutes at the most.
 * It is never copied into the workspace, a log or the conversation.
 */

import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
export const LOOK_MAX_BYTES = 700 * 1024;
const KEEP_MS = 5 * 60 * 1000;
const MAX_HELD = 3;
const TOKEN_RE = /^[0-9a-f]{24}$/;

export interface CameraSettings { enabled: boolean }

/** The `camera:` block of the plugin's settings: on unless it says otherwise. */
export function cameraSettings(raw: unknown): CameraSettings {
  const c = ((raw && typeof raw === 'object' ? (raw as Record<string, unknown>).camera : null) || {}) as Record<string, unknown>;
  const v = c.enabled;
  const off = v === false || ['false', 'no', 'off', '0', 'none'].includes(String(v ?? '').trim().toLowerCase());
  return { enabled: !off };
}

type Json = (o: unknown, status?: number) => void;

export class Looks {
  private dir = '';
  private held = new Map<string, { file: string; timer: NodeJS.Timeout }>();

  constructor(private base = os.tmpdir(), private keepMs = KEEP_MS) {}

  private folder(): string {
    if (!this.dir || !fs.existsSync(this.dir)) this.dir = fs.mkdtempSync(path.join(this.base, 'ws-look-'));
    return this.dir;
  }

  /** Keep one picture for one turn: its token. The oldest is dropped when more than three are waiting. */
  keep(jpeg: Buffer): string {
    const token = crypto.randomBytes(12).toString('hex');
    const file = path.join(this.folder(), `${token}.jpg`);
    fs.writeFileSync(file, jpeg, { mode: 0o600, flag: 'wx' });
    const timer = setTimeout(() => this.forget(token), this.keepMs);
    timer.unref();
    this.held.set(token, { file, timer });
    while (this.held.size > MAX_HELD) this.forget(this.held.keys().next().value as string);
    return token;
  }

  /** The file of a picture that is waiting, or ''. */
  fileOf(token: unknown): string {
    const hit = TOKEN_RE.test(String(token)) ? this.held.get(String(token)) : undefined;
    return hit && fs.existsSync(hit.file) ? hit.file : '';
  }

  forget(token: unknown): boolean {
    const hit = this.held.get(String(token));
    if (!hit) return false;
    clearTimeout(hit.timer);
    this.held.delete(String(token));
    try { fs.unlinkSync(hit.file); } catch (_) { /* gone already */ }
    return true;
  }

  get waiting(): number { return this.held.size; }
}

/** POST look: one JPEG, kept for one turn. */
export function look(ctx: { body: Buffer; json: Json }, raw: unknown, looks: Looks): void {
  if (!cameraSettings(raw).enabled) return ctx.json({ error: 'The camera is switched off in the settings.' }, 403);
  if (ctx.body.length < 200 || ctx.body.length > LOOK_MAX_BYTES || !ctx.body.subarray(0, 3).equals(JPEG)) return ctx.json({ error: 'That is not a picture from the camera.' }, 400);
  return ctx.json({ token: looks.keep(ctx.body) });
}

/** POST look-forget: the picture is deleted now. */
export function lookForget(ctx: { body: Buffer; json: Json }, looks: Looks): void {
  let token = '';
  try { token = String(JSON.parse(ctx.body.toString('utf8') || '{}').token || ''); } catch (_) { token = ''; }
  return ctx.json({ forgotten: looks.forget(token) });
}

/** What the assistant is told for a turn that carries a picture; '' for any other turn. */
export function lookTurn(body: Record<string, unknown>, raw: unknown, looks: Looks): string {
  const file = cameraSettings(raw).enabled ? looks.fileOf(body && body.look) : '';
  if (!file) return '';
  return `THE PERSON IS SHOWING YOU THEIR CAMERA for this turn: one still picture, which they chose to send by pressing "Look at this". Read the image file ${file} with your file-reading tool before you answer, and answer about what is in it.`
    + ' It is theirs and private: do not copy, move or keep the file, do not describe it anywhere but in this answer, and do not guess who a person in it is. If you cannot open it, say so plainly.';
}
