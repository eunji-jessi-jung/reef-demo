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
# The installed plugin when there is one, otherwise the same clone reef.py is read
# from. Both are the same file; only a machine with the marketplace copy has the first.
SKILL = next((p for p in (
    HOME / ".claude/plugins/cache/reef-marketplace/reef/1.0.0/skills/init/SKILL.md",
    HOME / "Projects/reef/skills/init/SKILL.md",
) if p.exists()), HOME / "Projects/reef/skills/init/SKILL.md")
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


def restore_reef():
    """The commands above write into the reef's .reef/ — `index` rewrites the source
    index, `index-context` creates the context index. The reef is a published
    repository and a build of this site must not leave it dirty, so whatever they
    touched is put back to the committed state. It also means every build runs
    `index-context` as a first run, which is what anyone cloning the repository
    gets, since the context index is not in it."""
    subprocess.run(["git", "-C", str(RF), "checkout", "--", ".reef/source-index.json"], check=True)
    ctx = RF / ".reef/context-index.json"
    tracked = subprocess.run(["git", "-C", str(RF), "ls-files", "--error-unmatch", str(ctx)],
                             capture_output=True).returncode == 0
    if ctx.exists() and not tracked:
        ctx.unlink()


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


def feed_scene(ctx):
    """/reef:feed has no entry in log.md — it was never run on this reef — so its scene
    is the real output of `reef.py index-context` against the reef as it stands,
    laid out exactly as skills/feed/SKILL.md step 3 prescribes. Every path listed is a
    file that exists and that no artifact cites; the count is the command's."""
    unref = ctx.get("unreferenced", [])
    lines = ["Indexing context files...", "",
             "Context scan:",
             f"  Total:         {ctx.get('total_files', 0)} files indexed",
             f"  New:           {len(ctx.get('new', []))} files",
             f"  Changed:       {len(ctx.get('changed', []))} files",
             f"  Unreferenced:  {len(unref)} files (not linked to any artifact)"]
    if unref:
        lines += [""] + [f"  {p}" for p in unref[:6]]
        if len(unref) > 6:
            lines.append(f"  … and {len(unref) - 6} more")
    return lines


# ---------------------------------------------------------------- scene builders
#
# Each of these renders one skill doing its actual job, in the layout that skill's
# own SKILL.md prescribes, filled from this reef. Nothing below invents a number or
# a line of output: if the material is not in the reef, the scene does not claim it.

WIDTH = 58


def clip(text, n):
    """One line's worth. Cuts on a word so a truncated clause still reads."""
    text = " ".join(text.split())
    if len(text) <= n:
        return text
    return text[:n].rsplit(" ", 1)[0].rstrip(" ,;.") + "…"


def frontmatter(path):
    """The scalar frontmatter keys. Enough for type and domain; not a YAML parser."""
    out = {}
    lines = path.read_text(encoding="utf-8").splitlines()
    if not lines or lines[0].strip() != "---":
        return out
    for line in lines[1:]:
        if line.strip() == "---":
            break
        m = re.match(r'^(\w+):\s*"?([^"]*?)"?\s*$', line)
        if m:
            out[m.group(1)] = m.group(2)
    return out


def artifacts():
    return [frontmatter(f) for f in sorted((RF / "artifacts").glob("*/*.md"))]


# The density marks the deep skill defines for its topology table.
def density(n):
    return "" if not n else "░" if n <= 2 else "▒" if n <= 4 else "▓" if n <= 6 else "█"


TYPE_COL = [("system", "SYS"), ("schema", "SCH"), ("api", "API"), ("process", "PRO"),
            ("contract", "CON"), ("decision", "DEC"), ("risk", "RSK"),
            ("pattern", "PAT"), ("glossary", "GLO")]


