@echo off
rem FoodTracker zum Testen starten: zuerst den neuesten Stand holen (git pull), dann den Server in einem eigenen
rem Fenster und danach Expo in diesem Fenster. Einfach doppelklicken - oder eine Verknuepfung darauf, z. B. auf dem
rem Desktop. Voraussetzungen und Anleitung: README.md, Abschnitt "Zum Testen auf dem Laptop".
rem Ohne Aktualisieren starten: start-test.cmd --ohne-pull
setlocal
cd /d "%~dp0"
title FoodTracker - Expo

rem Aktualisieren. git pull kann diese Datei selbst aendern, und cmd liest Batch-Dateien beim Ausfuehren Zeile fuer
rem Zeile von der Platte. Deshalb steht alles in einem Klammerblock, den cmd vorab komplett einliest; danach startet
rem die (vielleicht neue) Datei frisch mit --ohne-pull. Scheitert git pull, weil npm install package-lock.json
rem angepasst hat, wird nur diese Aenderung verworfen (npm erzeugt die Datei selbst) und es noch einmal versucht.
rem Im Block keine Kommentare und in Texten runde Klammern nur mit ^ davor.
if /i not "%~1"=="--ohne-pull" (
  set "FT_GIT="
  set "FT_PULL_OK="
  git rev-parse --is-inside-work-tree >nul 2>nul && set "FT_GIT=1"
  if not defined FT_GIT (
    echo Git fehlt oder dies ist kein Git-Ordner - starte ohne Aktualisieren.
  ) else (
    echo Hole den neuesten Stand ^(git pull^) ...
    git pull --ff-only && set "FT_PULL_OK=1"
    if not defined FT_PULL_OK (
      git diff --quiet -- app/package-lock.json server/package-lock.json
      if errorlevel 1 (
        echo npm hatte package-lock.json angepasst - verwerfe das und versuche es noch einmal ...
        git checkout -- app/package-lock.json server/package-lock.json
        git pull --ff-only && set "FT_PULL_OK=1"
      )
    )
    if defined FT_PULL_OK (
      git log -1 --format="Stand: %%cd - %%s" --date=format-local:"%%d.%%m.%%Y %%H:%%M"
    ) else (
      echo.
      echo Aktualisieren hat nicht geklappt ^(Meldung oben^) - starte mit dem vorhandenen Stand.
      echo Hilfe: README.md, Abschnitt "Zum Testen auf dem Laptop".
      timeout /t 20
    )
  )
  echo.
  call "%~f0" --ohne-pull
  exit /b
)

where node >nul 2>nul
if errorlevel 1 goto :nonode

call :install server
if errorlevel 1 goto :failed
call :install app
if errorlevel 1 goto :failed

if not exist "server\.env" (
  copy /y "server\.env.example" "server\.env" >nul
  echo Einstellungen angelegt: server\.env - bei Bedarf mit dem Editor anpassen.
)

echo.
echo Starte den Server in einem eigenen Fenster ...
start "FoodTracker - Server" /d "%~dp0server" cmd /k npm start

echo Starte Expo ...
echo   Browser: Taste w    iPhone: QR-Code mit der Kamera scannen    Android: QR-Code in Expo Go scannen
echo   Beenden: dieses Fenster und das Server-Fenster schliessen.
echo.
cd app
call npx expo start
goto :eof

:install
rem npm install nur, wenn node_modules fehlt oder sich package.json bzw. package-lock.json geaendert haben.
node "%~dp0scripts\needs-install.cjs" "%~1"
if not errorlevel 1 exit /b 0
echo.
echo Installiere die Pakete in %~1 (beim ersten Mal ein paar Minuten) ...
pushd "%~1"
call npm install --no-audit --no-fund
set rc=%errorlevel%
popd
if not "%rc%"=="0" exit /b %rc%
node "%~dp0scripts\needs-install.cjs" "%~1" --done
exit /b 0

:nonode
echo Node.js fehlt. In PowerShell installieren:
echo   winget install OpenJS.NodeJS.LTS
echo Danach dieses Fenster schliessen und start-test.cmd noch einmal doppelklicken.
pause
exit /b 1

:failed
echo.
echo npm install ist fehlgeschlagen - die Fehlermeldung steht oben.
pause
exit /b 1
