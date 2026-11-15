# Speech for the AI Assistant

Talk to the assistant and hear it answer. English only. Free: no key and no account.

## Turn it on

```bash
cd ~/workspace/avatars
bash cmd-tools-avatar-speech.sh -a install     # a recogniser and a voice, on this machine (about 240 MB)
bash cmd-tools-avatar-speech.sh                # what is installed
```

Then, in the assistant's panel:

| Do | What happens |
| --- | --- |
| Hold **Hold to talk** (or hold the Space bar when you are not typing) | What you say while you hold is transcribed and sent as your turn |
| Press **Keep listening** (the round microphone) | Hands-free: each phrase is cut at a short silence and sent, and it listens again |
| Say **stop**, press **Stop**, or press Escape | The voice stops and the microphone closes |

With **Keep listening** on it is a conversation, speech to speech: you speak, your words appear as you
say them, the assistant thinks, and its answer is spoken sentence by sentence in the local voice. Then
it listens again, turn after turn. Start talking while it speaks and the voice stops to listen
(barge-in). After Hold to talk the answer is spoken too, and the microphone stays closed.

The first press asks the browser's own permission question. The line above the buttons says what the
assistant is doing (Listening, Hearing you, Transcribing, Thinking, Speaking), shows your words while
you speak, and carries a red dot for as long as the microphone is open.

Without the local models the browser's own speech is used where the browser has it (Chrome, Edge,
Safari), and the talk buttons are not offered where it has none.

## Where the audio goes

| Engine | What it is | Where your voice goes | What is kept |
| --- | --- | --- | --- |
| `local` | A Whisper or Moonshine model run by the dashboard | From the browser to the dashboard on this machine, one phrase at a time | Nothing: a phrase is transcribed in memory and dropped. No file, no log |
| `browser` | The browser's own speech recognition | From the browser to the browser vendor's speech service. The dashboard is not involved | What the vendor's terms say |

Speaking the answer is the same choice: `local` is a Piper voice run by the dashboard (the text of the
answer goes to the dashboard on this machine and comes back as audio, kept nowhere), `browser` is a
voice the browser has. No paid voice is used for speech to speech; the ElevenLabs voice of the summary
is a separate setting of the dashboard and is only used when you pick it.

The microphone is opened by your press and by nothing else. While the assistant is thinking nothing
is heard. Phrases are never written to disk, and the transcript of what you said is only what you see
in the conversation, like a typed turn. In the same browser tab, Keep listening stays on when a page
changes, with its red dot; a new tab starts with the microphone closed.

## The switches

`core/config/plugin.avatar.settings.yml`, also in Settings → Plugins → Avatars:

| Key | Default | What it does |
| --- | --- | --- |
| `speech.microphone` | `true` | The talk buttons. `false` removes them and the dashboard refuses any audio |
| `speech.hands_free` | `true` | Keep listening. `false` leaves Hold to talk only |
| `speech.conversation` | `true` | After an answer, listen again. `false` closes the microphone after one phrase |
| `speech.speaking` | `true` | The answer is spoken, sentence by sentence |
| `speech.barge_in` | `true` | Talking over the voice stops it |
| `speech.wake_word` | `false` | Only speech that begins with the wake phrase is acted on |
| `speech.wake_phrase` | `workspace` | The wake phrase |
| `speech.follow_up_seconds` | `12` | After an answer, how long the wake phrase is not needed again |
| `speech.stop_word` | `stop` | Said on its own, it stops everything |
| `speech.stt_engine` | `auto` | `auto`, `local` or `browser` |
| `speech.stt_model` | `whisper-base.en` | The local recogniser |
| `speech.tts_engine` | `auto` | `auto`, `local` or `browser` |
| `speech.voice` | `en_US-ljspeech-medium` | The local voice |
| `speech.speed` | `1` | Speaking speed |
| `speech.silence_ms` | `900` | The silence that ends a phrase |
| `speech.language` | `en-US` | `en-US` or `en-GB`, for the browser's engines |

## The models and their licences

Nothing is shipped with the plugin: `-a install` downloads what you ask for into `avatars/.speech/`
(a folder that ignores itself in git), from the model releases of the sherpa-onnx project.

| Thing | Size | Licence |
| --- | --- | --- |
| `sherpa-onnx-node` 1.13.8, the engine (an optional dependency of the plugin) | 32 MB | Apache-2.0. Its build includes espeak-ng (GPL-3.0) to pronounce Piper voices; it runs as a process of its own |
| `whisper-base.en` (default), `whisper-tiny.en` | 160 MB, 104 MB | MIT (OpenAI Whisper) |
| `moonshine-tiny-en` | 120 MB | MIT (Useful Sensors Moonshine) |
| A Piper voice, e.g. `en_US-ljspeech-medium` (default: a public-domain dataset) | about 80 MB | Per voice: its `MODEL_CARD` says. Read it before using a voice in something you publish |
| The espeak-ng data inside each voice | — | GPL-3.0 |

```bash
bash cmd-tools-avatar-speech.sh -a list                                  # what can be installed
bash cmd-tools-avatar-speech.sh -a install --stt whisper-tiny.en --voice none
bash cmd-tools-avatar-speech.sh -a install --stt none --voice en_GB-alan-medium
bash cmd-tools-avatar-speech.sh -a remove --voice en_GB-alan-medium
```

## What you hear, and when

1. You stop talking. After the silence that ends a phrase (0.9 s, `speech.silence_ms`) the phrase is
   transcribed: about 0.3 s for a short sentence.
2. The assistant thinks: as long as a typed turn takes. Nothing is heard meanwhile.
3. The answer is spoken: its spoken summary, one to three sentences, not the tables and commands of the
   written answer, which stays in the conversation to read. The first sentence starts about 0.15 s after
   the answer arrives (the voice is loaded while the assistant thinks), and each next sentence is made
   while the one before it plays.
4. It listens again. Say **stop** on its own to end.

The answer is not spoken word by word while it is being written: the assistant's answer reaches the
page in one piece, and is spoken from that moment.

## What was measured

On a 16-thread laptop, CPU only, English sentences of 2.3 seconds spoken by a Piper voice:

| Recogniser | Time | Result |
| --- | --- | --- |
| `whisper-base.en` | 0.25 s | 5 of 5 word for word, a lone "Stop." included |
| `whisper-tiny.en` | 0.15 s | 4 of 5: the lone "Stop." was misheard |
| `moonshine-tiny-en` | 0.03 s | 3 of 5: two wrong words |

The local voice makes 2.8 seconds of speech in 0.13 seconds. In the browser: a spoken question was
transcribed 0.38 s after the phrase ended; the first spoken sentence started 0.10 to 0.15 s after the
answer arrived; talking over the voice stopped it within 0.15 s of the first sound.
