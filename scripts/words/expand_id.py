"""Expand the hunspell-id dictionary (root words + affix rules) into plain words.

Usage: python3 -I expand_id.py id_ID.dic id_ID.aff extra_words.txt > words.txt
Leaves out proper nouns, the -lah/-kah/-nya/-ku/-mu particle endings, and the loose
prefix+suffix combos (me-...-an) that are mostly not real words.
"""
import re, sys

dic, aff, extra = sys.argv[1:4]
CIRC, NEED = "A1", "A2"
SKIP_FLAGS = {"n0", "nl", "o0", "l0"}  # particles / enclitics only
PARTICLE = re.compile(r"(lah|kah|ku|mu|nya)$")

def flags(s):
    return [s[i:i + 2] for i in range(0, len(s), 2)]

rules = {}  # flag -> (kind, cross, [(strip, add, cont, cond_regex)])
lines = open(aff, encoding="latin-1").read().splitlines()
i = 0
while i < len(lines):
    p = lines[i].split()
    if len(p) >= 4 and p[0] in ("PFX", "SFX") and p[2] in "YN" and p[3].isdigit():
        kind, flag, cross, n = p[0], p[1], p[2] == "Y", int(p[3])
        ents = []
        for j in range(n):
            q = lines[i + 1 + j].split()
            strip = "" if q[2] == "0" else q[2]
            add, _, cont = q[3].partition("/")
            add = "" if add == "0" else add
            cond = q[4] if len(q) > 4 and not q[4].startswith("#") else "."
            cond = cond.replace("^", "", 0)
            # hunspell writes "not l and not r" as [^l^r]
            cond = re.sub(r"\[\^([^\]]*)\]", lambda m: "[^" + m.group(1).replace("^", "") + "]", cond)
            rx = re.compile(("^" + cond) if kind == "PFX" else (cond + "$"))
            ents.append((strip, add, set(flags(cont)), rx))
        rules[flag] = (kind, cross, ents)
        i += n + 1
    else:
        i += 1

# Particle-only entries of a0/i0 (e.g. -anlah, -annya) are dropped.
for f, (kind, cross, ents) in rules.items():
    if kind == "SFX":
        rules[f] = (kind, cross, [e for e in ents if not (PARTICLE.search(e[1]) and e[1] not in ("an", "i", "kan"))])

def apply(kind, w, e):
    strip, add, cont, rx = e
    if not rx.search(w):
        return None
    if kind == "PFX":
        if strip and not w.startswith(strip):
            return None
        return add + w[len(strip):]
    if strip and not w.endswith(strip):
        return None
    return w[: len(w) - len(strip)] + add

out = set()
def keep(w):
    w = w.replace("-", "")
    if re.fullmatch(r"[a-z]{3,}", w) and re.search("[aeiou]", w):
        out.add(w)

for raw in open(dic, encoding="utf-8").read().splitlines()[1:]:
    stem, _, fl = raw.strip().partition("/")
    if not re.fullmatch(r"[a-z]+(-[a-z]+)*", stem):  # skips affixes like "ber-" and "-an"
        continue
    F = set(flags(fl)) - SKIP_FLAGS
    if NEED not in F:
        keep(stem)
    pfx = [f for f in F if f in rules and rules[f][0] == "PFX"]
    sfx = [f for f in F if f in rules and rules[f][0] == "SFX"]
    # Prefix only
    for f in pfx:
        for e in rules[f][2]:
            w = apply("PFX", stem, e)
            if w and CIRC not in e[2] and NEED not in e[2]:
                keep(w)
    # Suffix, then an optional prefix (from the suffix's own flags or cross-product)
    for f in sfx:
        ents = rules[f][2]
        for e in ents:
            w = apply("SFX", stem, e)
            if not w:
                continue
            circ = CIRC in e[2]
            if not circ and NEED not in e[2]:
                keep(w)
            # Second suffix (twofold), only plain ones
            for f2 in e[2] - SKIP_FLAGS:
                if f2 in rules and rules[f2][0] == "SFX":
                    for e2 in rules[f2][2]:
                        w2 = apply("SFX", w, e2)
                        if w2 and not circ and CIRC not in e2[2] and NEED not in e2[2]:
                            keep(w2)
            cands = [p for p in e[2] if p in rules and rules[p][0] == "PFX"]
            # No cross-product: me-...-an and di-...-an forms are mostly not real words,
            # and the real confixes (ber-an, ke-an, pe-an) are coded with CIRCUMFIX.
            for pf in set(cands):
                for pe in rules[pf][2]:
                    if (CIRC in pe[2]) != circ:
                        continue  # circumfix parts must come together
                    w3 = apply("PFX", w, pe)
                    if w3:
                        keep(w3)

for w in open(extra).read().split():
    keep(w)
print(" ".join(sorted(out)))
