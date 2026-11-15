# Avatars

Talking AI characters, each a DDEV project built from the avatar app (a Node app, no database).

This folder is part of the **Webship Workspace** (`~/workspace`), a container-based harness (DDEV by default). Run its `cmd-*.sh`
from here.

## Agent

Use the **`webship-workspace`** agent for the folder itself. A character's own agent is its mind:
`avatar-<character id>`, kept in the project's `claude/agents/` and linked into `~/.claude/agents/`.

## Skills

- **`webship-workspace-dashboard`**
- **`voice-narration`** — Piper voices on this machine.
- **`elevenlabs-voiceover`** — ElevenLabs, which spends credits.

## Commands here

```bash
bash cmd-avatar-project.sh --help
bash cmd-tools-avatar-agent.sh --help
bash cmd-tools-avatar-catalog.sh --help
bash cmd-tools-avatar-character.sh --help
bash cmd-tools-avatar-voice.sh --help
bash cmd-tools-avatar-speech.sh --help
bash cmd-tools-reclaim.sh --help
bash cmd-tools-remove.sh --help
bash cmd-tools-screen.sh --help
```

## Hard rules

- **Containers only (DDEV by default).** The app runs in its web container; never run `node` or `npm` for it on the host.
- **A hostname belongs to one project.** A new avatar project drops any extra hostname the avatar app
  repository declares (`cmd-avatar-project.sh` does), so two avatars never answer on one address.
- **The microphone is the person's.** Speech for the assistant is switched part by part in `core/config/plugin.avatar.settings.yml`; never turn a switch on for someone, and never record or save what is said.
- **ElevenLabs spends money.** Never link a key or design a voice without the person asking.
- **Licences are per model and per voice.** Record the credit and licence with every character, and never
  publish a fan-made or "author only" model.
- **Agents live in the project** (`claude/agents/`), linked into `~/.claude` — edit them there, not the link.
- **Clean up after your own work, and ASK before you do.** Removing a project is `bash cmd-tools-remove.sh
  <project>`, never `rm -rf`.

The full architecture is in `products/workspace/CLAUDE.md`.

## AI items for this folder

The plugin of this folder (`@webship.co/workspace-avatar`) places its own AI items in the AI folders of the
workspace, when they are active:

- `avatars-character-maker` (`ai-agents/`): Builds and furnishes a talking AI character in `avatars/`: the project, its characters (body, voice, persona), its voices, the agent that is its mind; records every licence, spends no credits unasked
- `avatars-workflow` (`ai-skills/`): How work is done in `avatars/`: what may be used, the project, a voice, the character, its mind; every command with its flags, the `avatar` settings keys
- `/avatars-add-character` (`ai-commands/`): `/avatars-add-character <project> <id> <name> [model]`: checks the project and the licence of the body, adds the character with a free voice and says what it used
- `avatars-build-a-character` (`ai-prompts/`): A new session that builds a talking AI character: a body it may use, a free voice and a mind
