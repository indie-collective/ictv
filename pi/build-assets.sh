#!/bin/sh
# Pre-render the snow videos and the 1080p CRT overlay (other screen sizes are rendered by the player on first run).
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT="$ROOT/pi/cache"
mkdir -p "$OUT"

echo "Rendering crt-1920x1080.bgra"
python3 "$ROOT/pi/build-crt.py" 1920 1080 "$OUT/crt-1920x1080.bgra"

for variant in color white; do
    echo "Rendering snow-$variant.mp4"
    "$ROOT/pi/build-snow.sh" "$variant" "$OUT/snow-$variant.mp4"
done

echo "Rendering testcard.png / testcard.mp4"
"$ROOT/pi/build-testcard.sh" "$OUT/testcard.png" "$OUT/testcard.mp4"
