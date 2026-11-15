#!/usr/bin/env bash

argparse "$@" <<ARGEOF || exit 1
import re

def name(value):
    # argparse-bash hands values to the shell through eval: only what a model name is made of.
    if not re.fullmatch(r'[A-Za-z0-9_][A-Za-z0-9._-]{0,63}', value):
        raise argparse.ArgumentTypeError('is letters, digits, dots, hyphens and underscores')
    return value

parser.add_argument('-a', '--action',
                    choices=['status', 'install', 'remove', 'list'],
                    default='status',
                    help='status of the local speech engine and models (default); install a recogniser and a voice; remove one; list what can be installed.')
parser.add_argument('-s', '--stt',
                    type=name,
                    default="_default_",
                    help='The recogniser: whisper-base.en (default), whisper-tiny.en, moonshine-tiny-en, or none.')
parser.add_argument('-v', '--voice',
                    type=name,
                    default="_default_",
                    help='The voice: an English Piper voice, e.g. en_US-ljspeech-medium (default), en_GB-alan-medium, or none.')
ARGEOF
