#!/usr/bin/env bash
# Rebuilds the word lists in convex/lib/words/. Needs curl, python3 and dpkg-deb.
#   en.ts       = Webster's 2nd (web2, 3-10 letters) + SCOWL 50 US/UK (3-12 letters)
#   enCommon.ts = SCOWL 35 (example words for Letter Pair)
#   id.ts       = hunspell-id roots expanded with its affix rules + idCommon.ts
# idCommon.ts is hand-picked and edited by hand.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
out="$here/../../convex/lib/words"
tmp=$(mktemp -d)
cd "$tmp"

lib=https://raw.githubusercontent.com/LibreOffice/dictionaries/master/id
curl -sSfO "$lib/id_ID.dic"
curl -sSfO "$lib/id_ID.aff"
deb=http://archive.ubuntu.com/ubuntu/pool
for p in main/wamerican main/wbritish universe/wamerican-small; do
  name=${p#*/}
  curl -sSf -o "$name.deb" "$deb/${p%%/*}/s/scowl/${name}_2020.12.07-2_all.deb"
  dpkg-deb -x "$name.deb" "x_$name"
done
words() { grep -hxE "[a-z]{3,$1}" "${@:2}" | sort -u; }

# Webster's 2nd: the copy at /usr/share/dict/web2 (macOS/BSD), else the one already in en.ts.
if [ -f /usr/share/dict/web2 ]; then words 10 /usr/share/dict/web2 > web2.txt
else sed -n 's/^export const EN_WORDS = "\(.*\)";/\1/p' "$out/en.ts" | tr ' ' '\n' | words 10 - > web2.txt; fi
words 12 x_wamerican/usr/share/dict/american-english x_wbritish/usr/share/dict/british-english > scowl50.txt
words 12 x_wamerican-small/usr/share/dict/american-english-small > scowl35.txt
sed -n 's/^export const ID_COMMON = "\(.*\)";/\1/p' "$out/idCommon.ts" > id_common.txt

join() { tr '\n' ' ' | sed 's/ $//'; }
notice='//   SCOWL is Copyright 2000-2011 by Kevin Atkinson. Permission to use, copy, modify,
//   distribute and sell these word lists, the associated scripts, the output created
//   from the scripts, and its documentation for any purpose is hereby granted without
//   fee, provided that the above copyright notice appears in all copies and that both
//   that copyright notice and this permission notice appear in supporting documentation.
//   Kevin Atkinson makes no representations about the suitability of this array for any
//   purpose. It is provided "as is" without express or implied warranty.'
{
  echo "// English word list, 3-12 letters, lowercase. Built by scripts/words/build.sh from:"
  echo "// - Webster's 2nd International (public domain), 3-10 letters"
  echo "// - SCOWL size 50, US + UK spelling (adds plurals, past tenses and modern words)."
  echo "$notice"
  echo "export const EN_WORDS = \"$(sort -u web2.txt scowl50.txt | join)\";"
} > "$out/en.ts"
{
  echo "// Common English words (SCOWL size 35, Copyright 2000-2011 Kevin Atkinson, same notice as en.ts)."
  echo "// Used to pick friendly example words; the full list in en.ts decides what counts."
  echo "export const EN_COMMON = \"$(join < scowl35.txt)\";"
} > "$out/enCommon.ts"
{
  echo "// Indonesian word list, 3+ letters, lowercase, hyphens removed (kupu-kupu -> kupukupu)."
  echo "// Built by scripts/words/build.sh: root words from hunspell-id (as shipped in LibreOffice)"
  echo "// expanded with its affix rules (makan -> makanan, memakan, dimakan, pemakan, ...),"
  echo "// plus the hand-picked words in idCommon.ts. Particle endings (-lah, -kah, -nya, -ku, -mu)"
  echo "// are left out. hunspell-id: Copyright (C) 2004-2022 hunspell-id Authors, LGPL-3.0."
  echo "export const ID_WORDS = \"$(python3 -I "$here/expand_id.py" id_ID.dic id_ID.aff id_common.txt)\";"
} > "$out/id.ts"
rm -rf "$tmp"
echo "Done: $(wc -c < "$out/en.ts") bytes en, $(wc -c < "$out/id.ts") bytes id"
