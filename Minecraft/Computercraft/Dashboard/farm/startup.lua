-- ============================================================
--  Farm-Client fuer das Basis-Dashboard (CC:Tweaked)
--  Schaltet per Redstone eine Farm an/aus, gesteuert per Rednet.
--
--  Benoetigt: Computer + Wireless- oder Ender-Modem.
--  Beim ersten Start fragt das Programm Name, Redstone-Seite usw. ab.
-- ============================================================

local DIR = fs.getDir(shell.getRunningProgram())
local CFG_FILE = fs.combine(DIR, "farm.cfg")
local STATE_FILE = fs.combine(DIR, "farm.state")

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
  print("=== Farm-Einrichtung ===")
  print("")

  local name = ask("Name der Farm", os.getComputerLabel())
  while not name or name == "" do name = ask("Name der Farm (Pflicht)") end

  local sides
  repeat
    local txt = ask("Redstone-Seite(n), z.B. back oder back,left", "back", rs.getSides())
    sides = parseSides(txt)
    if not sides then printError("Ungueltig. Erlaubt: " .. table.concat(rs.getSides(), ", ")) end
  until sides

  print("")
  fg(colors.lightGray)
  print("Soll ein Redstone-Signal anliegen, wenn die Farm LAEUFT?")
  print(" j = Signal an  -> Farm laeuft (z.B. Maschine 'High')")
  print(" n = Signal aus -> Farm laeuft (z.B. Create-Kupplung)")
  local mode = ask("Signal wenn AN", "j")

  local key = ask("Netzwerk-Passwort (leer = keins)", "") or ""

  local cfg = {
    name = name,
    sides = sides,
    signalWhenOn = (mode or "j"):lower():sub(1, 1) ~= "n",
    protocol = "farmctl",
    key = key,
  }
  saveFile(CFG_FILE, cfg)
  pcall(os.setComputerLabel, name)
  return cfg
end

local cfg = loadFile(CFG_FILE) or setup()
local st = loadFile(STATE_FILE)
local on = true
if type(st) == "table" and type(st.on) == "boolean" then on = st.on end

local modem = peripheral.find("modem", function(_, m) return m.isWireless() end)
if not modem then
  printError("Kein Wireless- oder Ender-Modem gefunden!")
  return
end
rednet.open(peripheral.getName(modem))

local lastContact = "noch keiner"

local function apply()
  local out = (on == cfg.signalWhenOn)
  for _, s in ipairs(cfg.sides) do rs.setOutput(s, out) end
end

local function sendStatus()
  rednet.broadcast({ type = "status", name = cfg.name, on = on, key = cfg.key }, cfg.protocol)
end

local function setState(newOn)
  on = newOn
  saveFile(STATE_FILE, { on = on })
  apply()
  sendStatus()
end

-- Monitor (optional): zeigt den Zustand gross an, Button zum Umschalten ------

local mon, monName, monW, monH
local btnY1 = math.huge

local function setupMonitor()
  mon = peripheral.find("monitor")
  monName = mon and peripheral.getName(mon)
  if not mon then return end
  -- groesste Schrift, bei der Name und Button noch passen
  local minW = math.max(#cfg.name, 15) + 2
  for sc = 5, 0.5, -0.5 do
    mon.setTextScale(sc)
    local w, h = mon.getSize()
    if w >= minW and h >= 4 then break end
  end
  monW, monH = mon.getSize()
end

local function drawMonitor()
  if not mon then return end
  local w, h = monW, monH
  local mc = mon.isColor()
  local bgc = mc and (on and colors.green or colors.red) or (on and colors.white or colors.gray)
  local fgc = mc and colors.white or colors.black
  mon.setBackgroundColor(bgc)
  mon.clear()

  local function center(y, text, fgCol, bgCol)
    text = text:sub(1, w)
    mon.setBackgroundColor(bgCol)
    mon.setTextColor(fgCol)
    mon.setCursorPos(math.max(1, math.floor((w - #text) / 2) + 1), y)
    mon.write(text)
  end

  -- Button unten (3 Zeilen hoch, wenn Platz ist)
  local bh = (h >= 8) and 3 or 1
  btnY1 = h - bh + 1
  local btnBg = mc and (on and colors.red or colors.lime) or colors.black
  local btnFg = mc and (on and colors.white or colors.black) or colors.white
  mon.setBackgroundColor(btnBg)
  for y = btnY1, h do
    mon.setCursorPos(1, y)
    mon.write(string.rep(" ", w))
  end
  center(btnY1 + math.floor((bh - 1) / 2), on and "[ AUSSCHALTEN ]" or "[ EINSCHALTEN ]", btnFg, btnBg)

  -- Name und Zustand mittig darueber
  local free = btnY1 - 1
  local nameY = math.max(1, math.floor(free / 2) - (free >= 4 and 1 or 0))
  local statusY = math.min(free, nameY + (free >= 4 and 2 or 1))
  center(nameY, cfg.name, fgc, bgc)
  center(statusY, on and "LAEUFT" or "GESTOPPT", fgc, bgc)
end

local function draw()
  bg(colors.black)
  term.clear()
  local w, h = term.getSize()

  if isColor then
    term.setBackgroundColor(on and colors.green or colors.red)
  else
    term.setBackgroundColor(on and colors.white or colors.gray)
  end
  for y = 1, 3 do
    term.setCursorPos(1, y)
    term.write(string.rep(" ", w))
  end
  local title = on and "FARM AN" or "FARM AUS"
  term.setTextColor(isColor and colors.white or colors.black)
  term.setCursorPos(math.floor((w - #title) / 2) + 1, 2)
  term.write(title)

  bg(colors.black)
  local signal = (on == cfg.signalWhenOn) and "AN" or "AUS"
  local lines = {
    { "Name:     ", cfg.name },
    { "Redstone: ", table.concat(cfg.sides, ",") .. " = " .. signal },
    { "ID:       ", tostring(os.getComputerID()) },
    { "Kontakt:  ", lastContact },
    { "Monitor:  ", monName or "keiner" },
  }
  for i, l in ipairs(lines) do
    term.setCursorPos(2, 4 + i)
    fg(colors.lightGray); term.write(l[1])
    fg(colors.white); term.write(l[2])
  end

  term.setCursorPos(2, h)
  fg(colors.gray)
  term.write("[Leertaste] Umschalten  [R] Neu einrichten")

  drawMonitor()
end

setupMonitor()
apply()
sendStatus()
draw()

while true do
  local ev, a, b, c = os.pullEvent()
  if ev == "rednet_message" and c == cfg.protocol and type(b) == "table" and b.key == cfg.key then
    if b.type == "ping" then
      sendStatus()
    elseif b.type == "set" and type(b.on) == "boolean" then
      setState(b.on)
    end
    lastContact = os.date("%H:%M:%S") .. " (Dashboard #" .. a .. ")"
    draw()
  elseif ev == "monitor_touch" and a == monName then
    if c >= btnY1 then
      setState(not on)
      draw()
    end
  elseif ev == "monitor_resize" and a == monName then
    local w, h = mon.getSize()
    if w ~= monW or h ~= monH then
      setupMonitor()
      draw()
    end
  elseif ev == "peripheral" or ev == "peripheral_detach" then
    setupMonitor()
    draw()
  elseif ev == "key" then
    if a == keys.space then
      setState(not on)
      draw()
    elseif a == keys.r then
      fs.delete(CFG_FILE)
      os.reboot()
    end
  end
end
