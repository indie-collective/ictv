-- Crash guard for ICTV: any error in ictv.lua (at load or in a callback) quits mpv with
-- exit code 3, and pi/ictv.sh then shows the test card for 5 s and starts ICTV again.

local mp = require 'mp'
local msg = require 'mp.msg'

local function crash(err)
    msg.error('ICTV crashed: ' .. tostring(err))
    mp.commandv('quit', '3')
end

local function guard(f)
    return function(...)
        local ok, err = xpcall(f, debug.traceback, ...)
        if not ok then crash(err) end
    end
end

for _, name in ipairs { 'register_event', 'observe_property', 'add_timeout', 'add_periodic_timer',
                        'register_script_message', 'add_key_binding', 'add_forced_key_binding' } do
    local orig = mp[name]
    -- the callback is the last function argument; timers return an object, so pass results through
    mp[name] = function(...)
        local args = table.pack(...)
        for i = args.n, 1, -1 do
            if type(args[i]) == 'function' then args[i] = guard(args[i]); break end
        end
        return orig(table.unpack(args, 1, args.n))
    end
end

local dir = mp.get_script_directory()
local ok, err = xpcall(dofile, debug.traceback, dir .. '/ictv.lua')
if not ok then crash(err) end
