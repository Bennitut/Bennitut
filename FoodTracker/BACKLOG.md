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
Der Nachtschicht-PR hat keine Größengrenze mehr (Benjamins Entscheidung vom 24.11.2026): Neue Funktionen kommen in den
offenen PR, Benjamin mergt, wann er Zeit hat. Die PR-Beschreibung trotzdem kurz halten.

**Stand 24.11.2026 (abends):** Benjamins Entscheidungen vom 24.11.2026 sind umgesetzt: (1) PR-Grenze aufgehoben, neue
Funktionen kommen in den offenen PR #2; (2) Rezeptfotos zuerst – unklare Fotos ersetzt bzw. entfernt, Schlagwörter,
Beschreibungen und Videotitel vegetarischer und veganer Rezepte geprüft, Platzhalter für Rezepte ohne Foto; (3) Vorrat
Variante (b), Knopf „Abgehaktes in den Vorrat“. Ebenfalls erledigt: Punkt 5 (Offline-Modus), Punkt 7 (Entwürfe in
`docs/recht/` – Benjamin trägt seine Angaben ein und entscheidet drei Dinge, im PR gefragt) und Expo SDK 58 (Vorrang
unten). Benjamins Wünsche vom 24.11.2026 (15:27 Uhr) stehen als Vorrang 8.1–8.3 unten und sind erledigt: 8.1 (Server
zum Testen auf dem Laptop mit Ollama und `start-test.cmd`), 8.2 (Ernährungshistorie dauerhaft speichern) und 8.3
(Videos in der gewählten Sprache; das Suchen weiterer Videos läuft als Daueraufgabe, pro Lauf etwa 40 Rezepte nach der
obersten Aufgabe). Der Vorrang „Impressum & Datenschutz in App und Web-Version“ ist ebenfalls erledigt (24.11.2026,
abends) – Benjamin trägt seine Angaben in `app/src/legal/angaben.ts` ein, vorher baut der Pages-Workflow nicht.
Reihenfolge ab jetzt: Punkte 8–10. Der Tagesbericht bleibt wie gewohnt: Der erste Lauf am 25.11. (Japan-Zeit) macht
vorher den für den 24.11. Offen im PR: ob „Löschen geht in der Web-Version nicht“ (unten) vor Punkt 8 drankommen soll –
ohne Antwort weiter mit Punkt 8.

## Daueraufgabe: Tagesbericht als PDF (Benjamins Wunsch vom 23.11.2026)

Jeden Tag einmal, direkt nach dem Setup und vor der obersten offenen Aufgabe: Fehlt
`reports/<Vortag>.pdf` (Datum des Vortags in Japan-Zeit, `JJJJ-MM-TT`) oder wurde sie noch am Vortag selbst
committet (vorläufiger Stand), und gab es am Vortag Commits auf `claude/nightly`, dann
`node FoodTracker/reports/make-report.cjs <Vortag>` ausführen, die PDF committen und pushen, im PR unter
„Tagesberichte“ verlinken und Benjamin mit SendUserFile schicken (in der Benachrichtigung kurz erwähnen).

## Daueraufgabe: Videos je Sprache (8.3, Teil 3, Benjamins Wunsch vom 24.11.2026)

Pro Lauf nach der obersten Aufgabe etwa 40 Rezepte: je Katalogrezept und Sprache ein passendes, öffentlich verfügbares
YouTube-Video, zuerst en, dann es, fr, it, dazu de, wo es fehlt. Kandidaten über die Websuche (`allowed_domains`
youtube.com); Verfügbarkeit, Originaltitel und Kanal per YouTube-oEmbed prüfen – die Websuche zeigt oft automatisch
übersetzte Titel, maßgeblich ist der Titel laut oEmbed. Titel in der Zielsprache und dasselbe Gericht; bei vegetarischen
und veganen Rezepten kein Fleisch und kein Fisch im Titel (Server-Test in fünf Sprachen, auch „con carne“). Kanäle, die
erkennbar in einer anderen Sprache sprechen, nicht nehmen. Eintragen in `server/src/data/videos/<sprache>.ts`, sortiert
wie der Katalog. Lieber kein Video als ein ungeprüftes.

Fortschritt (Rezepte mit Video, von 236): **de: 193** · **en: 108** · **es: 1** · **fr: 0** · **it: 1**

- 24.11.2026: en +41 (Porridge mit Beeren bis Kürbis-Kokos-Suppe, Katalogreihenfolge). Ohne passendes Video: Quark mit
  Beeren und Walnüssen, Brötchen mit Hüttenkäse und Gurke (Treffer zeigen Paneer-Sandwiches). Weiter mit
  `kartoffel_lauch_suppe`.
- 24.11.2026 (abends): en +39 (Kartoffel-Lauch-Suppe bis Quesadillas), alle per oEmbed geprüft. Ohne passendes Video:
  Bergkäsebrot mit Apfel (Treffer zeigen gegrillte Cheddar-Sandwiches). Nahe Varianten genommen, wo das Gericht im
  Kern dasselbe ist: Kartoffeln mit Quark und Leinöl (statt Ofenkartoffeln mit Kräuterquark), Rösti mit Lauch und
  Gruyère, Frikadellen ohne Rotkohl, ungarische gefüllte Paprika, Burrito statt Wrap. Weiter mit `griechischer_salat`.

## ✅ Vorrang: Expo SDK 58 für Expo Go auf iPhone und Android (Benjamins Wunsch vom 24.11.2026) – erledigt 24.11.2026

