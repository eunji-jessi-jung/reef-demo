#!/usr/bin/env python3
"""Compress the reef into one prompt-sized digest.

The chat proxy puts this whole thing in its system prompt and caches it, so the
model sees every artifact rather than whatever a retrieval step happened to pick.
That is the point: the demo claims an agent works better with the reef, so the
agent had better actually be reading the reef.

Per artifact we keep the frontmatter that states provenance (id, title, status,
last_verified, known_unknowns) and the Key Facts, which the artifact contract
defines as atomic, independently checkable claims. Long prose sections are
dropped — they paraphrase the Key Facts and are what drifts.
"""
import json, pathlib, re, sys

REEF = pathlib.Path.home() / "Projects/sellflow-reef"
OUT = pathlib.Path(__file__).resolve().parent.parent / "data/digest.json"
MAX_FACT = 300          # chars of claim, after the citation tail is compacted
MAX_FACTS = 8
MAX_UNKNOWNS = 2
MAX_UNKNOWN_LEN = 200
MAX_TERMS = 14


def frontmatter(text):
    if not text.startswith("---"):
        return {}, text
    end = text.find("\n---", 3)
    raw, body = text[4:end], text[end + 4:]
    fm, key, buf = {}, None, []
    for line in raw.splitlines():
        if re.match(r"^\w[\w_]*:", line):
            if key:
                fm[key] = buf if buf else fm.get(key)
            key = line.split(":", 1)[0]
            val = line.split(":", 1)[1].strip().strip('"')
            buf = []
            fm[key] = val
        elif line.strip().startswith("- ") and key:
            buf.append(line.strip()[2:].strip().strip('"'))
            fm[key] = buf
    return fm, body


def compact_cites(fact):
    """Key Facts end in `→ path/to/file.java, other/path.sql`. The paths are most of
    the length and none of the meaning at this size, so keep the basenames only."""
    if "→" not in fact:
        return fact, ""
    claim, tail = fact.rsplit("→", 1)
    names = []
    for ref in tail.split(","):
        ref = ref.strip().strip("`")
        if not ref:
            continue
        names.append(ref.rsplit("/", 1)[-1])
    seen, uniq = set(), []
    for n in names:
        if n not in seen:
            seen.add(n); uniq.append(n)
    return claim.strip(), ", ".join(uniq[:3])


def key_facts(body):
    m = re.search(r"^## Key Facts\s*$(.*?)^## ", body, re.S | re.M)
    if not m:
        return []
    out = []
    for line in m.group(1).splitlines():
        if not line.startswith("- "):
            continue
        claim, src = compact_cites(re.sub(r"\s+", " ", line[2:]).strip())
        if len(claim) > MAX_FACT:
            claim = claim[:MAX_FACT].rsplit(" ", 1)[0] + " …"
        out.append({"c": claim, "s": src} if src else {"c": claim})
    return out[:MAX_FACTS]


def glossary_terms(body):
    """GLOSSARY- artifacts carry Terms tables instead of Key Facts, by contract.

    A glossary holds several tables, not one, and they do not share a shape: some are
    Term | Korean | Definition, others are Service | What it denotes | Defining file.
    Two things follow, and getting either wrong loses citations.

    A header row is any row whose next line is the |---| separator. Matching on the
    first cell instead ("term", "용어") only catches the first table, so every later
    table's header used to come through as a fact — "Service — What \u2018cancel\u2019 is
    there · Cardinality" was one of them.

    A file column is a column of paths, and it is the source, wherever it sits. Taking
    a fixed slice of the row threw it away whenever it was not where the first table
    put it.
    """
    lines = body.splitlines()
    rows = []
    for i, line in enumerate(lines):
        if not line.startswith("|"):
            continue
        nxt = lines[i + 1] if i + 1 < len(lines) else ""
        if re.match(r"^\|[\s:|-]+\|?\s*$", nxt):      # this row heads a table
            continue
        if re.match(r"^\|[\s:|-]+\|?\s*$", line):     # this row is a separator
            continue
        cells = [re.sub(r"[`\[\]]", "", c).strip() for c in line.strip("|").split("|")]
        if len(cells) < 2 or not cells[0]:
            continue
        term, rest = cells[0], cells[1:]

        # Whichever cell is a list of paths is the citation, not part of the meaning.
        src = ""
        keep = []
        for c in rest:
            if c and re.search(r"[\w./-]+\.(java|py|ts|js|sql|json|ya?ml|md|xlsx|csv|html|properties|gradle)\b", c):
                src = ", ".join(dict.fromkeys(
                    ref.strip().rsplit("/", 1)[-1] for ref in c.split(",") if ref.strip()))[:120]
            else:
                keep.append(c)

        gloss = " · ".join(c for c in keep if c and c not in {"—", "-", "–"})
        gloss = re.sub(r"\s+", " ", gloss)
        # A definition can also end in `→ path` like any other claim. Pulling the
        # citation off before the length cap is the point: truncating first sliced the
        # path in half and left the term looking unsourced.
        gloss, tail = compact_cites(gloss)
        src = src or tail
        gloss = gloss[:260]
        if term and gloss:
            row = {"c": f"{term} — {gloss}"}
            if src:
                row["s"] = src
            rows.append(row)
    return rows[:MAX_TERMS]


def main():
    arts = []
    for f in sorted(REEF.glob("artifacts/*/*.md")):
        text = f.read_text(encoding="utf-8")
        fm, body = frontmatter(text)
        aid = fm.get("id")
        if not aid:
            continue
        unk = fm.get("known_unknowns") or []
        facts = key_facts(body) or glossary_terms(body)
        arts.append({
            "id": aid,
            "type": fm.get("type", ""),
            "title": fm.get("title", ""),
            "status": fm.get("status", ""),
            "verified": fm.get("last_verified", ""),
            "facts": facts,
            "unknowns": [u[:MAX_UNKNOWN_LEN] for u in (unk if isinstance(unk, list) else [])][:MAX_UNKNOWNS],
        })

    chars = sum(len(json.dumps(a, ensure_ascii=False)) for a in arts)
    digest = {
        "_note": "Generated by tools/build-digest.py from sellflow-reef. Do not edit by hand.",
        "reef": "sellflow-reef",
        "artifacts": len(arts),
        "facts": sum(len(a["facts"]) for a in arts),
        # How many claims name the file they came from. The page quotes this rather
        # than a rounder claim, because "every claim is cited" is not quite true: a
        # handful rest on a grep returning nothing, or map one domain's term onto
        # another's, and neither points at a single file.
        "facts_sourced": sum(1 for a in arts for f in a["facts"] if f.get("s")),
        "approx_tokens": round(chars / 3.2),
        "items": arts,
    }
    OUT.write_text(json.dumps(digest, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(arts)} artifacts · {digest['facts']} key facts "
          f"({digest['facts_sourced']} with a source file) · "
          f"{sum(len(a['unknowns']) for a in arts)} unknowns")
    print(f"{chars:,} chars ≈ {digest['approx_tokens']:,} tokens → {OUT}")
    empty = [a["id"] for a in arts if not a["facts"]]
    if empty:
        print(f"WARNING: no Key Facts parsed for {len(empty)}: {', '.join(empty[:6])}", file=sys.stderr)


if __name__ == "__main__":
    main()
