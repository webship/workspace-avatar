# @webship.co/workspace-avatar

The **Avatars** workspace of the [Webship Workspace](https://github.com/webship/workspace) dashboard:
the `avatars/` folder (type `code`), its settings file (`core/config/workspace.avatars.settings.yml`),
its commands and its docs, as a plugin.

## Use it

```bash
cd ~/workspace
bash core/scripts/plugins.sh --require github:webship/workspace-avatar
bash core/scripts/plugins.sh --activate avatar     # puts `avatars` on the workspaces list of settings.yml
bash core/scripts/plugins.sh --install avatar      # the folder, its settings file (once), its commands, its docs (once)
```

The settings file and the docs are placed once and never overwritten: they hold what you put there.
`--deactivate` takes the workspace off the list; the folder and its content stay.

## The commands

| Command |
| --- |
| (none) |

The bash functions these commands call live in the dashboard's `core/scripts/functions`.
