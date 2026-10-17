#!/bin/sh
# Optional: re-encode videos/ into videos-pi/ as Pi-friendly H.264 (<=1080p30, keyframe
# every 2s so random seeks are fast). Much quicker on a PC; copy videos-pi/ over afterwards.
#   HEIGHT=720 PRESET=medium pi/transcode.sh
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
HEIGHT=${HEIGHT:-1080}
PRESET=${PRESET:-veryfast}
mkdir -p "$ROOT/videos-pi"

for src in "$ROOT"/videos/*.mp4; do
    out="$ROOT/videos-pi/$(basename "$src")"
    [ -s "$out" ] && continue
    echo "Transcoding $(basename "$src")"
    ffmpeg -nostdin -v error -stats -y -i "$src" \
        -vf "scale=-2:'min(ih,$HEIGHT)',fps=30" \
        -c:v libx264 -preset "$PRESET" -crf 22 -profile:v high -level 4.1 -pix_fmt yuv420p -g 60 \
        -c:a aac -b:a 128k -movflags +faststart \
        "$out.tmp.mp4" && mv "$out.tmp.mp4" "$out"
done
