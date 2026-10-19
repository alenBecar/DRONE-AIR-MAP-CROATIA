#!/bin/sh
# Map fonts (glyph PBFs) and sprites from protomaps/basemaps-assets, stored with the names the page expects.
set -e
W=${1:-web}
B=https://raw.githubusercontent.com/protomaps/basemaps-assets/main
for f in Regular Medium Italic; do
  mkdir -p "$W/fonts/NotoSans$f"
  for r in 0-255 256-511; do curl -fsSL -o "$W/fonts/NotoSans$f/$r.wasm" "$B/fonts/Noto%20Sans%20$f/$r.pbf"; done
done
mkdir -p "$W/sprites"
for t in light dark; do for e in json png; do
  curl -fsSL -o "$W/sprites/$t.$e" "$B/sprites/v4/$t.$e"
  curl -fsSL -o "$W/sprites/${t}_2x.$e" "$B/sprites/v4/$t@2x.$e"
done; done
