#!/usr/bin/env python3
"""Draw the hero visual from the reef itself, and inject it into index.html.

A coral colony grows by accretion — one polyp at a time, each leaving a little
structure behind. That is the product's own argument, so the hero image is not a
picture of a reef: it is this reef. One circle per artifact, 80 of them, laid out in
the phyllotactic spiral that actually governs how coral heads and sunflowers pack.

Two things are read off the data rather than chosen:

  colour  Coral for the types that make a claim — process, decision, risk, pattern,
          contract. Teal for the types that map the ground — system, schema, api,
          glossary. The same split the citation chips use, so the page means one
          thing by each colour.
  size    Radius follows how many key facts the artifact carries, so the dense ones
          read heavier. Opacity follows the same, softly.

Fills are CSS variables, which is why this is injected into the page rather than
referenced as an image file: var() only resolves for inline SVG, and that is what lets
one drawing serve both themes.

    python3 tools/build-hero.py
"""

import json, math, re, sys
from pathlib import Path

DEMO = Path(__file__).resolve().parent.parent
DIGEST = DEMO / "data" / "digest.json"
PAGE = DEMO / "index.html"

START = "<!-- hero:visual -->"
END = "<!-- /hero:visual -->"

CLAIMS = {"process", "decision", "risk", "pattern", "contract"}
GOLDEN = math.radians(137.507764)   # the divergence angle a colony actually packs at

SIZE = 440
SPREAD = 21.0
R_MIN, R_MAX = 4.2, 12.0


def main() -> int:
    if not DIGEST.exists():
        print(f"error: {DIGEST} not found — run build-digest.py first", file=sys.stderr)
        return 1
    items = json.loads(DIGEST.read_text(encoding="utf-8"))["items"]

    counts = [len(a.get("facts", [])) for a in items]
    lo, hi = min(counts), max(counts)
    span = (hi - lo) or 1

    # Densest first, so the heavy artifacts sit at the centre of the colony the way
    # the oldest growth does.
    order = sorted(items, key=lambda a: -len(a.get("facts", [])))

    mid = SIZE / 2
    circles = []
    for i, a in enumerate(order):
        weight = (len(a.get("facts", [])) - lo) / span
        angle = i * GOLDEN
        dist = SPREAD * math.sqrt(i)
        x, y = mid + dist * math.cos(angle), mid + dist * math.sin(angle)
        r = R_MIN + (R_MAX - R_MIN) * weight
        var = "--accent" if a["type"] in CLAIMS else "--deep"
        opacity = round(0.30 + 0.55 * weight, 3)
        # --i drives the stagger, so the colony assembles outward the way it grew.
        circles.append(
            f'<circle style="--i:{i}" cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" '
            f'fill="var({var})" opacity="{opacity}"><title>{a["id"]}</title></circle>'
        )

    svg = (
        f'{START}\n'
        f'        <svg class="colony" viewBox="0 0 {SIZE} {SIZE}" role="img"\n'
        f'             aria-label="{len(items)} artifacts, one circle each">\n'
        f'          ' + "\n          ".join(circles) + "\n"
        f'        </svg>\n'
        f'        {END}'
    )

    page = PAGE.read_text(encoding="utf-8")
    if START not in page:
        print(f"error: {PAGE} has no {START} marker", file=sys.stderr)
        return 1
    page = re.sub(re.escape(START) + r".*?" + re.escape(END), lambda _: svg, page, flags=re.S)
    PAGE.write_text(page, encoding="utf-8")

    claims = sum(1 for a in items if a["type"] in CLAIMS)
    print(f"hero     {len(items)} polyps · {claims} coral (claims) · "
          f"{len(items) - claims} teal (structure) · facts {lo}-{hi}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
