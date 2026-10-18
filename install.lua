-- Installer fuer das Basis-Dashboard (CC:Tweaked)
-- Holt die Programme aus dem GitHub-Repository Bennitut/Bennitut.
--
-- Erstinstallation:  wget run https://raw.githubusercontent.com/Bennitut/Bennitut/master/install.lua
-- Spaeter:           install            (fragt, was installiert werden soll)
--                    install dashboard  (oder energie / farm / nbt)

local BASE = "https://raw.githubusercontent.com/Bennitut/Bennitut/master/"

-- Paket -> { Beschreibung, { Datei im Repository = Datei auf dem Computer } }
local PACKAGES = {
  dashboard = { "Dashboard - zentraler Computer mit Monitor",
                { ["dashboard/startup.lua"] = "startup.lua",
                  ["dashboard/config.lua"]  = "config.lua",
                  ["dashboard/scan.lua"]    = "scan.lua" } },
  energie   = { "Energie-Sender - z.B. am Draconic Core",
                { ["energie/startup.lua"] = "startup.lua" } },
  farm      = { "Farm - schaltet eine Farm per Redstone",
                { ["farm/startup.lua"] = "startup.lua" } },
  nbt       = { "NBT Storage - Redstone-Signal beim NBT-Export",
                { ["nbt-storage/startup.lua"] = "startup.lua" } },
}
local ORDER = { "dashboard", "energie", "farm", "nbt" }

-- Diese Dateien werden nur ersetzt, wenn die vorhandene zu alt ist
local BACKUP = { ["config.lua"] = true }
local CONFIG_VERSION = 2

local function download(path)
  local res = http.get(BASE .. path .. "?t=" .. os.epoch("utc"))
  if not res then return nil end
  local data = res.readAll()
  res.close()
  return data
end

if not http then
  printError("HTTP ist auf dem Server deaktiviert.")
  return
end

local pkg = ({ ... })[1]
if not PACKAGES[pkg] then
  print("Was ist das fuer ein Computer?")
  for i, name in ipairs(ORDER) do
    print(("  %d) %s"):format(i, PACKAGES[name][1]))
  end
  write("> ")
  local a = read()
  pkg = ORDER[tonumber(a)] or a
end
if not PACKAGES[pkg] then
  printError("Unbekannt: " .. tostring(pkg))
  return
end

-- Erst alles laden, dann schreiben: bricht der Download ab, bleibt alles beim Alten
local got = {}
for src, dst in pairs(PACKAGES[pkg][2]) do
  write("Lade " .. src .. " ... ")
  local data = download(src)
  if not data then
    print("")
    printError("Download fehlgeschlagen. Ist das Repository oeffentlich?")
    return
  end
  print("ok")
  got[dst] = data
end

for name, content in pairs(got) do
  local keep = false
  if BACKUP[name] and fs.exists(name) then
    -- Einstellungen behalten, solange die vorhandene Datei aktuell genug ist
    local ok, old = pcall(dofile, name)
    local oldV = (ok and type(old) == "table" and tonumber(old.configVersion)) or 0
    if oldV >= CONFIG_VERSION then
      keep = true
      print("Behalte deine " .. name)
    else
      if fs.exists(name .. ".bak") then fs.delete(name .. ".bak") end
      fs.move(name, name .. ".bak")
      print("Alte " .. name .. " gesichert als " .. name .. ".bak")
    end
  end
  if not keep then
    local h = fs.open(name, "w")
    h.write(content)
    h.close()
    print("Geschrieben: " .. name)
  end
end

-- Sich selbst ablegen, damit spaeter "install" fuer Updates reicht
local me = download("install.lua")
if me then
  local h = fs.open("install.lua", "w")
  h.write(me)
  h.close()
end

print("")
print("Fertig! Neustart in 3 Sekunden...")
sleep(3)
os.reboot()
