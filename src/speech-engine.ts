/**
 * The local speech engine, as the dashboard uses it: transcribe an utterance, speak a sentence.
 *
 * The work is done by a child process (speech-worker.ts) started at the first request and stopped after
 * ten quiet minutes, so a dashboard nobody talks to holds no model in memory. Requests go one at a time;
 * a partial transcription asked for while the engine is busy is declined, never queued.
 *
 * The engine is the `sherpa-onnx-node` package (Apache-2.0), an optional dependency: where it could not
 * be installed, `available()` is false and the page falls back to the browser's own speech.
 */

import { fork, type ChildProcess } from 'child_process';
import path from 'path';

import type { SttModel, TtsVoice } from './speech-models';

const IDLE_MS = 10 * 60 * 1000;
const REQUEST_MS = 60 * 1000;

interface Pending { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }

export class SpeechEngine {
  private child: ChildProcess | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private chain: Promise<unknown> = Promise.resolve();
  private busy = 0;
  private idle: NodeJS.Timeout | null = null;
  private found: boolean | null = null;

  constructor(private worker = path.join(__dirname, 'speech-worker.js'), private threads = 2) {}

  /** Whether the engine's package is installed here. Looked up once. */
  available(): boolean {
    if (this.found === null) {
      try { require.resolve('sherpa-onnx-node'); this.found = true; } catch (_) { this.found = false; }
    }
    return this.found;
  }

  get working(): boolean { return this.busy > 0; }

  private start(): ChildProcess {
    if (this.child && this.child.connected) return this.child;
    const child = fork(this.worker, [], { serialization: 'advanced', stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    child.on('message', (m: any) => {
      const p = this.pending.get(m && m.id);
      if (!p) return;
      this.pending.delete(m.id);
      clearTimeout(p.timer);
      if (m.error) p.reject(new Error(m.error)); else p.resolve(m);
    });
    const gone = () => {
      if (this.child === child) this.child = null;
      for (const [id, p] of this.pending) { clearTimeout(p.timer); p.reject(new Error('The speech engine stopped.')); this.pending.delete(id); }
    };
    child.on('exit', gone);
    child.on('error', gone);
    child.unref();
    this.child = child;
    return child;
  }

  private ask<T>(message: Record<string, unknown>): Promise<T> {
    const run = () => new Promise<T>((resolve, reject) => {
      const child = this.start();
      const id = ++this.seq;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('The speech engine took too long.')); this.stop(); }, REQUEST_MS);
      this.pending.set(id, { resolve, reject, timer });
      child.send({ id, threads: this.threads, ...message }, (err) => { if (err) { clearTimeout(timer); this.pending.delete(id); reject(err); } });
    });
    this.busy += 1;
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => undefined).then(() => {
      this.busy -= 1;
      if (this.idle) clearTimeout(this.idle);
      this.idle = setTimeout(() => this.stop(), IDLE_MS);
      this.idle.unref();
    });
    return next;
  }

  /** The words in 16 kHz mono samples. */
  transcribe(samples: Float32Array, model: SttModel): Promise<{ text: string; ms: number }> {
    return this.ask({ op: 'stt', model, samples });
  }

  /** One sentence as a WAV file in memory. */
  speak(text: string, voice: TtsVoice, speed = 1): Promise<{ wav: Buffer; seconds: number; ms: number }> {
    return this.ask<{ wav: Buffer | Uint8Array; seconds: number; ms: number }>({ op: 'tts', voice, text, speed })
      .then((r) => ({ ...r, wav: Buffer.from(r.wav) }));
  }

  stop(): void {
    if (this.idle) { clearTimeout(this.idle); this.idle = null; }
    const child = this.child;
    this.child = null;
    if (child) { try { child.kill(); } catch (_) { /* gone already */ } }
  }
}

/** What a recogniser says that nobody said: its marks for silence and noise, and stray spaces. */
export function cleanTranscript(text: string): string {
  return String(text || '')
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')   // [BLANK_AUDIO], (silence), [Music]
    .replace(/\s+/g, ' ').trim().slice(0, 2000);
}

/** 16-bit little-endian PCM, as samples from -1 to 1. */
export function pcm16ToFloat(body: Buffer): Float32Array {
  const n = Math.floor(body.length / 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = body.readInt16LE(i * 2) / 0x8000;
  return out;
}
