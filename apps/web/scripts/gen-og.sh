#!/usr/bin/env bash
# Render the 1200x630 social-share card (Open Graph / Twitter) from its SVG source into /public.
# Uses rsvg-convert — same zero-extra-dep toolchain as gen-icons.sh.
#
#   bash apps/web/scripts/gen-og.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PUBLIC="$(cd "$SCRIPT_DIR/.." && pwd)/public"
SRC="$SCRIPT_DIR/og-card.svg"

if ! command -v rsvg-convert >/dev/null 2>&1; then
  echo "rsvg-convert not found — install librsvg (e.g. 'brew install librsvg')." >&2
  exit 1
fi

rsvg-convert -w 1200 -h 630 "$SRC" -o "$PUBLIC/og.png"
echo "Done → $PUBLIC/og.png ($(rsvg-convert --version | head -1))"
