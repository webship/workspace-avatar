/**
 * The speech models on this machine: where they are kept and which are there.
 *
 * Nothing is shipped with the plugin. `cmd-tools-avatar-speech.sh -a install` downloads a recogniser
 * and a voice into `avatars/.speech/` of the workspace (a folder that ignores itself in git):
 *
 *   avatars/.speech/stt/<model>/   a Whisper or Moonshine model: its .onnx files and tokens.txt
 *   avatars/.speech/tts/<voice>/   a Piper voice: <voice>.onnx, tokens.txt, espeak-ng-data/
 */

import fs from 'fs';
import path from 'path';

import { MODEL_NAME_RE } from './speech-settings';

export interface SttModel {
  name: string;
  kind: 'whisper' | 'moonshine';
  tokens: string;
  files: Record<string, string>;
}
export interface TtsVoice {
  id: string;
  model: string;
  tokens: string;
  dataDir: string;
}

export const speechDir = (root: string): string => path.join(root, 'avatars', '.speech');

const ls = (dir: string): string[] => { try { return fs.readdirSync(dir); } catch (_) { return []; } };
const pick = (dir: string, names: string[], re: RegExp): string => {
  const hit = names.filter((n) => re.test(n)).sort((a, b) => Number(/int8/.test(b)) - Number(/int8/.test(a)))[0];
  return hit ? path.join(dir, hit) : '';
};

/** A recogniser in `<dir>/stt/<name>`, with the files the engine needs, or null. The int8 files are preferred. */
export function findStt(dir: string, name: string): SttModel | null {
  if (!MODEL_NAME_RE.test(name)) return null;
  const at = path.join(dir, 'stt', name);
  const names = ls(at);
  const tokens = pick(at, names, /tokens\.txt$/);
  if (!tokens) return null;
  const encoder = pick(at, names, /encoder(\.int8)?\.onnx$/);
  const decoder = pick(at, names, /decoder(\.int8)?\.onnx$/);
  if (encoder && decoder) return { name, kind: 'whisper', tokens, files: { encoder, decoder } };
  const files = {
    preprocessor: pick(at, names, /^preprocess\.onnx$/),
    encoder: pick(at, names, /^encode(\.int8)?\.onnx$/),
    uncachedDecoder: pick(at, names, /^uncached_decode(\.int8)?\.onnx$/),
    cachedDecoder: pick(at, names, /^cached_decode(\.int8)?\.onnx$/),
  };
  return Object.values(files).every(Boolean) ? { name, kind: 'moonshine', tokens, files } : null;
}

/** Every recogniser that is installed, by name. */
export const listStt = (dir: string): SttModel[] => ls(path.join(dir, 'stt')).sort()
  .map((n) => findStt(dir, n)).filter((m): m is SttModel => m !== null);

/** A voice in `<dir>/tts/<id>`, or null. */
export function findVoice(dir: string, id: string): TtsVoice | null {
  if (!MODEL_NAME_RE.test(id)) return null;
  const at = path.join(dir, 'tts', id);
  const names = ls(at);
  const model = names.find((n) => n === `${id}.onnx`) || names.find((n) => /\.onnx$/.test(n));
  const dataDir = path.join(at, 'espeak-ng-data');
  if (!model || !names.includes('tokens.txt') || !fs.existsSync(dataDir)) return null;
  return { id, model: path.join(at, model), tokens: path.join(at, 'tokens.txt'), dataDir };
}

/** Every voice that is installed, by id. English only: the assistant speaks English. */
export const listVoices = (dir: string): TtsVoice[] => ls(path.join(dir, 'tts')).sort()
  .filter((n) => /^en_[A-Z]{2}-/.test(n)).map((n) => findVoice(dir, n)).filter((v): v is TtsVoice => v !== null);
