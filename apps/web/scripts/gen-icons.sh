#!/usr/bin/env bash
# Generate the full favicon / PWA app-icon set from the committed SVG sources.
#
#   bash apps/web/scripts/gen-icons.sh
#
# Sources (edit these, then re-run):
#   public/icon.svg            — full-bleed brand mark (favicons, apple-touch, the "any" PWA icons)
#   scripts/icon-maskable.svg  — same mark padded into the Android adaptive-icon safe zone
#
# Build-time dependency: rsvg-convert (Homebrew: `brew install librsvg`) for crisp SVG rasterizing.
# The .ico is assembled by make-ico.mjs (pure node:fs, no deps). Nothing here ships at runtime.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PUBLIC="$(cd "$SCRIPT_DIR/.." && pwd)/public"
SRC="$PUBLIC/icon.svg"
MASK_SRC="$SCRIPT_DIR/icon-maskable.svg"

if ! command -v rsvg-convert >/dev/null 2>&1; then
  echo "rsvg-convert not found. Install it with: brew install librsvg" >&2
  exit 1
fi

render() { rsvg-convert -w "$1" -h "$1" "$2" -o "$3"; }

# Shipped PWA / apple-touch icons.
render 192 "$SRC" "$PUBLIC/icon-192.png"
render 512 "$SRC" "$PUBLIC/icon-512.png"
render 180 "$SRC" "$PUBLIC/apple-touch-icon.png"
render 512 "$MASK_SRC" "$PUBLIC/icon-maskable-512.png"

# Shipped PNG favicons.
render 16 "$SRC" "$PUBLIC/favicon-16.png"
render 32 "$SRC" "$PUBLIC/favicon-32.png"

# Multi-size favicon.ico (16/32/48), then drop the 48 intermediate.
render 48 "$SRC" "$PUBLIC/icon-48.png"
node "$SCRIPT_DIR/make-ico.mjs" "$PUBLIC/favicon.ico" \
  "$PUBLIC/favicon-16.png" "$PUBLIC/favicon-32.png" "$PUBLIC/icon-48.png"
rm -f "$PUBLIC/icon-48.png"

echo "Done → favicon.ico, favicon-16.png, favicon-32.png, apple-touch-icon.png (180),"
echo "       icon-192.png, icon-512.png, icon-maskable-512.png"
