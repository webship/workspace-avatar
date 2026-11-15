/**
 * The speech settings of the AI Assistant, from the plugin's own settings file
 * (core/config/plugin.avatar.settings.yml, the `speech:` block), normalised.
 *
 * Every part has its own switch, and a part that is off is refused by the server as well as hidden in
 * the page. English only. Nothing here turns the microphone on: that is always the person's click.
 */

export interface SpeechSettings {
  microphone: boolean;      // the talk buttons are offered at all
  handsFree: boolean;       // Keep listening: phrases cut at a silence, no button held
  conversation: boolean;    // after an answer, listen again
  speaking: boolean;        // the answer is spoken, sentence by sentence
  bargeIn: boolean;         // talking over the voice stops it
  wakeWord: boolean;        // only speech that starts with the wake phrase is acted on
  wakePhrase: string;
  followUpSeconds: number;  // after an answer, this long without needing the wake phrase again
  stopWord: string;
  sttEngine: 'auto' | 'local' | 'browser';
  sttModel: string;
  ttsEngine: 'auto' | 'local' | 'browser';
  voice: string;
  speed: number;
  silenceMs: number;
  language: 'en-US' | 'en-GB';
}

export const SPEECH_DEFAULTS: SpeechSettings = {
  microphone: true,
  handsFree: true,
  conversation: true,
  speaking: true,
  bargeIn: true,
  wakeWord: false,
  wakePhrase: 'workspace',
  followUpSeconds: 12,
  stopWord: 'stop',
  sttEngine: 'auto',
  sttModel: 'whisper-base.en',
  ttsEngine: 'auto',
  voice: 'en_US-ljspeech-medium',
  speed: 1,
  silenceMs: 900,
  language: 'en-US',
};

export const MODEL_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

// A settings file read by bash hands values back as strings, so `false` arrives as "false".
const bool = (v: unknown, d: boolean): boolean => {
  if (v === undefined || v === null || v === '') return d;
  if (typeof v === 'boolean') return v;
  const t = String(v).trim().toLowerCase();
  if (['true', 'yes', 'on', '1'].includes(t)) return true;
  if (['false', 'no', 'off', '0', 'none'].includes(t)) return false;
  return d;
};
const num = (v: unknown, d: number, min: number, max: number): number => {
  const n = Number(v);
  return v === undefined || v === null || v === '' || !Number.isFinite(n) ? d : Math.max(min, Math.min(max, n));
};
const phrase = (v: unknown, d: string): string => {
  const t = String(v ?? '').toLowerCase().replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
  return t || d;
};
const engine = (v: unknown): 'auto' | 'local' | 'browser' => {
  const t = String(v ?? '').trim().toLowerCase();
  return t === 'local' || t === 'browser' ? t : 'auto';
};
const name = (v: unknown, d: string): string => {
  const t = String(v ?? '').trim();
  return MODEL_NAME_RE.test(t) ? t : d;
};

/** The `speech:` block of the plugin's settings, with every key present and in range. */
export function speechSettings(raw: unknown): SpeechSettings {
  const s = ((raw && typeof raw === 'object' ? (raw as Record<string, unknown>).speech : null) || {}) as Record<string, unknown>;
  const d = SPEECH_DEFAULTS;
  return {
    microphone: bool(s.microphone, d.microphone),
    handsFree: bool(s.hands_free, d.handsFree),
    conversation: bool(s.conversation, d.conversation),
    speaking: bool(s.speaking, d.speaking),
    bargeIn: bool(s.barge_in, d.bargeIn),
    wakeWord: bool(s.wake_word, d.wakeWord),
    wakePhrase: phrase(s.wake_phrase, d.wakePhrase),
    followUpSeconds: num(s.follow_up_seconds, d.followUpSeconds, 0, 120),
    stopWord: phrase(s.stop_word, d.stopWord),
    sttEngine: engine(s.stt_engine),
    sttModel: name(s.stt_model, d.sttModel),
    ttsEngine: engine(s.tts_engine),
    voice: name(s.voice, d.voice),
    speed: num(s.speed, d.speed, 0.5, 2),
    silenceMs: num(s.silence_ms, d.silenceMs, 300, 3000),
    language: String(s.language ?? '').trim() === 'en-GB' ? 'en-GB' : 'en-US',
  };
}
