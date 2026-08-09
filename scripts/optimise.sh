#!/usr/bin/env bash
# Convert source photos (HEIC/JPG/PNG) into web-ready JPEGs in photos/.
# Originals live outside the repo — they're ~100MB and don't belong in git.
#
#   ./scripts/optimise.sh ["/path/to/source folder"]
#
# Uses sips, which ships with macOS, so there's nothing to install.

set -euo pipefail

SRC="${1:-$HOME/Desktop/personal gallery}"
OUT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/photos"

MAX=1100   # longest edge, px — plenty for the sizes we render at
Q=68       # jpeg quality

if [ ! -d "$SRC" ]; then
  echo "source folder not found: $SRC" >&2
  exit 1
fi

mkdir -p "$OUT"
shopt -s nullglob nocaseglob

count=0
for f in "$SRC"/*.heic "$SRC"/*.jpg "$SRC"/*.jpeg "$SRC"/*.png; do
  base=$(basename "$f")
  slug=$(echo "${base%.*}" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
  sips -s format jpeg -s formatOptions "$Q" -Z "$MAX" "$f" --out "$OUT/$slug.jpg" >/dev/null 2>&1
  count=$((count + 1))
done

echo "converted $count photos -> $OUT"
du -sh "$OUT"
