#!/bin/sh
# Point this repo at .githooks/ so prepare-commit-msg strips AI attribution trailers.
set -e
cd "$(dirname "$0")/.."
git config core.hooksPath .githooks
chmod +x .githooks/prepare-commit-msg
echo "Installed .githooks (core.hooksPath=$(git config core.hooksPath))"
