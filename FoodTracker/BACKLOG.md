# FoodTracker – Backlog

Priorisierte Aufgabenliste für die automatische „Nachtschicht“. Pro Lauf wird die oberste offene
Aufgabe erledigt (bei großen Aufgaben ein abgeschlossener Teilschritt), abgehakt und mit Datum und
einer Zeile Notiz versehen. Neue Bugs und Ideen landen unter „Ideen und Erkenntnisse“ und werden
später priorisiert – Stabilität und Bedienbarkeit vor neuen Funktionen.

Vor jedem Commit: `cd server && npm run check` und `cd app && npm run check` (Typecheck, Lint und `npm test`),
bei Web-relevanten Änderungen zusätzlich `cd app && npm run web:export && npm run web:smoke`
(Rauchtest im headless Chromium, braucht Playwright). Nach Änderungen an dieser Datei oder an `reports/`:
`node --test reports/make-report.test.cjs` – prüft, dass der Tagesbericht alles Erledigte findet. Erledigtes
heißt hier immer „✅ … erledigt TT.MM.JJJJ“, neue Punkte unter „Ideen und Erkenntnisse“ enden mit „(TT.MM.JJJJ)“
(Einzelheiten im Kopf von `reports/make-report.cjs`).
Für die PR-Größe (Grenze etwa 1.500 Zeilen) zählen Videodateien und die generierten
`package-lock.json` nicht mit.

**Stand 24.11.2026:** PR #2 hat die Grenze von etwa 1.500 geänderten Zeilen überschritten. Bis Benjamin ihn mergt, nur
Fixes und Tests: Punkt 6 (Tests für die App-Logik), das doppelte Emoji, Neuplanen/Fixieren, der Tagesbericht, die
Rezepttexte je Sprache (Tests) und die Fotos mit Fleisch oder Fisch bei vegetarischen Rezepten sind erledigt. Als
Nächstes: prüfen, ob die Promo-Clips das entfernte Kürbisrisotto-Foto zeigen (dann neu aufnehmen), danach „Entdecken“
lädt alle Katalogfotos auf einmal (siehe „Ideen und Erkenntnisse“). Punkt 5, Teil 2 folgt nach dem Mergen im neuen PR.

## Daueraufgabe: Tagesbericht als PDF (Benjamins Wunsch vom 23.11.2026)

Jeden Tag einmal, direkt nach dem Setup und vor der obersten offenen Aufgabe: Fehlt
`reports/<Vortag>.pdf` (Datum des Vortags in Japan-Zeit, `JJJJ-MM-TT`) oder wurde sie noch am Vortag selbst
committet (vorläufiger Stand), und gab es am Vortag Commits auf `claude/nightly`, dann
`node FoodTracker/reports/make-report.cjs <Vortag>` ausführen, die PDF committen und pushen, im PR unter
„Tagesberichte“ verlinken und Benjamin mit SendUserFile schicken (in der Benachrichtigung kurz erwähnen).

## ✅ Vorrang: GitHub Pages vorbereiten (Benjamin richtet Pages ein, 23.11.2026) – erledigt 24.11.2026

24.11.2026: `.github/workflows/foodtracker-pages.yml` (Unterpfad aus `actions/configure-pages`), `app.config.js` setzt
`experiments.baseUrl` nur mit `WEB_BASE_PATH`, `npm run web:pages` baut nach `app/dist-pages/` samt angepasstem
Manifest und `404.html`; Rauchtest unter `/Bennitut/` wie auf GitHub Pages grün; Link in `clips.md` eingetragen.
Einschalten und mergen macht Benjamin (Anleitung im Kopf der Workflow-Datei und im PR).

Vor Punkt 5 erledigen – die Web-Version soll unter `https://bennitut.github.io/Bennitut/` laufen. Selbst nichts
veröffentlichen, nur vorbereiten; einschalten und mergen macht Benjamin.

- `.github/workflows/foodtracker-pages.yml` im Wurzelordner des Repos: bei Push auf `feature/food-tracker-app`
  (Pfade `FoodTracker/app/**` und `FoodTracker/server/src/**`) und per Hand (`workflow_dispatch`). Node 22,
  `npm ci` und Web-Export in `FoodTracker/app` mit Basis-Pfad `/Bennitut`, in `index.html` und `manifest.json` die
  absoluten Pfade (`/manifest.json`, `/icons/…`, `start_url`, `scope`) auf `/Bennitut/…` umschreiben, `404.html`
  als Kopie von `index.html` (Direktlinks), dann `actions/upload-pages-artifact` und `actions/deploy-pages`
  (Rechte `pages: write`, `id-token: write`, Umgebung `github-pages`).
