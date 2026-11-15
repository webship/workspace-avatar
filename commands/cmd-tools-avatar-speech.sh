#!/usr/bin/env bash

# workspace-name: Speech for the AI Assistant (local models)

# Bootstrap.
# Find the workspace tooling from this script, so a fresh clone needs no setup.
WORKSPACE_SCRIPTS="${WORKSPACE_SCRIPTS:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../core/scripts" && pwd)}";
source ${WORKSPACE_SCRIPTS}/bootstrap.sh || exit 1 ;

# Load workspace settings.
eval $(parse_yaml ${WORKSPACE_CONFIG}/workspace.avatars.settings.yml);

ARGPARSE_DESCRIPTION="The local speech models of the AI Assistant: a recogniser and a voice, free and on this machine"
source ${WORKSPACE_SCRIPTS}/plugins/avatar/args/arg-avatar-speech.sh || exit 1 ;

shift $#;

avatar_speech ;
