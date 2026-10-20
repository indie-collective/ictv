#!/bin/sh
# Launch ICTV in mpv. Extra arguments go to mpv (e.g. --gpu-context=drm on Raspberry Pi OS Lite).
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
[ -f "$ROOT/pi/cache/snow-color.mp4" ] && [ -f "$ROOT/pi/cache/testcard.mp4" ] || "$ROOT/pi/build-assets.sh"

# Run the player. A crash (exit code other than 0 or a plain kill) shows the test card for
# 5 s, then ICTV starts again.
run_player() {
    # The player is the only workload: raise CPU/IO priority of every mpv thread once it is up.
    # (Needs passwordless sudo; silently skipped otherwise.)
    (
        for _ in 1 2 3 4 5 6 7 8 9 10; do
            pid=$(pgrep -x mpv | head -n1) && [ -n "$pid" ] && break
            sleep 1
        done
        sleep 3
        [ -n "${pid:-}" ] && for t in /proc/$pid/task/*; do
            sudo -n renice -n -15 -p "${t##*/}" >/dev/null 2>&1
            sudo -n ionice -c 1 -n 0 -p "${t##*/}" >/dev/null 2>&1
        done
    ) &
    mpv --config-dir="$ROOT/pi/mpv" --script-opts=ictv-root="$ROOT" "$@"
}

while :; do
    status=0
    run_player "$@" || status=$?
    case $status in 0|130|143) exit "$status" ;; esac
    echo "ICTV crashed (exit $status), showing the test card" >&2
    pkill -f ictv-snow.sock 2>/dev/null || true   # the snow sound player outlives a crash
    if [ -f "$ROOT/pi/cache/testcard.mp4" ]; then
        timeout 5 mpv --no-config --fs --no-osc --no-terminal --really-quiet --loop-file=inf "$@" \
            "$ROOT/pi/cache/testcard.mp4" || true
    else
        sleep 5
    fi
done
