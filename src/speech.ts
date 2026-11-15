/**
 * Speech for the AI Assistant, on the server: what the page is told, an utterance transcribed, a
 * sentence spoken.
 *
 *   GET  /fragments/p/avatar/speech/config   what is switched on, and which engines are here
 *   POST /actions/p/avatar/hear              16 kHz mono 16-bit PCM in, { text } out
 *   POST /actions/p/avatar/speak             { text, voice } in, a WAV file out
 *
 * Where the audio goes. With the local engine an utterance travels from the browser to this
 * dashboard on the same machine, is transcribed in memory and is gone: nothing is written to a file or
 * a log, and nothing leaves the machine. With the browser's own engine the dashboard is not involved at
 * all: the browser sends the audio to its vendor's speech service. A part that is switched off in the
 * settings is refused here as well as hidden in the page.
 */

import type { ServerResponse } from 'http';

import { SpeechEngine, cleanTranscript, pcm16ToFloat } from './speech-engine';
import { findStt, findVoice, listStt, listVoices, speechDir } from './speech-models';
import { speechSettings, type SpeechSettings } from './speech-settings';

const MAX_SECONDS = 60;
const MIN_BYTES = 16000 * 2 * 0.2;         // a fifth of a second
const MAX_BYTES = 16000 * 2 * MAX_SECONDS;
const MAX_TEXT = 600;

export interface SpeechConfig {
  settings: SpeechSettings;
  stt: { local: boolean; model: string; models: string[]; why: string };
  tts: { local: boolean; voice: string; voices: string[]; why: string };
  install: string;
}

/** What the page is told: the switches, and what this machine can do without the browser's help. */
export function speechConfig(raw: unknown, root: string, engine: Pick<SpeechEngine, 'available'>): SpeechConfig {
  const settings = speechSettings(raw);
  const dir = speechDir(root);
  const has = engine.available();
  const models = listStt(dir).map((m) => m.name);
  const voices = listVoices(dir).map((v) => v.id);
  const model = models.includes(settings.sttModel) ? settings.sttModel : (models[0] || '');
  const voice = voices.includes(settings.voice) ? settings.voice : (voices[0] || '');
  const why = (list: string[], what: string) => (!has ? 'The local speech engine is not installed with the plugin on this machine.'
    : (list.length ? '' : `No ${what} is installed yet.`));
  return {
    settings,
    stt: { local: has && Boolean(model), model, models, why: why(models, 'recogniser') },
    tts: { local: has && Boolean(voice), voice, voices, why: why(voices, 'voice') },
    install: 'bash avatars/cmd-tools-avatar-speech.sh -a install',
  };
}

type Json = (o: unknown, status?: number) => void;
interface UploadContext { body: Buffer; searchParams: URLSearchParams; json: Json; res: ServerResponse }

/** POST hear: an utterance in, its words out. */
export async function hear(ctx: UploadContext, raw: unknown, root: string, engine: SpeechEngine): Promise<void> {
  const config = speechConfig(raw, root, engine);
  if (!config.settings.microphone) return ctx.json({ error: 'The microphone is switched off in the settings.' }, 403);
  if (config.settings.sttEngine === 'browser' || !config.stt.local) return ctx.json({ error: config.stt.why || 'The local recogniser is not the engine in use.' }, 409);
  if (ctx.body.length < MIN_BYTES || ctx.body.length > MAX_BYTES || ctx.body.length % 2) return ctx.json({ error: 'An utterance is 16 kHz mono 16-bit audio, a fifth of a second to a minute long.' }, 400);
  // A partial text is a courtesy while someone is still talking: never queued behind other work.
  if (ctx.searchParams.get('partial') === '1' && engine.working) return ctx.json({ busy: true });
  const model = findStt(speechDir(root), config.stt.model);
  if (!model) return ctx.json({ error: 'The recogniser is not there any more.' }, 409);
  const heard = await engine.transcribe(pcm16ToFloat(ctx.body), model);
  return ctx.json({ text: cleanTranscript(heard.text), ms: heard.ms, seconds: Math.round((ctx.body.length / 32000) * 100) / 100, engine: 'local', model: model.name });
}

/** POST speak: one sentence in, a WAV file out. */
export async function speak(ctx: UploadContext, raw: unknown, root: string, engine: SpeechEngine): Promise<void> {
  const config = speechConfig(raw, root, engine);
  if (!config.settings.speaking) return ctx.json({ error: 'Speaking is switched off in the settings.' }, 403);
  if (config.settings.ttsEngine === 'browser' || !config.tts.local) return ctx.json({ error: config.tts.why || 'The local voice is not the engine in use.' }, 409);
  let asked: { text?: unknown; voice?: unknown; speed?: unknown } = {};
  try { asked = JSON.parse(ctx.body.toString('utf8') || '{}'); } catch (_) { return ctx.json({ error: 'This takes JSON.' }, 400); }
  const text = String(asked.text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
  if (!text) return ctx.json({ error: 'Some words, please.' }, 400);
  const dir = speechDir(root);
  const voice = findVoice(dir, config.tts.voices.includes(String(asked.voice)) ? String(asked.voice) : config.tts.voice);
  if (!voice) return ctx.json({ error: 'The voice is not there any more.' }, 409);
  const speed = Number.isFinite(Number(asked.speed)) && Number(asked.speed) > 0 ? Math.max(0.5, Math.min(2, Number(asked.speed))) : config.settings.speed;
  const spoken = await engine.speak(text, voice, speed);
  ctx.res.writeHead(200, { 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store', 'Content-Length': spoken.wav.length, 'X-Speech-Ms': String(spoken.ms), 'X-Speech-Voice': voice.id });
  ctx.res.end(spoken.wav);
}
