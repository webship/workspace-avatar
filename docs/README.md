# Avatars

Talking AI characters: a 3D character in the browser that speaks, moves and lip-syncs, with a Claude Code
agent as its mind and a voice from your browser, Piper (free, offline) or ElevenLabs.

Each avatar is a DDEV project here, built from the avatar app (`avatar.repo` in
`core/config/workspace.avatars.settings.yml`). It has no database: the app is Node, the character is a VRM
file, and the mind is `claude -p` in the container with your own Claude Code login.

Every avatar project answers at https://<project>.ddev.site and https://<project>.avatars.workspace.ddev.site.
Set `avatar.repo` in the settings file (it ships as `CHANGE_ME`) before building one.

## Commands

```bash
bash cmd-avatar-project.sh my-avatar                    # a new avatar project from the avatar app
bash cmd-tools-avatar-character.sh my-avatar             # list its characters
bash cmd-tools-avatar-character.sh my-avatar -a add --id ada --name Ada \
     --model osa:Devil --voice-engine piper --voice en_GB-alba-medium
bash cmd-tools-avatar-agent.sh my-avatar -a create --id ada   # Ada gets her own Claude Code agent
bash cmd-tools-avatar-agent.sh my-avatar -a check        # Claude Code in the container, and the agents
bash cmd-tools-avatar-voice.sh my-avatar                 # which voices it can use
bash cmd-tools-avatar-voice.sh -a piper-install --voice ar_JO-kareem-medium
bash cmd-tools-avatar-voice.sh my-avatar -a elevenlabs-link   # key from settings.yml, never printed
bash cmd-tools-avatar-catalog.sh -a avatars --list       # free avatar libraries, with licences
bash cmd-tools-avatar-catalog.sh                         # voice engines, with licences
bash cmd-tools-remove.sh my-avatar                       # ddev delete, then the folder
```

## A character beside the Druplicon

Every character of a project in this folder is offered as the AI Assistant's avatar, beside the
Druplicon: the robot button in the assistant's panel, the gear, then **Avatar**. Its body, its moves,
its agent and its free voice are read from its project and served from there. The character file, the
moves a project can bring and how to have a new move written: `characters.md` in the plugin's docs.

## Talk to the AI Assistant

The assistant in the dashboard can be talked to and can answer aloud, with a recogniser and a voice on
this machine: free, no key, and the audio never leaves it. Each part has its own switch.

```bash
bash cmd-tools-avatar-speech.sh -a install    # the local recogniser and voice (about 240 MB)
bash cmd-tools-avatar-speech.sh               # what is installed
```

Hold **Hold to talk** in the assistant, or press **Keep listening**. The microphone opens only on your
press, a red dot shows while it is open, and nothing is recorded. The engines, where the audio goes and
the switches: `speech.md` in the plugin's docs.

## How the pieces connect

- **Body**: a VRM model in the project's `public/models/`. `--model osa:<name>` fetches one from
  [Open Source Avatars](https://www.opensourceavatars.com) (300+ free VRMs; licence per collection, mostly
  CC0) and saves the licence and credit with the character. Confirm the licence on the avatar's own page:
  the registry and an avatar's page do not always agree.
- **Character**: `characters/<id>.json` in the project, read when the app starts; the built-in ones are in
  `avatars.js`.
- **Mind**: a Claude Code agent, `claude/agents/avatar-<id>.md` in the project, linked into
  `~/.claude/agents/`. The app runs the session as that agent; without one it uses the character's persona.
- **Voice**: `browser` (free), `piper` (free, offline; voices in `~/.local/share/piper-voices`, mounted into
  every avatar) or `elevenlabs` (spends credits; key from `elevenlabs.api_key` in `settings.yml`).
  New characters get a free voice by default (`avatar.voice_engine` / `avatar.voice`: Piper
  `en_US-lessac-medium`); ElevenLabs is never the default.

Licences change: `cmd-tools-avatar-catalog.sh` shows what was checked and when. A character made from
someone else's work, fan art included, is for personal use unless its licence says otherwise.
