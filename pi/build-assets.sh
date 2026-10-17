#!/bin/sh
# Pre-render the snow transition clips (snow.gif + logo + snow.mp3) with ffmpeg,
# and the 1080p CRT overlay (other screen sizes are rendered by the player on first run).
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
ASSETS="$ROOT/public/assets"
OUT="$ROOT/pi/cache"
mkdir -p "$OUT"

DURATION=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$ASSETS/snow.mp3")

for variant in color white; do
    logo="$ASSETS/logo.png"
    [ "$variant" = white ] && logo="$ASSETS/logo-white.png"
    echo "Rendering snow-$variant.mp4"
    # 720p, snow scaled to cover, logo at 30vmin, audio at 30% like the browser version
    ffmpeg -nostdin -v error -y \
        -ignore_loop 0 -i "$ASSETS/snow.gif" -i "$logo" -i "$ASSETS/snow.mp3" \
        -filter_complex "[0:v]fps=25,scale=1280:1280,crop=1280:720[bg];[1:v]scale=-1:216[logo];[bg][logo]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v];[2:a]volume=0.3[a]" \
        -map "[v]" -map "[a]" -t "$DURATION" \
        -c:v libx264 -preset veryfast -crf 23 -g 25 -c:a aac -b:a 128k -movflags +faststart \
        "$OUT/snow-$variant.mp4"
done

echo "Rendering crt-1920x1080.bgra"
python3 "$ROOT/pi/build-crt.py" 1920 1080 "$OUT/crt-1920x1080.bgra"