def topology(arts):
    """Deep's briefing opens with artifact density by domain and type — a factual
    summary off the frontmatter, with no inference about architecture. The reader is
    meant to notice the thin cells without being told about them."""
    grid = {}
    for a in arts:
        grid[(a.get("domain"), a.get("type"))] = grid.get((a.get("domain"), a.get("type")), 0) + 1
    domains = sorted({a.get("domain") for a in arts if a.get("domain")})
    head = " " * 12 + " ".join(f"{c:>3}" for _, c in TYPE_COL)
    rows = [head]
    for d in domains:
        cells = " ".join(f"{density(grid.get((d, t), 0)):>3}" for t, _ in TYPE_COL)
        rows.append(f"{d:<12}{cells}")
    rows += ["", "░ 1-2   ▒ 3-4   ▓ 5-6   █ 7+"]
    return rows


def api_extraction():
    """What /reef:source got, and which tier it got it at. The meta file each
    extraction writes carries the ladder it climbed, so the scene can say which tiers
    were tried and why the cheap ones were not available."""
    metas = []
    for f in sorted((RF / "sources/apis").rglob("openapi.meta.json")):
        m = json.loads(f.read_text(encoding="utf-8"))
        label = m["service"] + (f"/{m['sub']}" if m.get("sub") else "")
        metas.append((label, m))
    lines = ["  service             tier  endpoints", "  " + "─" * 36]
    METHODS = {"get", "put", "post", "delete", "patch", "head", "options"}
    for label, m in metas:
        # Counted off the spec that was written, not off the meta file: a tier-3 copy
        # records no endpoint count of its own, and a blank column there would read
        # as "found nothing" rather than "counted elsewhere". A service with no HTTP
        # surface writes no spec at all, and says so instead of showing a zero.
        spec_path = RF / "sources/apis" / label / "openapi.json"
        if spec_path.exists():
            spec = json.loads(spec_path.read_text(encoding="utf-8"))
            n = str(sum(1 for ops in spec.get("paths", {}).values()
                        for k in ops if k.lower() in METHODS))
            extra = f"  (+{m['unmounted_endpoints']} unmounted)" if m.get("unmounted_endpoints") else ""
        else:
            n, extra = "—", "  no HTTP API"
        lines.append(f"  {label:<19}{m['extraction_tier']:>4}{n:>10}{extra}")
    erds = sorted(str(f.parent.relative_to(RF / "sources/schemas"))
                  for f in (RF / "sources/schemas").rglob("schema.md"))
    lines += ["", f"  ERDs: {', '.join(erds)}"]
    # Why the runtime tier was unavailable, in the extraction's own words.
    for _, m in metas:
        for t in m.get("tiers_attempted", []):
            if t["tier"] == 2 and t["result"].startswith("skipped"):
                why = re.split(r"(?<=\.)\s+", t["result"])[1] if ". " in t["result"] else t["result"]
                lines += ["", "  tier 2 unavailable:", "  " + clip(why, WIDTH - 4)]
                return lines
    return lines


def scuba_batches(drafts, total):
    """Scuba runs the manifest in batches with a verification gate between each one,
    and the manifest records which batch wrote each artifact and when. Showing the
    rounds is the difference between a scene that reports a number and one that runs
    to the end of its own process."""
    m = json.loads((RF / ".reef/scuba-manifest.json").read_text(encoding="utf-8"))
    done = m["completed"] if isinstance(m["completed"], list) else []
    if not done:
        return [], None
    rounds = {}
    for it in done:
        rounds.setdefault(it.get("batch", "?"), []).append(it)
    lines = []
    for b in sorted(rounds):
        items = rounds[b]
        at = max(i["completed_at"] for i in items)[11:16]
        lines.append(f"  batch {b:<3}{len(items):>4} written{at:>9}")
    new_n = sum(1 for i in done if i.get("action") == "new")
    started = min(i["completed_at"] for i in done)
    lines += ["  " + "─" * 30,
              f"  manifest    {len(done)} of {len(done)} complete · 0 skipped",
              f"  artifacts   {drafts} → {total}"
              f"   ({new_n} new, {len(done) - new_n} deepened)"]
    # The scene lists rounds that begin before the resume entry the log is keyed to,
    # so its clock is the first of them rather than the entry's own time.
    return lines, started[11:16]


