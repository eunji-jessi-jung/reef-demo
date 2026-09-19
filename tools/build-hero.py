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

SIZE = 460
SPREAD = 11.4          # tighter, so the points read as one field rather than scatter
DOT_ART = 4.3          # the artifacts read slightly heavier than the rock
DOT_SUB = 2.9
FIELD = 620            # total points; the artifacts are the innermost of them


def main() -> int:
    if not DIGEST.exists():
        print(f"error: {DIGEST} not found — run build-digest.py first", file=sys.stderr)
        return 1
    items = json.loads(DIGEST.read_text(encoding="utf-8"))["items"]

    counts = [len(a.get("facts", [])) for a in items]
    lo, hi = min(counts), max(counts)
    span = (hi - lo) or 1

    # Densest first, so the heavy artifacts sit at the centre the way the oldest
    # growth does, and the field continues outward past them.
    order = sorted(items, key=lambda a: -len(a.get("facts", [])))

    mid = SIZE / 2
    circles = []
    for i in range(FIELD):
        angle = i * GOLDEN
        dist = SPREAD * math.sqrt(i)
        x, y = mid + dist * math.cos(angle), mid + dist * math.sin(angle)
        edge = 1 - (i / FIELD) ** 1.7        # the field thins toward its rim

        if i < len(order):
            a = order[i]
            weight = (len(a.get("facts", [])) - lo) / span
            var = "--accent" if a["type"] in CLAIMS else "--deep"
            opacity = round(0.55 + 0.40 * weight, 3)
            radius = DOT_ART
            title = f"<title>{a['id']}</title>"
        else:
            # Substrate: the rock a colony grows on. Uniform, unlit, and the reason
            # eighty points read as a form instead of a scatter.
            var, title = "--ink", ""
            opacity = round(0.16 * edge, 3)
            radius = DOT_SUB

        # --i drives the stagger, so the field assembles outward the way it grew.
        circles.append(
            f'<circle style="--i:{i}" cx="{x:.1f}" cy="{y:.1f}" r="{radius}" '
            f'fill="var({var})" opacity="{opacity}">{title}</circle>'
        )

    svg = (
        f'{START}\n'
        f'        <svg class="colony" viewBox="0 0 {SIZE} {SIZE}" role="img"\n'
        f'             aria-label="{len(items)} artifacts, one lit point each, on a field of {FIELD}">\n'
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
    print(f"hero     {FIELD} dots · {len(items)} artifacts "
          f"({claims} coral / {len(items) - claims} teal) on {FIELD - len(items)} substrate")
    return 0


if __name__ == "__main__":
    sys.exit(main())
