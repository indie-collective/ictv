# ICTV — mpv edition (Raspberry Pi 4B)

A lightweight player for kiosk screens, built on **mpv + a Lua script + ffmpeg**. There is no Node, browser or web server at runtime.
It reads the same `data/*.json` and `videos/*.mp4` as the Node version, which is left untouched.

| Browser version | mpv edition |
|---|---|
| `src/index.html` playback loop | `pi/mpv/scripts/ictv/main.lua` |
| `src/config.js` | `pi/config.lua` |
| CSS CRT effect + `bezel.png` | `pi/cache/crt-<w>x<h>.bgra`, a full-screen overlay image (rendered by `pi/build-crt.py`) |
| `snow.gif` + logo + `snow.mp3` | `pi/cache/snow-{color,white}.mp4` (rendered by ffmpeg) |
| Title / category overlay | mpv OSD (libass), same box model and animations |

## Install on the Pi

```bash
# Raspberry Pi OS (Bookworm or Trixie), from the repo root
pi/install.sh              # apt: mpv ffmpeg fonts-montserrat, then renders the snow clips
pi/install.sh --autostart  # same, and start ICTV at boot (labwc desktop, or tty1 on Lite)
```

## Getting videos onto the Pi

Downloading still uses the Node tool (`npm run setup`), which needs the YouTube API and yt-dlp. Run it on any machine,
then copy `data/` and `videos/` into the repo on the Pi, for example:

```bash
rsync -av data videos pi@ictv.local:~/ictv/
```

The library files are 1080p60 H.264. A Pi 4 can decode that in hardware, but random seeks and 60 fps output are
tight. For smoother playback, re-encode to 1080p30 with a keyframe every 2 s. This is faster on a PC:

```bash
pi/transcode.sh                     # videos/ -> videos-pi/ (the player uses videos-pi/ first)
HEIGHT=720 pi/transcode.sh          # lighter still
```

## Run

```bash
pi/ictv.sh                          # desktop session
pi/ictv.sh --gpu-context=drm        # Raspberry Pi OS Lite, straight from the console
```

Keys: `n` next clip, `q` quit.

Settings are in `pi/config.lua`: clip length, crop bounds, per-video overrides, CRT effect, overlay on/off and text scale.
Player tuning (hwdec, scaling) is in `pi/mpv/mpv.conf`. It is loaded with `--config-dir`, so your personal mpv config is not used.

## Tuning the title ribbon

- Size: `UI.TEXT_SCALE` in `pi/config.lua` scales the title, subtitle and category tab together (1.0 is the browser size at 1080p; 1.6 reads well on a TV).
- Position: in `layout_details()` in `pi/mpv/scripts/ictv/main.lua`, `box_y` sets the bottom edge and the `+ 30` on `text_x`, `cat_x` and `box_w` shifts the text right, clear of the CRT bezel. Values are pixels at 1080p.

## Notes

- Only one program can drive a GPU's display output at a time (DRM master). Both HDMI ports of a Pi 4 share one device, so running a second `--gpu-context=drm` mpv on the other port breaks ICTV. Use a compositor if you need two screens.

- The title overlay is a subtitle track and the CRT effect is an overlay image drawn above it, so the bezel covers the left end of the title box as in the browser version. A GLSL shader would cost a full-screen GPU pass per frame, which drops frames on a Pi 4.
- 60 fps files drop frames on a Pi 4 as soon as anything is drawn over the video. Use `pi/transcode.sh` (30 fps) for smooth playback.
- If no metadata JSON matches the files on disk, the player falls back to every `.mp4` it finds, titled by filename.
- If playback stutters, try `hwdec=drm` or `hwdec=v4l2m2m-copy` in `mpv.conf`, or use `pi/transcode.sh`.
