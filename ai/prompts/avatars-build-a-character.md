Build a talking AI character in the avatars folder: the project, a body it may use, a free voice and a mind.

The launch line is for Claude Code, the default; the text between the triple quotes can be given to another AI CLI as it is.

```
claude --permission-mode bypassPermissions """
Build a talking AI character named <name> in the avatar project <project>
# ~/workspace/avatars/<project> · https://<project>.ddev.site · container-based (DDEV by default)
# free engines only: the browser voice or Piper; nothing that spends credits without my yes
# every model and every voice has a licence: tell me what it is before you use one

1. bash cmd-tools-avatar-catalog.sh
   bash cmd-tools-avatar-catalog.sh --action avatars --list
   propose a body and a voice I may use, with the licence of each
2. ls -d ~/workspace/avatars/<project>
   if the project is not there: bash cmd-avatar-project.sh --help, tell me what it needs, and wait
3. bash cmd-tools-avatar-voice.sh <project>
   tell me which voices are ready
4. bash cmd-tools-avatar-character.sh <project> --action add with the id, the name, the body and the voice we agreed on
5. bash cmd-tools-avatar-agent.sh <project> --action create --id <id>
   the agent that is the mind of the character; show me the file it wrote

If a command fails, show the line that failed and stop. Do not retry with other options.
Report the character, its body, its voice, the licence of each, and the address.
"""
```
