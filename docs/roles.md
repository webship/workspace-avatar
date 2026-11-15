# What the assistant can do here

The AI Assistant works for the team across the workspace: development, testing, design, video
production, audio production and documents. It is not told a list of promises. At each turn it is told,
role by role, the folders of **this** workspace that serve the role and the commands that are in them
**right now**, each with the name its own header or its `--help` gives it. A folder added a minute ago
is in the next answer; a role whose folder is not here says so, and how the folder is added.

| Role | Folders it looks in | What the lines are |
| --- | --- | --- |
| Development | `dev/`, `sandboxes/`, `demos/`, `products/`, `projects/`, `modules/`, `themes/`, `profiles/`, `recipes/`, `libraries/`, `site-templates/` | The builders and the tools of those folders, without the testing ones |
| Testing | `test/` and the sites folders | Their testing and checks commands. The suite is Webship-js; the report is in the project's Tests menu |
| Design | `designs/`, `images/`, `graphs/` | Their commands, and the board (`designs/boards/` when a page is saved to the workspace) |
| Video production | `videos/` | Its commands |
| Audio production | `audio/` | Its commands |
| Documents | `docs/`, `specs/`, `worklogs/` | Their commands; a document is a Markdown file there |

Eight commands a role are named, and the number of the rest. See exactly what it is told on this
machine: `/fragments/p/avatar/roles` on the dashboard.

## The rules it is given with them

- A site is built, started and stopped only through its folder's commands, never by hand on the machine.
- While testing, and in any scenario it writes, it uses the accounts a site has: a suite never creates
  or deletes a user account.
- A site out on the web is opened and read, nothing more: no form, no sign-in, no going through its
  pages by itself. A site of this workspace opens in the reading window by its own address.
- It reads `bash <command> --help` before it uses a flag, and says what it ran and what it answered.

## With the other abilities

Asked aloud (speech to speech) the answer is spoken; shown something (the camera) the picture comes
with that one turn; a page it opens (the reading window) can be read section by section; what it
draws (the board) can be kept in `designs/boards/`. Each of those is its own switch.

## The switch

`core/config/plugin.avatar.settings.yml`: `roles.enabled` (default `true`). `false` leaves the assistant
with what the dashboard tells it by itself.

## For any AI command line tool

The list is plain text in the assistant's context: nothing in it is specific to one AI tool. The
commands are bash scripts that any agent with a shell can run the same way.
