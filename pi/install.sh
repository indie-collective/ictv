#!/bin/sh
# One-time setup on Raspberry Pi OS: packages, snow clips and (optionally) autostart.
#   pi/install.sh               install only
#   pi/install.sh --autostart   also start ICTV on boot
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)

sudo apt-get update
sudo apt-get install -y mpv ffmpeg fonts-montserrat
"$ROOT/pi/build-assets.sh"

[ "${1:-}" = "--autostart" ] || exit 0

LABWC="$HOME/.config/labwc/autostart"
if command -v labwc >/dev/null 2>&1; then
    # Desktop image (Wayland/labwc)
    mkdir -p "$(dirname "$LABWC")"
    grep -qs "pi/ictv.sh" "$LABWC" || echo "$ROOT/pi/ictv.sh &" >> "$LABWC"
    echo "Added to $LABWC"
else
    # Lite image: start on the tty1 autologin console, straight to DRM
    grep -qs "pi/ictv.sh" "$HOME/.bash_profile" || cat >> "$HOME/.bash_profile" <<PROFILE
[ "\$(tty)" = /dev/tty1 ] && exec "$ROOT/pi/ictv.sh" --gpu-context=drm
PROFILE
    sudo raspi-config nonint do_boot_behaviour B2
    echo "Console autologin enabled; ICTV starts on tty1"
fi
