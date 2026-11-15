# Characters in the AI Assistant

The assistant's avatar is the Druplicon, which ships with the dashboard, or a character of an avatar
project in this folder. Every character found here is offered in the avatar's settings (the robot
button in the assistant's panel, then the gear): nothing to list by hand. Everything about a character
is read from its project when the page is drawn and is served from there; nothing is copied into the
dashboard. A model keeps its own licence, and one made from someone else's work stays on your machine.

## What makes a character

```text
avatars/<project>/
  characters/<id>.json        the character: who it is and what it brings
  public/models/<id>.vrm      its body
  public/custom-moves.js      moves of the project's own (optional)
  public/custom-moves.json    what each of those moves is for (optional)
  claude/agents/avatar-<id>.md its mind, linked into ~/.claude/agents (optional)
```

`characters/<id>.json`, as `cmd-tools-avatar-character.sh … -a add` writes it:

| Key | What the assistant's panel does with it |
| --- | --- |
| `name` | The name in the picker, and what the assistant is called while the avatar is shown |
| `model` | `/models/<file>.vrm`: the body, served from the project. It must be inside the project |
| `credit` | Shown under the picker. Say the licence |
| `moves` | A set of moves beyond the shared ones: `guide` suits a small floating character whose arms start beside its head. `settings.yml` can say it instead: `assistant.avatar_moves.<id>` |
| `agent` | The AI agent the assistant runs as while this avatar is shown, when it is installed in `~/.claude/agents` |
| `voice`, `voiceEn`, `fallback` | `{ "engine": "piper", "voice": "en_GB-alba-medium" }`: the free local voice the avatar speaks in during speech to speech, when that voice is installed (`cmd-tools-avatar-speech.sh -a install --stt none --voice <name>`). A paid engine's voice here is never read by the dashboard |

A project folder may be a link to a project kept elsewhere on the machine. To offer only the avatars
you name, set `assistant.avatars_discover: false` in `core/config/settings.yml`.

## Moves of the project's own

`public/custom-moves.js` is a module whose default export is the moves, by name:

```js
export default {
  twirl: {
    duration: 2.4,                       // seconds, 0.5 to 10
    pose(t, p, o, h) {                   // t runs from 0 to 1
      const e = h.envelope(t, 0.2, 0.2); // eases in and out
      p.add('spine', 0, Math.sin(t * Math.PI * 2) * 0.9 * e, 0);   // bone, then x, y, z in radians
      p.add('leftUpperArm', 0, 0, 0.9 * e);
      p.add('rightUpperArm', 0, 0, -0.9 * e);
      o.hipsY += 0.04 * Math.sin(t * Math.PI) * e;                  // the whole figure, in metres
    },
  },
};
```

and `public/custom-moves.json` says what each is for, which is what the assistant is told:

```json
{ "version": 1, "moves": [ { "name": "twirl", "en": "Twirl", "when": "a happy turn on the spot, for good news" } ] }
```

The rules, checked by the dashboard before the file is served and again by the page:

- A name is 2 to 24 lowercase letters. A move never replaces one that is already there (`wave`, `nod`, `bow` …).
- The file is at most 60 KB, inside the project, and names nothing but arithmetic: no network, no
  document or window, no timers, storage or imports. A file that names one is not served, and the
  avatar keeps the shared moves.
- Bones are the VRM humanoid ones (`hips`, `spine`, `chest`, `neck`, `head`, `leftUpperArm`,
  `leftLowerArm`, `leftHand`, the same on the right, the legs). From the arms-down rest a left arm
  rises with +z and a right arm with -z.
- `h.ease(t)` and `h.envelope(t, in, out)` are given to a pose; `h.reach` is accepted and does nothing here.

## Program a new move

A move is a small file of arithmetic, so any AI CLI can write one. Give it this page and say what the
move should look like, from the project folder:

```text
Read docs/characters.md of the Avatars plugin ("Moves of the project's own"). In public/custom-moves.js
of this avatar project add a move called "salute": the right hand rises to the brow, holds, and comes
down, 2 seconds. Add its line to public/custom-moves.json. Keep every move that is there. Use only
arithmetic: the dashboard refuses the file otherwise.
```

Reload the dashboard page: the new move is there, and the assistant can use it by writing `[salute]`
in an answer. Keep a copy of the file before a change; putting the copy back is the way back.
