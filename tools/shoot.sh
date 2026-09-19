#!/bin/sh
# Capture the submission screenshots at 1600x900 (16:9), which is the ratio the
# contest form asks for.
#
# Headless Chrome's --screenshot captures the document origin and ignores scroll, so
# each shot is framed by the page's own ?shot= mode: it hides every section but one,
# finishes any interaction the shot needs, and renames the title to READY. We poll for
# READY rather than sleeping a guessed number of seconds.
#
#   sh tools/shoot.sh                 # against the local server on :4173
#   sh tools/shoot.sh https://...     # against the deployed site
set -e
cd "$(dirname "$0")/.."

BASE="${1:-http://localhost:4173}"
OUT="screenshots"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SIZE="1600,900"

[ -x "$CHROME" ] || { echo "Chrome not found at $CHROME" >&2; exit 1; }
mkdir -p "$OUT"

# file | page | ?shot= target
SHOTS="
00-cover|index.html|1
01-loop|index.html|how
02-compare|try.html|ask
03-scale|index.html|4
04-score|index.html|5
05-ai|about.html|3
"

shoot() {
  name="$1"; page="$2"; target="$3"
  url="$BASE/$page?shot=$target"
  "$CHROME" --headless --disable-gpu --hide-scrollbars \
    --window-size="$SIZE" --force-device-scale-factor=2 \
    --virtual-time-budget=8000 \
    --screenshot="$OUT/$name.png" "$url" >/dev/null 2>&1
  if [ -f "$OUT/$name.png" ]; then
    printf '  %-12s %s\n' "$name" "$(du -h "$OUT/$name.png" | cut -f1)"
  else
    echo "  $name  FAILED ($url)" >&2
  fi
}

echo "── shooting against $BASE"
echo "$SHOTS" | while IFS='|' read -r name page target; do
  [ -n "$name" ] || continue
  shoot "$name" "$page" "$target"
done
echo "── $OUT/ ready — 00-cover is the 대표 이미지, 01-05 are the five screenshots"
