#!/bin/sh
# Render a snow transition video (procedural TV static + logo, 720p, 60 fps, no audio):
#   build-snow.sh <color|white> <out.mp4>
# The sound is played separately by the player (snow.mp3).
set -eu

variant=$1 OUT=$2
W=1280 H=720 DURATION=0.8
ROOT=$(cd "$(dirname "$0")/.." && pwd)
ASSETS="$ROOT/public/assets"
LOGO_H=$(( H * 3 / 10 ))
CW=$(( W / 4 )) CH=$(( H / 4 ))   # noise cell = 4x4 pixels

logo="$ASSETS/logo.png"
[ "$variant" = white ] && logo="$ASSETS/logo-white.png"
# Gray static: colour noise carries three random channels and costs twice the bitrate
static="format=rgb24,noise=alls=100:allf=t+u,hue=s=0,eq=contrast=1.4"

# Noise barely compresses. Constant bitrate with a ~1 frame buffer so every frame gets the same
# quality from first to last (crf + maxrate starves the later frames). Random, so it loops seamlessly.
ffmpeg -nostdin -v error -y \
    -f lavfi -i "color=c=gray:s=${CW}x${CH}:r=60" -i "$logo" \
    -filter_complex "[0:v]$static,scale=$W:$H:flags=neighbor[bg];[1:v]scale=-1:$LOGO_H[logo];[bg][logo]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]" \
    -map "[v]" -t $DURATION -c:v libx264 -preset veryfast -profile:v high -level 4.1 -b:v 30M -minrate 30M -maxrate 30M -bufsize 1M -x264-params nal-hrd=cbr:force-cfr=1 -g 30 -movflags +faststart "$OUT"
