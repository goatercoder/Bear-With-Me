#!/bin/sh
# Build dist/focusling.zip — the file you upload to the Chrome Web Store / AMO.
set -e
cd "$(dirname "$0")/.."
mkdir -p dist
rm -f dist/focusling.zip
zip -q -r dist/focusling.zip manifest.json core.js background.js sprites.js game.js app.js blocked.js \
  popup.html arena.html blocked.html style.css icons
echo "wrote dist/focusling.zip"
