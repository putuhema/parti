"""Find sprites in Angais/pixel-art-atlas-1.4m whose subject/caption match what Raja Silat needs.
Reads only the subject + caption columns of the remote Parquet files (no image data), then writes
matches.json: [{group, term, idx, subject, caption}] where idx is the row index in the train split."""
import json
import re
import sys

import duckdb

OUT = sys.argv[1]
SHARDS = [f"https://huggingface.co/datasets/Angais/pixel-art-atlas-1.4m/resolve/refs%2Fconvert%2Fparquet/default/train/{i:04d}.parquet" for i in range(15)]

# group -> term -> regex (matched against subject first, then caption)
WANT = {
    "prison objects": {
        "key": r"\bkeys?\b", "chain": r"\bchains?\b", "shackle": r"\b(manacles?|handcuffs?|leg irons?|ball and chain)\b",
        "padlock": r"\bpadlocks?\b", "crate": r"\b(crates?|wooden box)\b", "barrel": r"\bbarrels?\b",
        "boulder": r"\b(boulders?|rock)\b", "firecracker": r"\b(firecrackers?|dynamite)\b", "gong": r"\bgongs?\b",
        "drum": r"\bdrums?\b", "coin": r"\bcoins?\b", "torch": r"\btorch(es)?\b", "lantern": r"\blanterns?\b",
        "bell": r"\bbells?\b", "bucket": r"\bbuckets?\b", "hay": r"\b(hay|straw)\b", "cage": r"\b(cage|prison bars|jail)\b",
    },
    "weapons": {
        "keris": r"\b(keris|kris)\b", "dagger": r"\bdaggers?\b", "knife": r"\bknife\b", "sword": r"\bswords?\b",
        "whip": r"\bwhips?\b", "staff": r"\b(bo staff|quarterstaff|wooden staff|bamboo staff|bamboo pole|walking stick)\b",
    },
    "pusaka (relics)": {
        "scarf": r"\b(scarf|shawl|sash)\b", "cap": r"\b(fez|skullcap|songkok|kufi|peci)\b", "bracelet": r"\b(bracelet|bangle)\b",
        "coffee": r"\bcoffee\b", "prayer beads": r"^(?!.*(goblin|orc|shaman|herbalist|view)).*\b(rosary|prayer beads|mala|bead necklace|beaded bracelet)\b", "sandal": r"\b(sandals?|flip ?flops?)\b",
        "gem ring": r"^(?!.*(campfire|marker|arm ring|target|onion|ring toss)).*\brings?\b", "herbal potion": r"\b(herbal|tonic|elixir)\b", "cloth": r"\b(cloth|fabric|textile)\b",
        "flaming blade": r"\b(flaming|fire) (sword|dagger|blade)\b",
    },
    "icons": {
        "dice": r"\b(dice|die)\b", "shield": r"\bshields?\b", "heart": r"\bhearts?\b", "hourglass": r"\bhourglass\b",
        "crown": r"\bcrowns?\b", "skull": r"\bskulls?\b", "scroll": r"\bscrolls?\b", "potion": r"\bpotions?\b",
        "campfire": r"\b(campfire|bonfire)\b", "bag": r"\b(bag|pouch|sack)\b", "chest": r"\btreasure chest\b",
        "question": r"\bquestion\b", "star": r"\bstars?\b", "boot": r"\bboots?\b", "fist": r"\bboxing gloves?\b",
        "gold pile": r"\bgold (pile|coins)\b", "card": r"\b(playing card|tarot card)\b",
    },
    "chess": {
        "pawn": r"\bchess pawn\b", "knight": r"\bchess knight\b", "rook": r"\bchess rook\b", "bishop": r"\bchess bishop\b",
        "queen": r"\bchess queen\b", "king": r"\bchess king\b", "chess board": r"\bchess ?board\b",
    },
}
PER_TERM = 8

con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs;")
rows = con.execute(
    f"SELECT filename, file_row_number, subject, caption FROM read_parquet({SHARDS!r}, filename=true, file_row_number=true)"
).fetchall()
# Global row index = rows in earlier shards + row number in this shard.
counts = {}
for fn, _, _, _ in rows:
    counts[fn] = counts.get(fn, 0) + 1
offset, start = 0, {}
for fn in SHARDS:
    start[fn] = offset
    offset += counts.get(fn, 0)
print("rows read:", len(rows), "total:", offset, file=sys.stderr)

out, used = [], set()
for group, terms in WANT.items():
    for term, pat in terms.items():
        rx = re.compile(pat, re.I)
        by_subject, by_caption = [], []
        for fn, n, subj, cap in rows:
            idx = start[fn] + n
            if idx in used:
                continue
            if subj and rx.search(subj):
                by_subject.append((idx, subj, cap))
            elif cap and rx.search(cap):
                by_caption.append((idx, subj, cap))
            if len(by_subject) >= PER_TERM:
                break
        picks = (by_subject + by_caption)[:PER_TERM]
        for idx, subj, cap in picks:
            used.add(idx)
            out.append({"group": group, "term": term, "idx": idx, "subject": subj, "caption": cap})
        print(f"{group:16} {term:14} {len(picks)}", file=sys.stderr)

json.dump(out, open(OUT, "w"), indent=1)
print("matches:", len(out), file=sys.stderr)
