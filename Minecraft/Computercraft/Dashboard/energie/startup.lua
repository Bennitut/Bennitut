-- ============================================================
--  Energie-Sender fuer das Basis-Dashboard (CC:Tweaked)
--  Liest einen entfernten Energiespeicher aus (z.B. Draconic Energy
--  Core ueber einen Energy Pylon) und funkt die Werte per Ender-Modem
--  an das Dashboard.
--
--  Benoetigt: Computer + Ender-Modem, Energiespeicher direkt am
--  Computer oder per Wired Modem angeschlossen.
-- ============================================================

local DIR = fs.getDir(shell.getRunningProgram())
local CFG_FILE = fs.combine(DIR, "energy.cfg")

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

local function fmtNum(n, unit)
  if type(n) ~= "number" then return "?" end
  local pre = { "", "k", "M", "G", "T", "P", "E" }
  local i = 1
  while math.abs(n) >= 1000 and i < #pre do n = n / 1000; i = i + 1 end
  local s = (i == 1) and string.format("%d", math.floor(n + 0.5)) or string.format("%.2f", n)
  return s .. " " .. pre[i] .. (unit or "")
end

-- Liefert eine Lesefunktion fuer gaengige Energie-Peripherie
local function reader(name)
  local p = peripheral.wrap(name)
  if not p then return nil end
  if p.getEnergy and p.getMaxEnergy then
    return function() return p.getEnergy(), p.getMaxEnergy() end
  elseif p.getEnergy and p.getEnergyCapacity then
    return function() return p.getEnergy(), p.getEnergyCapacity() end
  elseif p.getEnergyStored and p.getMaxEnergyStored then
    return function() return p.getEnergyStored(), p.getMaxEnergyStored() end
  elseif p.getEnergyStorage and p.getMaxEnergyStorage then
    return function() return p.getEnergyStorage(), p.getMaxEnergyStorage() end
  end
end

