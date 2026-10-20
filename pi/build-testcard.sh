#!/bin/sh
# Render the PM5544-style test card with the logo in the middle (720p PNG):
#   build-testcard.sh <out.png> [out.mp4]   (the mp4 adds a looping 1 kHz beep)
set -eu

OUT=$1
W=1280 H=720
ROOT=$(cd "$(dirname "$0")/.." && pwd)
LOGO_H=$(( H / 4 ))

python3 "$ROOT/pi/build-testcard.py" $W $H | ffmpeg -nostdin -v error -y \
    -f image2pipe -c:v ppm -i - -i "$ROOT/public/assets/logo.png" \
    -filter_complex "[1:v]scale=-1:$LOGO_H[logo];[0:v][logo]overlay=(W-w)/2:(H-h)/2" \
    -frames:v 1 "$OUT"

# Optional second argument: a 10 s looping clip of the card with a 1 kHz beep (70% of -18 dBFS)
if [ $# -ge 2 ]; then
    ffmpeg -nostdin -v error -y -loop 1 -framerate 25 -t 10 -i "$OUT" \
        -f lavfi -t 10 -i "sine=frequency=1000:sample_rate=48000,volume=0.7" \
        -c:v libx264 -preset veryfast -tune stillimage -pix_fmt yuv420p -c:a aac -b:a 128k -shortest \
        -movflags +faststart "$2"
fi
