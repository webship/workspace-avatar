# The camera

Show the AI Assistant something: a device, a sketch on paper, a screen that is not this one.

## Use it

1. Show the avatar (the robot button in the assistant's panel) and press the **camera** button in its tools.
   The browser asks its own permission question the first time.
2. The **Camera** window opens with the preview, and says **Camera on** beside a red dot. The button is red too.
3. Press **Look at this**. A small copy of the picture appears: that one picture goes to the assistant
   with the next thing you ask, typed or said ("What is this cable for?").
4. **To the board** puts a still on the board instead, to draw over.
5. **Turn off**, the window's ×, Escape, or leaving the page each stop the camera at once.

## What it does with what it sees

| Thing | Where it goes | What is kept |
| --- | --- | --- |
| The preview | Nowhere: it is drawn by the browser, in this page | Nothing |
| A picture, after **Look at this** | From the browser to the dashboard on this machine, then to the assistant with that one turn. The assistant runs through your AI command line tool, so the picture goes where your prompts go | A private temporary file (this user only) until the answer comes, five minutes at the most. Then it is deleted. It is not in the conversation, a log or the workspace |
| A picture, after **To the board** | Onto the board, in this browser | With the board's pages, in the browser's own storage, until you clear it |

The camera never opens by itself: not when a page loads, not because the assistant asked, not because
it was on a moment ago. There is no recording and no sound from the camera: the microphone is a
separate thing with its own button and its own switch. The assistant is told that the picture is
private, not to keep or copy it, and not to guess who a person in it is.

## The switch

`core/config/plugin.avatar.settings.yml`, also in Settings → Plugins → Avatars:

| Key | Default | What it does |
| --- | --- | --- |
| `camera.enabled` | `true` | The camera button. `false` removes it, and the dashboard refuses any picture |

The camera needs a secure page: the dashboard's own https address has one. It needs the avatar to be
shown, because the camera's window is one of the avatar's windows.
