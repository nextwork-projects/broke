#!/bin/sh
# Installs broke into ~/broke (or $BROKE_DIR) and starts it:
#   curl -fsSL https://raw.githubusercontent.com/nextwork-projects/broke/main/install.sh | sh
set -e
REPO="${BROKE_REPO:-https://github.com/nextwork-projects/broke.git}"
DIR="${BROKE_DIR:-$HOME/broke}"

command -v git >/dev/null || { echo "broke needs git. Get it from https://git-scm.com/downloads, then run this again."; exit 1; }
command -v node >/dev/null || { echo "broke needs Node.js. Get the LTS version from https://nodejs.org, then run this again."; exit 1; }
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ] || { echo "broke needs Node.js 20 or newer. Get it from https://nodejs.org, then run this again."; exit 1; }

if [ -d "$DIR/.git" ]; then echo "broke is already in $DIR. Starting it."; else git clone --quiet "$REPO" "$DIR"; fi
cd "$DIR"
exec node scripts/start.mjs
