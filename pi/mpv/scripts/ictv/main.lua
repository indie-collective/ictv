-- ICTV for mpv: random clips from the ICTV library with snow transitions,
-- a lower-third title overlay and an optional CRT look.
-- Port of src/index.html; reads the same data/*.json and videos/*.mp4.

local mp = require 'mp'
local msg = require 'mp.msg'
local utils = require 'mp.utils'
local options = require 'mp.options'

local opts = { root = '' }
options.read_options(opts, 'ictv')

local root = opts.root ~= '' and opts.root
    or utils.join_path(mp.get_script_directory(), '../../../..')
local function path_of(rel) return utils.join_path(root, rel) end

local config = dofile(path_of('pi/config.lua'))
local UI, VIDEO = config.UI, config.VIDEO

math.randomseed(os.time())

-- Library -------------------------------------------------------------------

local function file_exists(p)
    local info = utils.file_info(p)
    return info ~= nil and info.is_file
end

local function find_video(id)
    for _, dir in ipairs(config.PATHS.VIDEOS) do
        local p = path_of(dir .. '/' .. id .. '.mp4')
        if file_exists(p) then return p end
    end
end

local function latest_json(dir)
    local best, best_mtime
    for _, f in ipairs(utils.readdir(dir, 'files') or {}) do
        if f:match('%.json$') then
            local info = utils.file_info(utils.join_path(dir, f))
            if info and (not best_mtime or info.mtime > best_mtime) then
                best, best_mtime = f, info.mtime
            end
        end
    end
    return best and utils.join_path(dir, best)
end

local function read_file(p)
    local f = io.open(p, 'rb')
    if not f then return nil end
    local s = f:read('*a')
    f:close()
    return s
end

local function load_library()
    local clips = {}
    local json_path = latest_json(path_of(config.PATHS.DATA))
    local items = json_path and utils.parse_json(read_file(json_path) or '')

    if items then
        msg.info('Metadata: ' .. json_path)
        for _, v in ipairs(items) do
            local id = v.contentDetails and v.contentDetails.videoId
            local p = id and find_video(id)
            if p then
                clips[#clips + 1] = {
                    id = id,
                    path = p,
                    title = v.snippet.title,
                    formatted = v.formatted or { title = v.snippet.title },
                    type = v.type or 'misc',
                    duration = tonumber(v.duration),
                }
            elseif id then
                msg.verbose('Missing video file for ' .. id)
            end
        end
    end

    -- No usable metadata: play whatever .mp4 files are on disk
    if #clips == 0 then
        msg.warn('No metadata matched; scanning video folders')
        local seen = {}
        for _, dir in ipairs(config.PATHS.VIDEOS) do
            for _, f in ipairs(utils.readdir(path_of(dir), 'files') or {}) do
                local id = f:match('^(.+)%.mp4$')
                if id and not seen[id] then
                    seen[id] = true
                    clips[#clips + 1] = {
                        id = id, path = path_of(dir .. '/' .. f), title = id,
                        formatted = { title = id }, type = 'misc',
                    }
                end
            end
        end
    end

    msg.info(#clips .. ' clips available')
    return clips
end

local library = load_library()
local stack = {}

-- Draw without replacement; refill once every clip has played
local function next_clip()
    if #stack == 0 then
        for i, c in ipairs(library) do stack[i] = c end
    end
    if #stack == 0 then return nil end
    return table.remove(stack, math.random(#stack))
end

local function pick_start(clip)
    local len, d = VIDEO.CLIP_DURATION, clip.duration
    if not d or d <= 0 then return nil end

    local bounds = VIDEO.CROP_BOUNDS[clip.type] or {}
    local s, e = bounds.START or 0, bounds.END or 0
    local o = VIDEO.OVERRIDES[clip.id]
    if o then s, e = o.START or s, o.END or e end

    local t
    if d - (s + e) > 0 then
        t = math.random() * (d - (s + e) - len) + s
    else
        t = math.floor(math.random() * (d - len))
    end
    return math.max(0, t)
end

local function clip_volume(clip)
    local o = VIDEO.OVERRIDES[clip.id]
    if o and o.VOLUME then return o.VOLUME end
    local t = (clip.title or ''):lower()
    return (t:find('trailer', 1, true) or t:find('aftermovie', 1, true)) and 0.3 or 1
end

-- Details overlay (lower third) -----------------------------------------------

local W, H = 1920, 1080
local measurer = mp.create_osd_overlay('ass-events')
measurer.res_x, measurer.res_y = W, H
measurer.hidden, measurer.compute_bounds = true, true

local LINE_HEIGHT = 1.2

local function ass_color(hex)
    local r, g, b = hex:match('#?(%x%x)(%x%x)(%x%x)')
    return (b .. g .. r):upper()
end

local function ass_escape(s)
    return (s:gsub('\\', '\\\226\129\160'):gsub('{', '\\{'):gsub('}', '\\}'):gsub('[\r\n]+', ' '))
end

local function text_tag(x, y, fs, style, color)
    return string.format('{\\an7\\pos(%.1f,%.1f)\\bord0\\shad0\\fn%s\\fs%.1f%s\\1c&H%s&}',
        x, y, UI.FONT, fs, style, color)
end

local function text_width(s, fs, style)
    measurer.data = text_tag(0, 0, fs, style, 'FFFFFF') .. s
    local r = measurer:update()
    if r and r.x1 then return r.x1 end
    local chars = select(2, s:gsub('[^\128-\191]', ''))
    return chars * fs * 0.55
end

local function rect(x, y, w, h, color)
    return string.format('{\\an7\\pos(%.1f,%.1f)\\bord0\\shad0\\1c&H%s&\\p1}m 0 0 l %.1f 0 %.1f %.1f 0 %.1f{\\p0}',
        x, y, color, w, w, h, h)
end

-- Same box model as public/style.css (#details, #category, #full-title)
local function layout_details(f)
    local rem = 16 * UI.TEXT_SCALE
    local inset = UI.CRT_EFFECT and W * 0.05 or rem
    local L = { rem = rem }

    L.title = ass_escape(f.title or '')
    L.subtitle = f.subtitle and f.subtitle ~= '' and ass_escape(f.subtitle) or nil
    L.category = f.category and f.category ~= '' and ass_escape(f.category) or nil

    L.title_fs, L.sub_fs, L.cat_fs = 1.5 * rem, 1.1 * rem, 1.25 * rem
    L.text_x = inset

    local tw = text_width(L.title, L.title_fs, '\\b600')
    local sw = L.subtitle and text_width(L.subtitle, L.sub_fs, '\\i1') or 0
    L.box_w = inset + math.max(tw, sw) + rem
    L.box_h = rem + L.title_fs * LINE_HEIGHT
        + (L.subtitle and 0.25 * rem + L.sub_fs * LINE_HEIGHT or 0)
    L.box_y = H * 0.96 - L.box_h
    L.width = L.box_w

    if L.category then
        L.cat_x = inset
        L.cat_w = text_width(L.category, L.cat_fs, '\\b700') + rem
        L.cat_h = L.cat_fs * LINE_HEIGHT
        L.width = math.max(L.width, L.cat_x + L.cat_w + rem)
    end
    return L
end

-- Returns { layer, text } pairs; the category tab is on a lower layer than the title box
local function render_details(L, dx, cat_dy)
    local primary, secondary = ass_color(UI.PRIMARY_COLOR), ass_color(UI.SECONDARY_COLOR)
    local ev = {}
    local rem = L.rem

    -- Category tab sits behind the title box and slides up out of it
    if L.category then
        local y = L.box_y - L.cat_h + cat_dy
        ev[#ev + 1] = { 0, rect(L.cat_x + dx, y, L.cat_w, L.cat_h, secondary) }
        ev[#ev + 1] = { 0, text_tag(L.cat_x + dx + 0.5 * rem, y + 0.1 * L.cat_fs, L.cat_fs, '\\b700', '000000') .. L.category }
    end

    ev[#ev + 1] = { 1, rect(dx, L.box_y, L.box_w, L.box_h, primary) }
    local y = L.box_y + 0.5 * rem
    ev[#ev + 1] = { 1, text_tag(L.text_x + dx, y + 0.1 * L.title_fs, L.title_fs, '\\b600', 'FFFFFF') .. L.title }
    if L.subtitle then
        y = y + L.title_fs * LINE_HEIGHT + 0.25 * rem
        ev[#ev + 1] = { 1, text_tag(L.text_x + dx, y + 0.1 * L.sub_fs, L.sub_fs, '\\i1', 'FFFFFF') .. L.subtitle }
    end
    return ev
end

local function ease(t) return t * t * (3 - 2 * t) end

-- @keyframes enterX: hidden until 30%, slide in until 40%, hold, slide out from 95%
local function enter_x(f)
    if f < 0.3 or f >= 1 then return 0 end
    if f < 0.4 then return ease((f - 0.3) / 0.1) end
    if f < 0.95 then return 1 end
    return 1 - ease((f - 0.95) / 0.05)
end

-- The overlay is a subtitle track, so the CRT overlay image (overlay-add, drawn above
-- subtitles) covers it like in the browser version. The animation is baked into one event
-- per animation frame, timed against the clip's own timestamps. Loading the next file
-- drops the track, so there is nothing to hide.
local ASS_HEADER = string.format([[
[Script Info]
ScriptType: v4.00+
PlayResX: %d
PlayResY: %d
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,%s,48,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
]], W, H, UI.FONT)

local FRAME_CS = 3 -- animation step, in centiseconds (ASS time resolution)

local function ass_time(cs)
    local f = math.floor
    return string.format('%d:%02d:%02d.%02d', f(cs / 360000), f(cs / 6000) % 60, f(cs / 100) % 60, cs % 100)
end

local function details_ass(L, t0)
    local total = VIDEO.CLIP_DURATION / 3
    local cat_delay, cat_dur = VIDEO.CLIP_DURATION / 6, VIDEO.CLIP_DURATION / 60
    local base = math.floor(t0 * 100 + 0.5)
    local out = { ASS_HEADER }
    local key, start_cs, ev

    local function flush(end_cs)
        if not ev then return end
        local span = ass_time(base + start_cs) .. ',' .. ass_time(base + end_cs)
        for _, e in ipairs(ev) do
            out[#out + 1] = string.format('Dialogue: %d,%s,Default,,0,0,0,,%s\n', e[1], span, e[2])
        end
    end

    -- Skip the hidden start of enterX so the slide-in begins DETAILS_DELAY seconds into the clip
    local skip = math.max(0, 0.3 * total - (VIDEO.DETAILS_DELAY or 0.3 * total))
    local last = math.ceil((total - skip) * 100 / FRAME_CS)
    for k = 0, last do
        local cs = k * FRAME_CS
        local t = cs / 100 + skip
        local p = k < last and enter_x(t / total) or 0
        local c = L.category and ease(math.min(1, math.max(0, (t - cat_delay) / cat_dur))) or 1
        local k2 = p == 0 and '0' or (p .. ':' .. c)
        if k2 ~= key then
            flush(cs)
            key, start_cs = k2, cs
            ev = p > 0 and render_details(L, -L.width * (1 - p), (1 - c) * (L.cat_h or 0)) or nil
        end
    end
    return table.concat(out)
end

local function show_details(clip)
    if not UI.VIDEO_DETAILS then return end
    local L = layout_details(clip.formatted or {})
    local t0 = mp.get_property_number('time-pos', 0)
    mp.commandv('sub-add', 'memory://' .. details_ass(L, t0), 'select', 'ICTV details')
end

-- Playback ------------------------------------------------------------------

local snow = {
    color = path_of(config.PATHS.CACHE .. '/snow-color.mp4'),
    white = path_of(config.PATHS.CACHE .. '/snow-white.mp4'),
}
if not file_exists(snow.color) then
    msg.error('Snow clips missing; run pi/build-assets.sh')
end

local pending_clip, clip_timer

local function show_snow(variant)
    variant = variant or (math.random() < 0.5 and 'white' or 'color')
    mp.set_property('start', 'none')
    mp.set_property('loop-file', 'inf')
    mp.set_property_number('volume', 100)
    mp.commandv('loadfile', snow[variant], 'replace')
end

local function play_random_clip()
    if clip_timer then clip_timer:kill() end
    show_snow()

    local clip = next_clip()
    if not clip then msg.error('No videos available'); return end

    clip_timer = mp.add_timeout(VIDEO.SNOW_DURATION_MS / 1000, function()
        local start = pick_start(clip)
        mp.set_property('loop-file', 'no')
        mp.set_property('start', start and string.format('%.3f', start)
            or string.format('%d%%', math.random(5, 80)))
        mp.set_property_number('volume', clip_volume(clip) * 100)
        pending_clip = clip
        mp.commandv('loadfile', clip.path, 'replace')
        msg.info(string.format('Playing "%s" (%s)', clip.title, clip.id))
    end)
end

-- Start the overlay once the clip is actually on screen
mp.register_event('playback-restart', function()
    if pending_clip then
        show_details(pending_clip)
        pending_clip = nil
    end
end)

-- CRT look: one pre-rendered BGRA image at screen size, drawn with overlay-add. Overlays
-- are drawn above subtitles, so the details banner sits under it. A GLSL shader (or
-- blend-subtitles=video) costs a full-screen GPU pass per frame, which drops frames on a Pi 4.
local function show_crt(w, h)
    local file = path_of(string.format('%s/crt-%dx%d.bgra', config.PATHS.CACHE, w, h))
    local function add()
        mp.commandv('overlay-add', '0', '0', '0', file, '0', 'bgra',
            tostring(w), tostring(h), tostring(w * 4))
    end
    if file_exists(file) then return add() end

    msg.info(string.format('Rendering CRT overlay for %dx%d', w, h))
    mp.command_native_async({
        name = 'subprocess', playback_only = false,
        args = { 'python3', path_of('pi/build-crt.py'), tostring(w), tostring(h), file },
    }, function(ok, res)
        if ok and res.status == 0 then add() else msg.error('CRT overlay render failed') end
    end)
end

if UI.CRT_EFFECT then
    mp.set_property('panscan', '1.0') -- object-fit: cover
    local crt_size
    mp.observe_property('osd-dimensions', 'native', function(_, d)
        if not d or d.w <= 0 or d.h <= 0 then return end
        local size = d.w .. 'x' .. d.h
        if size == crt_size then return end
        crt_size = size
        show_crt(d.w, d.h)
    end)
end

local countdown = VIDEO.INTRO_SNOW_S

mp.add_periodic_timer(1, function()
    countdown = countdown - 1
    if countdown <= 0 then
        countdown = VIDEO.CLIP_DURATION
        play_random_clip()
    end
end)

local function skip()
    countdown = VIDEO.CLIP_DURATION
    play_random_clip()
end
mp.add_forced_key_binding('n', 'ictv-next', skip)
mp.add_forced_key_binding('N', 'ictv-next-shift', skip)

show_snow('color')
