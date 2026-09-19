#!/usr/bin/env python3
"""Stamp asset URLs with a content hash so a browser cannot serve a stale demo.

GitHub Pages caches assets, so a returning visitor keeps the JavaScript they saw
last time. On a normal site that is a minor annoyance; for a submission it means a
fix lands and the person judging it still sees the old behaviour. Each asset URL
gets ?v=<hash of that file>, which changes only when the file does.

    python3 tools/stamp-assets.py
"""
from __future__ import annotations

import hashlib, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PATTERN = re.compile(r'(?P<attr>href|src)="(?P<path>(?:assets|data)/[^"?]+)(?:\?v=[0-9a-f]+)?"')


def digest(rel: str) -> str | None:
    f = ROOT / rel
    if not f.is_file():
        return None
    return hashlib.sha256(f.read_bytes()).hexdigest()[:8]


def main() -> int:
    missing, stamped = [], 0
    for page in sorted(ROOT.glob("*.html")):
        text = page.read_text(encoding="utf-8")

        def sub(m):
            nonlocal stamped
            h = digest(m["path"])
            if h is None:
                missing.append(f'{page.name} → {m["path"]}')
                return m[0]
            stamped += 1
            return f'{m["attr"]}="{m["path"]}?v={h}"'

        new = PATTERN.sub(sub, text)
        if new != text:
            page.write_text(new, encoding="utf-8")
        print(f"  {page.name}")

    print(f"{stamped} asset references stamped")
    if missing:
        print("MISSING:", *missing, sep="\n  ", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
