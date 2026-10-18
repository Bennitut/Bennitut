-- ============================================================
--  NBT Storage fuer das Basis-Dashboard (CC:Tweaked)
--  Schaltet ein Redstone-Signal AN, bevor das Dashboard die Items mit
--  NBT-Daten aus dem ME-System exportiert, und danach wieder AUS.
--
--  Benoetigt: Computer + Wireless- oder Ender-Modem.
--  Optional: Monitor daneben, zeigt Status und Log.
--  Beim ersten Start fragt das Programm Redstone-Seite usw. ab.
-- ============================================================

local DIR = fs.getDir(shell.getRunningProgram())
local CFG_FILE = fs.combine(DIR, "nbt.cfg")

local isColor = term.isColor()

local function fg(c) term.setTextColor(isColor and c or colors.white) end
local function bg(c) term.setBackgroundColor(isColor and c or colors.black) end

local function loadFile(path)
  if not fs.exists(path) then return nil end
  local h = fs.open(path, "r")
  local d = h.readAll()
  h.close()
  return textutils.unserialize(d)
end

local function saveFile(path, data)
  local h = fs.open(path, "w")
  h.write(textutils.serialize(data))
  h.close()
end

local function ask(prompt, default, choices)
  fg(colors.yellow)
  write(prompt)
  if default and default ~= "" then
    fg(colors.lightGray)
    write(" [" .. default .. "]")
  end
  fg(colors.white)
  write(": ")
  local complete
  if choices then
    local completion = require("cc.completion")
    complete = function(text) return completion.choice(text, choices) end
  end
  local ans = read(nil, nil, complete)
  if ans == "" then ans = default end
  return ans
end

