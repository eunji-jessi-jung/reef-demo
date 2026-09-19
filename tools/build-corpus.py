#!/usr/bin/env python3
"""Build data/corpus.json — the sellflow sources, as an agent without a reef sees them.

This is the control arm of the demo's comparison, so its only job is to be fair. What
goes in is decided by one rule, and the rule is printed into the output:

    everything in the fixture repository, and nothing from the reef repository.

The fixture repository IS the company: five code repositories under repos/ and the
document tree under sources/ — the wiki export, the published OpenAPI spec, Slack
history, mail, minutes, a handover, an incident postmortem, tickets, sprint records,
the service registry, business rules, an org chart, both versions of the procedure
document, the archived 2024 draft, and the queue export.

Nothing is read from sellflow-reef, and that is the point. Its artifacts/ is the reef
itself; its sources/apis/ and sources/schemas/ hold specs and ER models that
/reef:source extracted from the code; its sources/infra/ holds runtime notes the same
pass wrote by reading the code, complete with the reef's own judgements ("Unverified",
"the two disagree"). Handing any of those to the control arm would be handing it part
of the reef, and an earlier version of this script did exactly that.

The two spreadsheets are binary, so neither arm can read them directly. The fixture
ships a verbatim text rendering of each beside the original, and that rendering is
included here — converting a spreadsheet to text is file handling, not the reef's
insight, so withholding it would tilt the comparison the other way.

The exclusion list ships inside corpus.json so a judge can check the arm was not
rigged in either direction.
"""

import json, os, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEMO = HERE.parent
FIXTURE = DEMO.parent / "sellflow"
CODE_ROOT = FIXTURE / "repos"
DOCS_ROOT = FIXTURE / "sources"

SKIP_DIR = {".git", "node_modules", "target", "build", "dist", "__pycache__",
            ".venv", "venv", ".gradle", ".idea"}
TEXT_EXT = {".java", ".py", ".ts", ".js", ".json", ".yaml", ".yml", ".xml", ".sql",
            ".md", ".properties", ".gradle", ".html", ".csv", ".eml", ".txt",
            ".toml", ".cfg", ".sh", ".conf"}

EXCLUDED = [
    "sellflow-reef/artifacts/**        — the reef itself, all 80 artifacts",
    "sellflow-reef/sources/apis/**     — OpenAPI specs /reef:source extracted from the code",
    "sellflow-reef/sources/schemas/**  — ER models /reef:source extracted from the ORMs",
    "sellflow-reef/sources/infra/**    — runtime notes the same pass wrote by reading the code",
    "sellflow-reef/CLAUDE.md, index.md, log.md — the reef's navigation and run log",
    "sellflow-reef/ANSWER-KEY.md       — the fixture's answer key",
    "*.xlsx                            — binary; the verbatim .md rendering beside it is included",
]


def collect(root: Path, prefix_of):
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIR)
        for name in sorted(filenames):
            path = Path(dirpath) / name
            if path.suffix.lower() not in TEXT_EXT:
                continue
            try:
                text = path.read_text(encoding="utf-8")
            except (UnicodeDecodeError, OSError):
                continue
            out.append({"path": prefix_of(path), "text": text})
    return out


def main() -> int:
    if not CODE_ROOT.is_dir() or not DOCS_ROOT.is_dir():
        print(f"error: the fixture is not beside this repository ({FIXTURE})", file=sys.stderr)
        return 1

    files = []
    # Code cites as <repo>:<path>, matching the reef's own citation form.
    for repo in sorted(p for p in CODE_ROOT.iterdir() if p.is_dir()):
        files += collect(repo, lambda p, r=repo: f"{r.name}:{p.relative_to(r).as_posix()}")
    # Documents cite as sellflow-docs:<path>, likewise.
    files += collect(DOCS_ROOT, lambda p: f"sellflow-docs:{p.relative_to(DOCS_ROOT).as_posix()}")

    chars = sum(len(f["text"]) for f in files)
    corpus = {
        "_note": ("The sellflow sources as an agent without a reef sees them: the whole fixture "
                  "repository, and nothing from the reef. Rebuild: python3 tools/build-corpus.py"),
        "rule": "include everything in the fixture repository; include nothing from the reef repository",
        "excluded": EXCLUDED,
        "roots": ["sellflow/repos (5 repositories)", "sellflow/sources (the document tree)"],
        "files_n": len(files),
        "chars": chars,
        "files": files,
    }
    (DEMO / "data" / "corpus.json").write_text(
        json.dumps(corpus, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    # The browser gets paths only. The page lists what the no-reef arm was given, so a
    # judge can see the inventory without downloading 200 KB of it.
    groups = {}
    for f in files:
        groups.setdefault(f["path"].split(":")[0], []).append(f["path"].split(":", 1)[1])
    (DEMO / "data" / "sources-manifest.json").write_text(json.dumps({
        "_note": corpus["_note"],
        "rule": corpus["rule"],
        "excluded": EXCLUDED,
        "files_n": len(files),
        "chars": chars,
        "groups": [{"name": k, "n": len(v), "paths": sorted(v)} for k, v in sorted(groups.items())],
    }, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    print(f"corpus.json  {len(files)} files  {chars/1024:.0f} KB of text")
    for name in sorted(groups):
        print(f"    {name:20s} {len(groups[name]):4d} files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
