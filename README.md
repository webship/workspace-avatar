# @webship.co/workspace-avatar

The **Avatars** workspace of the [Webship Workspace](https://github.com/webship/workspace) dashboard:
the `avatars/` folder (type `code`), its settings file (`core/config/workspace.avatars.settings.yml`),
its commands and its docs, as a plugin.

## Use it

```bash
cd ~/workspace
bash core/scripts/plugins.sh --require github:webship/workspace-avatar
bash core/scripts/plugins.sh --activate avatar --with-needs     # puts `avatars` on the workspaces list of settings.yml
bash core/scripts/plugins.sh --install avatar      # the folder, its settings file (once), its commands, its docs (once)
```

The settings file and the docs are placed once and never overwritten: they hold what you put there.
`--deactivate` takes the workspace off the list; the folder and its content stay.

## What it needs

The AI items land in the four AI folders, so the manifest needs them (`needs`): `ai-agents`, `ai-skills`, `ai-commands`, `ai-prompts`. `--activate avatar` and `--install avatar` stop while one is missing and name it; with `--with-needs` they are required, activated and installed first.

## The AI items

The plugin carries its own AI items (`ai/` in the package, the manifest's `ai` block), written for the work this folder is for. `--install` places each one in the workspace folder of its kind, when that folder is an active workspace folder; `--uninstall` removes them, and keeps one that was edited in its folder.

| Item | Kind | Lands in | What it is for |
| --- | --- | --- | --- |
| `avatars-character-maker` | Agent | `ai-agents/avatars-character-maker.md` | Builds and furnishes a talking AI character in `avatars/`: the project, its characters (body, voice, persona), its voices, the agent that is its mind; records every licence, spends no credits unasked |
| `avatars-workflow` | Skill | `ai-skills/avatars-workflow/` | How work is done in `avatars/`: what may be used, the project, a voice, the character, its mind; every command with its flags, the `avatar` settings keys |
| `/avatars-add-character` | Command | `ai-commands/avatars-add-character.md` | `/avatars-add-character <project> <id> <name> [model]`: checks the project and the licence of the body, adds the character with a free voice and says what it used |
| `avatars-build-a-character` | Prompt | `ai-prompts/avatars-build-a-character.md` | A new session that builds a talking AI character: a body it may use, a free voice and a mind |

From its folder an item is installed into the AI CLI (Claude Code by default) like any other: the folder's page on the dashboard, or `bash cmd-tools-ai-items.sh <name> --install` in the AI folder (`--to dev/<project>` for one project). A prompt is not installed: the New screen form lists it as the start of a new session. The body of every item is plain Markdown any AI CLI can follow; Claude Code is the default shape (the frontmatter, the launch line of a prompt). Every command, flag, settings key and path an item names is checked by `tests/items.test.ts`; the shape of the items is the one of the reference, [`docs/plugin-items-pattern.md` of the WordPress plugin](https://github.com/webship/workspace-wordpress/blob/1.0.x/docs/plugin-items-pattern.md).

## The commands

| Command |
| --- |
| `cmd-avatar-project.sh` |
| `cmd-tools-avatar-agent.sh` |
| `cmd-tools-avatar-catalog.sh` |
| `cmd-tools-avatar-character.sh` |
| `cmd-tools-avatar-voice.sh` |
| `cmd-tools-reclaim.sh` |
| `cmd-tools-remove.sh` |
| `cmd-tools-screen.sh` |

The bash functions these commands call live in the dashboard's `core/scripts/functions`.