24.11.2026: Expo SDK 58 mit React Native 0.88.1 und React 19.3 (`npx expo install expo@^58.0.0`, dann `--fix`); am Code
war nichts anzupassen, nur `package-lock.json` neu erzeugt und `tsconfig.json` so, wie SDK 58 sie schreibt. Geprüft:
expo-doctor 20/20, `npx expo install --check`, `npm run check` (112 App-, 56 Server-Tests), Web-Export und Rauchtest,
`expo export` für iOS und Android, das Manifest von `npx expo start` (`exposdk:58.0.0`) und die Entwicklungs-Bundles,
die Expo Go für iOS und Android lädt. Android ohne Gerät nicht abschließend prüfbar (unter „Ideen und Erkenntnisse“).

Expo Go aus dem App Store bzw. Play Store unterstützt nur SDK 58 („Project is incompatible with this version of Expo
Go“), auf iOS lässt sich keine ältere Version installieren. Nach dem Upgrade-Leitfaden heben, Breaking Changes prüfen,
alle Checks plus Bundles für beide Plattformen; im PR „In 5 Minuten testen“ mit Expo Go für SDK 58 und den
Windows-Voraussetzungen (Git und Node.js LTS per winget, `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`).

## ✅ Vorrang: Server zum Testen auf dem Laptop, ohne XAMPP (8.1, Benjamins Wunsch vom 24.11.2026) – erledigt 24.11.2026

24.11.2026: CORS für den eigenen Rechner und private Netze (auch auf Fehlerantworten), `server/.env` mit Vorlage
`.env.example`, Ollama als kostenlose KI neben Claude (alle KI-Funktionen über `server/src/ai/provider.ts`, Prompts in
`ai/tasks.ts`), 503 `ai_not_configured` plus drei weitere `ai_*`-Codes mit Texten in fünf Sprachen, `/api/health` mit
KI-Zustand, Server-Zeile im Profil, `start-test.cmd`, Startmeldung mit WLAN-Adresse, KI und Firewall-Regel, README.
30 neue Server-Tests (86), 2 App-Tests (114); im Browser mit `npx expo start --web` und laufendem Server geprüft: Der
Import meldet ohne KI „Auf dem Server ist keine KI eingerichtet …“ statt „Keine Verbindung zum Server.“ Mit echtem
Ollama nicht prüfbar (unter „Ideen und Erkenntnisse“).

Im Browser (`npx expo start`, Taste `w`) zeigt der Rezept-Import „Keine Verbindung zum Server.“ Kein XAMPP: Es bringt
Apache, PHP und MySQL mit und kann den Node-Server nicht ausführen; der Server läuft direkt mit Node.js auf dem Laptop
(gleicher Rechner, Port 3000). Ziel: Ein Doppelklick startet alles; Import, Foto- und Bon-Erkennung, Übersetzen und
KI-Wünsche funktionieren, ohne dass Benjamin Geld ausgibt. Ein Server im Internet für echte Tester gehört nicht dazu
(nur unter „Ideen und Erkenntnisse“ notieren, was dafür nötig wäre).

- [x] CORS mit `hono/cors`: `http://localhost`, `127.0.0.1` und private Netze (10.x, 172.16–31.x, 192.168.x) mit
  beliebigem Port, weitere Ursprünge über `CORS_ORIGINS` (kommagetrennt); nicht pauschal jede Website. Mit Tests.
- [x] `server/.env` lesen, falls vorhanden; eingechecktes `server/.env.example` ohne Geheimnisse erklärt alle Variablen
  (`ALLOW_DEV_LOGIN=1` nur zum Testen); `.env` und `server/data/` stehen in `.gitignore`.
- [x] Kostenlose KI: Anbieter Ollama neben Claude. `AI_PROVIDER` (`claude` oder `ollama`); ohne Angabe Claude, wenn
  `ANTHROPIC_API_KEY` gesetzt ist, sonst Ollama, wenn es unter `OLLAMA_URL` (Standard `http://127.0.0.1:11434`)
  antwortet. Modell `gemma4:e4b` (versteht Bilder, `OLLAMA_MODEL`; im README `qwen3-vl:8b` als Alternative).
  `/api/chat` ohne Streaming, Temperatur 0, Bilder als Base64, `format` = JSON-Schema aus dem Zod-Schema, Denken aus;
  Antwort mit demselben Zod-Schema prüfen, Fehler auf die `AnalysisError`-Codes abbilden, großzügiges Zeitlimit (auch in
  der App). Alle KI-Funktionen über diese eine Stelle; Tests mit nachgebautem `fetch`, ohne echtes Ollama.
- [x] Ohne KI: KI-Endpunkte antworten mit 503 `ai_not_configured`, die App zeigt einen verständlichen Text in allen
  fünf Sprachen; `/api/health` meldet, welche KI aktiv ist.
- [x] `FoodTracker/start-test.cmd` zum Doppelklicken: bei Bedarf `npm install` in `server` und `app`, Server im eigenen
  Fenster, danach `npx expo start`. Beim Serverstart: Adresse im WLAN, aktive KI bzw. ob Ollama erreichbar ist,
  Hinweis auf die Firewall-Regel für Port 3000 (fürs iPhone).
- [x] Profil: eine Zeile zum Server – verbunden mit Claude, mit lokaler KI, ohne KI oder nicht erreichbar.
- [x] README und PR („In 5 Minuten testen“): `winget install Ollama.Ollama`, `ollama pull gemma4:e4b`, `git pull`,
  `FoodTracker\start-test.cmd` doppelklicken, im Browser Taste `w`, am iPhone den QR-Code, Firewall-Regel als
  Administrator; Instagram gibt die Beschreibung ohne Anmeldung oft nicht heraus → Caption ins Feld „Beschreibung“.
- [x] Prüfen: Server-Tests; im Browser mit `npx expo start --web` und laufendem Server scheitert der Import nicht mehr
  an der Verbindung (ohne KI kommt die neue Meldung); dazu der bisherige Web-Rauchtest.

