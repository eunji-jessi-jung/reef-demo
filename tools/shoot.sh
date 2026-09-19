#!/bin/zsh
# Capture the submission screenshots at 1600x900 with headless Chrome.
#
# The scenes need the page mid-interaction, so each URL carries ?shot=<scene> and
# assets/js/shot.js puts the page into that state, then sets document.title to READY.
# Chrome's virtual time budget gives the page room to get there before the capture.
#
#   zsh tools/shoot.sh [base-url]
#
# Default base is the local server on 4173, so a scene can be reshot without
# waiting for a deploy. Pass the published URL to capture what a judge will see.
set -e
cd "$(dirname "$0")/.."

CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
BASE="${1:-http://localhost:4173}"
OUT="screenshots"
W=1600; H=900

[[ -x "$CHROME" ]] || { echo "Chrome not found at $CHROME" >&2; exit 1 }
mkdir -p "$OUT"

shoot () {  # shoot <file> <page> <scene>
  local file="$OUT/$1.png" url="$BASE/$2?shot=$3"
  "$CHROME" --headless --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=1 --window-size=$W,$H \
    --virtual-time-budget=9000 --screenshot="$file" "$url" >/dev/null 2>&1
  if [[ -f "$file" ]]; then
    printf "  %-28s %s\n" "$1.png" "$(python3 -c "
import struct,sys
d=open('$file','rb').read(33)
w,h=struct.unpack('>II', d[16:24]); print(f'{w}x{h}  {round(len(open(\"$file\",\"rb\").read())/1024)}KB')
")"
  else
    echo "  FAILED $1" >&2
  fi
}

echo "capturing from $BASE"
shoot 01-cover       index.html  reveal
shoot 02-two-searches index.html search
shoot 03-money-path  index.html  path
shoot 04-score       index.html  evaluation
shoot 05-chat        index.html  ask
shoot 06-challenge   why.html    paper
echo "→ $OUT/"
