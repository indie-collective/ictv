-- ICTV (mpv edition) settings. Mirrors src/config.js; paths are relative to the repo root.
return {
    PATHS = {
        DATA = 'data',                      -- metadata JSON written by `npm run setup`
        VIDEOS = { 'videos-pi', 'videos' }, -- first folder containing <id>.mp4 wins
        CACHE = 'pi/cache',                 -- snow clips rendered by pi/build-assets.sh
    },

    UI = {
        CRT_EFFECT = true,
        VIDEO_DETAILS = true,
        FONT = 'Montserrat',
        TEXT_SCALE = 1.0,       -- 1.0 = same size as the browser version at 1080p
        PRIMARY_COLOR = '#054d43',
        SECONDARY_COLOR = '#149c88',
    },

    VIDEO = {
        CLIP_DURATION = 60,
        SNOW_DURATION_MS = 500,
        INTRO_SNOW_S = 2,
        DETAILS_DELAY = 2,      -- seconds into a clip before the title banner slides in

        CROP_BOUNDS = {
            podcast = { START = 120, END = 120 },
            jam = { START = 300, END = 400 },
            stunfest = { START = 10, END = 10 },
            misc = { START = 400, END = 400 },
        },

        OVERRIDES = {
            -- ['sQxLDY8Epqk'] = { VOLUME = 0.3, START = 100, END = 100 },
        },
    },
}