- Den Basis-Pfad nur für diesen Build setzen (z. B. `app.config.js`, das `experiments.baseUrl` aus einer
  Umgebungsvariable liest), damit `npx expo start` lokal unverändert bleibt. Lokal mit Export und Rauchtest unter
  `/Bennitut/` prüfen.
- In `marketing/clips/clips.md` den Platzhalter durch `https://bennitut.github.io/Bennitut/` ersetzen und im PR
  erklären: nach dem Mergen unter Settings → Pages bei „Source“ „GitHub Actions“ wählen; lehnt GitHub die
  Bereitstellung wegen der Umgebung `github-pages` ab, dort unter Settings → Environments `feature/food-tracker-app`
  als erlaubten Branch eintragen.

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
- [x] **6. Tests für die App-Logik** in `app/src/lib` (Planer, Vorrat, Nährwerte, Datumslogik) mit einem
  leichtgewichtigen Test-Runner ohne native Module.
  - 24.11.2026: `npm test` in `app/` (Node-Test-Runner + `tsx`, Teil von `npm run check`, rund 4 s): 79 Tests für Datum (fünf Zeitzonen, Zeitumstellung), Vorrat, Nährwerte/Kalorienbedarf, Planer wie in der App ohne Server (mit den Einkaufslisten ist jedes Gericht kochbar) und Übersetzungen. Zwei Fehler im Vorrat gefunden und behoben: leere Posten nach dem Runden und eine um einen Tag zu lange Haltbarkeit nach der Umstellung auf Sommerzeit.
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

- ✅ **Web-Version hosten:** entschieden 23.11.2026, erledigt 24.11.2026: GitHub Pages unter
  `https://bennitut.github.io/Bennitut/` mit Unterpfad, Manifest-Pfaden, `404.html` und dem Tester-Link in `clips.md`
  vorbereitet. (23.11.2026)
- **Abgehakte Einkäufe landen nicht im Vorrat:** Nur gelieferte Bestellungen und Kassenbons (beides braucht den
  Server) buchen in den Vorrat. In der Web-Version bleibt der Vorrat deshalb leer, solange man nicht alles von Hand
  einträgt, und „Gegessen“ zieht nichts ab – der Kreislauf Einkauf → Vorrat → Kochen bricht ab. Vorschlag: Beim
  Abhaken einer Zeile (oder mit „Alles eingekauft“) Packungen × Packungsgröße in den Vorrat buchen. Der Test
  „Einkaufen und Kochen“ zeigt, dass die Mengen dann aufgehen. Neue Funktion – Benjamin entscheidet; die Frage steht
  in PR #2 unter „Brauche deine Entscheidung“ (vor dem Umsetzen seine Antwort dort nachlesen). (24.11.2026)
- ✅ **Neuplanen und Fixieren testbar machen:** erledigt 24.11.2026 – `prepareReplan()` in `lib/replan.ts`
  (Startdatum, behaltene Wochen, fixierte Gerichte), 7 Tests plus einer mit dem echten Planer. Dabei zwei Fehler
  behoben: Tauschen in der ersten Woche an einem späteren Tag ließ den Plan heute beginnen (Rezept landete Tage zu
  spät, Fixierungen, Gegessenes und Abgehaktes gingen verloren); „Neu planen“ an einem späteren Tag ließ fixierte
  Gerichte fallen. (24.11.2026)
- ✅ **Rezepttexte je Sprache testbar machen:** erledigt 24.11.2026 – `localizeRecipe`, `needsTranslation` und die
  bisher im Store eingebaute Logik für gespeicherte Übersetzungen und verbesserte Texte (`withStoredTexts`) stehen in
  `lib/recipeText.ts` (ohne Store und native Module); 8 Tests, u. a. Fallback auf Englisch, wann „Übersetzen“
  erscheint, verbesserter Text vor der Übersetzung und alle Katalogrezepte in fünf Sprachen. Kein Fehler gefunden.
  (24.11.2026)
- ✅ **Fotos mit Fleisch oder Fisch bei vegetarischen und veganen Rezepten:** erledigt 24.11.2026 – beim Prüfen des
  Rezept-Details zeigten die Ofenkartoffeln mit Kräuterquark ein Ribeye-Steak. Die Titel aller 107 Fotos vegetarischer
  und veganer Rezepte an der Quelle geprüft; neun nennen Fleisch oder Fisch und sind entfernt (Burrito-Bowl, Gebratener
  Reis mit Ei, Ofenkartoffeln, Kürbisrisotto, Quesadillas, Reis-Congee, Rotes Kürbis-Curry, Calzone, Palak mit
  Halloumi). Jetzt haben 184 von 236 Rezepten ein Foto; der Server-Test verlangt mindestens 180. (24.11.2026)
