#!/usr/bin/env python3
"""Stamp asset URLs with a content hash so a browser cannot serve a stale demo.

GitHub Pages caches assets, so a returning visitor keeps the JavaScript they saw
last time. On a normal site that is a minor annoyance; for a submission it means a
fix lands and the person judging it still sees the old behaviour.

Stamping the entry script in the HTML is not enough on its own: an ES module's
`import` specifiers are separate requests with their own cache entries, so a stale
chat.js survives a fresh beats.js. This rewrites those specifiers too, and iterates
until the hashes stop moving — changing a leaf changes its importer's bytes, which
changes that importer's own hash.

    python3 tools/stamp-assets.py
"""
from __future__ import annotations

import hashlib
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
HTML_REF = re.compile(r'(?P<attr>href|src)="(?P<path>(?:assets|data)/[^"?]+)(?:\?v=[0-9a-f]+)?"')
JS_IMPORT = re.compile(r"""(?P<kw>from\s+|import\s*\()(?P<q>['"])(?P<spec>\./[\w.-]+\.js)(?:\?v=[0-9a-f]+)?(?P=q)""")
MAX_PASSES = 5


def digest(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:8]


def stamp_js_imports() -> bool:
    """Rewrite ./x.js specifiers to ./x.js?v=<hash>. True if anything changed."""
    changed = False
    for js in sorted(ROOT.glob("assets/js/*.js")):
        text = js.read_text(encoding="utf-8")

        def sub(m: re.Match) -> str:
            target = js.parent / m["spec"][2:]
            if not target.is_file():
                print(f"  MISSING import {m['spec']} in {js.name}", file=sys.stderr)
                return m[0]
            return f'{m["kw"]}{m["q"]}{m["spec"]}?v={digest(target)}{m["q"]}'

        new = JS_IMPORT.sub(sub, text)
        if new != text:
            js.write_text(new, encoding="utf-8")
            changed = True
    return changed


def stamp_html() -> tuple[int, list[str]]:
    stamped, missing = 0, []
    for page in sorted(ROOT.glob("*.html")):
        text = page.read_text(encoding="utf-8")

        def sub(m: re.Match) -> str:
            nonlocal stamped
            target = ROOT / m["path"]
            if not target.is_file():
                missing.append(f'{page.name} -> {m["path"]}')
                return m[0]
            stamped += 1
            return f'{m["attr"]}="{m["path"]}?v={digest(target)}"'

        new = HTML_REF.sub(sub, text)
        if new != text:
            page.write_text(new, encoding="utf-8")
    return stamped, missing


def main() -> int:
    for i in range(MAX_PASSES):
        if not stamp_js_imports():
            break
    else:
        print("import hashes did not settle", file=sys.stderr)
        return 1

    stamped, missing = stamp_html()
    print(f"{stamped} asset references stamped over {i + 1} pass(es)")
    for js in sorted(ROOT.glob("assets/js/*.js")):
        for m in JS_IMPORT.finditer(js.read_text(encoding="utf-8")):
            print(f"  {js.name} -> {m['spec']}?v=...")
    if missing:
        print("MISSING:", *missing, sep="\n  ", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