## ✅ Vorrang: Ernährungshistorie automatisch und dauerhaft speichern (8.2, Benjamins Wunsch vom 24.11.2026) – erledigt 24.11.2026

24.11.2026: Tagebuch unter eigenen Schlüsseln (`foodtracker/diary/v1` plus ein Teil pro Jahr in Kurzform) mit
Migration, Löschmarken und Hinweis bei Speicherfehlern; Sicherung über `POST /api/diary/sync` (`server/data/diary/`,
pro Konto bzw. Geräte-ID, neuere Fassung gewinnt), Profil mit „1 Jahr“/„Alles“, Wochen- bzw. Monatsbalken, allen Tagen
zum Blättern und Karte „Sicherung“ (CSV, JSON, Import ohne Duplikate; neu `expo-sharing` und `expo-document-picker`).
20 App-Tests (134), 7 Server-Tests (93), Web-Rauchtest erweitert; im Browser mit laufendem Server geprüft: Gerät 1
sichert ins Konto, ein zweites Gerät mit demselben Konto bekommt die Historie zurück, ohne Konto pro Gerät. Teilen und
Dateiauswahl in Expo Go ohne Gerät nicht prüfbar (unter „Ideen und Erkenntnisse“).

Heute liegt das Tagebuch mit allem anderen unter einem Schlüssel in AsyncStorage bzw. localStorage, Speicherfehler
werden verschluckt, und das Profil zeigt nur 7 oder 30 Tage.

- [x] Nichts löscht Tagebucheinträge automatisch (keine Migration, kein neuer Plan, kein neuer Fragebogen); ein Test
  sichert das ab.
- [x] Tagebuch unter einem eigenen Schlüssel (mit Migration), damit es auch gespeichert wird, wenn der übrige Zustand mit
  Fotos und importierten Rezepten zu groß wird (localStorage meist etwa 5 MB, AsyncStorage unter Android 6 MB).
  Scheitert das Speichern, einen Hinweis zeigen.
- [x] Automatische Sicherung auf dem Server, sobald einer erreichbar ist: neue, geänderte und gelöschte Einträge im
  Hintergrund hochladen und beim Start abgleichen (über die Eintrags-ID; Gelöschtes als Löschmarke). Ablage unter
  `server/data/`, pro Konto, sonst pro Geräte-ID. Mit Konto (zum Testen Dev-Login) kommt die Historie auf einem neuen
  Gerät oder nach dem Löschen der Browserdaten zurück; im Profil in einem Satz erklären. Ohne Server alles lokal.
- [x] Im Profil „Historie exportieren“ (CSV und JSON) und „Importieren“ (JSON, ohne Duplikate).
- [x] Ansicht: neben 7 und 30 Tagen „1 Jahr“ und „Alles“; bei langen Zeiträumen Balken pro Woche bzw. Monat, Durchschnitt
  über die erfassten Tage und eine Liste zum Blättern durch alle vergangenen Tage.
- [x] Logik ohne native Module in `app/src/lib` mit Tests, Server-Endpunkte mit Tests, Texte in allen fünf Sprachen; die
  Sicherung in Teil B des Datenschutz-Entwurfs ergänzen.

## ✅ Vorrang: Verlinkte Videos in der gewählten Sprache (8.3, Benjamins Wunsch vom 24.11.2026) – erledigt 24.11.2026

24.11.2026: Eine Datei je Sprache (`server/src/data/videos/`), Feld `RecipeVideo.language`, alle 224 Videos per oEmbed
nachgeprüft – 16 Titel standen in automatischer deutscher Übersetzung, jetzt überall der Originaltitel; aufgeteilt in
193 de, 28 en, 1 it, 1 es, Keema Matar entfernt (Kanal auf Urdu). App: nur Videos der gewählten Sprache, sonst „🔎 Video
suchen · YouTube“ mit Rezeptname und Suchwort in dieser Sprache (`lib/videos.ts`, 9 Tests); Kopien und Editor behalten
die Katalogvideos. Server-Test für Videotitel in fünf Sprachen; Web-Rauchtest prüft Deutsch und Englisch. Teil 3 läuft
als Daueraufgabe weiter (oben), erste Etappe: 41 englische Videos.

Heute hat jedes Katalogrezept ein YouTube-Video (`server/src/data/recipeVideos.ts`), fast alle auf Deutsch.

1. Videos je Sprache (de, en, fr, it, es); `RecipeVideo` bekommt das Feld `language`, die vorhandenen Videos ihrer
   Sprache zuordnen.
2. Im Rezept nur Videos in der gewählten Sprache (de-AT und de-CH zählen als de). Gibt es dort keins, öffnet derselbe
   Knopf eine YouTube-Suche in dieser Sprache (Rezeptname in der Sprache plus `searchSuffix`). Die Suchlinks unter „Mehr
   Videos“, Originalbeiträge importierter Rezepte und selbst eingetragene Links bleiben. Logik in `app/src/lib` mit Tests.
3. Danach Daueraufgabe in Etappen – steht jetzt als eigener Abschnitt „Daueraufgabe: Videos je Sprache“ oben.

## ✅ Vorrang: Impressum & Datenschutz in App und Web-Version (Nachtschicht, 24.11.2026) – erledigt 24.11.2026

24.11.2026: Bildschirm „Impressum & Datenschutz“ (`/legal`) mit Impressum Variante A und Datenschutzerklärung Teil A
(Teil B und Mindestalter nur mit Server); in der App unter 👤 Profil, in der Web-Version zusätzlich „Impressum“ oben
rechts auf jeder Seite. Angaben nur in `app/src/legal/angaben.ts`, Texte in `app/src/legal/texte.ts`; solange etwas
fehlt, „📝 Entwurf“ mit Liste, und `npm run web:pages` bricht ab (zum Ausprobieren `-- --entwurf`). Platzhalter-Logik in
`lib/legal.ts` mit 13 Tests (156), Web-Rauchtest öffnet die Seite (auch auf Englisch), fünf Sprachen.

