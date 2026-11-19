#!/bin/sh
# Makes full-document copies of the prototype pages for opening locally (the artifact host adds this skeleton itself).
cd "$(dirname "$0")"
for f in index signup; do
  [ -f "$f.html" ] || continue
  { printf '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>\n'; cat "$f.html"; printf '\n</body></html>\n'; } > "$f.local.html"
done