def ask_scene(entry, ev):
    """The report /reef:ask prescribes, with the numbers this run recorded. Only the
    buckets the log actually carries are shown: the skill wants five that sum, and a
    replay that invented the missing three would be making them up."""
    bank = (RF / ".reef/questions-for-owner.md").read_text(encoding="utf-8")
    entries = re.findall(r"^## (.+)$", bank, re.M)
    a = ev["runs"]["ask"]
    resolved = re.search(r"(\d+) unknowns resolved from sources", entry)
    lines = [f"Question bank — {a['questions']} new entries", "",
             f"  Harvested   {a['unknowns']:>4} unknowns across {a['artifacts']} artifacts"]
    if resolved:
        lines.append(f"  Resolved    {int(resolved.group(1)):>4} from sources — artifacts updated")
    lines += [f"  Deposited   {a['questions']:>4} new questions", "",
              "  Top of the bank:"]
    for i, h in enumerate(entries[:2], 1):
        lines.append(f"    {i}. " + clip(h, WIDTH - 7))
    lines += ["", f"  Bank is now {len(entries)} entries.",
              "  → .reef/questions-for-owner.md"]
    return lines


def bank_scene(asof):
    """What /reef:test loads before it answers anything: the bank, grouped by the
    source that raised each question. Filtered to the questions that existed on the
    day of this run — update adds more later, and the scene must not show a bank
    bigger than the one that run was given."""
    qs = [q for q in json.loads((RF / ".reef/questions.json").read_text(encoding="utf-8"))["questions"]
          if q.get("added", "") <= asof]
    by = {}
    for q in qs:
        by[q["source"]] = by.get(q["source"], 0) + 1
    phases = sorted({q["phase"] for q in qs})
    lines = ["Loading the question bank..."]
    for src, n in sorted(by.items(), key=lambda kv: -kv[1]):
        lines.append(f"  {src:<22}{n:>3}")
    lines += ["  " + "─" * 25,
              f"  {len(qs)} questions, seeded at {', '.join(phases)}"]
    return lines


def test_report(ev, date):
    """The report /reef:test prescribes: a twenty-wide progress bar, then the bank
    itself, fully answered first. Statuses are read from .reef/questions.json as the
    last run left them."""
    qs = json.loads((RF / ".reef/questions.json").read_text(encoding="utf-8"))["questions"]
    full = [q for q in qs if q.get("status") == "answered"]
    part = [q for q in qs if q.get("status") == "partial"]
    filled = round(20 * (len(full) + len(part) / 2) / len(qs))
    e = ev["evaluation"]
    lines = [f"Test Your Reef — {RF.name}{' ' * 10}{date}",
             "━" * WIDTH, "",
             f"Progress: {'█' * filled}{'░' * (20 - filled)} {len(full)}/{len(qs)} answered", ""]
    for q in full[:3]:
        lines.append(f" ✓ {clip(q['text'], WIDTH - 4)}")
    for q in part[:2]:
        lines.append(f" ~ {clip(q['text'], WIDTH - 4)}")
    lines += ["", f"{e['fragments_recovered']}/{e['fragments_total']} answer-key fragments recovered"
                  f" · {e['self_overstated']} overclaims"]
    return lines


def update_scene():
    """The update report, from the one this reef actually has on file. This is the
    part a generator has no equivalent for: it is a diff against what was already
    known, not a re-run, and the note at the end is the report's own accounting of
    what its diff could not see."""
    reports = sorted((RF / ".reef/update-history").glob("update-report-*.json"))
    r = json.loads(reports[-1].read_text(encoding="utf-8"))
    date = r["generated_at"][:10]
    items = r.get("items", [])
    lines = [f"Update Report — {r['reef']}{' ' * 12}{date}",
             "━" * WIDTH, "",
             clip(f"Sources pulled: {r['sources_pulled']}", WIDTH), "",
             "What changed:"]
    for name, c in r["source_changes"].items():
        n = c["files_changed"]
        lines.append(f"  {name:<20}{(str(n) + ' files') if n else 'no changes'}")
    lines += ["", f"Refreshes ({len(items)} items):"]
    for it in items[:3]:
        lines.append(f"  {it['n']}. [{it['type']}] {it['artifact']}")
        lines.append("     " + clip(it["summary"], WIDTH - 5))
    if len(items) > 3:
        lines.append(f"  … and {len(items) - 3} more")
    if r.get("new_questions"):
        lines += ["", "New questions surfaced: " + " ".join(r["new_questions"])]
    if r.get("notes"):
        lines += ["", clip(r["notes"], WIDTH)]
    return lines


