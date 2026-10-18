-- Einstellungen fuer das Basis-Dashboard.
-- Alles, was hier fehlt oder auskommentiert ist, nutzt den Standardwert.
return {
  configVersion = 2,      -- nicht aendern: steigt, wenn neue Einstellungen dazukommen

  title     = "BASIS-DASHBOARD",

  -- Rolle: "main" = Haupt-Dashboard (verwaltet Ordner, Lag-Schutz, Lager, Chat)
  --        "mirror" = Neben-Dashboard (zeigt alles vom Haupt-Dashboard, Knoepfe wirken dort)
  role      = "main",

  -- Monitor: nil = automatisch erkennen, sonst Name z.B. "monitor_0"
  monitor   = nil,

  -- Schriftgroesse: "auto" waehlt die groesste Schrift, bei der mindestens
  -- minWidth x minHeight Zeichen auf den Monitor passen.
  -- Kleinere Werte = groessere Schrift. Oder feste Zahl 0.5 - 5.
  textScale = "auto",
  minWidth  = 50,
  minHeight = 24,

  -- Muss bei allen Farm-Computern gleich sein
  protocol  = "farmctl",
  key       = "",         -- Passwort (bei den Farmen beim Einrichten gleich eingeben)

  -- Energiespeicher -----------------------------------------------------
  -- Leer = automatisch: Draconic (per Energie-Sender oder Pylon am Kabel),
  -- Induction Port, Energy Cubes usw. Alle werden addiert und einzeln gezeigt.
  --
  -- Manuell (Namen zeigt das Programm "scan"):
  -- energy = {
  --   { peripheral = "meBridge_0",            label = "AE2" },
  --   { peripheral = "draconic_rf_storage_0", label = "Draconic" },
  -- },
  energy       = {},
  energyUnit   = "FE",
  energyFactor = 1,       -- Faktor fuer normale Speicher (0.4 = Mekanism-Joule -> FE)
  aeEnergy     = false,   -- AE2-Energie mitzaehlen (aus: FE in AppliedFlux-Zellen ist nicht lesbar)
  aeFactor     = 2,       -- 1 AE = 2 FE
  feCells      = true,    -- FE in AppliedFlux-Zellen (ME FE Storage Cell) mitzaehlen
  feCellFactor = 1048576, -- FE pro belegtem Byte (256M-Zelle: Bytes x 1048576 = FE)

  -- ME Bridge (Advanced Peripherals): nil = automatisch
  meBridge  = nil,

  farmTimeout = 15,       -- Sekunden ohne Antwort, bis eine Farm OFFLINE ist

  -- Quelle fuer den UPDATE-Knopf oben rechts (Ordner, in dem install.lua liegt)
  updateUrl   = "https://raw.githubusercontent.com/Bennitut/Bennitut/master/Minecraft/Computercraft/Dashboard/",

  -- Chat-Bot: braucht eine Chat Box (Advanced Peripherals) am Computer/Kabel
  chat        = true,
  chatPrefix  = "Basis",    -- Name vor jeder Nachricht
  chatRange   = nil,        -- Reichweite in Bloecken, nil = ganzer Server
  chatTps     = 19,         -- Meldung, wenn die TPS darunter fallen
  chatEnergySeconds = 10,   -- Meldung, wenn die Energie so lange sinkt
  chatEnergyPause   = 300,  -- mindestens so viele Sekunden zwischen zwei Energie-Warnungen
  chatCrafts  = true,       -- Meldung, wenn ein Craft fertig ist
  chatFarms   = true,       -- Meldung, wenn Farmen an-/ausgehen
  chatFarmOffline = true,   -- Meldung, wenn ein Farm-Computer offline/wieder online geht
  chatStock   = true,       -- Meldung bei knappem Lager-Item / gestartetem Auto-Craft
  chatStorageWarn = 90,     -- Meldung, wenn ein ME-Speicher zu so viel % voll ist

  stockMaxCraft = 4096,     -- hoechstens so viele Items pro Auto-Craft

  -- NBT-Export: legt alle Items mit NBT-Daten (verzauberte/beschaedigte
  -- Werkzeuge, gefuellte Rucksaecke, ...) regelmaessig aus dem ME-System in
  -- eine Kiste. Die Kiste muss direkt an der ME Bridge stehen.
  -- Auch im Reiter EINSTELLUNGEN schaltbar.
  nbtExport         = false,
  nbtExportSide     = "up",   -- Seite der Kiste von der Bridge aus: up/down/north/south/east/west
  nbtExportInterval = 3600,   -- Sekunden zwischen zwei Exporten (3600 = 1 Stunde)
  nbtExportSkip     = {       -- diese Items bleiben im ME-System, z.B.:
    -- "minecraft:enchanted_book",
  },
  -- Vor dem Export schaltet der Computer "NBT Storage" (eigenes Installer-Paket)
  -- sein Redstone-Signal AN, nach dem Export wieder AUS
  nbtStorage        = true,
  nbtStorageWait    = 3,      -- Sekunden zwischen Signal AN und Export
}
