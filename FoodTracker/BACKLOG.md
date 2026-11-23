# FoodTracker – Backlog

Priorisierte Aufgabenliste für die automatische „Nachtschicht“. Pro Lauf wird die oberste offene
Aufgabe erledigt (bei großen Aufgaben ein abgeschlossener Teilschritt), abgehakt und mit Datum und
einer Zeile Notiz versehen. Neue Bugs und Ideen landen unter „Ideen und Erkenntnisse“ und werden
später priorisiert – Stabilität und Bedienbarkeit vor neuen Funktionen.

Vor jedem Commit: `cd server && npm run check` und `cd app && npm run check`,
bei Web-relevanten Änderungen zusätzlich `cd app && npm run web:export && npm run web:smoke`
(Rauchtest im headless Chromium, braucht Playwright).
Für die PR-Größe (Grenze etwa 1.500 Zeilen) zählen Videodateien und die generierten
`package-lock.json` nicht mit.

## Aufgaben

- [x] **1. Gesundheitscheck und `npm run check`** in `app/` und `server/` (Typecheck, Server-Tests, Lint der App).
  - 23.11.2026: alles grün (Server-Typecheck, 55 Tests, App-Typecheck); ESLint eingerichtet, 2 Fehler und 5 Warnungen behoben, Expo-Pakete auf SDK-57-Stand, Sicherheitsupdates für hono im Server.
- [x] **2. Web-Version:** `npx expo export --platform web` muss durchlaufen (Stand 23.11.2026: scheitert,
  weil `react-native-web` fehlt). Funktionen, die im Browser nicht gehen (Kamera, Dateisystem,
  Video-Thumbnails, Apple-Login), sauber abfangen oder ausblenden. Ziel: Die App läuft ohne Server als
  statische Web-App.
  - 23.11.2026: Export läuft (`npm run web:export`, Single-Page-App in `app/dist/`); Fragebogen → Monatsplan → Einkauf → Vorrat klappt im Browser ohne Server, der Plan bleibt nach dem Neuladen erhalten; ohne Server keine Anfragen an `localhost`; Video-Einzelbilder nur in der App; Tab-Beschriftung nicht mehr abgeschnitten; neuer Browser-Rauchtest `npm run web:smoke`.
- [x] **3. Promo-Clips, um erste Tester zu gewinnen:** Sobald die Web-Version läuft, mit Playwright
  (headless Chromium) Bildschirmaufnahmen der wichtigsten Abläufe im Handy-Format aufnehmen, etwa
  Fragebogen → Monatsplan → Einkaufsliste → Vorrat. Daraus mit ffmpeg 2 bis 3 Hochkant-Clips schneiden
  (1080×1920, 15 bis 30 Sekunden, H.264, deutsche Texteinblendungen, ohne Musik), jeder unter 5 MB, unter
  `marketing/clips/`. Dazu `marketing/clips/clips.md` mit Vorschlägen für Beitragstexte (TikTok,
  Instagram, YouTube Shorts) und einer Anleitung, wo Interessierte die Web-Version testen können. Keine
  fremden Inhalte, Musik oder Logos ohne Lizenz.
  - 23.11.2026: drei Clips (20/16/18 s, je unter 1 MB) mit `make-clips.cjs` (Playwright-Screencast + ffmpeg, reproduzierbar), `clips.md` mit Beitragstexten und Tester-Anleitung (Link noch Platzhalter, bis das Hosting entschieden ist), `bildnachweise.md` für die Rezeptfotos.
- [x] **4. PWA:** Web-Manifest, Name, Icons, Theme-Farbe und ein Hinweis „Zum Home-Bildschirm hinzufügen“.
  - 23.11.2026: `public/manifest.json`, eigenes Symbol (Schüssel mit Blättern, `assets/icon-web.svg`) in allen Größen, Theme-Farbe, `lang="de"`; Chromium meldet die Web-App als installierbar. Hinweis „Als App nutzen“ unter „Heute“, sobald es einen Plan gibt (iPhone: Teilen → Zum Home-Bildschirm, Chrome/Android mit „Installieren“-Knopf), „Später“ blendet ihn dauerhaft aus.
- [ ] **5. Offline-Modus als Standard:** Ohne Server-URL die Server-Funktionen (Foto- und Bon-Erkennung,
  Import, Übersetzen, Community, Bestellungen) freundlich als „bald verfügbar“ kennzeichnen statt Fehler
  zu zeigen.
  - 23.11.2026, Teil 1: `HAS_SERVER` in `lib/api.ts` und Karte `components/ComingSoon.tsx` („🚧 Bald verfügbar“, fünf Sprachen); Erfassen (Foto/Kassenbon) und Rezept-Import nutzen sie. Offen: Übersetzen, Community (Entdecken, Teilen), Bestellungen, KI-Wünsche im Plan, Anmeldung, Fotos/Bewertungen und „Text mit KI verbessern“.
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

