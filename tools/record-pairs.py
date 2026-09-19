#!/usr/bin/env python3
"""Record both arms' answers to the prepared questions, into data/qa.json.

Two reasons this exists.

1. The demo must not break. If the proxy is unreachable or its budget is spent, the
   comparison page falls back to these recorded runs and says so. Without them the
   page would have nothing to show.
2. The page quotes how much context each arm was given. That number should be measured,
   not estimated, so it is taken from the API's own usage report on a real call and
   written here with the date it was taken.

Nothing is edited by hand and nothing is selected. Every prepared question is asked in
both languages, on both arms, and whatever comes back is what gets stored — including a
weak answer, and including one that makes the reef look worse. Re-run it and the file
is overwritten from scratch.

    python3 tools/record-pairs.py [--endpoint URL] [--only q1,q2]
"""

import argparse, json, sys, time, urllib.error, urllib.request
from datetime import date
from pathlib import Path

DEMO = Path(__file__).resolve().parent.parent
QA = DEMO / "data" / "qa.json"
DEFAULT_ENDPOINT = "https://reef-demo-delta.vercel.app/api/chat"
ORIGIN = "http://localhost:4173"     # must be in the proxy's allowlist
ARMS = ("reef", "raw")
LANGS = ("ko", "en")
# The proxy allows 8 model calls per minute per address and each question is two, so
# one question every 16 seconds is the fastest this can honestly go.
PACE_S = 16
RETRY_WAIT_S = 65


def call(endpoint, question, retries=1):
    body = json.dumps({"question": question, "arms": list(ARMS)}).encode("utf-8")
    req = urllib.request.Request(endpoint, data=body, method="POST", headers={
        "content-type": "application/json", "origin": ORIGIN})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:300]
        # Being throttled is expected when recording sixteen answers in a row; waiting
        # out the window is correct, and raising the proxy's limit to suit this script
        # would not be.
        if e.code == 429 and "rate_limited" in detail and retries:
            print(f"    throttled; waiting {RETRY_WAIT_S}s", file=sys.stderr)
            time.sleep(RETRY_WAIT_S)
            return call(endpoint, question, retries - 1)
        return {"_http": e.code, "_body": detail}
    except Exception as e:                                   # noqa: BLE001
        return {"_error": repr(e)}


def context_tokens(usage):
    """What the arm was actually given, however it was billed."""
    return sum(usage.get(k) or 0 for k in
               ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    ap.add_argument("--only", help="comma-separated question ids")
    args = ap.parse_args()

    doc = json.loads(QA.read_text(encoding="utf-8"))
    items = doc["items"]
    if args.only:
        wanted = {s.strip() for s in args.only.split(",")}
        items = [it for it in items if it["id"] in wanted]

    measured = {arm: 0 for arm in ARMS}
    failures = []
    calls = 0

    for it in items:
        for lang in LANGS:
            question = it["q"][lang]
            data = call(args.endpoint, question)
            calls += 1
            if "arms" not in data:
                failures.append(f"{it['id']}/{lang}: {data}")
                print(f"  {it['id']}/{lang}  FAILED  {data}", file=sys.stderr)
                continue

            marks = []
            for arm in ARMS:
                res = data["arms"].get(arm) or {}
                if res.get("error") or not res.get("answer"):
                    failures.append(f"{it['id']}/{lang}/{arm}: {res.get('error')}")
                    marks.append(f"{arm}=fail")
                    continue
                key = "a" if arm == "reef" else "a_raw"
                cite = "cites" if arm == "reef" else "cites_raw"
                # Citations used to be one flat list per question; they are now per
                # language, because the two answers do not cite the same things.
                if not isinstance(it.get(cite), dict):
                    it[cite] = {}
                it.setdefault(key, {})[lang] = res["answer"]
                it[cite][lang] = res.get("cites", [])
                measured[arm] = max(measured[arm], context_tokens(res.get("usage") or {}))
                marks.append(f"{arm}={len(res['answer'])}c/{len(res.get('cites', []))}cites")
            print(f"  {it['id']}/{lang}  " + "  ".join(marks))
            time.sleep(PACE_S)

    doc["recorded"] = {
        "at": date.today().isoformat(),
        "endpoint": args.endpoint,
        "note": ("Answers as they came back, unedited and unselected. The reef arm holds the "
                 "artifacts; the raw arm holds the fixture repository. Regenerate with "
                 "tools/record-pairs.py."),
        "context_tokens": measured,
    }
    doc["_note"] = doc["recorded"]["note"]
    QA.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    print(f"\n{calls} calls · context measured: " +
          " · ".join(f"{a} {measured[a]:,}" for a in ARMS))
    if failures:
        print(f"{len(failures)} failure(s):", file=sys.stderr)
        for f in failures:
            print("  " + f, file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