local function energyPeripherals()
  local list = {}
  for _, n in ipairs(peripheral.getNames()) do
    local t = peripheral.getType(n)
    if t ~= "modem" and t ~= "monitor" and reader(n) then
      list[#list + 1] = { name = n, type = t }
    end
  end
  return list
end

local function ask(prompt, default)
  fg(colors.yellow)
  write(prompt)
  if default and default ~= "" then
    fg(colors.lightGray)
    write(" [" .. default .. "]")
  end
  fg(colors.white)
  write(": ")
  local ans = read()
  if ans == "" then ans = default end
  return ans
end

local function setup()
  bg(colors.black)
  term.clear()
  term.setCursorPos(1, 1)
  fg(colors.cyan)
  print("=== Energie-Sender einrichten ===")
  print("")

  local list = energyPeripherals()
  while #list == 0 do
    printError("Kein Energiespeicher gefunden!")
    print("Wired Modem an den Pylon setzen und aktivieren (rot).")
    print("Erneut suchen in 5 Sekunden...")
    sleep(5)
    list = energyPeripherals()
  end

  fg(colors.white)
  print("Gefundene Energiespeicher:")
  for i, p in ipairs(list) do
    fg(colors.lime); write(" " .. i .. ") ")
    fg(colors.white); print(p.name .. " (" .. tostring(p.type) .. ")")
  end
  if #list > 1 then
    fg(colors.lime); write(" 0) ")
    fg(colors.white); print("alle zusammen")
  end

  local chosen
  repeat
    local n = tonumber(ask("Auswahl", "1"))
    if n == 0 and #list > 1 then
      chosen = {}
      for _, p in ipairs(list) do chosen[#chosen + 1] = p.name end
    elseif n and list[n] then
      chosen = { list[n].name }
    end
  until chosen

  local defaultLabel = "Energie"
  local t = (peripheral.getType(chosen[1]) or ""):lower()
  if t:find("draconic") or t:find("pylon") or t:find("rf_storage") then defaultLabel = "Draconic" end

  print("")
  local label = ask("Name im Dashboard", defaultLabel)
  local factor = tonumber(ask("Umrechnungsfaktor (1 = FE, 0.4 = Joule->FE)", "1")) or 1
  local key = ask("Netzwerk-Passwort (wie beim Dashboard, leer = keins)", "") or ""

  local cfg = {
    label = label,
    peripherals = chosen,
    factor = factor,
    interval = 1,
    protocol = "farmctl",
    key = key,
  }
  saveFile(CFG_FILE, cfg)
  pcall(os.setComputerLabel, "Energie: " .. label)
  return cfg
end

local cfg = loadFile(CFG_FILE) or setup()

local modem = peripheral.find("modem", function(_, m) return m.isWireless() end)
if not modem then
  printError("Kein Ender- oder Wireless-Modem gefunden!")
  return
end
rednet.open(peripheral.getName(modem))

local last = { stored = nil, cap = nil, rate = nil, sent = 0, err = nil }
local history = {}

local function readAll()
  local stored, cap = 0, 0
  for _, name in ipairs(cfg.peripherals) do
    local r = reader(name)
    if not r then return nil, "Speicher '" .. name .. "' nicht erreichbar" end
    local ok, e, m = pcall(r)
    if not ok or type(e) ~= "number" or type(m) ~= "number" then
      return nil, "Fehler beim Auslesen von " .. name
    end
    stored, cap = stored + e, cap + m
  end
  return stored * cfg.factor, cap * cfg.factor
end

local function draw()
  bg(colors.black)
  term.clear()
  local w, h = term.getSize()
  local ok = last.err == nil and last.stored ~= nil

  if isColor then term.setBackgroundColor(ok and colors.orange or colors.red)
  else term.setBackgroundColor(colors.white) end
  for y = 1, 3 do
    term.setCursorPos(1, y)
    term.write(string.rep(" ", w))
  end
  local title = "ENERGIE-SENDER: " .. cfg.label
  term.setTextColor(isColor and colors.black or colors.black)
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

  if ok then
    local pct = last.cap > 0 and last.stored / last.cap * 100 or 0
    line("Gespeichert: ", fmtNum(last.stored, "FE"))
    line("Kapazitaet:  ", fmtNum(last.cap, "FE"))
    line("Fuellstand:  ", string.format("%.2f %%", pct), colors.yellow)
    if last.rate then
      line("Rate:        ", (last.rate >= 0 and "+" or "-") .. fmtNum(math.abs(last.rate), "FE/t"),
           last.rate >= 0 and colors.lime or colors.red)
    end
  else
    line("Fehler: ", tostring(last.err or "noch keine Daten"), colors.red)
  end
  y = y + 1
  line("Speicher:    ", table.concat(cfg.peripherals, ", "))
  line("Gesendet:    ", last.sent .. "x  (alle " .. cfg.interval .. "s)")
  line("Computer-ID: ", tostring(os.getComputerID()))

  term.setCursorPos(2, h)
  fg(colors.gray)
  term.write("[R] Neu einrichten")
end

local function sendLoop()
  while true do
    local stored, cap = readAll()
    if stored then
      local now = os.clock()
      history[#history + 1] = { now, stored }
      while #history > 2 and now - history[1][1] > 10 do table.remove(history, 1) end
      if #history >= 2 then
        local a, b = history[1], history[#history]
        local ticks = (b[1] - a[1]) / 0.05
        if ticks > 0 then last.rate = (b[2] - a[2]) / ticks end
      end
      last.stored, last.cap, last.err = stored, cap, nil
      rednet.broadcast({
        type = "energy", key = cfg.key, label = cfg.label,
        stored = stored, cap = cap, rate = last.rate,
      }, cfg.protocol)
      last.sent = last.sent + 1
    else
      last.stored, last.err = nil, cap
    end
    draw()
    sleep(cfg.interval)
  end
end

local function keyLoop()
  while true do
    local _, k = os.pullEvent("key")
    if k == keys.r then
      fs.delete(CFG_FILE)
      os.reboot()
    end
  end
end

parallel.waitForAny(sendLoop, keyLoop)
