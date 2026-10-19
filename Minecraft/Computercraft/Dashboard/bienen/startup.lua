-- ============================================================
--  Bienen-Steuerung fuer das Basis-Dashboard (CC:Tweaked)
--  Taktet die Modular-Bees-Factory (Super Factory Manager) per
--  Redstone-Puls und zeigt Honig + Elektroden aus dem ME-System.
--
--  Das SFM-Programm nutzt "EVERY REDSTONE PULSE DO": jeder Puls von
--  diesem Computer = ein Durchlauf. Der Abstand der Pulse (Ticks) ist
--  am Monitor, am Computer und im Dashboard einstellbar. AUS = keine Pulse.
--
--  Benoetigt: Computer direkt am Factory Manager + Wireless-/Ender-Modem.
--  Optional: Monitor, ME Bridge (Advanced Peripherals).
--  Im Dashboard erscheint die Factory im Reiter FARMEN.
-- ============================================================

local DIR = fs.getDir(shell.getRunningProgram())
local CFG_FILE = fs.combine(DIR, "bienen.cfg")
local STATE_FILE = fs.combine(DIR, "bienen.state")

local SCAN_INTERVAL = 10     -- Sekunden zwischen ME-Abfragen
local RATE_WINDOW = 300      -- Sekunden fuer die Honig-Rate
local STEPS = { 2, 4, 5, 10, 20, 40, 60, 100, 200 }   -- waehlbare Ticks zwischen den Pulsen

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
  print("=== Bienen-Factory einrichten ===")
  print("")

  local name = ask("Name", os.getComputerLabel() or "Bienen")
  while not name or name == "" do name = ask("Name (Pflicht)") end

  local sides
  repeat
    local txt = ask("Redstone-Seite zum Factory Manager", "back", rs.getSides())
    sides = parseSides(txt)
    if not sides then printError("Ungueltig. Erlaubt: " .. table.concat(rs.getSides(), ", ")) end
  until sides

  local key = ask("Netzwerk-Passwort (leer = keins)", "") or ""
  local warn = tonumber(ask("Warnung ab wie wenig Elektroden im ME", "4")) or 4

  local cfg = {
    name = name,
    sides = sides,
    protocol = "farmctl",
    key = key,
    warnElectrodes = warn,
  }
  saveFile(CFG_FILE, cfg)
  pcall(os.setComputerLabel, name)
  return cfg
end

local cfg = loadFile(CFG_FILE) or setup()
local st = loadFile(STATE_FILE)
local on, ticks = true, 20
if type(st) == "table" then
  if type(st.on) == "boolean" then on = st.on end
  if tonumber(st.ticks) then ticks = math.max(2, math.floor(tonumber(st.ticks))) end
end

local modem = peripheral.find("modem", function(_, m) return m.isWireless() end)
if not modem then
  printError("Kein Wireless- oder Ender-Modem gefunden!")
  return
end
rednet.open(peripheral.getName(modem))

local lastContact = "noch keiner"
local pulses = 0

-- ME-Daten -------------------------------------------------------------

local me
local honey, electrodes, honeyRate   -- mB, Stueck, mB pro Minute
local samples = {}

local function findMe()
  me = peripheral.find("meBridge") or peripheral.find("me_bridge")
end

local function listOf(...)
  for _, fn in ipairs({ ... }) do
    if me and me[fn] then
      local ok, r = pcall(me[fn])
      if ok and type(r) == "table" then return r end
    end
  end
  return nil
end

local function sumMatching(list, pattern)
  local n = 0
  for _, e in pairs(list) do
    if type(e) == "table" and tostring(e.name or ""):lower():find(pattern, 1, true) then
      n = n + (tonumber(e.amount or e.count) or 0)
    end
  end
  return n
end

