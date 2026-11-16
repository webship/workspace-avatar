---
description: Add a character to an avatar project of the avatars/ folder of the Webship Workspace with cmd-tools-avatar-character.sh — a body whose licence allows it, a free voice, a persona, and the credit recorded.
argument-hint: '<project> <character id> <name> [model]'
---

# /avatars-add-character

Add a character to an avatar project of `~/workspace/avatars` from: `$ARGUMENTS`

The arguments are the text typed after the command: the first word is the project (its folder
name in `avatars/`), the second word is the character's id (lowercase letters, digits and
hyphens), the third its name, and a last word is where its body comes from: `osa:<name>` from
the open registry, or a `.vrm` file that is already in the project's `public/models/`. With a
word missing, stop and ask for it. The workspace is container-based (DDEV by default).

## 1. Look at the project

```bash
cd ~/workspace/avatars
bash cmd-tools-avatar-character.sh <project>
bash cmd-tools-avatar-voice.sh <project>
```

If a character of that id exists, stop and say so: `--replace` is never added unasked.

## 2. Check the body may be used

```bash
bash cmd-tools-avatar-catalog.sh --action avatars --list
```

Say the licence of the model. A fan-made model, or one for its author only, is not used: stop
and say so.

## 3. Add it, with a free voice

```bash
bash cmd-tools-avatar-character.sh <project> --action add --id <id> --name <name> --model osa:<model> --voice-engine piper
bash cmd-tools-avatar-character.sh <project> --action add --id <id> --name <name> --model-file <file>.vrm --voice-engine piper --credit "<who made it, and its licence>"
```

Use the first form for a model of the registry (its credit is filled in), the second for a file
in the project. Never choose the paid voice engine unasked.

## 4. Report

The character, its body and the licence of it, its voice, and the address of the project
(`https://<project>.ddev.site`). To give it a mind:
`bash cmd-tools-avatar-agent.sh <project> --action create --id <id>`. For that, hand over to the
`avatars-character-maker` agent; the `avatars-workflow` skill has every command.
