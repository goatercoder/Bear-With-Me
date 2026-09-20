#!/bin/sh
# Build dist/focusling.zip — the file you upload to the Chrome Web Store / AMO.
set -e
cd "$(dirname "$0")/.."
mkdir -p dist
rm -f dist/focusling.zip
zip -q -r dist/focusling.zip manifest.json rules.js background.js oski.js overlay.js window.html window.js icons
echo "wrote dist/focusling.zip"
