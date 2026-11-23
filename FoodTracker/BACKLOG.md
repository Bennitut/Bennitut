# FoodTracker – Backlog

Priorisierte Aufgabenliste für die automatische „Nachtschicht“. Pro Lauf wird die oberste offene
Aufgabe erledigt (bei großen Aufgaben ein abgeschlossener Teilschritt), abgehakt und mit Datum und
einer Zeile Notiz versehen. Neue Bugs und Ideen landen unter „Ideen und Erkenntnisse“ und werden
später priorisiert – Stabilität und Bedienbarkeit vor neuen Funktionen.

Vor jedem Commit: `cd server && npm run check` und `cd app && npm run check`,
bei Web-relevanten Änderungen zusätzlich `cd app && npx expo export --platform web`.
Für die PR-Größe (Grenze etwa 1.500 Zeilen) zählen Videodateien und die generierten
`package-lock.json` nicht mit.

## Aufgaben

- [x] **1. Gesundheitscheck und `npm run check`** in `app/` und `server/` (Typecheck, Server-Tests, Lint der App).
  - 23.11.2026: alles grün (Server-Typecheck, 55 Tests, App-Typecheck); ESLint eingerichtet, 2 Fehler und 5 Warnungen behoben, Expo-Pakete auf SDK-57-Stand, Sicherheitsupdates für hono im Server.
- [ ] **2. Web-Version:** `npx expo export --platform web` muss durchlaufen (Stand 23.11.2026: scheitert,
  weil `react-native-web` fehlt). Funktionen, die im Browser nicht gehen (Kamera, Dateisystem,
  Video-Thumbnails, Apple-Login), sauber abfangen oder ausblenden. Ziel: Die App läuft ohne Server als
  statische Web-App.
- [ ] **3. Promo-Clips, um erste Tester zu gewinnen:** Sobald die Web-Version läuft, mit Playwright
  (headless Chromium) Bildschirmaufnahmen der wichtigsten Abläufe im Handy-Format aufnehmen, etwa
  Fragebogen → Monatsplan → Einkaufsliste → Vorrat. Daraus mit ffmpeg 2 bis 3 Hochkant-Clips schneiden
  (1080×1920, 15 bis 30 Sekunden, H.264, deutsche Texteinblendungen, ohne Musik), jeder unter 5 MB, unter
  `marketing/clips/`. Dazu `marketing/clips/clips.md` mit Vorschlägen für Beitragstexte (TikTok,
  Instagram, YouTube Shorts) und einer Anleitung, wo Interessierte die Web-Version testen können. Keine
  fremden Inhalte, Musik oder Logos ohne Lizenz.
- [ ] **4. PWA:** Web-Manifest, Name, Icons, Theme-Farbe und ein Hinweis „Zum Home-Bildschirm hinzufügen“.
- [ ] **5. Offline-Modus als Standard:** Ohne Server-URL die Server-Funktionen (Foto- und Bon-Erkennung,
  Import, Übersetzen, Community, Bestellungen) freundlich als „bald verfügbar“ kennzeichnen statt Fehler
  zu zeigen.
- [ ] **6. Tests für die App-Logik** in `app/src/lib` (Planer, Vorrat, Nährwerte, Datumslogik) mit einem
  leichtgewichtigen Test-Runner ohne native Module.
- [ ] **7. Rechtstexte als Entwürfe:** Datenschutzerklärung und Impressum (Österreich) mit klar markierten
  Platzhaltern für Benjamins Angaben. Nichts erfinden.
- [ ] **8. `docs/MONETARISIERUNG.md`:** Vorschlag kostenlos gegenüber Premium (KI-Funktionen verursachen
  API-Kosten und gehören ins Premium), Preisideen, Wege ohne Vorabkosten. Nur ein Konzept, keine
  Zahlungsanbindung.
- [ ] **9. KI-Kosten im Server begrenzen:** Rate-Limit pro Nutzer oder Gerät, Cache für identische
  Anfragen, günstigstes geeignetes Modell je Funktion, Kostenschätzung pro Anfrage loggen.
- [ ] **10. Store-Vorbereitung ohne Konten:** `eas.json` mit den Profilen development, preview und
  production sowie Store-Texte DE/EN unter `docs/store/`. Nichts einreichen.

Danach: Punkte aus „Ideen und Erkenntnisse“ priorisieren, Stabilität und Bedienbarkeit vor neuen Funktionen.

## Ideen und Erkenntnisse

- **Web-Export (für Punkt 2):** Der Fehler kommt aus `expo-router/build/renderRootComponent.js`, das
  `react-native-web/dist/index` importiert. `react-dom` ist schon installiert. Paket mit
  `npx expo install react-native-web` ergänzen, danach den nächsten Fehler ansehen. (23.11.2026)
- **Lint ist streng:** `npm run lint` bricht schon bei Warnungen ab (`--max-warnings 0`), damit sich keine
  Warnungen ansammeln. Bewusst gewollte Ausnahmen mit `// eslint-disable-next-line <regel>` und einer
  Begründung markieren. (23.11.2026)
- **expo-doctor:** lief in der Cloud-Sitzung nicht (das Paket wird erst beim Aufruf heruntergeladen).
  Bei Gelegenheit lokal `npx expo-doctor` ausführen. `npx expo install --check` ist grün. (23.11.2026)
- **npm audit (App):** 12 Meldungen (8 mittel, 4 hoch), alle in Abhängigkeiten von Expo und ESLint
  (u. a. `query-string`/`decode-uri-component` in expo-router, `minimatch`, `zod`). Nicht mit
  `npm audit fix --force` beheben, sondern über neue Expo-Patchstände (`npx expo install --check`).
  Der Server meldet nach dem Update 0 Schwachstellen. (23.11.2026)
- **ESLint 9** gilt laut npm als nicht mehr unterstützt; erst auf ESLint 10 wechseln, wenn
  `eslint-config-expo` es offiziell unterstützt. (23.11.2026)
