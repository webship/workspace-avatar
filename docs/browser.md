# The reading window

The AI Assistant's avatar has a reading window: a page is fetched by the dashboard and shown with no
script and no form, so it is read and never acted on. The assistant opens it (`BROWSE:` and `SEARCH:`
in an answer), and so can you: the address box takes an address or search words. The dashboard gives
it back, forward, reload, bigger and smaller text, "read aloud what is in view" and "open in a real tab".

With the base after 1.0.10 it also opens **the sites of this workspace**: a project of one of your
sites folders, by its own address, read as a visitor sees it, without signing in.

This plugin adds a second row of tools:

| Tool | What it does | For |
| --- | --- | --- |
| **Sites of this workspace** | The projects of your sites folders that have an address; choosing one opens it. The globe button in the avatar's tools opens the first | your own sites |
| **Sections** | The page's headings, in order; choosing one goes to it and marks it | any page |
| **Read section** | Reads that section aloud: its title, then its words, up to the next heading of its level. With the local voice it is read sentence by sentence; talk over it, or press **Stop reading** | any page |
| **Section to the board** | The section's title as a line on the board and its first words as a note | any page |
| **Picture to the board** | A picture of the page, 1280 by 800, put on the board | your own sites |
| **Test this site** | Starts the project's Webship-js tests with the folder's own `cmd-tools-testing.sh <project> --run`, in a session like the Tests menu's; a project with no testing stack is set up first. The report is in the project's Tests menu. It runs in a session on the machine; where the dashboard has no runner there, it says the command to run in a terminal instead | your own sites |

## What it will and will not do

| | A site of this workspace | A site out on the web |
| --- | --- | --- |
| Open and read a page | Yes: a GET with no cookie, as a visitor | Yes: https, a public address |
| Read a section aloud, put it on the board | Yes | Yes |
| A picture of the page | Yes: taken by the browser in the dashboard's container, which is let reach that one site and nothing else, signed in as nobody; it is handed to this page and kept nowhere | No |
| Run its tests | Yes, the project's own suite | No |
| Fill in a form, sign in, follow links by itself | No | No |

A site on another runtime (Docker Compose, Lando, Docksal, Podman, Kubernetes) has no address of this
kind yet and opens in its own tab. A picture needs a browser where the dashboard runs (`chromium`); the
dashboard's own image has one.
