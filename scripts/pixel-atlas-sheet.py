"""Build index.html (a contact sheet) next to manifest.json: every sprite enlarged with crisp pixels, grouped.
Run: python3 scripts/pixel-atlas-sheet.py art/pixel-atlas"""
import base64
import html
import json
import os
import sys

DIR = sys.argv[1]
m = json.load(open(os.path.join(DIR, "manifest.json")))
def b64(rel):
    # Embedded, so the sheet works opened from anywhere (and shared as one file).
    return base64.b64encode(open(os.path.join(DIR, rel), "rb").read()).decode()


groups = {}
for s in m["sprites"]:
    groups.setdefault(s["group"], {}).setdefault(s["term"], []).append(s)

parts = []
for g, terms in groups.items():
    parts.append(f'<h2>{html.escape(g.title())}</h2>')
    for t, items in terms.items():
        cells = "".join(
            f'<figure title="{html.escape(s["caption"])} (#{s["idx"]})"><img src="data:image/png;base64,{b64(s["file"])}" alt="{html.escape(s["caption"])}">'
            f'<figcaption>{html.escape(s["caption"])}<br><small>#{s["idx"]}</small></figcaption></figure>'
            for s in items
        )
        parts.append(f'<section><h3>{html.escape(t)}</h3><div class="row">{cells}</div></section>')

page = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pixel Atlas Picks</title>
<style>
:root {{ --bg: #f7f0ea; --card: #fff; --ink: #3c3c3c; --soft: #8a7f94; --line: #e8d9cb; }}
@media (prefers-color-scheme: dark) {{ :root {{ --bg: #1d1a22; --card: #2a2631; --ink: #eee; --soft: #a99fb3; --line: #3a3442; }} }}
body {{ margin: 0; padding: 16px; background: var(--bg); color: var(--ink); font: 14px/1.4 system-ui, sans-serif; }}
h1 {{ margin: 0 0 4px; font-size: 22px; }}
.note {{ color: var(--soft); max-width: 70ch; }}
h2 {{ margin: 28px 0 6px; font-size: 18px; border-bottom: 2px solid var(--line); padding-bottom: 4px; }}
h3 {{ margin: 12px 0 6px; font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--soft); }}
.row {{ display: flex; flex-wrap: wrap; gap: 8px; }}
figure {{ margin: 0; width: 104px; padding: 8px; background: var(--card); border-radius: 12px; border: 1px solid var(--line); text-align: center; }}
img {{ width: 80px; height: 80px; image-rendering: pixelated; background: repeating-conic-gradient(#0000000d 0 25%, transparent 0 50%) 0 0 / 10px 10px; border-radius: 6px; }}
figcaption {{ font-size: 11px; color: var(--soft); margin-top: 4px; overflow-wrap: anywhere; }}
</style></head><body>
<h1>Pixel Atlas picks for Raja Silat</h1>
<p class="note">{len(m["sprites"])} sprites (16&times;16, shown 5&times;) from <a href="{m["source"]}">Angais/pixel-art-atlas-1.4m</a>.
Licence: {html.escape(m["licence"])} The # number is the sprite's row in the dataset.</p>
{"".join(parts)}
</body></html>"""
open(os.path.join(DIR, "index.html"), "w").write(page)
print("wrote", os.path.join(DIR, "index.html"), len(m["sprites"]), "sprites")