- **Web-Version hosten (für Punkt 3, braucht Benjamins Entscheidung):** Für Tester braucht es einen Link.
  Kostenlos und ohne neues Konto ginge GitHub Pages unter `bennitut.github.io/Bennitut/`; dafür muss
  `experiments.baseUrl` auf `/Bennitut` stehen (sonst zeigen die Skript-Pfade ins Leere) und eine Kopie von
  `index.html` als `404.html` dazu, damit Direktlinks wie `/plan` funktionieren. Einschalten (Pages bzw. eine
  Action) muss Benjamin selbst – die Nachtschicht veröffentlicht nichts. (23.11.2026)
- **Tester-Link in `marketing/clips/clips.md`:** steht als Platzhalter `<LINK ZUR WEB-VERSION>` drin, bis das
  Hosting entschieden ist; dann ersetzen. (23.11.2026)
- **Datenschutz (für Punkt 7):** Die Web-Version und die App laden Rezeptfotos direkt von `upload.wikimedia.org` und
  `live.staticflickr.com` – dabei sehen diese Dienste die IP-Adresse. In der Datenschutzerklärung erwähnen oder die
  Fotos später selbst ausliefern. (23.11.2026)
- **Promo-Clips aktuell halten:** Ändert sich die Oberfläche deutlich, die Clips mit `node make-clips.cjs` neu
  aufnehmen (etwa drei Minuten). Die Texteinblendungen versprechen bewusst nur, was ohne Server geht. (23.11.2026)
- **App-Symbol ist noch das Expo-Standardsymbol** (`assets/icon.png`, Android-Symbole, Splash): Für die Stores
  braucht es ein eigenes. Vorschlag: das neue Web-Symbol (`assets/icon-web.svg`, Schüssel mit Blättern) auch dafür
  verwenden – Benjamin entscheidet über das Aussehen. (23.11.2026)
- **Web unter einem Unterpfad (z. B. GitHub Pages `/Bennitut/`):** `public/index.html` und `public/manifest.json`
  verweisen absolut auf `/manifest.json`, `/icons/…` und `start_url: "/"`; beim Hosting unter einem Unterpfad
  müssen diese Pfade das Präfix bekommen. (23.11.2026)
- **Web: Video-Import** ist im Browser ausgeblendet (keine Video-Thumbnails, kein Dateisystem). Machbar wäre
  es mit `<video>` + Canvas; lohnt erst, wenn es einen Server gibt. Achtung: `expo-image-picker` liefert die
  Videolänge im Browser in Sekunden, in der App in Millisekunden. (23.11.2026)
- **Doppeltes Emoji im Nutzerverzeichnis:** Die Karte zeigt „👥 👥 Nutzerverzeichnis“, weil der Text
  `account.directory` schon das Emoji enthält und die Karte zusätzlich `icon="👥"` bekommt (`app/src/app/users.tsx`).
  Kleiner Fix: Emoji aus dem Text nehmen (alle fünf Sprachen) oder das `icon` weglassen. (23.11.2026)
- **`expo lint` prüft keine `.cjs`-Dateien** (z. B. `app/scripts/web-smoke.cjs`); die einmal von Hand mit
  `npx eslint scripts/web-smoke.cjs` prüfen, wenn sie geändert werden. (23.11.2026)
- **Lint ist streng:** `npm run lint` bricht schon bei Warnungen ab (`--max-warnings 0`), damit sich keine
  Warnungen ansammeln. Bewusst gewollte Ausnahmen mit `// eslint-disable-next-line <regel>` und einer
  Begründung markieren. (23.11.2026)
- **expo-doctor:** läuft inzwischen auch in der Cloud-Sitzung (`npx --yes expo-doctor`): 21 von 21 Checks
  bestanden, `npx expo install --check` ist grün. (23.11.2026)
- **npm audit (App):** 12 Meldungen (8 mittel, 4 hoch), alle in Abhängigkeiten von Expo und ESLint
  (u. a. `query-string`/`decode-uri-component` in expo-router, `minimatch`, `zod`). Nicht mit
  `npm audit fix --force` beheben, sondern über neue Expo-Patchstände (`npx expo install --check`).
  Der Server meldet nach dem Update 0 Schwachstellen. (23.11.2026)
- **„App-Daten zurücksetzen“ im Profil fehlt:** Den ersten Fragebogen (mit automatischem Plan) kann man
  in Expo Go nur testen, wenn man Expo Go neu installiert. Ein Knopf mit Sicherheitsabfrage hilft beim
  Testen und passt zur Datenschutzerklärung (Daten selbst löschen). (23.11.2026)
- **ESLint 9** gilt laut npm als nicht mehr unterstützt; erst auf ESLint 10 wechseln, wenn
  `eslint-config-expo` es offiziell unterstützt. (23.11.2026)
