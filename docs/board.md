# The board

The AI Assistant's avatar has a board: the robot button in the assistant's panel, then the board icon,
or the assistant opens it itself when it writes `BOARD:` and `DRAW:` lines in an answer. The dashboard
gives it a pen, colours and widths, sticky notes, Undo, Clear, Save drawing (SVG) and Save notes
(Markdown). This plugin adds a second row of tools, on the same board:

| Tool | What it does |
| --- | --- |
| **Move** | Drag anything on the board: a shape, a stroke, a word, a picture, what the assistant drew |
| **Erase** | Click a thing to remove it |
| **Rectangle**, **Ellipse**, **Diamond**, **Line**, **Arrow** | Drag from one corner to the other. The colour and the width are the pen's |
| **Text** | Click where the words go, type, press Enter |
| **Picture** | A PNG, JPEG, WebP or GIF from this computer, up to 3 MB. A copied picture can be pasted too |
| **Look** | Whiteboard, Chalkboard, Grid paper, Dotted paper |
| **Pages** | The page before, the next page, **New page** (after this one), **Remove page**. Twenty at most |
| **Save picture** | Downloads the page that is shown as a PNG, 2000 by 1200, with its lines of text |
| **To the workspace** | Writes that PNG into the workspace: `designs/boards/`, or `images/boards/`, or `docs/boards/`, the first of those folders that is a workspace here. A file that is there is never replaced |

Everything these tools add is under the board's own **Undo** and **Clear**.

## What is kept, and where

A board stays in this browser. Its pages (the drawing, the lines, the notes) are kept in the browser's
own storage, so closing the board, a reload or the next day brings them back on this computer; nothing
is sent anywhere. A picture put on the board is read by the browser and is part of the page. When the
pages with their pictures are too large for the browser's storage, the pages are kept without the pictures.

The board leaves the browser only when you press a save button: **Save picture** and **Save drawing**
download a file, **To the workspace** writes one PNG into the workspace folder, where the team finds
it with the other designs.

A page that is put back is rebuilt from a list of what a board can hold (strokes, shapes, words,
pictures held in the page itself), never from markup: nothing that could run is ever put on a board.
