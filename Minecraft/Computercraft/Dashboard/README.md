# Basis-Dashboard für ComputerCraft (ATM10)

Programme für CC:Tweaked: Dashboard mit Monitor, Energie-Sender, Farm-Steuerung und NBT Storage.

## Installation

Auf jedem Computer:

```
wget run https://raw.githubusercontent.com/Bennitut/Bennitut/master/Minecraft/Computercraft/Dashboard/install.lua
```

Danach auswählen, was der Computer sein soll:

| Nr. | Paket       | Wofür                                                         |
|-----|-------------|---------------------------------------------------------------|
| 1   | `dashboard` | Zentraler Computer mit Monitor, ME Bridge, Chat Box           |
| 2   | `energie`   | Energie-Sender, z. B. am Draconic Core                         |
| 3   | `farm`      | Schaltet eine Farm per Redstone                               |
| 4   | `nbt`       | NBT Storage: Redstone AN während des NBT-Exports, danach AUS  |

Updates später einfach mit `install` (oder `install farm` usw.). Das Dashboard hat dafür den UPDATE-Knopf.

## Ordner

- `install.lua` – Installer, lädt die Dateien aus diesem Repository
- `dashboard/` – `startup.lua`, `config.lua`, `scan.lua`
- `energie/`, `farm/`, `nbt-storage/` – je eine `startup.lua`

## NBT-Export

Das Dashboard legt im eingestellten Abstand (Standard: 1 Stunde) alle Items mit NBT-Daten
aus dem ME-System in eine Kiste direkt an der ME Bridge. Vorher schaltet es per Funk das
Redstone-Signal am Computer **NBT Storage** an und nach dem Export wieder aus. Antwortet
NBT Storage nicht, wird nicht exportiert. Einstellbar im Reiter EINSTELLUNGEN.

- Startbildschirm: kleine Übersicht (letzter Export, wichtigste Items, nächster Termin)
- Reiter STATISTIK → „NBT-Export“: alle Exporte mit Zeit, Items und Mengen
- NBT Storage: optionaler Monitor mit Signal-Status und Log (Signal AN/AUS, exportierte Items)
- Neben-Dashboards übernehmen Zeitzone, Farben, Titel, Chat- und NBT-Einstellungen vom
  Haupt-Dashboard; Änderungen dort werden ans Haupt-Dashboard weitergegeben
