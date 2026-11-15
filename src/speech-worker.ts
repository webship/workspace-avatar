/**
 * The speech engine's own process: it loads the models and does the work, so the dashboard's process
 * never waits on a recogniser and never loads the engine's native code.
 *
 * Asked over IPC by speech-engine.ts: { id, op: 'stt' | 'tts', … } and it answers { id, … } or
 * { id, error }. It keeps a model loaded between requests and holds nothing else: no audio and no text
 * is written anywhere.
 */

import type { SttModel, TtsVoice } from './speech-models';

interface SttRequest { id: number; op: 'stt'; model: SttModel; samples: Float32Array; threads: number }
interface TtsRequest { id: number; op: 'tts'; voice: TtsVoice; text: string; speed: number; threads: number }
type Request = SttRequest | TtsRequest;

let sherpa: any = null;
const recognisers = new Map<string, any>();
const voices = new Map<string, any>();

function engine(): any {
  if (!sherpa) sherpa = require('sherpa-onnx-node');   // eslint-disable-line @typescript-eslint/no-require-imports
  return sherpa;
}

function recogniser(model: SttModel, threads: number): any {
  const key = `${model.kind}:${model.tokens}`;
  let rec = recognisers.get(key);
  if (!rec) {
    const modelConfig: Record<string, unknown> = { tokens: model.tokens, numThreads: threads, provider: 'cpu', debug: 0 };
    modelConfig[model.kind] = model.files;
    rec = new (engine().OfflineRecognizer)({ featConfig: { sampleRate: 16000, featureDim: 80 }, modelConfig });
    recognisers.clear();   // one recogniser in memory at a time
    recognisers.set(key, rec);
  }
  return rec;
}

function voiceOf(voice: TtsVoice, threads: number): any {
  let tts = voices.get(voice.model);
  if (!tts) {
    tts = new (engine().OfflineTts)({
      model: { vits: { model: voice.model, tokens: voice.tokens, dataDir: voice.dataDir }, numThreads: threads, provider: 'cpu', debug: 0 },
      maxNumSentences: 1,
    });
    voices.clear();
    voices.set(voice.model, tts);
  }
  return tts;
}

/** Samples from -1 to 1, as a 16-bit mono WAV file in memory. */
export function wav(samples: Float32Array, sampleRate: number): Buffer {
  const out = Buffer.alloc(44 + samples.length * 2);
  out.write('RIFF', 0); out.writeUInt32LE(36 + samples.length * 2, 4); out.write('WAVEfmt ', 8);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
  out.writeUInt32LE(sampleRate, 24); out.writeUInt32LE(sampleRate * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
  out.write('data', 36); out.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i += 1) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    out.writeInt16LE(Math.round(v < 0 ? v * 0x8000 : v * 0x7fff), 44 + i * 2);
  }
  return out;
}

function handle(req: Request): Record<string, unknown> {
  const began = Date.now();
  if (req.op === 'stt') {
    const rec = recogniser(req.model, req.threads);
    const stream = rec.createStream();
    stream.acceptWaveform({ sampleRate: 16000, samples: req.samples });
    rec.decode(stream);
    return { text: String(rec.getResult(stream).text || ''), ms: Date.now() - began };
  }
  const tts = voiceOf(req.voice, req.threads);
  const audio = tts.generate({ text: req.text, sid: 0, speed: req.speed });
  return { wav: wav(audio.samples, audio.sampleRate), seconds: audio.samples.length / audio.sampleRate, ms: Date.now() - began };
}

if (typeof process.send === 'function') {
  process.on('message', (req: Request) => {
    try { process.send!({ id: req.id, ...handle(req) }); }
    catch (err) { process.send!({ id: req.id, error: String((err as Error).message || err).slice(0, 300) }); }
  });
  process.on('disconnect', () => process.exit(0));
}