- **Fotos, die vielleicht nicht passen:** Bei der Linsen-Bolognese (Quelle: „Julia's Bolognese Sauce“, sieht nach
  Fleisch-Ragù aus), den vegetarischen Enchiladas („tacos and enchiladas“), Mapo Tofu und Nasi Goreng mit Tempeh nennt
  der Titel kein Fleisch, die Gerichte enthalten es aber oft – Benjamin sieht sie sich am besten selbst an. Ersetzen
  nur durch andere frei lizenzierte Fotos (Openverse), sonst Platzhalter. (24.11.2026)
- **Promo-Clips und das entfernte Kürbisrisotto-Foto:** `bildnachweise.md` nennt es für alle drei Clips (dort stehen
  alle beim Aufnehmen geladenen Fotos). Prüfen, ob es im Bild zu sehen ist; wenn ja, die Clips mit `node make-clips.cjs`
  neu aufnehmen (das Huhn ist auf dem Foto kaum zu erkennen, die Clips zeigen aber einen vegetarischen Plan).
  (24.11.2026)
- **„Entdecken“ lädt alle Katalogfotos auf einmal:** Die Rezeptliste rendert alle 236 Katalogrezepte samt 184
  Vorschaubildern in einer ScrollView. Auf älteren iPhones kostet das Speicher, und Wikimedia drosselt viele
  gleichzeitige Bildabrufe (HTTP 429 – beim gleichzeitigen Laden von gut 100 Fotos blieben fünf leer, einzeln
  abgerufen kamen sie kurz danach). Vorschlag: zuerst etwa 30 zeigen und „Mehr anzeigen“, oder eine virtualisierte
  Liste. Langfristig helfen selbst ausgelieferte Fotos (siehe Datenschutz). (24.11.2026)
- **Tauschen in der laufenden Woche plant die schon vergangenen Tage dieser Woche mit:** Dort kann danach ein
  anderes Gericht stehen, auch bei schon als gegessen markierten (der Haken hängt am Platz, nicht am Rezept). „Neu
  planen“ an einem späteren Tag beginnt einen neuen Monat und setzt Gegessenes zurück, auch das von heute. Idee:
  Vergangenes und Gegessenes beim Neuplanen wie fixiert behandeln. Achtung: Der Planer setzt bei fixierten Gerichten
  `locked: true` (zeigt 🔒), das müsste danach wieder weg. (24.11.2026)
- **Tests der App (`app/test/`):** TypeScript 6 bindet `@types/*` nicht mehr automatisch ein; die Tests haben deshalb
  eine eigene `test/tsconfig.json` mit Node-Typen, der App-Code bleibt ohne (damit nichts aus Node hineinrutscht).
  Zeitzonen stellen die Tests über `process.env.TZ` um (unter Windows noch nicht ausprobiert). Klappt das nicht,
  laufen sie in der Zeitzone des Rechners, und nur der Test für `today()`/`nowTime()` wird übersprungen. Statt der
  noch experimentellen Mock-Uhr von Node nehmen `today()` und `nowTime()` optional einen Zeitpunkt. (24.11.2026)
- **GitHub Pages antwortet auf Direktlinks mit Status 404** (`404.html` enthält die App, im Browser funktioniert
  alles). Suchmaschinen indexieren Unterseiten deshalb nicht – für eine Testversion egal; für den echten Start
  einen Webspace mit SPA-Weiterleitung nehmen (Netlify, Cloudflare Pages o. Ä.). (24.11.2026)
- **Pages-Workflow ohne Rauchtest:** Der Workflow baut und veröffentlicht, ohne vorher `web:smoke` laufen zu lassen
  (Playwright und Chromium kosten pro Lauf etwa 1–2 Minuten). Die Nachtschicht prüft vor jedem Commit; falls trotzdem
  einmal eine kaputte Version online geht, den Rauchtest als Schritt vor dem Hochladen ergänzen. (24.11.2026)
- **„Run workflow“ für den Pages-Workflow** zeigt GitHub nur an, wenn die Workflow-Datei auch auf dem
  Standard-Branch `master` liegt. Nicht nötig: Jeder Push auf `feature/food-tracker-app`, der die App ändert,
  startet den Workflow. (24.11.2026)
