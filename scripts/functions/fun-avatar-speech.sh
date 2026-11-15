#!/usr/bin/env bash

# The local speech models of the AI Assistant: a recogniser (speech to text) and a voice (text to
# speech), kept in avatars/.speech of the workspace. Free, no key; once they are here the audio never
# leaves this machine. Nothing is shipped with the plugin: each is downloaded when asked for, from the
# model releases of the sherpa-onnx project.
#
#   avatars/.speech/stt/<model>/   Whisper (MIT, OpenAI) or Moonshine (MIT, Useful Sensors)
#   avatars/.speech/tts/<voice>/   a Piper voice (its licence is in its MODEL_CARD), with the
#                                  espeak-ng data it is pronounced with (GPL-3.0)

AVATAR_SPEECH_RELEASES="https://github.com/k2-fsa/sherpa-onnx/releases/download"

function avatar_speech_dir() {
  echo "${WORKSPACE_ROOT}/avatars/.speech" ;
}

# The archive of a recogniser, or nothing for a name that is not offered.
function avatar_speech_stt_archive() {
  case "$1" in
    whisper-base.en)   echo "asr-models/sherpa-onnx-whisper-base.en.tar.bz2" ;;
    whisper-tiny.en)   echo "asr-models/sherpa-onnx-whisper-tiny.en.tar.bz2" ;;
    moonshine-tiny-en) echo "asr-models/sherpa-onnx-moonshine-tiny-en-int8.tar.bz2" ;;
  esac
}

function avatar_speech_list() {
  cat <<LISTEOF
Recognisers (speech to text), English:
  whisper-base.en     160 MB  most accurate here: 0.25 s for a 2.3 s sentence   MIT (OpenAI Whisper)
  whisper-tiny.en     104 MB  0.15 s; a lone short word can be misheard         MIT (OpenAI Whisper)
  moonshine-tiny-en   120 MB  0.03 s; more word mistakes                        MIT (Useful Sensors Moonshine)

Voices (text to speech): any English Piper voice, by name, for example
  en_US-ljspeech-medium   a US voice from a public-domain dataset (the default)
  en_GB-alan-medium       a British voice
  en_US-lessac-medium     a US voice; its dataset licence limits what it may be used for
Each voice says its own licence in its MODEL_CARD: read it before using a voice in something you publish.
The names: https://huggingface.co/rhasspy/piper-voices (English ones begin with en_).
LISTEOF
}

function avatar_speech_fetch() {
  local archive="$1" target="$2" ;
  local tmp ; tmp="$(mktemp -d "${TMPDIR:-/tmp}/avatar-speech.XXXXXX")" || return 1 ;
  echo "Downloading ${archive##*/} ..." ;
  if ! curl -fL --proto '=https' --progress-bar -o "${tmp}/model.tar.bz2" "${AVATAR_SPEECH_RELEASES}/${archive}" ; then
    rm -rf "${tmp}" ; echo "Could not download ${archive##*/}: check the name with -a list." >&2 ; return 1 ;
  fi
  mkdir -p "${tmp}/out" && tar -xjf "${tmp}/model.tar.bz2" -C "${tmp}/out" --strip-components=1 || { rm -rf "${tmp}" ; echo "The archive could not be read." >&2 ; return 1 ; }
  rm -rf "${target}" && mkdir -p "$(dirname "${target}")" && mv "${tmp}/out" "${target}" ;
  rm -rf "${tmp}" ;
}

function avatar_speech_status() {
  local dir ; dir="$(avatar_speech_dir)" ;
  echo "Speech for the AI Assistant (free, no key; with these the audio never leaves this machine)" ;
  if [[ -d "${WORKSPACE_PATH}/workspace-app/node_modules/sherpa-onnx-node" ]] ; then
    echo "  engine       sherpa-onnx-node is installed with the dashboard" ;
  else
    echo "  engine       not installed: bash core/scripts/plugins.sh --require @webship.co/workspace-avatar brings it (an optional dependency)" ;
  fi
  local found="" m ;
  for m in "${dir}"/stt/*/ ; do [[ -d "${m}" ]] && found="${found} $(basename "${m}")" ; done
  echo "  recognisers ${found:- none: bash cmd-tools-avatar-speech.sh -a install}" ;
  found="" ;
  for m in "${dir}"/tts/*/ ; do [[ -d "${m}" ]] && found="${found} $(basename "${m}")" ; done
  echo "  voices      ${found:- none: bash cmd-tools-avatar-speech.sh -a install}" ;
  echo "  kept in      ${dir/#${HOME}/\~}" ;
  echo "  switches     core/config/plugin.avatar.settings.yml (speech:)" ;
}

function avatar_speech() {
  local dir ; dir="$(avatar_speech_dir)" ;
  local stt="${STT}" voice="${VOICE}" ;
  case "${ACTION}" in
    list) avatar_speech_list ;;
    status) avatar_speech_status ;;
    install)
      [[ "${stt}" == "_default_" ]] && stt="whisper-base.en" ;
      [[ "${voice}" == "_default_" ]] && voice="en_US-ljspeech-medium" ;
      mkdir -p "${dir}" && printf '*\n' > "${dir}/.gitignore" ;
      if [[ "${stt}" != "none" ]] ; then
        local archive ; archive="$(avatar_speech_stt_archive "${stt}")" ;
        [[ -n "${archive}" ]] || { echo "Unknown recogniser '${stt}': see -a list." >&2 ; return 1 ; }
        avatar_speech_fetch "${archive}" "${dir}/stt/${stt}" || return 1 ;
        # The 8-bit files are the ones used: the full-size copies and the samples only take room.
        if ls "${dir}/stt/${stt}"/*.int8.onnx >/dev/null 2>&1 ; then
          find "${dir}/stt/${stt}" -maxdepth 1 -name '*.onnx' ! -name '*.int8.onnx' ! -name 'preprocess.onnx' -delete ;
        fi
        rm -rf "${dir}/stt/${stt}/test_wavs" ;
        echo "Installed the recogniser ${stt}." ;
      fi
      if [[ "${voice}" != "none" ]] ; then
        [[ "${voice}" =~ ^en_[A-Z]{2}-[a-z0-9_]+-(x_low|low|medium|high)$ ]] || { echo "A voice is an English Piper voice, like en_US-ljspeech-medium: see -a list." >&2 ; return 1 ; }
        avatar_speech_fetch "tts-models/vits-piper-${voice}.tar.bz2" "${dir}/tts/${voice}" || return 1 ;
        echo "Installed the voice ${voice}. Its licence is in ${dir/#${HOME}/\~}/tts/${voice}/MODEL_CARD." ;
      fi
      avatar_speech_status ;;
    remove)
      [[ "${stt}" == "_default_" && "${voice}" == "_default_" ]] && { echo "Say which: --stt <model> or --voice <voice>." >&2 ; return 1 ; }
      if [[ "${stt}" != "_default_" && "${stt}" != "none" ]] ; then rm -rf "${dir}/stt/${stt}" && echo "Removed the recogniser ${stt}." ; fi
      if [[ "${voice}" != "_default_" && "${voice}" != "none" ]] ; then rm -rf "${dir}/tts/${voice}" && echo "Removed the voice ${voice}." ; fi ;;
  esac
}
