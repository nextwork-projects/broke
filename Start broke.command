#!/bin/zsh
# Double-click to run broke. Everything else lives in scripts/start.mjs. (To change the code, run `npm run dev`: it reloads on every edit.)
cd "$(dirname "$0")"
if ! command -v node >/dev/null; then echo "Node.js is not installed. Get it from https://nodejs.org (LTS), then double-click this again."; read; exit 1; fi
exec node scripts/start.mjs
