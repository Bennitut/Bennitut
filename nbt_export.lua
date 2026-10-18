-- nbt_export.lua
-- Holt einmal pro Stunde alle Items mit NBT-/Komponenten-Daten aus dem
-- AE2-Netz (ueber eine ME Bridge von Advanced Peripherals) und legt sie
-- in eine Kiste.
--
-- Aufbau:  ME Bridge am Computer (oder per Modem) + Kiste direkt an der
--          ME Bridge (Seite unten unter KISTE_SEITE eintragen).
-- Start:   nbt_export          -> laeuft dauerhaft, jede Stunde ein Durchlauf
--          nbt_export test     -> zeigt nur an, was exportiert wuerde
--          nbt_export debug    -> zeigt die Rohdaten der ersten Items

------------------------------------------------------------------------
-- Einstellungen
------------------------------------------------------------------------
local KISTE_SEITE = "up"        -- Seite der Kiste von der ME Bridge aus gesehen
                                -- ("up","down","north","south","east","west")
local INTERVALL   = 60 * 60     -- Sekunden zwischen den Durchlaeufen (1 Stunde)

-- Items, die trotz NBT im ME-System bleiben sollen
local AUSNAHMEN = {
  -- ["minecraft:enchanted_book"] = true,
}

------------------------------------------------------------------------
local bridge = peripheral.find("me_bridge") or peripheral.find("meBridge")
if not bridge then
  error("Keine ME Bridge gefunden. Ist sie angeschlossen?", 0)
end

local listItems = bridge.listItems or bridge.getItems
if not listItems then
  error("Diese ME-Bridge-Version kennt weder listItems noch getItems.", 0)
end

-- Hat das Item eigene Daten (NBT in alten Versionen, Komponenten in 1.21)?
local function hatDaten(item)
  if type(item.nbt) == "table" and next(item.nbt) ~= nil then return true end
  if type(item.nbt) == "string" and item.nbt ~= "" then return true end
  if type(item.components) == "table" and next(item.components) ~= nil then return true end
  return false
end

-- Exportiert genau diese Item-Variante (ueber den Fingerprint) in die Kiste.
-- Die Bridge gibt pro Aufruf oft nur einen Stack heraus, darum die Schleife.
local function exportiere(item)
  local filter = { name = item.name, count = item.count }
  if item.fingerprint then filter.fingerprint = item.fingerprint end

  local gesamt = 0
  while gesamt < item.count do
    filter.count = item.count - gesamt
    local ok, menge = pcall(bridge.exportItem, filter, KISTE_SEITE)
    if not ok or type(menge) ~= "number" or menge <= 0 then break end
    gesamt = gesamt + menge
  end
  return gesamt
end

local function durchlauf(nurTesten)
  local items = listItems()
  if type(items) ~= "table" then
    print("Konnte die Itemliste nicht lesen.")
    return
  end

  local anzahlSorten, anzahlItems = 0, 0
  for _, item in ipairs(items) do
    if hatDaten(item) and not AUSNAHMEN[item.name] then
      local name = item.displayName or item.name
      if nurTesten then
        print(("%dx %s"):format(item.count, name))
      else
        local raus = exportiere(item)
        if raus > 0 then
          anzahlSorten = anzahlSorten + 1
          anzahlItems = anzahlItems + raus
        end
        if raus < item.count then
          print(("Nur %d/%d %s exportiert (Kiste voll?)"):format(raus, item.count, name))
        end
      end
    end
  end

  if not nurTesten then
    print(("[%s] %d Items (%d Sorten) exportiert"):format(
      textutils.formatTime(os.time(), true), anzahlItems, anzahlSorten))
  end
end

------------------------------------------------------------------------
local modus = ...

if modus == "debug" then
  local items = listItems()
  for i = 1, math.min(3, #items) do
    print(textutils.serialize(items[i]))
  end
  return
elseif modus == "test" then
  durchlauf(true)
  return
end

print("NBT-Export laeuft. Intervall: " .. INTERVALL .. " s")
while true do
  local ok, err = pcall(durchlauf, false)
  if not ok then print("Fehler: " .. tostring(err)) end
  sleep(INTERVALL)
end
