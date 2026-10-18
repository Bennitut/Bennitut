-- Zeigt alle angeschlossenen Peripherie-Geraete und ihre Energie-Funktionen,
-- dazu die Speicherzellen der ME Bridge. Alles wird auch in scan.txt gespeichert
-- (ansehen mit:  edit scan.txt).

local lines = {}
local function add(s, c) lines[#lines + 1] = { s, c or colors.white } end

local function itemName(item)
  if type(item) == "table" then return tostring(item.name or item.displayName or "?") end
  return tostring(item)
end

for _, name in ipairs(peripheral.getNames()) do
  local types = { peripheral.getType(name) }
  local methods = peripheral.getMethods(name) or {}
  local energy = {}
  for _, m in ipairs(methods) do
    local l = m:lower()
    if l:find("energy") or l:find("transfer") then energy[#energy + 1] = m end
  end
  add(name .. " (" .. table.concat(types, ", ") .. ")", #energy > 0 and colors.lime or colors.lightGray)
  if #energy > 0 then
    add(" " .. table.concat(energy, ", "))
    local p = peripheral.wrap(name)
    local get = p.getEnergyStorage or p.getStoredEnergy or p.getEnergyStored or p.getEnergy
    local max = p.getMaxEnergyStorage or p.getMaxEnergyStored or p.getMaxEnergy or p.getEnergyCapacity
    if get and max then
      local ok1, e = pcall(get)
      local ok2, m = pcall(max)
      if ok1 and ok2 then add((" Wert: %s / %s"):format(tostring(e), tostring(m)), colors.yellow) end
    end
  end
end

-- Speicherzellen der ME Bridge (fuer AppliedFlux-FE-Zellen) ----------------
for _, name in ipairs(peripheral.getNames()) do
  local p = peripheral.wrap(name)
  if p and p.getCells then
    local ok, cells = pcall(p.getCells)
    if ok and type(cells) == "table" then
      add("getCells: " .. #cells .. " Zellen", colors.cyan)
      -- gleiche Zellen zusammenfassen, besondere (nicht Item/Fluid) einzeln zeigen
      local groups, order, special = {}, {}, {}
      for _, c in ipairs(cells) do
        local t = tostring(c.type)
        if t ~= "ae2:i" and t ~= "ae2:f" then
          special[#special + 1] = c
        else
          local k = itemName(c.item) .. " " .. t
          if not groups[k] then groups[k] = 0; order[#order + 1] = k end
          groups[k] = groups[k] + 1
        end
      end
      for _, k in ipairs(order) do add((" %dx %s"):format(groups[k], k), colors.lightGray) end
      if #special == 0 then
        add(" Keine FE-/Sonderzellen gemeldet!", colors.red)
      end
      for _, c in ipairs(special) do
        add((" SONDERZELLE %s %s used=%s"):format(itemName(c.item), tostring(c.type), tostring(c.usedBytes)), colors.yellow)
        add("   " .. textutils.serialize(c, { compact = true }), colors.yellow)
      end
    else
      add("getCells Fehler: " .. tostring(cells), colors.red)
    end
  end
  if p and p.getDrives then
    local ok, drives = pcall(p.getDrives)
    if ok and type(drives) == "table" then
      add("getDrives: " .. #drives .. " Laufwerke", colors.cyan)
      for i, d in ipairs(drives) do
        local list = type(d) == "table" and (d.cells or d.items) or nil
        local names = {}
        if type(list) == "table" then
          for _, c in pairs(list) do
            if type(c) == "table" then names[#names + 1] = itemName(c.item or c.name) end
          end
        end
        add((" #%d %s: %s"):format(i, itemName(type(d) == "table" and (d.item or d.name) or d),
            #names > 0 and table.concat(names, ", ") or "?"), colors.lightGray)
        if i == 1 then add("   " .. textutils.serialize(d, { compact = true }):sub(1, 400), colors.gray) end
      end
    else
      add("getDrives Fehler: " .. tostring(drives), colors.red)
    end
  end
end

-- Crafting-Rohdaten (fuer den CRAFTS-Reiter) -------------------------------
for _, name in ipairs(peripheral.getNames()) do
  local p = peripheral.wrap(name)
  if p and (p.getCraftingTasks or p.getCraftingCPUs) then
    if p.getCraftingTasks then
      local ok, list = pcall(p.getCraftingTasks)
      if ok and type(list) == "table" then
        add("getCraftingTasks: " .. #list .. " Auftraege", colors.cyan)
        if list[1] then add("   " .. textutils.serialize(list[1], { compact = true }):sub(1, 500), colors.yellow) end
        if list[1] and list[1].id ~= nil and p.getCraftingJob then
          local ok2, job = pcall(p.getCraftingJob, list[1].id)
          if ok2 and type(job) == "table" then
            local keys = {}
            for k in pairs(job) do keys[#keys + 1] = tostring(k) end
            table.sort(keys)
            add("getCraftingJob: " .. table.concat(keys, ", "), colors.yellow)
            if type(job.getMissingItems) == "function" then
              local ok3, m = pcall(job.getMissingItems)
              add("   fehlend: " .. textutils.serialize(ok3 and m or tostring(m), { compact = true }):sub(1, 300), colors.yellow)
            end
          else
            add("getCraftingJob: " .. tostring(job), colors.red)
          end
        end
      else
        add("getCraftingTasks Fehler: " .. tostring(list), colors.red)
      end
    end
    if p.getCraftingCPUs then
      local ok, cpus = pcall(p.getCraftingCPUs)
      if ok and type(cpus) == "table" then
        add("getCraftingCPUs: " .. #cpus .. " CPUs", colors.cyan)
        for _, c in ipairs(cpus) do
          if c.isBusy then
            add("   " .. textutils.serialize(c, { compact = true }):sub(1, 500), colors.yellow)
            break
          end
        end
      end
    end
  end
end

if #lines == 0 then add("Keine Peripherie gefunden. Wired Modems aktiviert (rot)?", colors.red) end

local h = fs.open("scan.txt", "w")
for _, l in ipairs(lines) do h.writeLine(l[1]) end
h.close()

term.clear()
term.setCursorPos(1, 1)
for _, l in ipairs(lines) do
  if term.isColor() then term.setTextColor(l[2]) end
  textutils.pagedPrint(l[1])
end
term.setTextColor(colors.white)
print("")
print("Gespeichert in scan.txt (ansehen: edit scan.txt)")