Nach den Vorrang-Abschnitten 8.1–8.3 und vor Punkt 8 erledigen. Grund: Nach dem Mergen geht die Web-Version auf GitHub Pages online, und laut USP braucht
„jegliche Website“ die Offenlegung nach § 25 Mediengesetz (Strafe bis 20.000 Euro). Die Entwürfe liegen in
`docs/recht/` (Erklärungen und Quellen in `docs/recht/README.md`).

- Neuer Bildschirm „Impressum & Datenschutz“: in der App unter Profil, in der Web-Version zusätzlich von jeder Seite
  aus erreichbar (WKO: „ständig leicht und unmittelbar auffindbar“), z. B. ein kleiner Link unten auf „Heute“.
- Benjamins Angaben (Name, Wohnort bzw. Anschrift, E-Mail …) an genau einer Stelle im Code, damit er sie in einer
  Datei einträgt; Texte aus `docs/recht/` übernehmen (Impressum Variante A, bis Benjamin entscheidet). Teil B der
  Datenschutzerklärung erst mit Server zeigen. Texte auf Deutsch, in den anderen Sprachen ein Satz dazu.
- Solange Angaben fehlen: in der App ein deutlicher Hinweis „Entwurf“, und `npm run web:pages` (damit auch der
  Pages-Workflow) bricht mit einer verständlichen Meldung ab – so geht keine Web-Version ohne Offenlegung online.
- Erkennung der Platzhalter in `app/src/lib` mit Tests; der Web-Rauchtest öffnet den neuen Bildschirm.

## ✅ Vorrang: Abgehaktes in den Vorrat (Benjamins Entscheidung vom 24.11.2026, Variante b) – erledigt 24.11.2026

24.11.2026: Knopf „🧺 Abgehaktes in den Vorrat (n)“ unter der Einkaufsliste; gebuchte Zeilen tragen „🧺 im Vorrat“.
Logik in `app/src/lib/shopping.ts` (8 Tests), Store-Aktionen `bookCheckedShopping` und `receiveOrder`, Bestellungen
merken sich Plan und Woche (`forWeek`). Web-Rauchtest bucht zwei Zeilen; mit lokalem Server und Demo-Lieferdienst
geprüft: jede Zeile genau einmal im Vorrat.

Direkt nach den Rezeptfotos umsetzen. Unter der Einkaufsliste ein Knopf „Abgehaktes in den Vorrat“: bucht alle
abgehakten Zeilen der Woche als Packungen × Packungsgröße in den Vorrat (mit Einkaufsdatum, damit die Haltbarkeit
stimmt). Nichts doppelt buchen: Was schon gebucht ist, merken; ein zweiter Tipp bucht nur neu Abgehaktes, und wird
später doch eine Bestellung für diese Woche geliefert, kommen die schon gebuchten Zeilen nicht noch einmal in den Vorrat.
Logik ohne native Module in `app/src/lib` mit Tests in `app/test/`, Texte in allen fünf Sprachen, im Browser prüfen.

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
- [x] **5. Offline-Modus als Standard:** Ohne Server-URL die Server-Funktionen (Foto- und Bon-Erkennung,
  Import, Übersetzen, Community, Bestellungen) freundlich als „bald verfügbar“ kennzeichnen statt Fehler
  zu zeigen.
  - 23.11.2026, Teil 1: `HAS_SERVER` in `lib/api.ts` und Karte `components/ComingSoon.tsx` („🚧 Bald verfügbar“, fünf Sprachen); Erfassen (Foto/Kassenbon) und Rezept-Import nutzen sie. Offen: Übersetzen, Community (Entdecken, Teilen), Bestellungen, KI-Wünsche im Plan, Anmeldung, Fotos/Bewertungen und „Text mit KI verbessern“.
  - 24.11.2026, Teil 2: Bestellungen und Community – „Liefern lassen“ (vorher rot „Keine Verbindung zum Server.“), „Aus der Community“ unter „Entdecken“ (vorher „… konnten nicht geladen werden.“) und „In der Community teilen“ bei eigenen Rezepten zeigen ohne Server den Hinweis `ComingSoonNote` (Abzeichen „🚧 Bald verfügbar“ und ein Satz, was bis dahin geht) und fragen den Server nicht mehr an; Web-Rauchtest prüft beides. Offen: Anmeldung (Profil, Anmelden, Nutzerverzeichnis), Übersetzen, KI-Wünsche im Plan, Fotos/Bewertungen, „Text mit KI verbessern“ und „Problem melden“.
  - 24.11.2026, Teil 3: Rest erledigt, damit ist Punkt 5 fertig. Rezept: Sterne ohne Server ausgeblendet, statt „Text mit KI verbessern“ und „Problem melden“ ein gesammelter Hinweis mit dem Tipp „Favorit“; „🌐 Übersetzen“ (Französisch, Italienisch, Spanisch) als Hinweis; eigene Fotos bleiben privat (Hinweis statt „Öffentlich/Nur ich“, kein „Öffentlich machen“). Plan: Feld für KI-Wünsche ausgeblendet, keine Anfrage. Profil, `/login` und Nutzerverzeichnis: „Bald verfügbar“. Web-Rauchtest prüft alles (Übersetzen auf Französisch), neuer Test für den Favorit-Hinweis (112 Tests); Clips 1 und 3 neu aufgenommen (ohne Wunschfeld und Sterne).