- ✅ **Tagesbericht: auch Vorrang und erledigte Ideen zeigen:** erledigt 24.11.2026 – „Was heute passiert ist“
  zeigt jetzt auch erledigte Vorrang-Abschnitte und ✅-Punkte aus „Ideen und Erkenntnisse“ (beide zählen bei
  „Aufgaben erledigt“ mit) und listet die an dem Tag neu notierten Punkte. `node --test reports/make-report.test.cjs`
  prüft das Lesen und das Format dieser Datei. Keine fast leere letzte Seite mehr (PR-Link steht jetzt oben).
  (24.11.2026)
- **Datenschutz (für Punkt 7):** Die Web-Version und die App laden Rezeptfotos direkt von `upload.wikimedia.org` und
  `live.staticflickr.com` – dabei sehen diese Dienste die IP-Adresse. In der Datenschutzerklärung erwähnen oder die
  Fotos später selbst ausliefern. (23.11.2026)
- **Promo-Clips aktuell halten:** Ändert sich die Oberfläche deutlich, die Clips mit `node make-clips.cjs` neu
  aufnehmen (etwa drei Minuten). Die Texteinblendungen versprechen bewusst nur, was ohne Server geht. (23.11.2026)
- **App-Symbol ist noch das Expo-Standardsymbol** (`assets/icon.png`, Android-Symbole, Splash): Für die Stores
  braucht es ein eigenes. Vorschlag: das neue Web-Symbol (`assets/icon-web.svg`, Schüssel mit Blättern) auch dafür
  verwenden – Benjamin entscheidet über das Aussehen. (23.11.2026)
- **Web: Video-Import** ist im Browser ausgeblendet (keine Video-Thumbnails, kein Dateisystem). Machbar wäre
  es mit `<video>` + Canvas; lohnt erst, wenn es einen Server gibt. Achtung: `expo-image-picker` liefert die
  Videolänge im Browser in Sekunden, in der App in Millisekunden. (23.11.2026)
- ✅ **Doppeltes Emoji im Nutzerverzeichnis:** Die Karte zeigte „👥 👥 Nutzerverzeichnis“, weil der Text
  `account.directory` schon das Emoji enthält und die Karte zusätzlich `icon="👥"` bekommt (`app/src/app/users.tsx`).
  (23.11.2026) Erledigt 24.11.2026: Karte und Kopfzeile nutzen `account.directoryTitle` ohne Emoji (wie `admin.title`
  neben `account.adminArea`); dieselbe Ursache hatte „🏆 ⭐ Am besten bewertet“ unter Rezepte. Ein Test in
  `test/i18n.test.ts` prüft jetzt alle `<Card title={t(…)} icon=…>`: Der Titel darf in keiner Sprache mit einem
  Emoji beginnen. Texte mit Emoji für Knöpfe bekommen einen eigenen Schlüssel.
- **`expo lint` prüft keine `.cjs`-Dateien** (z. B. `app/scripts/web-smoke.cjs`); die einmal von Hand mit
  `npx eslint scripts/web-smoke.cjs` prüfen, wenn sie geändert werden. (23.11.2026)
- **Lint ist streng:** `npm run lint` bricht schon bei Warnungen ab (`--max-warnings 0`), damit sich keine
  Warnungen ansammeln. Bewusst gewollte Ausnahmen mit `// eslint-disable-next-line <regel>` und einer
  Begründung markieren. (23.11.2026)
- **expo-doctor:** läuft inzwischen auch in der Cloud-Sitzung (`npx --yes expo-doctor`): 21 von 21 Checks
  bestanden, `npx expo install --check` ist grün. (23.11.2026) Expo veröffentlicht oft Patchstände; am 24.11.
  fehlten schon vier (u. a. expo-router 57.0.32) → `npx expo install --fix`, danach wieder 21 von 21. (24.11.2026)
- **npm audit (App):** 12 Meldungen (8 mittel, 4 hoch), alle in Abhängigkeiten von Expo und ESLint
  (u. a. `query-string`/`decode-uri-component` in expo-router, `minimatch`, `zod`). Nicht mit
  `npm audit fix --force` beheben, sondern über neue Expo-Patchstände (`npx expo install --check`).
  Der Server meldet nach dem Update 0 Schwachstellen. (23.11.2026)
- **„App-Daten zurücksetzen“ im Profil fehlt:** Den ersten Fragebogen (mit automatischem Plan) kann man
  in Expo Go nur testen, wenn man Expo Go neu installiert. Ein Knopf mit Sicherheitsabfrage hilft beim
  Testen und passt zur Datenschutzerklärung (Daten selbst löschen). (23.11.2026)
- **ESLint 9** gilt laut npm als nicht mehr unterstützt; erst auf ESLint 10 wechseln, wenn
  `eslint-config-expo` es offiziell unterstützt. (23.11.2026)
