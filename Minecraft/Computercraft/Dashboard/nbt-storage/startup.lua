-- ============================================================
--  NBT Storage fuer das Basis-Dashboard (CC:Tweaked)
--  Schaltet ein Redstone-Signal AN, bevor das Dashboard die Items mit
--  NBT-Daten aus dem ME-System exportiert, und danach wieder AUS.
--
--  Benoetigt: Computer + Wireless- oder Ender-Modem.
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

local modem = peripheral.find("modem", function(_, m) return m.isWireless() end)
if not modem then
  printError("Kein Wireless- oder Ender-Modem gefunden!")
  return
end
rednet.open(peripheral.getName(modem))

local on = false
local onSince = nil
local lastCmd = "noch keiner"
local safetyTimer = nil

local function setSignal(v)
  on = v
  for _, s in ipairs(cfg.sides) do rs.setOutput(s, v) end
  onSince = v and os.epoch("utc") or nil
  if safetyTimer then os.cancelTimer(safetyTimer) end
  -- Falls das Dashboard abstuerzt, bleibt das Signal nicht ewig an
  safetyTimer = v and os.startTimer(cfg.maxOn * 60) or nil
end

local function draw()
  bg(colors.black)
  term.clear()
  local w, h = term.getSize()

  if isColor then term.setBackgroundColor(on and colors.lime or colors.gray)
  else term.setBackgroundColor(colors.white) end
  for y = 1, 3 do
    term.setCursorPos(1, y)
    term.write(string.rep(" ", w))
  end
  local title = "NBT STORAGE: SIGNAL " .. (on and "AN" or "AUS")
  term.setTextColor(colors.black)
  term.setCursorPos(math.max(1, math.floor((w - #title) / 2) + 1), 2)
  term.write(title:sub(1, w))
  bg(colors.black)

  local y = 5
  local function line(k, v, c)
    term.setCursorPos(2, y)
    fg(colors.lightGray); term.write(k)
    fg(c or colors.white); term.write(v)
    y = y + 1
  end
  line("Redstone:    ", table.concat(cfg.sides, ", "))
  line("Letzter Befehl: ", lastCmd)
  if on and onSince then
    line("An seit:     ", math.floor((os.epoch("utc") - onSince) / 1000) .. " s", colors.yellow)
  end
  line("Sicherheit:  ", "nach " .. cfg.maxOn .. " min selbst AUS")
  line("Computer-ID: ", tostring(os.getComputerID()))

  term.setCursorPos(2, h)
  fg(colors.gray)
  term.write("[R] Neu einrichten")
end

setSignal(false)
draw()

local redraw = os.startTimer(1)
while true do
  local ev, a, b, c = os.pullEvent()
  if ev == "rednet_message" and c == cfg.protocol and type(b) == "table"
     and b.key == cfg.key and b.type == "nbtRs" then
    setSignal(b.on and true or false)
    lastCmd = (on and "AN" or "AUS") .. " von #" .. a .. " um " .. textutils.formatTime(os.time(), true)
    rednet.send(a, { type = "nbtAck", on = on, key = cfg.key }, cfg.protocol)
    draw()
  elseif ev == "timer" and a == safetyTimer then
    safetyTimer = nil
    setSignal(false)
    lastCmd = "Sicherheits-AUS nach " .. cfg.maxOn .. " min"
    draw()
  elseif ev == "timer" and a == redraw then
    if on then draw() end
    redraw = os.startTimer(1)
  elseif ev == "key" and a == keys.r then
    setSignal(false)
    fs.delete(CFG_FILE)
    os.reboot()
  end
end