- [x] **6. Tests für die App-Logik** in `app/src/lib` (Planer, Vorrat, Nährwerte, Datumslogik) mit einem
  leichtgewichtigen Test-Runner ohne native Module.
  - 24.11.2026: `npm test` in `app/` (Node-Test-Runner + `tsx`, Teil von `npm run check`, rund 4 s): 79 Tests für Datum (fünf Zeitzonen, Zeitumstellung), Vorrat, Nährwerte/Kalorienbedarf, Planer wie in der App ohne Server (mit den Einkaufslisten ist jedes Gericht kochbar) und Übersetzungen. Zwei Fehler im Vorrat gefunden und behoben: leere Posten nach dem Runden und eine um einen Tag zu lange Haltbarkeit nach der Umstellung auf Sommerzeit.
- [x] **7. Rechtstexte als Entwürfe:** Datenschutzerklärung und Impressum (Österreich) mit klar markierten
  Platzhaltern für Benjamins Angaben. Nichts erfinden.
  - 24.11.2026: `docs/recht/` mit `impressum.md` (Variante A: Offenlegung nach § 25 Abs. 5 MedienG, Variante B: dazu § 5 ECG), `datenschutz.md` (Teil A für heute ohne Server: Gerät, GitHub Pages, Rezeptfotos, Links; Teil B für die Server-Funktionen) und `README.md` mit Checkliste der Angaben, drei Entscheidungen und Quellen mit Stand; Platzhalter `[[ANGABE|ENTSCHEIDUNG|PRÜFEN: …]]`. Was der Server speichert und an Anthropic schickt, aus dem Code nachgeprüft. RIS und Wikimedia waren nicht abrufbar.
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
- ✅ **Abgehakte Einkäufe landen nicht im Vorrat:** Nur gelieferte Bestellungen und Kassenbons (beides braucht den
  Server) buchten in den Vorrat. Erledigt 24.11.2026 mit dem Knopf „Abgehaktes in den Vorrat“ (Vorrang oben). In der Web-Version bleibt der Vorrat deshalb leer, solange man nicht alles von Hand
  einträgt, und „Gegessen“ zieht nichts ab – der Kreislauf Einkauf → Vorrat → Kochen bricht ab. Der Test „Einkaufen
  und Kochen“ zeigt, dass die Mengen aufgehen, wenn man Packungen × Packungsgröße bucht. Benjamin hat am 24.11.2026
  Variante (b) gewählt (Knopf unter der Einkaufsliste) – steht jetzt als Vorrang oben. (24.11.2026)
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
- ✅ **Fotos, die vielleicht nicht passen:** Bei der Linsen-Bolognese, den vegetarischen Enchiladas, Mapo Tofu und Nasi
  Goreng mit Tempeh nannte der Titel kein Fleisch, die Gerichte enthalten es aber oft. Erledigt 24.11.2026: Benjamin hat
  sie angesehen und entfernen lassen. Ersetzt nur, wo die Quelle ausdrücklich die vegetarische Variante nennt und weder
  Fleisch noch Fisch (alle Wikimedia Commons): Mapo Tofu („Vegan mapo tofu“), Enchiladas („Corn and bean enchiladas“),
  Linsen-Bolognese („Nudeln mit Tomatensauce, roten Linsen“, Kategorie „Vegan food“). Nasi Goreng bleibt beim
  Platzhalter (einziger Fund „Vegetarian Nasi Goreng“ mit Spiegelei, das Rezept ist vegan). Zusätzlich Schlagwörter und
  Beschreibungen aller 98 Fotos vegetarischer und veganer Rezepte geprüft: entfernt Kartoffel-Lauch-Suppe („bacon“),
  Kartoffel-Spinat-Frittata („ham“), Erbsensuppe (mit Schinkenknochen gekocht) und Kürbis-Kokos-Suppe (mit Fischsauce);
  Pancakes und Tofu-Gemüse-Pfanne gibt es bei Flickr nicht mehr. Acht Videos ersetzt (Titel nannten u. a. Huhn,
  Garnelen, Hackfleisch; dazu Erbsensuppe „nach Bundeswehr Art“ und „authentisches“ Mapo Tofu), ein Server-Test prüft
  die Titel. Jetzt 177 Fotos (Test: mindestens 175). Pescetarische Rezepte auf Fleisch gegengeprüft: unauffällig.
  (24.11.2026)
- ✅ **Promo-Clips und das entfernte Kürbisrisotto-Foto:** erledigt 24.11.2026 – Bild für Bild geprüft: Das Foto ist in
  keinem Clip zu sehen, neu aufnehmen war nicht nötig. Vom Plan zeigen die Clips nur Montag und das Frühstück am Dienstag
  (Rösti, Krautfleckerl, Mujaddara, Çılbır), dazu das Rösti-Rezept, „Heute“ und die Einkaufsliste (ohne Rezeptfotos).
  Geladen wurde es nur, weil die Plan-Ansicht die Fotos der ganzen Woche lädt; deshalb steht es bis zum nächsten
  Aufnehmen noch in `bildnachweise.md` (dort lieber zu viele als zu wenige). Auch das Foto von Nasi Goreng mit Tempeh
  (siehe oben) ist in keinem Clip zu sehen. (24.11.2026)
- ✅ **„Entdecken“ lädt alle Katalogfotos auf einmal:** erledigt 24.11.2026 – „Entdecken“ und der Tausch-Dialog im Plan
  (ohne Einschränkungen fast 190 passende Rezepte) zeigen zuerst 30 Rezepte und „Mehr anzeigen (30 von 236)“ für je 30
  weitere; die Suche läuft weiter über den ganzen Katalog. Logik in `lib/recipeLists.ts` mit 6 Tests, der Web-Rauchtest
  prüft beide Listen (vorher lud „Entdecken“ 176 Fotos auf einmal, jetzt 20). Eine virtualisierte Liste (FlatList) hätte
  geheißen, den ganzen Bildschirm umzubauen. Langfristig helfen selbst ausgelieferte Fotos (siehe Datenschutz).
  (24.11.2026)
