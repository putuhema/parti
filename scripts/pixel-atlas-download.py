"""Download the matched sprites (one row each through the dataset viewer API) into OUT_DIR/<group>/<term>-<idx>.png
and write OUT_DIR/manifest.json. Checks each row's caption against the search result."""
import json
import os
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

MATCHES, OUT = sys.argv[1], sys.argv[2]
API = "https://datasets-server.huggingface.co/rows?dataset=Angais/pixel-art-atlas-1.4m&config=default&split=train&offset={}&length=1"
slug = lambda s: re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def get(url, tries=4):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "raja-silat-asset-pull"}), timeout=30) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            if i == tries - 1:
                raise
            time.sleep(1.5 * (i + 1))


def fetch(m):
    row = json.loads(get(API.format(m["idx"])))["rows"][0]["row"]
    ok = row["caption"] == m["caption"]
    png = get(row["image"]["src"])
    if not png.startswith(b"\x89PNG"):
        raise ValueError("not a PNG")
    rel = f"{slug(m['group'])}/{slug(m['term'])}-{m['idx']}.png"
    os.makedirs(os.path.join(OUT, os.path.dirname(rel)), exist_ok=True)
    with open(os.path.join(OUT, rel), "wb") as f:
        f.write(png)
    return {**m, "file": rel, "row_id": row["row_id"], "caption_checked": ok, "bytes": len(png)}


matches = json.load(open(MATCHES))
WORKERS = int(os.environ.get("WORKERS", "6"))
PAUSE = float(os.environ.get("PAUSE", "0"))
# Resume: keep what's already downloaded, only fetch the rest.
prev = {}
if os.path.exists(os.path.join(OUT, "manifest.json")):
    prev = {r["idx"]: r for r in json.load(open(os.path.join(OUT, "manifest.json")))["sprites"]}


def _safe(m):
    if m["idx"] in prev:
        return prev[m["idx"]]
    try:
        r = fetch(m)
        time.sleep(PAUSE)
        return r
    except Exception as e:  # noqa: BLE001
        time.sleep(PAUSE * 4)
        return {**m, "error": str(e)}


with ThreadPoolExecutor(WORKERS) as ex:
    results = list(ex.map(_safe, matches))
done = [r for r in results if "error" not in r]
failed = [r for r in results if "error" in r]
json.dump({
    "source": "https://huggingface.co/datasets/Angais/pixel-art-atlas-1.4m",
    "licence": "CC0 1.0 (dataset), AI-generated with Krea 2 Turbo: Krea 2 Community License s2.3 allows commercial use only under USD 1M yearly company revenue; disclose AI-generated content where platforms require it.",
    "sprites": done,
}, open(os.path.join(OUT, "manifest.json"), "w"), indent=1)
print("downloaded", len(done), "failed", len(failed), "caption mismatches", sum(not r["caption_checked"] for r in done), "bytes", sum(r["bytes"] for r in done))
for r in failed[:5]:
    print("FAILED", r["term"], r["idx"], r["error"])