local function scanMe()
  if not me then findMe() end
  if not me then
    honey, electrodes, honeyRate = nil, nil, nil
    return
  end
  local fluids = listOf("getFluids", "listFluid", "listFluids")
  local items = listOf("getItems", "listItems")
  honey = fluids and sumMatching(fluids, "honey") or nil
  electrodes = items and sumMatching(items, "electrode") or nil

  if honey then
    local now = os.epoch("utc") / 1000
    samples[#samples + 1] = { t = now, v = honey }
    while #samples > 1 and now - samples[1].t > RATE_WINDOW do table.remove(samples, 1) end
    local first = samples[1]
    if now - first.t >= 20 then
      honeyRate = (honey - first.v) / ((now - first.t) / 60)
    end
  end
end

local function fmtNum(n)
  local a = math.abs(n)
  if a >= 1e9 then return string.format("%.1fG", n / 1e9) end
  if a >= 1e6 then return string.format("%.1fM", n / 1e6) end
  if a >= 1e4 then return string.format("%.1fk", n / 1e3) end
  if a < 100 and n ~= math.floor(n) then return string.format("%.1f", n) end
  return tostring(math.floor(n + 0.5))
end

local function rateText()
  if not honeyRate then return "" end
  local r = honeyRate / 1000
  return (r >= 0 and "+" or "") .. fmtNum(r) .. " B/min"
end

local function electrodesLow()
  return electrodes ~= nil and electrodes < (cfg.warnElectrodes or 4)
end

local function speedText()
  return ticks .. " Ticks (" .. fmtNum(20 / ticks) .. "/s)"
end

-- Takt / Netzwerk --------------------------------------------------------

local pulseTimer, offTimer

local function setOut(v)
  for _, s in ipairs(cfg.sides) do rs.setOutput(s, v) end
end

-- Pulse neu starten (nach AN/AUS oder neuer Geschwindigkeit)
local function restartPulses()
  pulseTimer, offTimer = nil, nil
  setOut(false)
  if on then pulseTimer = os.startTimer(0.05) end
end

local function stepTicks(dir)
  local idx = 1
  for i, s in ipairs(STEPS) do if s <= ticks then idx = i end end
  if STEPS[idx] ~= ticks and dir < 0 then idx = idx + 1 end
  return STEPS[math.max(1, math.min(#STEPS, idx + dir))]
end

local function sendStatus()
  rednet.broadcast({
    type = "status", name = cfg.name, on = on, key = cfg.key,
    bees = { honey = honey, honeyRate = honeyRate, electrodes = electrodes,
             warn = cfg.warnElectrodes, ticks = ticks, me = me ~= nil },
  }, cfg.protocol)
end

local function saveState()
  saveFile(STATE_FILE, { on = on, ticks = ticks })
end

local function setState(newOn)
  on = newOn
  saveState()
  restartPulses()
  sendStatus()
end

local function setTicks(t)
  ticks = math.max(2, math.min(1200, math.floor(t)))
  saveState()
  restartPulses()
  sendStatus()
end

-- Monitor (optional) ----------------------------------------------------

local mon, monName, monW, monH
local btnY1 = math.huge
local speedY, minusX2, plusX1 = -1, 0, math.huge

local function setupMonitor()
  mon = peripheral.find("monitor")
  monName = mon and peripheral.getName(mon)
  if not mon then return end
  local minW = math.max(#cfg.name, 22) + 2
  for sc = 5, 0.5, -0.5 do
    mon.setTextScale(sc)
    local w, h = mon.getSize()
    if w >= minW and h >= 9 then break end
  end
  monW, monH = mon.getSize()
end

local function drawMonitor()
  if not mon then return end
  local w, h = monW, monH
  local mc = mon.isColor()
  local stateBg = mc and (on and colors.green or colors.red) or (on and colors.white or colors.gray)
  local stateFg = mc and colors.white or colors.black
  mon.setBackgroundColor(colors.black)
  mon.clear()

  local function fill(x1, y1, x2, y2, col)
    mon.setBackgroundColor(col)
    for y = y1, y2 do
      mon.setCursorPos(x1, y)
      mon.write(string.rep(" ", x2 - x1 + 1))
    end
  end
  local function center(y, text, fgCol, bgCol)
    text = text:sub(1, w)
    mon.setBackgroundColor(bgCol)
    mon.setTextColor(fgCol)
    mon.setCursorPos(math.max(1, math.floor((w - #text) / 2) + 1), y)
    mon.write(text)
  end

  -- Kopf: Name + Zustand
  fill(1, 1, w, 2, stateBg)
  center(1, cfg.name, stateFg, stateBg)
  center(2, on and "LAEUFT" or "GESTOPPT", stateFg, stateBg)

  -- AN/AUS-Button unten
  local bh = (h >= 12) and 3 or 1
  btnY1 = h - bh + 1
  local btnBg = mc and (on and colors.red or colors.lime) or colors.white
  local btnFg = mc and (on and colors.white or colors.black) or colors.black
  fill(1, btnY1, w, h, btnBg)
  center(btnY1 + math.floor((bh - 1) / 2), on and "[ AUSSCHALTEN ]" or "[ EINSCHALTEN ]", btnFg, btnBg)

  -- Geschwindigkeit: [ - ]  20 Ticks (1/s)  [ + ]
  speedY = btnY1 - 2
  local bw = 5
  minusX2, plusX1 = bw, w - bw + 1
  local sbg = mc and colors.gray or colors.white
  local sfg = mc and colors.white or colors.black
  fill(1, speedY, bw, speedY, sbg)
  fill(plusX1, speedY, w, speedY, sbg)
  mon.setTextColor(sfg)
  mon.setBackgroundColor(sbg)
  mon.setCursorPos(3, speedY); mon.write("-")
  mon.setCursorPos(w - 2, speedY); mon.write("+")
  center(speedY, speedText(), mc and colors.cyan or colors.white, colors.black)
  center(speedY - 1, "Takt", colors.lightGray, colors.black)

  -- Werte dazwischen
  local lines = {}
  if me then
    lines[#lines + 1] = { "Honig: " .. (honey and fmtNum(honey / 1000) .. " B" or "?"), colors.yellow }
    if honeyRate then
      lines[#lines + 1] = { rateText(), honeyRate >= 0 and colors.lime or colors.red }
    end
    lines[#lines + 1] = { "Elektroden: " .. (electrodes and fmtNum(electrodes) or "?"),
                          electrodesLow() and colors.orange or colors.white }
    if electrodesLow() then lines[#lines + 1] = { "ELEKTRODEN KNAPP!", colors.red } end
  else
    lines[#lines + 1] = { "keine ME Bridge", colors.lightGray }
  end
  local top, bottom = 3, speedY - 2
  local y = top + math.max(0, math.floor((bottom - top + 1 - #lines) / 2))
  for _, l in ipairs(lines) do
    if y > bottom then break end
    center(y, l[1], mc and l[2] or colors.white, colors.black)
    y = y + 1
  end
end

local function draw()
  bg(colors.black)
  term.clear()
  local w, h = term.getSize()

  term.setBackgroundColor(isColor and (on and colors.green or colors.red) or (on and colors.white or colors.gray))
  for y = 1, 3 do
    term.setCursorPos(1, y)
    term.write(string.rep(" ", w))
  end
  local title = on and "BIENEN AN" or "BIENEN AUS"
  term.setTextColor(isColor and colors.white or colors.black)
  term.setCursorPos(math.floor((w - #title) / 2) + 1, 2)
  term.write(title)

  bg(colors.black)
  local lines = {
    { "Name:       ", cfg.name },
    { "Redstone:   ", table.concat(cfg.sides, ",") .. (on and " (Pulse)" or " (aus)") },
    { "Takt:       ", speedText() },
    { "ID:         ", tostring(os.getComputerID()) },
    { "Kontakt:    ", lastContact },
    { "Monitor:    ", monName or "keiner" },
    { "ME Bridge:  ", me and peripheral.getName(me) or "keine" },
    { "Honig:      ", honey and (fmtNum(honey / 1000) .. " B  " .. rateText()) or "?" },
    { "Elektroden: ", electrodes and fmtNum(electrodes) or "?" },
  }
  for i, l in ipairs(lines) do
    term.setCursorPos(2, 4 + i)
    fg(colors.lightGray); term.write(l[1])
    fg(colors.white); term.write(l[2])
  end

  term.setCursorPos(2, h)
  fg(colors.gray)
  term.write("[Leer] An/Aus  [+/-] Takt  [R] Einrichten")

  drawMonitor()
end

findMe()
scanMe()
setupMonitor()
restartPulses()
sendStatus()
draw()

local scanTimer = os.startTimer(SCAN_INTERVAL)

while true do
  local ev, a, b, c = os.pullEvent()
  if ev == "timer" then
    if a == pulseTimer then
      -- Puls: 1 Tick an (bei langsamem Takt 2 Ticks), dann aus
      setOut(true)
      pulses = pulses + 1
      offTimer = os.startTimer(ticks >= 4 and 0.1 or 0.05)
      pulseTimer = os.startTimer(ticks * 0.05)
    elseif a == offTimer then
      setOut(false)
      offTimer = nil
    elseif a == scanTimer then
      scanMe()
      sendStatus()
      draw()
      scanTimer = os.startTimer(SCAN_INTERVAL)
    end
  elseif ev == "rednet_message" and c == cfg.protocol and type(b) == "table" and b.key == cfg.key then
    if b.type == "ping" then
      sendStatus()
    elseif b.type == "set" then
      if type(b.on) == "boolean" then setState(b.on) end
      if tonumber(b.ticks) then setTicks(tonumber(b.ticks)) end
    end
    if b.type == "ping" or b.type == "set" then
      lastContact = os.date("%H:%M:%S") .. " (Dashboard #" .. a .. ")"
      draw()
    end
  elseif ev == "monitor_touch" and a == monName then
    if c >= btnY1 then
      setState(not on)
      draw()
    elseif c == speedY and b <= minusX2 then
      setTicks(stepTicks(1))
      draw()
    elseif c == speedY and b >= plusX1 then
      setTicks(stepTicks(-1))
      draw()
    end
  elseif ev == "monitor_resize" and a == monName then
    local w, h = mon.getSize()
    if w ~= monW or h ~= monH then
      setupMonitor()
      draw()
    end
  elseif ev == "peripheral" or ev == "peripheral_detach" then
    findMe()
    setupMonitor()
    draw()
  elseif ev == "key" then
    if a == keys.space then
      setState(not on)
      draw()
    elseif a == keys.minus or a == keys.numPadSubtract then
      setTicks(stepTicks(1))
      draw()
    elseif a == keys.equals or a == keys.numPadAdd then
      setTicks(stepTicks(-1))
      draw()
    elseif a == keys.r then
      fs.delete(CFG_FILE)
      os.reboot()
    end
  end
end