- ✅ **Kein Platzhalter für Rezepte ohne Foto im Plan, unter „Heute“ und im Tausch-Dialog:** Dort stand gar kein Bild,
  der Name rückte nach links und die Zeilen standen versetzt (z. B. Mujaddara). Erledigt 24.11.2026: neue Komponente
  `components/RecipeThumb.tsx` (🍽️ auf grauem Grund, 64 × 36) an allen vier Stellen, auch in „Entdecken“; im Browser mit
  einem vegetarischen Plan geprüft. Die Promo-Clips neu aufzunehmen steht als eigener Punkt unten. (24.11.2026)
- ✅ **Promo-Clips 1 und 3 neu aufnehmen:** Dort stand Mujaddara noch ohne Platzhalter (Zeile versetzt). (24.11.2026)
  Erledigt 24.11.2026: alle drei Clips neu aufgenommen und Bild für Bild geprüft (Mujaddara mit Platzhalter, keines der
  entfernten Fotos). Clip 2 zeigt jetzt auch „Gekauft? Ein Tipp – ab in den Vorrat“ (Knopf, Vorrat mit Haltbarkeit,
  „🧺 im Vorrat“ in der Liste) und ist 23 s lang; „Liefern lassen“ zeigt dabei „Bald verfügbar“. `bildnachweise.md`
  ohne Frittata, Kürbisrisotto und Nasi Goreng, `clips.md` mit neuen Texten zu Clip 2.
- **Ollama mit echtem Modell nicht geprüft:** In der Cloud-Sitzung läuft kein Ollama mit `gemma4:e4b` (9,4 GB, braucht
  eine Grafikkarte). Anfrage und Antwort folgen der Ollama-Doku (`/api/chat`, `format` als JSON-Schema, `think: false`)
  und sind mit nachgebautem `fetch` und einem nachgebauten Ollama-Server getestet. Offen: wie gut `gemma4:e4b` die
  Schemas trifft (vor allem den Kassenbon mit dem ganzen Zutatenkatalog) und wie lange es auf 8 GB Grafikspeicher
  braucht. Bei „Die KI-Antwort konnte nicht gelesen werden“ steht die Ursache im Server-Fenster; Benjamin um die Zeile
  bitten. Ideen, falls es hakt: `OLLAMA_NUM_CTX` senken, `qwen3-vl:8b` probieren, Katalog im Prompt kürzen. (24.11.2026)
