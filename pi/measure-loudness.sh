#!/bin/sh
# Measure integrated loudness (LUFS) and true peak (dBTP) of every video's audio, once.
# Results go to pi/cache/loudness.tsv (id, LUFS, dBTP); the player turns them into a per-clip gain.
# Safe to run on the Pi while ICTV plays (idle CPU/IO priority); already-measured files are skipped.
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT="$ROOT/pi/cache/loudness.tsv"
touch "$OUT"

for src in "$ROOT"/videos/*.mp4; do
    id=$(basename "$src" .mp4)
    grep -q "^$id	" "$OUT" && continue
    res=$(nice -n 19 ionice -c 3 ffmpeg -nostdin -hide_banner -nostats -i "$src" -map 0:a:0 -vn \
        -af ebur128=peak=true -f null - 2>&1 | awk '
            /Integrated loudness:/ {s=1} /Peak:/ && s {p=$2}
            s && /I:/ {i=$2} END {print i, p}')
    set -- $res
    if [ -n "${1:-}" ] && [ "$1" != "-70.0" ]; then
        printf '%s\t%s\t%s\n' "$id" "$1" "${2:--1}" >> "$OUT"
        echo "$id $1 LUFS, peak ${2:--1} dBTP"
    else
        echo "$id: no usable audio, skipped" >&2
    fi
done
