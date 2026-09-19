#!/usr/bin/env python3
"""Assemble the terminal replay the landing page plays, from real material only.

The site shows reef being used. It is not a screen recording of the session that
built sellflow-reef — that took eight hours of wall clock and called a model — and
the page says so. What it plays instead is a replay whose every line has a source:

  - the welcome block, verbatim from the init skill's SKILL.md
  - the codebases found, and the index counts, from `reef.py index` run right now
  - each milestone, verbatim from sellflow-reef/log.md, with its real timestamp
  - the closing health report, in the format the snorkel skill prescribes, filled
    from `reef.py lint` and `reef.py diff` run right now and the artifact counts
    the rest of the site already uses

Nothing is typed by hand. If the log or the repositories change, this changes.

    python3 tools/build-cast.py
"""
import json, pathlib, re, subprocess, sys
from datetime import datetime

HOME = pathlib.Path.home()
RF = HOME / "Projects/sellflow-reef"
REEF = HOME / "Projects/reef/scripts/reef.py"
SKILL = HOME / ".claude/plugins/cache/reef-marketplace/reef/1.0.0/skills/init/SKILL.md"
ROOT = pathlib.Path(__file__).resolve().parent.parent
EV = ROOT / "data/evidence.json"
OUT = ROOT / "data/cast.json"

for p in (RF, REEF, SKILL, EV):
    if not p.exists():
        sys.exit(f"missing: {p}")


