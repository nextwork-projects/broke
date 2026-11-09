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

# Adds a `broke` command, so a new Terminal window starts it again with one word.
LINE="alias broke='node \"$DIR/scripts/start.mjs\"'"
for RC in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.bash_profile"; do
  [ "$RC" = "$HOME/.zshrc" ] || [ -f "$RC" ] || continue # zsh is the Mac default; bash files only if they exist
  grep -qxF "$LINE" "$RC" 2>/dev/null || printf '\n# broke\n%s\n' "$LINE" >> "$RC"
done
BROKE_TIP=1 exec node scripts/start.mjs
