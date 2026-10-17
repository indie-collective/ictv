#!/bin/sh
# Launch ICTV in mpv. Extra arguments go to mpv (e.g. --gpu-context=drm on Raspberry Pi OS Lite).
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
[ -f "$ROOT/pi/cache/snow-color.mp4" ] || "$ROOT/pi/build-assets.sh"

exec mpv --config-dir="$ROOT/pi/mpv" --script-opts="ictv-root=$ROOT" "$@"
