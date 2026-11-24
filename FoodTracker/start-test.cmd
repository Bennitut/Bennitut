@echo off
rem FoodTracker zum Testen starten: der Server in einem eigenen Fenster, danach Expo in diesem Fenster.
rem Einfach doppelklicken. Voraussetzungen und Anleitung: README.md, Abschnitt "Zum Testen auf dem Laptop".
setlocal
cd /d "%~dp0"
title FoodTracker - Expo

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
