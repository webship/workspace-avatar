---
name: avatars-workflow
description: How work is done in the `avatars/` folder of the Webship Workspace — how a talking AI character is built (the avatar project, a character with its body, voice and persona, the agent that is its mind), what the voice engines and avatar libraries allow, with the flags of each command and the settings keys of the folder (the `avatar` block). Use when asked to "build an avatar", "add a character", "install a voice", "give the character an agent", or when a command of `avatars/` is about to be run.
argument-hint: '[what you are about to do in avatars]'
---

# avatars-workflow

`~/workspace/avatars` is the Avatars folder of a Webship Workspace (container-based, DDEV by default).
Avatars are talking AI characters, each one a container project built from the avatar app: a body (a VRM model), a voice, and an AI agent as its mind. It comes with the Avatars plugin (`@webship.co/workspace-avatar`), which places the commands below in the folder. Every command finds the workspace from its own path; run it from the folder, and read `bash <command> --help` before quoting a flag.

## The order of work

1. **See what may be used**: `bash cmd-tools-avatar-catalog.sh`, and
   `bash cmd-tools-avatar-catalog.sh --action avatars --list`.
2. **Build the project**: `bash cmd-avatar-project.sh my-avatar` (with `avatar.repo` set, or
   `--repo`). It answers at `https://my-avatar.ddev.site`.
3. **Make sure a voice is there**: `bash cmd-tools-avatar-voice.sh my-avatar`;
   `bash cmd-tools-avatar-voice.sh --action piper-install --voice en_GB-alba-medium` for a free one.
4. **Add the character**: `bash cmd-tools-avatar-character.sh my-avatar --action add --id ada --name Ada --model-file ada.vrm`,
   with its credit and licence.
5. **Give it a mind**: `bash cmd-tools-avatar-agent.sh my-avatar --action create --id ada`, then
   `--action link`.

## Builders

| Builder | Builds | Flags |
| --- | --- | --- |
| `cmd-avatar-project.sh` | An avatar project: the avatar app cloned and run in its own container; with no name, the one `avatar.project` names | `--branch` `--launch` `--link-agents` `--repo` |

## Commands

| Command | What it does | Flags |
| --- | --- | --- |
| `cmd-tools-avatar-agent.sh` | The agents of a project: `--action` is `list` (the default), `link` (into the AI CLI of this machine), `create` (the mind of a character, `--id`) or `check` (the AI CLI in the container) | `--action` `--id` `--replace` |
| `cmd-tools-avatar-catalog.sh` | Where a body or a voice can come from, and under which licence: `--action` is `voices` (the default) or `avatars`; `--list` adds every public model of the open registry | `--action` `--list` |
| `cmd-tools-avatar-character.sh` | The characters of a project: `--action` is `list` (the default), `add` or `remove` | `--action` `--agent` `--credit` `--gender` `--id` `--language` `--model` `--model-file` `--name` `--persona-file` `--replace` `--voice` `--voice-engine` |
| `cmd-tools-avatar-voice.sh` | The voices of a project: `--action` is `status` (the default), `piper-list`, `piper-install`, `elevenlabs-link` or `elevenlabs-unlink` | `--action` `--voice` |
| `cmd-tools-reclaim.sh` | Disk held by projects whose folder is gone: a dry run unless `--apply` | `--apply` `--keep-days` `--list-protected` `--only` |
| `cmd-tools-remove.sh` | Containers, volumes and folder together; refuses work that is on no remote unless `--force` | `--force` `--orphans` |
| `cmd-tools-screen.sh` | A detached session with a log the dashboard follows | `--follow` `--list` `--log` `--run` `--stop` |

## Settings

| Key | File | What it says |
| --- | --- | --- |
| `doc.name` | `core/config/workspace.avatars.settings.yml` | The folder under the workspace root: `avatars` |
| `avatar.repo`, `avatar.branch` | `core/config/workspace.avatars.settings.yml` | The repository of the avatar app and its branch; `avatar.repo` is to be set before the first build |
| `avatar.project` | `core/config/workspace.avatars.settings.yml` | The name of the project the builder takes when none is given |
| `avatar.agent_prefix` | `core/config/workspace.avatars.settings.yml` | What the name of a character's agent starts with: `avatar-` |
| `avatar.voice_engine`, `avatar.voice` | `core/config/workspace.avatars.settings.yml` | The voice a new character gets: a free local one |
| `avatar.piper_voices_dir`, `avatar.piper_voices_url`, `avatar.osa_index_url` | `core/config/workspace.avatars.settings.yml` | Where the free voices are kept and fetched from, and the index of the open registry of models |
| `presentation.subtitle`, `presentation.noun`, `presentation.kind` | `core/config/workspace.avatars.settings.yml` | How the page reads: one item is an `avatar`, laid out as `projects` |
| `assistant.name`, `assistant.placeholder` | `core/config/workspace.avatars.settings.yml` | What the assistant is called on this page; `default` takes the workspace's |
| `workspaces` | `core/config/settings.yml` | The active folders; `avatars` is on it once the plugin is activated |

## Rules

- **Licences are per model and per voice.** Record the credit and the licence with every
  character (`--credit`), and never publish a model that is fan-made or for its author only.
- **ElevenLabs spends money.** Never link a key and never choose a paid voice without the person
  asking; a key is never read or printed. The browser voice and Piper are free.
- **A character's agent lives in the project** (`claude/agents/` in it) and is linked into the AI
  CLI's folder: change the file in the project, never the link.
- **Containers only** (DDEV by default): the avatar app runs in its own container; never `node`
  or `npm` for it on the host.
- **Remove through the tool**: `bash cmd-tools-remove.sh <project>`, only when asked; never
  `rm -rf`.
- **A hostname belongs to one project**: two avatars never answer at one address.

The Avatars plugin places these beside this one, each in the workspace folder of its kind: the agent `avatars-character-maker` (`ai-agents/`), the command `/avatars-add-character` (`ai-commands/`) and the prompt `avatars-build-a-character` (`ai-prompts/`).

## The book

For any automated functional testing in this work (a Gherkin feature, a step definition, choosing a
step, a test run and its failures), read the book *Automated Functional Testing Recipes* first.

- **Where.** Use the first that exists: `.claude/automated-functional-testing-recipes/` in the project,
  `~/.claude/automated-functional-testing-recipes/` (installed by webship/webship-js-ai-agent,
  webship/webship-js-skills or webship/ai-agents), or
  https://github.com/webship/webship-js-ai-agent/tree/2.0.x/automated-functional-testing-recipes
- **How.** Its `README.md` first, then the chapter that matches the task (one file per chapter,
  named by its subject), not the single complete file.
- **Which wins.** The installed webship-js package and the step pack are the source of truth for
  step phrasing. When they differ from the book, follow them and say so.
