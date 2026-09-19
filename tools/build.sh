#!/bin/sh
# Rebuild everything the site derives from the repositories, then stamp the assets.
# Run this before every commit. The stamp step in particular is not optional: skip it
# and a returning visitor keeps the JavaScript they loaded last time, which is how a
# fix can land and the person judging never see it.
set -e
cd "$(dirname "$0")/.."

echo "── evidence  (figures and quotations, extracted from the three repositories)"
python3 tools/build-evidence.py

echo "── corpus    (the sellflow sources, as the no-reef arm of the comparison sees them)"
python3 tools/build-corpus.py

echo "── digest    (the reef, compressed for the chat's system prompt)"
python3 tools/build-digest.py

echo "── hero      (the colony, drawn from the digest, injected into index.html)"
python3 tools/build-hero.py

echo "── stamp     (content hashes on assets and module imports)"
python3 tools/stamp-assets.py

echo "── check"
python3 - <<'PY'
import json, pathlib, sys
bad = []
for f in pathlib.Path("data").glob("*.json"):
    try:
        json.loads(f.read_text(encoding="utf-8"))
    except Exception as e:
        bad.append(f"{f}: {e}")

# every data-i18n key in the pages must exist in strings.json, in both languages
strings = json.loads(pathlib.Path("data/strings.json").read_text(encoding="utf-8"))
import re
used = set()
for page in pathlib.Path(".").glob("*.html"):
    text = page.read_text(encoding="utf-8")
    used |= set(re.findall(r'data-i18n(?:-ph)?="([^"]+)"', text))
    used |= set(re.findall(r'data-md="([^"]+)"', text))
missing = sorted(k for k in used if k not in strings)
half = sorted(k for k in used if k in strings and not (strings[k].get("ko") and strings[k].get("en")))
if missing: bad.append("strings missing: " + ", ".join(missing))
if half:    bad.append("strings missing a language: " + ", ".join(half))

if bad:
    print("\n".join("  FAIL " + b for b in bad), file=sys.stderr)
    sys.exit(1)
print(f"  {len(used)} copy keys, both languages; data files parse")
PY
echo "── ready to commit"
