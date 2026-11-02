#!/bin/bash
set -e

if [ -z "$GIT_REPOSITORY_URL" ]; then
    echo "GIT_REPOSITORY_URL is not set" >&2
    exit 1
fi

git clone "$GIT_REPOSITORY_URL" /home/app/output

exec node script.js