local function parseSides(text)
  local valid = {}
  for _, s in ipairs(rs.getSides()) do valid[s] = true end
  local sides = {}
  for part in tostring(text or ""):gmatch("[^,%s]+") do
    local s = part:lower()
    if not valid[s] then return nil end
    sides[#sides + 1] = s
  end
  if #sides == 0 then return nil end
  return sides
end

local function setup()
  bg(colors.black)
  term.clear()
  term.setCursorPos(1, 1)
  fg(colors.cyan)
  print("=== NBT-Storage-Einrichtung ===")
  print("")

  local sides
  repeat
    local txt = ask("Redstone-Seite(n), z.B. back oder back,left", "back", rs.getSides())
    sides = parseSides(txt)
    if not sides then printError("Ungueltig. Erlaubt: " .. table.concat(rs.getSides(), ", ")) end
  until sides

  local maxOn = tonumber(ask("Spaetestens nach so vielen Minuten selbst AUS", "30")) or 30
  local key = ask("Netzwerk-Passwort (wie beim Dashboard, leer = keins)", "") or ""

  local cfg = {
    sides = sides,
    maxOn = math.max(1, maxOn),
    protocol = "farmctl",
    key = key,
  }
  saveFile(CFG_FILE, cfg)
  pcall(os.setComputerLabel, "NBT Storage")
  return cfg
end

local cfg = loadFile(CFG_FILE) or setup()
local LOG_FILE = fs.combine(DIR, "nbt.log")
local LOG_MAX = 60

local modem = peripheral.find("modem", function(_, m) return m.isWireless() end)
if not modem then
  printError("Kein Wireless- oder Ender-Modem gefunden!")
  return
end
rednet.open(peripheral.getName(modem))

-- Log: neueste zuerst, { t = Unix-Zeit in ms, text, color }
local saved = loadFile(LOG_FILE) or {}
local log = type(saved.log) == "table" and saved.log or {}
local tz = tonumber(saved.tz)   -- Zeitzone kommt vom Dashboard mit jedem Befehl

local function saveLog() saveFile(LOG_FILE, { log = log, tz = tz }) end

local function addLog(text, color)
  table.insert(log, 1, { t = os.epoch("utc"), text = text, color = color })
  while #log > LOG_MAX do table.remove(log) end
end

local function clock(t, fmt)
  local off = tz or math.floor((os.epoch("local") - os.epoch("utc")) / 3600000 + 0.5)
  return os.date("!" .. (fmt or "%H:%M"), math.floor(t / 1000) + math.floor(off * 3600))
end

local on = false
local onSince = nil
local safetyTimer = nil

local function setSignal(v)
  on = v
  for _, s in ipairs(cfg.sides) do rs.setOutput(s, v) end
  onSince = v and os.epoch("utc") or nil
  if safetyTimer then os.cancelTimer(safetyTimer) end
  -- Falls das Dashboard abstuerzt, bleibt das Signal nicht ewig an
  safetyTimer = v and os.startTimer(cfg.maxOn * 60) or nil
end

local function logSummary(s)
  if type(s) ~= "table" then return end
  if s.err then addLog("Export fehlgeschlagen: " .. tostring(s.err), colors.red) return end
  addLog("Export: " .. tostring(s.count) .. " Items, " .. tostring(s.kinds) .. " Sorten", colors.yellow)
  if s.missed and s.missed > 0 then addLog("  " .. s.missed .. " passten nicht in die Kiste", colors.red) end
  -- Items in umgekehrter Reihenfolge einfuegen, damit das groesste oben steht
  local items = type(s.items) == "table" and s.items or {}
  for i = math.min(#items, 5), 1, -1 do
    addLog("  " .. tostring(items[i].c) .. "x " .. tostring(items[i].n), colors.lightGray)
  end
end

-- Bildschirm (Computer oder Monitor) ------------------------------------

local mon = peripheral.find("monitor")
if mon then mon.setTextScale(0.5) end

local function drawOn(t)
  local col = t.isColor()
  local function fgc(c) t.setTextColor(col and c or colors.white) end
  t.setBackgroundColor(colors.black)
  t.clear()
  local w, h = t.getSize()
  local hh = h >= 16 and 3 or 1

  t.setBackgroundColor(col and (on and colors.lime or colors.gray) or colors.white)
  for y = 1, hh do
    t.setCursorPos(1, y)
    t.write(string.rep(" ", w))
  end
  local title = "NBT STORAGE: SIGNAL " .. (on and "AN" or "AUS")
  t.setTextColor(colors.black)
  t.setCursorPos(math.max(1, math.floor((w - #title) / 2) + 1), math.floor((hh + 1) / 2))
  t.write(title:sub(1, w))
  t.setBackgroundColor(colors.black)

  local y = hh + 2
  local function line(k, v, c)
    if y > h then return end
    t.setCursorPos(2, y)
    fgc(colors.lightGray); t.write(k)
    fgc(c or colors.white); t.write(tostring(v):sub(1, math.max(0, w - 1 - #k)))
    y = y + 1
  end
  if on and onSince then
    line("An seit: ", math.floor((os.epoch("utc") - onSince) / 1000) .. " s", colors.yellow)
  end
  line("Redstone: ", table.concat(cfg.sides, ", ") .. "  (max. " .. cfg.maxOn .. " min)")
  line("Computer-ID: ", tostring(os.getComputerID()))

  y = y + 1
  if y <= h - 1 then
    t.setCursorPos(2, y)
    fgc(colors.cyan); t.write("LOG")
    y = y + 1
  end
  local last = (t == term.current()) and h - 1 or h
  for _, e in ipairs(log) do
    if y > last then break end
    local stamp = clock(e.t, w >= 45 and "%d.%m. %H:%M" or "%H:%M") .. " "
    t.setCursorPos(2, y)
    fgc(colors.gray); t.write(stamp)
    fgc(e.color or colors.white); t.write(e.text:sub(1, math.max(0, w - 1 - #stamp)))
    y = y + 1
  end
  if #log == 0 and y <= last then
    t.setCursorPos(2, y)
    fgc(colors.gray); t.write("noch keine Eintraege")
  end
end

local function draw()
  drawOn(term.current())
  term.setCursorPos(2, select(2, term.getSize()))
  term.setTextColor(term.isColor() and colors.gray or colors.white)
  term.write("[R] Neu einrichten")
  if mon then drawOn(mon) end
end

setSignal(false)
draw()

local redraw = os.startTimer(1)
while true do
  local ev, a, b, c = os.pullEvent()
  if ev == "rednet_message" and c == cfg.protocol and type(b) == "table"
     and b.key == cfg.key and b.type == "nbtRs" then
    local want = b.on and true or false
    if tonumber(b.tz) then tz = tonumber(b.tz) end
    -- Wiederholte Befehle (Bestaetigung verloren) nur einmal ins Log
    if want ~= on then
      setSignal(want)
      if want then
        addLog("Signal AN (Dashboard #" .. a .. ")", colors.lime)
      else
        logSummary(b.summary)
        addLog("Signal AUS", colors.lightGray)
      end
      saveLog()
    end
    rednet.send(a, { type = "nbtAck", on = on, key = cfg.key }, cfg.protocol)
    draw()
  elseif ev == "timer" and a == safetyTimer then
    safetyTimer = nil
    setSignal(false)
    addLog("Sicherheits-AUS nach " .. cfg.maxOn .. " min", colors.red)
    saveLog()
    draw()
  elseif ev == "timer" and a == redraw then
    if on then draw() end
    redraw = os.startTimer(1)
  elseif ev == "monitor_resize" then
    draw()
  elseif ev == "key" and a == keys.r then
    setSignal(false)
    fs.delete(CFG_FILE)
    os.reboot()
  end
end