- **Server im Internet für echte Tester:** Gehört nicht zu 8.1. Nötig wären: ein Rechner im Internet mit HTTPS (z. B.
  kleiner VPS mit Domain und Let's Encrypt), dauerhafter Speicher für `server/data/`, `CORS_ORIGINS` mit der
  Pages-Adresse und `EXPO_PUBLIC_API_URL` beim Bauen der Web-Version, `ALLOW_DEV_LOGIN` aus und Apple/Google-Anmeldung
  eingerichtet. KI dann über Claude (Ollama braucht eine Grafikkarte, in der Cloud teuer) – also vorher Punkt 9
  (Kosten begrenzen), Einwilligung und Teil B der Datenschutzerklärung, „Konto löschen“ und das Impressum. (24.11.2026)
- **Android in Expo Go ohne Gerät nicht prüfbar:** Manifest und Entwicklungs-Bundle für Android entstehen mit SDK 58
  fehlerfrei; Android-spezifisch im Code sind nur der Schatten (`elevation`) und die Google-Client-ID, die
  Android-Einstellungen in `app.json` (Symbole, `predictiveBackGestureEnabled`, Paketname) wirken in Expo Go nicht.
  Läuft die App auf Benjamins Android-Gerät trotzdem nicht, braucht es die genaue Fehlermeldung (im PR gefragt).
  Häufige Ursachen ohne Fehler im Code: Expo Go nicht aktuell, Handy in einem anderen WLAN, die Windows-Firewall
  blockiert Port 8081 (Ausweg `npx expo start --tunnel`, dann aber ohne Server-Funktionen). (24.11.2026)
- **Löschen geht in der Web-Version nicht:** `Alert.alert` ist in react-native-web eine leere Funktion. „Löschen“ bei
  eigenen Rezepten und eigenen Fotos zeigt im Browser deshalb keine Abfrage und löscht nichts (ebenso die Abfragen im
  Admin-Bereich, der ohne Server aber nicht erreichbar ist). Vorschlag: eine kleine Funktion `confirm()` in `lib/`, die
  im Browser `window.confirm` nimmt und in der App `Alert.alert`; im Web-Rauchtest ein eigenes Rezept anlegen und
  löschen. Klein und für Tester spürbar – im PR gefragt, ob es vor Punkt 7 drankommen soll. (24.11.2026)
- **Rechtstexte an zwei Stellen:** Die Entwürfe mit Erklärungen stehen in `docs/recht/`, die angezeigte Fassung in
  `app/src/legal/texte.ts`. Wer eines ändert, muss das andere nachziehen. Idee, falls das oft vorkommt: die App-Fassung
  beim Bauen aus den Markdown-Dateien erzeugen (Hinweise für Benjamin dort als Kommentare). (24.11.2026)
- **Datenschutzerklärung, „1. Verantwortlich“:** Dort steht wie im Impressum (Variante A) nur der Wohnort. Art. 13 DSGVO
  verlangt Name und „Kontaktdaten“ – die E-Mail-Adresse ist eine; ob der Ort daneben genügt, ist offen (`[[PRÜFEN]]` in
  `docs/recht/README.md`, im PR gefragt). (24.11.2026)
- **Pages-Workflow nach dem Mergen rot, bis das Impressum ausgefüllt ist:** gewollt – `npm run web:pages` bricht ab und
  listet die fehlenden Angaben im Protokoll; GitHub schickt dann eine Mail „workflow failed“. Nach dem Eintragen läuft
  er beim nächsten Push von selbst (oder „Re-run jobs“). (24.11.2026)
- **Anzeigename im Profil ohne Server ohne Wirkung:** Unter „Über dich“ steht „Wird angezeigt, wenn du Rezepte in der
  Community teilst.“ – der Name wird nur fürs Teilen und für öffentliche Fotos genutzt, beides gibt es ohne Server
  nicht. Ohne Server ausblenden oder den Hinweis anpassen. (24.11.2026)
- **„Bald verfügbar“ gibt es nur ohne Server-Adresse:** In Expo Go und mit `npx expo start` + Taste `w` kennt die App
  immer eine (der Rechner, Port 3000) und meldet ohne laufenden Server weiter „Keine Verbindung zum Server.“ – gewollt,
  beim Entwickeln soll ein fehlender Server auffallen. Den Offline-Modus der Web-Version sieht man lokal mit
  `npm run web:export` und `npx expo serve` (liefert `dist/` aus; Direktlinks wie `/plan` geben dort 404, also bei `/`
  anfangen). Ein Schalter wie `EXPO_PUBLIC_API_URL=off` für Expo Go wäre machbar, falls Benjamin das braucht. (24.11.2026)
- **Tab-Leiste auf Französisch abgeschnitten:** Bei 360 px Breite stehen dort „Aujour…“ und „Provisi…“ (Heute, Vorrat);
  auf Deutsch passt alles. Kürzere Beschriftungen oder etwas kleinere Schrift prüfen, auch auf Italienisch und Spanisch.
  (24.11.2026)
- **Kontrast von Orange auf Hellorange:** `colors.warning` (#D9822B) hat auf `colors.accentTint` nur 2,6 : 1 und auf
  Weiß 2,9 : 1 (empfohlen ab 4,5 : 1), z. B. „⚠️ bald verbrauchen“ unter „Könnte schlecht werden“ und die
  Resthaltbarkeit im Vorrat. Der neue Hinweis „Bald verfügbar“ nimmt deshalb #A0561A (4,9 : 1). Bei Gelegenheit
  `colors.warning` für Text abdunkeln. (24.11.2026)
- **Fotos verschwinden an der Quelle:** Zwei Flickr-Fotos gab es am 24.11.2026 nicht mehr (Pancakes, Tofu-Gemüse-Pfanne,
  jetzt Platzhalter). Dann zeigt die App ein leeres Bild, und der Link unter dem Foto führt ins Leere. Ab und zu prüfen
  (z. B. monatlich) oder die Fotos langfristig selbst ausliefern (siehe Datenschutz). Die Fotos der übrigen Rezepte
  gibt es noch (vier Wikimedia-Abfragen wurden gedrosselt). (24.11.2026)
- **Fotos und Videos aus der Cloud prüfen:** Openverse lieferte am 24.11.2026 keine Treffer (selbst für „tofu“),
  Wikimedia drosselt schnelle Abfragen (HTTP 429, ein paar Sekunden Pause hilft), Flickr-Bilder selbst sind gesperrt,
  Flickr-Seiten mit Titel, Beschreibung und Schlagwörtern aber lesbar. YouTube-Titel kommen über oEmbed; fünf Videos
  antworten dort mit 401 (Einbetten abgeschaltet, Vorschaubild vorhanden – der Link funktioniert). (24.11.2026)
- ✅ **Server ohne CORS:** Der Server schickte keine CORS-Header; im Browser mit `npx expo start` (Taste `w`, Port 8081)
  scheiterten Anfragen an Port 3000 deshalb mit „Keine Verbindung zum Server.“ (Expo Go war nicht betroffen). (24.11.2026)
  Erledigt 24.11.2026 mit Vorrang 8.1: `hono/cors` für localhost, 127.0.0.1 und private Netze, weitere über
  `CORS_ORIGINS`.
- **Web-Export mit `EXPO_PUBLIC_API_URL`:** Metro übernimmt die Variable nur mit `npx expo export --clear`; ohne
  `--clear` kam am 24.11.2026 der zwischengespeicherte Stand ohne Server heraus (und umgekehrt). Der Pages-Workflow
  baut in einer frischen Umgebung und ist nicht betroffen. (24.11.2026)
- **Video bei der Calzone zeigt Cannelloni:** `vg_calzone_spinat` verlinkt „Schnelles Cannelloni mit
  Spinat-Ricotta-Füllung“ – vegetarisch, aber ein anderes Gericht. Bei Gelegenheit ein Calzone-Video suchen. (24.11.2026)
- **Weitere deutsche Videos zeigen ein anderes Gericht:** beim Aufteilen nach Sprachen aufgefallen –
  `m_putenschnitzel_natur` (Kartoffelpfanne mit Bohnen, ohne Pute), `v_raeuchertofu_broetchen` (Keto-Avocado-Brötchen),
  `w_rind_madras` (veganes Madras-Curry statt Rind), `m_lachs_ruehrei_brot` (Krabbenrührei statt Lachs). Bei der
  Daueraufgabe „Videos je Sprache“ (Teil „de, wo es fehlt“) zusammen mit der Calzone ersetzen. (24.11.2026)
- **Admin-Änderungen frieren die Videos eines Rezepts ein:** `applyOverrides` ersetzt `media` als Ganzes. Speichert ein
  Admin ein Katalogrezept, erscheinen später ergänzte Videos in anderen Sprachen bei diesem Rezept nicht. Erst mit Server
  und Admin-Konten relevant; Lösung: im Patch nur geänderte Medien speichern oder Katalogvideos beim Anwenden ergänzen.
  (24.11.2026)
- **Suche im Tausch-Dialog:** Ohne Einschränkungen passen fast 190 Rezepte; trotz „Mehr anzeigen“ ist das viel Blättern.
  Ein Suchfeld wie in „Entdecken“ wäre eine neue Funktion – erst nach dem Mergen. (24.11.2026)
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
- ✅ **Datenschutz (für Punkt 7):** Die Web-Version und die App laden Rezeptfotos direkt von `upload.wikimedia.org` und
  `live.staticflickr.com` – dabei sehen diese Dienste die IP-Adresse. In der Datenschutzerklärung erwähnen oder die
  Fotos später selbst ausliefern. (23.11.2026) Erledigt 24.11.2026: in `docs/recht/datenschutz.md`, Abschnitt 4,
  beschrieben; „Rezeptfotos selbst ausliefern“ steht als eigener Punkt unten, Benjamin entscheidet (im PR gefragt).
- **Rezeptfotos selbst ausliefern:** Löst zwei Probleme auf einmal: Wikimedia und Flickr erfahren keine IP-Adressen
  mehr (Abschnitt 4 der Datenschutzerklärung entfällt), und Fotos verschwinden nicht mehr an der Quelle (siehe unten).
  Laut `recipeImages.ts` erlauben alle 177 Fotos kommerzielle Nutzung (79 × CC BY 2.0, 2 × CC BY 3.0, 94 × CC BY-SA
  2.0–4.0, 2 × CC0/gemeinfrei); Urheber:in und Lizenz müssen sichtbar bleiben. Vorher die Größe messen – für die
  Web-Version unkritisch, in der App wird das Paket größer. Benjamin entscheidet (im PR gefragt). (24.11.2026)
- **Konto löschen fehlt:** App und Server können ein Konto anlegen und abmelden, aber nicht löschen. Vor dem Start der
  Anmeldung nötig – Recht auf Löschung (Art. 17 DSGVO); auch Apple verlangt für Apps mit Konten eine Löschfunktion in
  der App (vor dem Einreichen in den App-Review-Richtlinien nachlesen). (24.11.2026)
- **Einwilligung vor KI-Funktionen:** Mit Server gehen Fotos, Rezepttexte und Wünsche an Anthropic; Wünsche und Fotos
  können Gesundheitsangaben enthalten (Art. 9 DSGVO: ausdrückliche Einwilligung). Vor der ersten Nutzung einmal fragen,
  im Profil widerrufbar machen und ein Mindestalter festlegen (in Österreich willigen Kinder ab 14 selbst ein, bei
  Gesundheitsdaten laut herrschender Meinung auch dann nur mit den Eltern). Gehört zu Teil B der
  Datenschutzerklärung. (24.11.2026)
- **Sicherung der Historie startet ohne Nachfrage:** Sobald ein Server erreichbar ist, geht das Tagebuch dorthin (so
  gewünscht). Für Benjamins Laptop unkritisch; vor einem Server für andere zusammen mit der Einwilligung für die
  KI-Funktionen fragen und im Profil abschaltbar machen – Ernährungsdaten können Gesundheitsdaten sein (Art. 9 DSGVO,
  im Datenschutz-Entwurf B6 als `[[PRÜFEN]]`). (24.11.2026)
- **Eigene Fotos füllen den Speicher:** Eigene Rezeptfotos stehen als data-URI (je etwa 60–120 KB) im übrigen Zustand;
  im Browser (localStorage, meist etwa 5 MB pro Adresse) ist nach einigen Dutzend Fotos Schluss. Seit 8.2 erscheint
  dann ein Hinweis, und das Tagebuch ist nicht betroffen, aber Plan und Vorrat werden nicht mehr gespeichert. Lösung:
  Fotos als Dateien (`expo-file-system`) bzw. im Browser in IndexedDB statt im Zustand. (24.11.2026)
- **Teilen und Dateiauswahl in Expo Go ungeprüft:** „Als Tabelle (CSV)“, „Als Sicherung (JSON)“ und „Sicherung
  importieren“ nutzen in der App `expo-sharing` und `expo-document-picker` (beide in Expo Go); im Browser im Rauchtest
  geprüft, auf iPhone und Android ohne Gerät nicht. Benjamin im PR gebeten, es auszuprobieren. (24.11.2026)
- **Tagebuch nur heute bearbeitbar:** Einträge lassen sich nur unter „Heute“ löschen, vergangene Tage im Profil weder
  löschen noch ändern; nachtragen geht nur am selben Tag. Der Abgleich kann Änderungen schon (`updatedAt`) – eine
  Bearbeitung im Profil wäre eine neue Funktion. (24.11.2026)
- **Nutzerverzeichnis nur mit Zustimmung:** Heute steht jedes nicht gesperrte Konto mit Namen im Verzeichnis, das alle
  Angemeldeten sehen. Datensparsamer: nur wer zustimmt oder etwas teilt. Vor dem Start der Anmeldung entscheiden.
  (24.11.2026)
- **RIS und Wikimedia aus der Cloud nicht lesbar:** WebFetch meldet beim RIS (Gesetzestexte) „ROBOTS_UNREACHABLE“ und
  bei Wikimedia-Seiten „url_not_found“ – nicht auf anderem Weg holen. Für Rechtsfragen reichen meist die Erläuterungen
  von WKO und USP (beide lesbar). (24.11.2026)
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