def run(cmd):
    r = subprocess.run(["python3", str(REEF), cmd, "--reef", str(RF)], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(f"reef.py {cmd} failed:\n{r.stderr}")
    return json.loads(r.stdout)


def welcome():
    """The diagram the init skill prints first, exactly as the skill has it."""
    text = SKILL.read_text(encoding="utf-8")
    block = re.search(r"```\n(\s+~ ~ ~.*?)```", text, re.S).group(1)
    lines = [l.rstrip() for l in block.splitlines()]
    while lines and not lines[-1].strip():
        lines.pop()
    return lines


def log_entries():
    text = (RF / "log.md").read_text(encoding="utf-8")
    out = []
    for m in re.finditer(r"\*\*(\S+?)\*\* — (.+)", text):
        at = datetime.fromisoformat(m.group(1))
        out.append((at, m.group(2).strip()))
    return out


def clock(at):
    return at.strftime("%H:%M")


def first(entries, pattern):
    for at, text in entries:
        if re.search(pattern, text):
            return at, text
    sys.exit(f"log.md has no entry matching {pattern!r}")


def upto(text, marker):
    """The entry up to, not including, the first occurrence of marker. The marker is
    a clause boundary the entry itself draws — what follows it is cross-reference
    bookkeeping that belongs in the log, not on a screen."""
    i = text.find(marker)
    return text if i < 0 else text[:i].rstrip(" ;,")


def sentence(text, n=1):
    """The first n sentences of a log entry. The log is written for the record, and
    a milestone on screen needs the headline, not the bookkeeping after it. An entry
    of the form "found N problems; all corrected: <list>" keeps its verdict and drops
    the list."""
    m = re.match(r"^(.*?; all corrected)\b", text)
    if m:
        return m.group(1)
    parts = re.split(r"(?<=\.)\s+", text)
    return " ".join(parts[:n]).rstrip(".")


def bar(unchanged, total, width=8):
    fill = round(width * unchanged / total) if total else 0
    return "█" * fill + "░" * (width - fill)


def health(ev, lint, diff):
    """The report in the snorkel skill's own layout, from real lint and diff."""
    types = ev["reef"]["counts"]["by_type"]
    prefix = {"system": "SYS-", "schema": "SCH-", "api": "API-", "process": "PROC-",
              "decision": "DEC-", "glossary": "GLOSSARY-", "contract": "CON-",
              "risk": "RISK-", "pattern": "PAT-"}
    # diff counts snapshot entries, not files, so no file column here: the index
    # printed a file count a few scenes earlier and the two must not disagree.
    lines = [f"Reef Health — sellflow-reef{' ' * 23}{ev['build']['start'][:10]}",
             "━" * 58, "",
             "Sources              Freshness",
             "─" * 48]
    for name, d in diff["sources"].items():
        total = d["new"] + d["updated"] + d["deleted"] + d["unchanged"]
        status = "fresh" if d["updated"] + d["deleted"] == 0 else "aging"
        lines.append(f"{name:<20} {bar(d['unchanged'], total)} {status}")
    lines += ["", "Artifacts            Total", "─" * 48]
    for t, n in sorted(types.items(), key=lambda kv: -kv[1]):
        lines.append(f"{prefix[t]:<20} {n}")
    lines.append(f"{'all':<20} {ev['reef']['counts']['artifacts']}")
    errors, warnings = len(lint["errors"]), len(lint["warnings"])
    lines += ["", f"Issues: {errors} errors · {warnings} warnings"]
    return lines


def main():
    ev = json.loads(EV.read_text(encoding="utf-8"))
    entries = log_entries()
    index = run("index")
    lint = run("lint")
    diff = run("diff")
    sources = [s for s in index["sources"] if s != "sellflow-docs"]
    project = json.loads((RF / ".reef/project.json").read_text(encoding="utf-8"))
    name = project.get("name") or RF.name
    roots = {pathlib.Path(s["path"]).parent for s in project["sources"]
             if s["name"] != "sellflow-docs"}
    scan = sorted(roots)[0]
    try:
        scan = pathlib.Path("..") / scan.relative_to(RF.parent)
    except ValueError:
        pass

    snorkel = first(entries, r"^Snorkel pass")
    audit = first(entries, r"^Audit: ")
    scuba = first(entries, r"^Scuba Phase 1 resumed")
    deep = first(entries, r"^Deep: ")
    test1 = first(entries, r"^Test pass found")
    ask = first(entries, r"^Owner question bank")
    update = first(entries, r"^Update: ")
    test2 = first(entries, r"^Independent test pass")

    scenes = [
        {"id": "init", "cmd": "/reef:init", "at": clock(entries[0][0]), "lines":
            welcome() + ["",
            "? What should this reef be called?", f"> {name}", "",
            "? Where are the codebases I should scan?", f"> {scan}", "",
            f"I found {len(sources)} codebases:"]
            + [f"  {i + 1}. {s}" for i, s in enumerate(sources)]
            + ["> all", "", "Scaffolding the reef...", "Indexing source files..."]
            + [f"  {s:<20} {index['sources'][s]['files_indexed']:>3} files" for s in index["sources"]]},
        {"id": "snorkel", "cmd": "/reef:snorkel", "at": clock(snorkel[0]), "lines":
            [sentence(snorkel[1]), sentence(audit[1])]},
        {"id": "scuba", "cmd": "/reef:scuba", "at": clock(scuba[0]), "lines": [sentence(scuba[1])]},
        {"id": "deep", "cmd": "/reef:deep", "at": clock(deep[0]), "lines": [upto(deep[1], "; cross-linked")]},
        {"id": "test-1", "cmd": "/reef:test", "at": clock(test1[0]), "lines": [sentence(test1[1], 1)]},
        {"id": "ask", "cmd": "/reef:ask", "at": clock(ask[0]), "lines": [upto(ask[1], " (second pass")]},
        {"id": "update", "cmd": "/reef:update", "at": clock(update[0]), "lines": [sentence(update[1], 1)]},
        {"id": "test-2", "cmd": "/reef:test", "at": clock(test2[0]), "lines": [sentence(test2[1], 2)]},
        {"id": "health", "cmd": "/reef:health", "at": clock(entries[-1][0]), "lines": health(ev, lint, diff)},
    ]
    cast = {
        "_note": "Generated by tools/build-cast.py from sellflow-reef/log.md, .reef/project.json, the "
                 "init skill's SKILL.md, and `reef.py index|lint|diff` run at generation time. Do not edit by hand.",
        "generated": datetime.now().isoformat(timespec="minutes"),
        "session_date": ev["build"]["start"][:10],
        "scenes": scenes,
    }
    OUT.write_text(json.dumps(cast, ensure_ascii=False, indent=1), encoding="utf-8")
    n = sum(len(s["lines"]) for s in scenes)
    print(f"cast     {len(scenes)} scenes · {n} lines · {scenes[0]['at']} → {scenes[-1]['at']}")
    print(f"→ {OUT}")


if __name__ == "__main__":
    main()