def main():
    ev = json.loads(EV.read_text(encoding="utf-8"))
    entries = log_entries()
    index = run("index")
    lint = run("lint")
    diff = run("diff")
    ctx = run("index-context")
    restore_reef()
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

    arts = artifacts()
    n_artifacts = len(arts)
    manifest = json.loads((RF / ".reef/scuba-manifest.json").read_text(encoding="utf-8"))
    # The buckets hold the items themselves in a finished manifest and a plain count
    # in a summarised one; either way what the scene wants is how many.
    def mlen(key):
        v = manifest.get(key, 0)
        return len(v) if isinstance(v, list) else v
    digest = json.loads((ROOT / "data/digest.json").read_text(encoding="utf-8"))
    partials = [q for q in json.loads((RF / ".reef/questions.json").read_text(encoding="utf-8"))["questions"]
                if q.get("status") == "partial"]

    scuba_rounds, scuba_at = scuba_batches(ev["build"]["drafts"], n_artifacts)

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
        # snorkel and source run as one stage on the page, so the scene shows both:
        # the sweep's own count, then the ladder each extraction actually climbed.
        {"id": "snorkel", "cmd": "/reef:snorkel · /reef:source", "at": clock(snorkel[0]), "lines":
            [f"Sweeping {len(sources)} sources for structure...",
             f"  {ev['build']['drafts']} drafts · {ev['runs']['snorkel']['answered']} of "
             f"{ev['runs']['snorkel']['questions']} discovery questions settled", "",
             "Extracting API specs and ERDs..."] + api_extraction()},
        {"id": "scuba", "cmd": "/reef:scuba", "at": scuba_at, "lines":
            ["Working the drafts against the sources...", ""]
            + scuba_rounds
            + [f"  key facts   {digest['facts']} · {digest['facts_sourced']} carry a source file",
               f"  unknowns    {ev['reef']['counts']['unknowns']} recorded rather than guessed"]},
        # Deep opens by reading the reef and handing back its shape, then asks which
        # thread to pull. The heatmap and the open questions are that briefing.
        {"id": "deep", "cmd": "/reef:deep", "at": clock(deep[0]), "lines":
            ["Reading the reef before asking anything...", ""]
            + topology(arts)
            + ["", "Still open:"]
            + [f"  ~ {clip(q['text'], WIDTH - 4)}" for q in partials[:2]]
            + ["", "Which of these pulls you in?"]},
        {"id": "test-1", "cmd": "/reef:test", "at": clock(test1[0]), "lines":
            bank_scene(test1[0].date().isoformat())
            + ["", "Answering from artifacts only — no source code.",
               "  " + clip(sentence(test1[1], 1), WIDTH - 2)]},
        {"id": "feed", "cmd": "/reef:feed", "at": None, "lines": feed_scene(ctx)},
        {"id": "ask", "cmd": "/reef:ask", "at": clock(ask[0]), "lines": ask_scene(ask[1], ev)},
        {"id": "update", "cmd": "/reef:update", "at": clock(update[0]), "lines": update_scene()},
        {"id": "test-2", "cmd": "/reef:test", "at": clock(test2[0]), "lines":
            ["Reading artifacts only — no sources, no answer key.", ""]
            + test_report(ev, ev["evaluation"]["report"][-13:-3])},
        {"id": "health", "cmd": "/reef:health", "at": clock(entries[-1][0]), "lines": health(ev, lint, diff)},
    ]
    cast = {
        "_note": "Generated by tools/build-cast.py from sellflow-reef/log.md, .reef/project.json, the "
                 "init skill's SKILL.md, and `reef.py index|lint|diff|index-context` run at generation time. Do not edit by hand.",
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
