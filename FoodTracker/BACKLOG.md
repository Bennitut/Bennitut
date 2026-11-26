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

**Stand 27.11.2026, 2 Uhr:** Seit Benjamins Wunsch vom 24.11.2026, 23:22 Uhr, ist der **Server im Internet mit
Konten, dauerhafter Speicherung und Reel-Import Vorrang 1** (Abschnitt gleich unten): pro Lauf ein abgeschlossener, grüner
Teilschritt in der Reihenfolge 9.1 bis 9.5. 9.1 ist seit 26.11. fertig (Konten mit E-Mail und Passwort in Server und App,
Übernahme der Gerätedaten beim Anmelden, Einwilligung vor der ersten KI-Funktion mit Eltern-Hinweis, kein Mindestalter).
Seit 27.11. gibt es die Speicherschicht (SQLite-Datei oder Postgres mit `DATABASE_URL`, versionierte Migrationen); dort
liegen Konten, Sitzungen und die Tagebuch-Sicherung, Letztere in einer allgemeinen Tabelle für den Abgleich. Als Nächstes
9.2, Teil 3 (Community-Rezepte, Favoriten, Bewertungen, Meldungen und Admin-Änderungen in die Datenbank, Fotos als
Dateien). Danach Vorrang 2 (Benjamins Antworten vom 24.11.2026 gegen 23:30 Uhr, mit
„Rezeptfotos selbst ausliefern“), dann die Daueraufgabe „Videos je Sprache“ (der Rest von 8.3), dann die Punkte 8–10.
Der Tagesbericht kommt jeden Tag nach dem Teilschritt von Vorrang 1. Schon erledigt (Abschnitte weiter unten): Punkte
1–7, Benjamins Entscheidungen vom 24.11. (PR-Grenze aufgehoben, Rezeptfotos geprüft, Vorrat Variante (b)), Expo SDK 58,
die Wünsche 8.1–8.3 (Server zum Testen mit Ollama und `start-test.cmd`, Ernährungshistorie, Videos in der gewählten
Sprache), „Impressum & Datenschutz in App und Web-Version“ und Impressum Variante B.
**Benjamins Antworten vom 24.11.2026 (gegen 23:30 Uhr, im Chat per Auswahlmenü):** (1) Impressum **Variante B** –
umgestellt; seine Angaben hat Claude im Chat in `app/src/legal/angaben.ts` eingetragen (Commit 69027d1), nur noch
prüfen. (2) Rezeptfotos **Variante (a), selbst ausliefern**. (3) **Kein Mindestalter** – die App bleibt für alle offen,
auch Konto und KI-Funktionen; keine Altersgrenze und keine Altersprüfung, aber der Hinweis zur Zustimmung eines
Elternteils. (4) „Löschen geht in der Web-Version nicht“: nicht dringend, nicht vorziehen. (5) `start-test.cmd` holt
den neuesten Stand selbst (erledigt). (6) **Kontaktformular**, sobald der Server steht. Einzelheiten: Vorrang 2.

## Vorrang 1: Server im Internet mit Konten, dauerhafter Speicherung und Reel-Import (9, Benjamins Wunsch vom 24.11.2026, 23:22 Uhr)

Benjamin will: Konten anlegen können, Daten werden dauerhaft gespeichert, und Instagram-Reels und Ähnliches lassen sich
importieren. Geht allem anderen vor; nur ein noch offenes Expo-Update käme davor. Die Nachtschicht legt keine Konten bei
Diensten an und veröffentlicht nichts: Sie macht den Server fertig, Benjamin richtet das Hosting einmalig nach
`docs/SERVER-HOSTING.md` ein. Fertiges aus 8.1 und 8.2 (CORS, `.env`, KI-Stelle mit Ollama, Historien-Sicherung)
weiterverwenden statt doppelt bauen. Pro Lauf ein abgeschlossener, grüner Teilschritt (unten von oben nach unten).

**9.1 Konten**

- [x] Server: Registrierung und Anmeldung mit E-Mail und Passwort (zusätzlich zu Apple, Google und Dev-Login):
  Passwörter mit scrypt aus `node:crypto` (keine nativen Pakete), Mindestlänge 10, Sitzungs-Token mit Ablauf, Abmelden,
  Rate-Limit für Anmeldeversuche, keine Auskunft, ob eine E-Mail schon registriert ist; Dev-Login nur mit
  `ALLOW_DEV_LOGIN=1`. Dazu Passwort ändern, Konto löschen und „Meine Daten exportieren“ (DSGVO). Passwort-Reset per
  E-Mail nur, wenn ein Mail-Dienst konfiguriert ist (optionale `SMTP_*`-Variablen in `.env.example`); sonst den Knopf
  ausblenden und unter „Ideen und Erkenntnisse“ notieren. – erledigt 25.11.2026: `POST /api/auth/register` und `/login`
  (scrypt N = 2¹⁵, r = 8, p = 3, rund 0,2 s pro Prüfung), Sitzungen 30 Tage; Rate-Limit pro IP-Adresse und pro Adresse
  (auch für Adressen ohne Konto), gleiche Antwort und Rechenzeit für unbekannte Adressen; `POST /api/auth/password`
  meldet andere Geräte ab; `DELETE /api/auth/me` löscht das Konto mit Tagebuch-Sicherung, geteilten Rezepten,
  Favoriten, Fotos, Sternen und Meldungen; `GET /api/auth/export` als JSON ohne Passwort-Hash; „Passwort vergessen?“ mit
  8-stelligem Code (30 Minuten, höchstens 5 Versuche) nur mit `SMTP_*` (nodemailer), `/api/auth/config` meldet es.
  `ADMIN_EMAILS` macht Passwort-Konten erst mit bestätigter Adresse zum Admin; ohne Namen heißt ein Konto „Nutzer:in“
  statt des Teils der Adresse vor dem „@“. `TRUST_PROXY=1` hinter einem Proxy. 21 Server-Tests (115).
- [x] App: Anmelde- und Registrierungsbildschirm in allen fünf Sprachen, Anmeldung bleibt gespeichert
  (`expo-secure-store` auf dem Handy, localStorage im Web), die App funktioniert weiter ohne Konto; im Profil Passwort
  ändern, Konto löschen und Daten exportieren. – erledigt 26.11.2026: Anmelden und Registrieren mit E-Mail und Passwort
  (`components/PasswordSignIn.tsx`) samt „Passwort vergessen?“ mit Code (nur mit Mail-Dienst); Adresse und Passwortlänge
  werden vor dem Absenden wie im Server geprüft, Fehler nennen Wartezeit bzw. Mindestlänge; bei der Registrierung der
  Hinweis zur Zustimmung eines Elternteils und ein Link zur Datenschutzerklärung. Sitzung unter eigenem Schlüssel
  (`lib/session.ts`: Schlüsselbund bzw. Keystore über `expo-secure-store`, im Browser localStorage; Umzug aus dem übrigen
  Zustand, der kein Token mehr enthält). Karte „Konto verwalten“ im Profil: Passwort ändern, „Meine Daten exportieren“,
  Konto löschen mit Rückfrage direkt in der Karte (kein `Alert`, das im Browser nichts zeigt). 15 App-Tests (174);
  `npm run web:account` spielt alles im Browser mit echtem Server durch.
- [x] Beim ersten Anmelden die lokalen Daten des Geräts ins Konto übernehmen, ohne Duplikate. – erledigt 26.11.2026:
  Nach jeder Anmeldung ruft die App einmal `POST /api/auth/claim-device` auf: Fotos, Sterne, geteilte Rezepte, Favoriten,
  Meldungen und die Tagebuch-Sicherung der Geräte-ID gehören danach dem Konto, die Sicherung unter der Geräte-ID ist weg.
  Nichts doppelt: Hat das Konto dasselbe Rezept bzw. Foto schon bewertet, favorisiert oder gemeldet, gilt seine Fassung
  (Sterne haben keinen Zeitpunkt), eigene Fotos bleiben ohne eigene Sterne, im Tagebuch gewinnt die neuere Fassung.
  Gespeichert wird, für welches Konto es geklappt hat (`claimedFor`, jede An- und Abmeldung setzt es zurück); im Profil
  einmal ein Hinweis, Anmeldebildschirm und „Nicht angemeldet“ sagen es vorher (fünf Sprachen). Das Tagebuch auf dem
  Gerät ging schon vorher beim ersten Abgleich ganz ins Konto. Plan, Vorrat, eigene Rezepte und Einstellungen liegen
  bisher nur auf dem Gerät – sie kommen mit 9.2 (Abgleich aller Daten) nach demselben Muster ins Konto. Dabei eine
  Sicherheitslücke geschlossen (Geräte-ID „user:<Konto-ID>“, unter „Ideen und Erkenntnisse“). 9 Server-Tests (124),
  2 App-Tests (176), `npm run web:account` prüft die Übernahme im Browser.
- [x] Kein Mindestalter (Vorrang 2, Antwort 3): keine Altersabfrage, aber bei der Registrierung und vor der ersten
  Nutzung der KI-Funktionen der Hinweis, dass Kinder unter 14 und – für Gesundheitsdaten wie Allergien oder das
  Ernährungstagebuch – Minderjährige unter 18 nur mit Zustimmung eines Elternteils einwilligen (§ 4 Abs. 4 DSG, Art. 8
  und 9 DSGVO). Bei der Registrierung steht der Hinweis seit 26.11.2026 (fünf Sprachen, `ParentalNotice`). – erledigt
  26.11.2026: Vor der ersten KI-Funktion (Mahlzeit, Kassenbon, Import, Übersetzen, „Text mit KI verbessern“, Wünsche im
  Plan) fragt ein Dialog um Erlaubnis: was diese Funktion an wen schickt (Claude von Anthropic oder ein Modell auf dem
  Server), ausdrückliche Einwilligung für Gesundheitsangaben, Eltern-Hinweis, Widerruf im Profil (Karte
  „KI-Funktionen“). „Nicht jetzt“ schickt nichts, Wünsche im Plan entfallen dann mit Hinweis. Die App verschickt
  KI-Anfragen nur mit Einwilligung (`lib/aiConsent.ts`, `components/AiConsent.tsx`) und nennt dem Server die Fassung im
  Header `X-AI-Consent`; ohne antwortet er mit 403 `ai_consent_required`, bevor etwas an die KI geht
  (`server/src/ai/consent.ts`). Datenschutz B3 und „Mindestalter“ ohne Platzhalter. 3 Server-Tests (127), 6 App-Tests
  (182), `npm run web:account` spielt Dialog, Widerruf und Server-Ablehnung im Browser durch.

**9.2 Dauerhafte Speicherung**

Ziel: eine Speicherschicht im Server für alle Nutzerdaten – Profil und Fragebogen, Pläne, Einkaufsliste, Vorrat,
Tagebuch/Historie, eigene und importierte Rezepte (Fotos als Dateien bzw. in einem Objektspeicher, nicht in der
Datenbank), dazu Konten und Sitzungen (auf kostenlosen Cloud-Diensten gehen Dateien beim Neustart verloren). Mit
`DATABASE_URL` Postgres (für kostenlose Anbieter wie Neon oder Supabase), ohne `DATABASE_URL` eine lokale Datei unter
`server/data/`. Versionierte Migrationen; Tests ohne echte Datenbank. In Teilschritten:

- [x] Speicherschicht mit SQLite-Datei oder Postgres, Konten und Sitzungen in der Datenbank (Teil 1) – erledigt
  27.11.2026: `server/src/storage/db.ts` – dasselbe SQL für SQLite (`node:sqlite`, in Node.js eingebaut, keine nativen
  Pakete; `data/foodtracker.db`, `DATABASE_FILE`) und Postgres (`pg`, `DATABASE_URL`; verschlüsselt, wenn die Adresse
  kein `sslmode` nennt; Verbindung beim Start geprüft, ohne die Adresse auszugeben). `migrations.ts` mit
  `schema_migrations` (Migration 1: Konten, Sitzungen, Codes, `storage_meta`); eine von einer neueren Fassung umgebaute
  Datenbank lässt den Server nicht starten. `UserStore` liegt in der Datenbank (asynchron); Codes zählen jeden Versuch
  vor dem Vergleich (auch bei gleichzeitigen Anfragen höchstens fünf). `data/users.json` übernimmt der Server beim Start
  einmal (gleiche Konto-IDs, gültige Anmeldungen) und löscht sie. Startmeldung „Daten: …“, sauberes Schließen beim
  Beenden. Tests auf SQLite und auf Postgres über pg-mem (nachgebaut im Speicher). 28 Server-Tests (155),
  `npm run web:account` mit eigener Datenbank grün.
- [x] Tagebuch-Sicherung in die Datenbank (Teil 2): Einträge und Löschmarken als Zeilen statt einer Datei pro Konto bzw.
  Gerät, mit einmaligem Umzug aus `data/diary/`. Gleich als allgemeine Tabelle für den Abgleich (Besitzer, Art,
  Eintrags-ID, Revision, Zeitstempel, Inhalt oder Löschmarke), damit Plan, Vorrat und Co. sie mitnutzen. – erledigt
  27.11.2026: Migration 2 mit `sync_records` (Besitzer, Art, Eintrags-ID, Revision, Zeitpunkt, Inhalt als JSON, NULL
  = Löschmarke) und `sync_revisions` (Zähler pro Besitzer und Art); `storage/sync.ts` (`SyncStore`: Abgleich, Übernahme
  ins Konto, Löschen – für jede Art nutzbar), `DiaryStore` darauf mit der Art „diary“, die Schnittstelle der App bleibt
  gleich. Alles oder nichts pro Anfrage (vorher blieb eine an der Grenze abgelehnte Anfrage halb im Speicher), Pakete
  fester Größe (5000 Einträge in rund 50 ms), gleichzeitige Abgleiche nacheinander (Postgres: Zeilensperre).
  `data/diary/` übernimmt der Server beim Start einmal mit denselben Revisionen (Geräte verpassen nichts) und löscht die
  Dateien, unlesbare bleiben liegen; „Konto löschen“ entfernt auch Löschmarken und Zähler des Kontos. 17 Server-Tests
  (172, SQLite und pg-mem), der App-Test gegen den echten Server-Speicher läuft jetzt mit Datenbank, `npm run
  web:account` prüft Umzug, Übernahme ins Konto, Export und Löschen im Browser.
- [ ] Community-Rezepte, Favoriten, Bewertungen, Meldungen und Admin-Änderungen in die Datenbank (Teil 3), mit Umzug aus
  den JSON-Dateien; Fotos als Dateien (`data/photos/`) bzw. in einem Objektspeicher statt als data-URI.
- [ ] Abgleich App ↔ Server wie in 8.2 (Eintrags-ID, Löschmarken, Zeitstempel), jetzt für alle genannten Daten; offline
  weiter nutzbar, Abgleich sobald verbunden. Tabelle `sync_records` und `SyncStore` stehen seit Teil 2 (je Art ein eigener
  Name, eigene Grenzen). Wie beim Tagebuch geht beim ersten Abgleich mit einem Konto alles vom Gerät
  hoch (Rest von 9.1 „lokale Daten ins Konto“, ohne Duplikate); bei Einzelstücken wie Plan und Einstellungen gewinnt
  die neuere Fassung.
- [ ] Server-Adresse: `EXPO_PUBLIC_API_URL` beim Start bzw. Bauen, dazu im Profil änderbar; ohne Angabe wie bisher der
  Laptop im WLAN. Dabei die Abgleich-Marken an die Datenbank binden (unter „Ideen und Erkenntnisse“: „Neuer Server,
  alte Abgleich-Marken“).

**9.3 Bereit fürs Internet (vorbereiten, nicht deployen)**

- [ ] Dockerfile und Health-Check für den Server; `CORS_ORIGINS` für die Web-Version (`https://bennitut.github.io`)
  und eigene Domains.
- [ ] `docs/SERVER-HOSTING.md` auf Deutsch, Schritt für Schritt, zwei kostenlose Wege mit ehrlichen Grenzen:
  (a) Laptop plus Cloudflare Tunnel (KI kostenlos über Ollama auf der GPU, aber nur erreichbar, solange der Laptop
  läuft); (b) kostenloser Cloud-Dienst mit kostenloser Postgres-Datenbank (aktuelle Gratis-Angebote per Websuche prüfen,
  z. B. Render plus Neon; Schlafmodus, Speicher- und Rechenlimits, wo eine Kreditkarte verlangt wird). Ehrlich: Ohne GPU
  braucht die KI dort die Claude-API (kostet API-Geld) oder eine Weiterleitung an Ollama auf dem Laptop (`OLLAMA_URL` auf
  die Tunnel-Adresse, mit geheimem Schlüssel) – als Option vorsehen. Klar abgrenzen, was Benjamin selbst tun muss.
- [ ] Sicherheit: nur über HTTPS, Rate-Limits, Größenbegrenzung für Uploads, keine Geheimnisse im Repo, Logs ohne
  Passwörter, Tokens oder E-Mail-Adressen; Datenschutz-Entwurf um Konten, Speicherung, Hosting-Anbieter und Reel-Import
  ergänzen. B2 („Konto“) in `app/src/legal/texte.ts` und `docs/recht/datenschutz.md` ist seit 26.11.2026 auf dem Stand
  (E-Mail und Passwort mit scrypt-Prüfwert, Code per Mail-Dienst, Sitzung im Schlüsselbund bzw. in localStorage,
  Übernahme der Gerätedaten beim Anmelden, Export und Löschen im Profil).

**9.4 Import von Instagram-Reels, TikTok und YouTube Shorts**

- [ ] App: Link einfügen (in Expo Go zusätzlich einen kopierten Link aus der Zwischenablage anbieten; ein echtes
  Teilen-Ziel braucht einen eigenen Build → „Ideen und Erkenntnisse“) und alternativ das Video selbst hochladen
  (gespeichertes Reel oder Bildschirmaufnahme aus der Mediathek).
- [ ] Server bei einem Link: nur öffentlich zugängliche Angaben ohne Anmeldung (oEmbed, Open-Graph-Titel und
  -Beschreibung, bei YouTube die öffentliche Seite). Keine Anmeldung bei Instagram oder TikTok, keine Umgehung von
  Sperren, kein Herunterladen der Videos mit Werkzeugen wie yt-dlp. Reicht die Beschreibung nicht, bittet die App, das
  Video hochzuladen oder die Caption einzufügen.
- [ ] Server bei einem hochgeladenen Video: mit ffmpeg Ton und einige Standbilder; Transkription über eine austauschbare
  Stelle (Whisper lokal, z. B. über transformers.js auf der CPU, oder ein Whisper-Server unter `WHISPER_URL`; Wahl im PR
  begründen); eingeblendeten Text über das Bildmodell der KI-Stelle; daraus mit demselben Zod-Schema ein Rezept. Ohne KI
  `ai_not_configured`. Als Hintergrundauftrag mit Statusabfrage und Fortschritt in der App. Weil dann Video bzw. Ton
  an die KI gehen: Einwilligungstext (`aiConsent.sendsImport`, B3) erweitern und die Fassung erhöhen (siehe „Fassung
  der Einwilligung erhöhen“).
- [ ] Quelle und Link im importierten Rezept speichern; das hochgeladene Video nach der Auswertung löschen. Tests mit
  kurzen, selbst erzeugten Testvideos (ffmpeg `testsrc`, Stille oder Sprachsynthese) und nachgebauten KI-Antworten.

**9.5 Prüfen und berichten**

- [ ] Alle Checks, dazu ein End-to-End-Test im Browser mit laufendem Server: registrieren, Daten anlegen, abmelden,
  Browserdaten löschen, neu anmelden, Daten sind wieder da; Reel-Import mit einem Testvideo. Im PR „In 5 Minuten
  testen“ um Konto und Reel-Import ergänzen und Benjamin per Auswahlmenü fragen, welchen Hosting-Weg aus
  `SERVER-HOSTING.md` er nehmen will (a oder b).

**Danach, sobald der Server steht (Server-Themen)**

- [ ] Kontaktformular in App und Web-Version (Vorrang 2, Antwort 6): Nachricht an den Server, von dort per E-Mail weiter
  oder zum Abholen abgelegt. Ist es fertig, Benjamin per Auswahlmenü fragen, ob die Telefonnummer aus dem Impressum soll
  (Vorgabe: ja).

## Vorrang 2: Benjamins Antworten vom 24.11.2026, gegen 23:30 Uhr (10, im Chat per Auswahlmenü)

Nach Vorrang 1 in dieser Reihenfolge; Antwort 3 (kein Mindestalter) und 6 (Kontaktformular) gelten schon beim Bau von
Vorrang 1.

- [x] 1. Impressum **Variante B**: Die Texte sind umgestellt (24.11.2026), Benjamins Angaben stehen in
  `app/src/legal/angaben.ts` (Commit 69027d1, Rechtstexte-Tests grün). Nur noch prüfen: App und Web-Version zeigen kein
  „Entwurf“ mehr, `npm run web:pages` läuft durch; verbleibende `[[PRÜFEN]]`-Stellen im PR auflisten. Die Angaben
  nirgends sonst wiederholen. – erledigt 25.11.2026: `npm run web:pages` baut ohne `--entwurf`, der Rauchtest unter
  `/Bennitut/` findet Impressum und Datenschutzerklärung vollständig; „Entwurf“ steht nur noch bei Teil B (nur mit
  Server sichtbar, bis es den Server für andere gibt). Die elf `[[PRÜFEN]]`-Stellen stehen im PR.
- [ ] 2. Rezeptfotos **Variante (a), selbst ausliefern** – eigener Abschnitt „Vorrang: Rezeptfotos selbst ausliefern“
  unten.
- [x] 3. **Kein Mindestalter** (Benjamins Entscheidung, nachdem er die Folgen kannte): Die App bleibt für alle offen,
  auch Konto und KI-Funktionen. Keine Altersgrenze und keine Altersprüfung, aber der Hinweis, dass Kinder unter 14 und –
  für Gesundheitsdaten wie Allergien oder das Ernährungstagebuch – Minderjährige unter 18 nur mit Zustimmung eines
  Elternteils einwilligen (§ 4 Abs. 4 DSG, Art. 8 und 9 DSGVO). Die Platzhalter zum Mindestalter in `docs/recht/` und
  `app/src/legal/texte.ts` entsprechend ersetzen; Teil B der Datenschutzerklärung, Registrierung (9.1) und die
  Einwilligung vor den KI-Funktionen folgen dem. – erledigt 26.11.2026: Abschnitt „Mindestalter“ der
  Datenschutzerklärung (nur mit Server) sagt „kein Mindestalter“ samt Eltern-Hinweis, B3 beschreibt die Einwilligung vor
  der ersten KI-Funktion und den Widerruf im Profil; `docs/recht/README.md` Entscheidung 3 abgehakt. Der Hinweis steht
  bei der Registrierung und im Dialog vor der ersten KI-Funktion (9.1).
- [x] 4. „Löschen geht in der Web-Version nicht“: nicht dringend, nicht vorziehen – bleibt unter „Ideen und
  Erkenntnisse“.
- [x] 5. `start-test.cmd` holt den neuesten Stand selbst (Commits ac6a7b2 und 870bdc5 von Claude aus dem Chat) – erledigt
  24.11.2026, unter „Ideen und Erkenntnisse“.
- [ ] 6. **Kontaktformular**, damit die Telefonnummer später wieder aus dem Impressum kann – steht bei den Server-Themen
  in Vorrang 1 („Danach“).

## Daueraufgabe: Tagesbericht als PDF (Benjamins Wunsch vom 23.11.2026)

Jeden Tag einmal, nach dem Teilschritt von Vorrang 1 (vorher direkt nach dem Setup): Fehlt
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

## Vorrang: Rezeptfotos selbst ausliefern (10.2, Benjamins Entscheidung vom 24.11.2026, Variante a)

Die frei lizenzierten Fotos aus `server/src/data/recipeImages.ts` einmalig herunterladen, verkleinern (etwa 800 px
breit, JPEG oder WebP; Gesamtgröße messen, Ziel höchstens etwa 15 MB) und aus dem eigenen Projekt ausliefern, so dass
App und Web-Version keine Anfragen mehr an Wikimedia oder Flickr schicken. Benjamin lädt dafür nichts selbst hoch.
Bildnachweise (Urheber:in, Lizenz, Quelle) bleiben sichtbar. Löst nebenbei „Fotos verschwinden an der Quelle“ (unten).
Stand 24.11.2026: 177 Fotos, davon 44 von Wikimedia Commons (`upload.wikimedia.org`, aus der Cloud ladbar, drosselt
schnelle Abfragen mit HTTP 429) und 133 von Flickr (`live.staticflickr.com`, aus der Cloud gesperrt). Die Vorlagen sind
heute höchstens 500 px (Wikimedia-Vorschaubilder) bzw. 640 px (Flickr-Größe „z“) groß – für etwa 800 px größere
Fassungen der Quelle nehmen (Flickr „c“ = 800 px, Wikimedia-Vorschaubild in einer Standardbreite).

- [ ] Skript zum Herunterladen und Verkleinern (nur fehlende Fotos, Pausen gegen HTTP 429), Ablage im Projekt, z. B.
  `app/assets/recipes/<rezept-id>.jpg`; Gesamtgröße messen.
- [ ] Flickr-Fotos: zuerst ein GitHub-Actions-Workflow, der sie herunterlädt, verkleinert und in `claude/nightly`
  committet (nur dieser Branch); geht das nicht, ein Skript für Benjamins Laptop zum Doppelklicken – dann Benjamin wie
  in Abschnitt 5a der Anweisungen fragen. Fotos, die sich noch nicht herunterladen ließen, bleiben bis dahin wie bisher.
- [ ] App und Web-Version zeigen die eigenen Dateien (in Expo Go und im Web-Export prüfen, dass keine Anfrage mehr an
  Wikimedia oder Flickr geht – der Web-Rauchtest kann das zählen); Bildnachweis unter dem Foto und Link zur Quelle
  bleiben.
- [ ] Danach Abschnitt 4 der Datenschutzerklärung (Rezeptfotos) und „Kurz gesagt“ in `app/src/legal/texte.ts` und
  `docs/recht/datenschutz.md` anpassen bzw. streichen, Bildnachweis im Impressum und `docs/recht/README.md` nachziehen.

## ✅ Vorrang: Impressum Variante B (10.1, Benjamins Entscheidung vom 24.11.2026) – erledigt 24.11.2026

24.11.2026: Impressum mit den Angaben nach § 5 E-Commerce-Gesetz und der Offenlegung nach § 25 Mediengesetz
(„Medieninhaber und Diensteanbieter“, volle Anschrift mit „Österreich“, E-Mail, zweiter Kontaktweg, Gegenstand,
Bildnachweis); `angaben.ts` mit den Feldern Straße, Hausnummer mit Stiege und Tür, PLZ, Ort und zweiter Kontaktweg
(eine reine Telefonnummer erscheint als „Telefon: …“, `contactLine` in `lib/legal.ts`). Die Datenschutzerklärung nennt
unter „1. Verantwortlich“ dieselbe volle Anschrift – damit ist die Frage, ob dort der Wohnort genügt, erledigt.
Mindestalter-Platzhalter „noch offen“. `docs/recht/` auf Variante B (Variante A nur noch zum Vergleich). 3 neue Tests
(159). Benjamins Name ist eingetragen; Anschrift, E-Mail, zweiter Kontaktweg und „Stand“ fehlen noch (Claude fragt im
Chat), bis dahin „Entwurf“ und kein Pages-Build. Nachtrag: Claude hat die übrigen Angaben am 24.11. im Chat eingetragen
(Commit 69027d1); was noch zu prüfen ist, steht in Vorrang 2.

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
KI-Wünsche funktionieren, ohne dass Benjamin Geld ausgibt. Den Server im Internet für echte Tester gibt es seit dem
24.11.2026 (23:22 Uhr) als eigenen Vorrang 1 (oben).

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
- ✅ **`start-test.cmd` holt den neuesten Stand selbst:** erledigt 24.11.2026 (Commit ac6a7b2 von Claude aus dem
  Chat, Benjamins Wunsch): `git pull --ff-only` in einem Klammerblock, danach startet die Datei frisch mit
  `--ohne-pull`; scheitert der Pull an lokalen Änderungen (npm und Expo ändern auf Benjamins Laptop `package.json`,
  `package-lock.json` und `tsconfig.json`), legt sie diese mit `git stash` beiseite und versucht es noch einmal (Commit
  870bdc5). Nicht zurückbauen und den Schalter `--ohne-pull` genau so schreiben – Benjamins
  Desktop-Verknüpfung erkennt daran, dass die Datei schon selbst aktualisiert. Wer Batch-Dateien ändert: `git pull` kann
  die laufende Datei ersetzen, deshalb gehört alles, was danach noch laufen muss, in den Klammerblock. Zum Testen reicht
  jetzt ein Doppelklick auf `start-test.cmd` (oder eine Verknüpfung darauf), kein `git pull` von Hand. (24.11.2026)
- **Ollama mit echtem Modell nicht geprüft:** In der Cloud-Sitzung läuft kein Ollama mit `gemma4:e4b` (9,4 GB, braucht
  eine Grafikkarte). Anfrage und Antwort folgen der Ollama-Doku (`/api/chat`, `format` als JSON-Schema, `think: false`)
  und sind mit nachgebautem `fetch` und einem nachgebauten Ollama-Server getestet. Offen: wie gut `gemma4:e4b` die
  Schemas trifft (vor allem den Kassenbon mit dem ganzen Zutatenkatalog) und wie lange es auf 8 GB Grafikspeicher
  braucht. Bei „Die KI-Antwort konnte nicht gelesen werden“ steht die Ursache im Server-Fenster; Benjamin um die Zeile
  bitten. Ideen, falls es hakt: `OLLAMA_NUM_CTX` senken, `qwen3-vl:8b` probieren, Katalog im Prompt kürzen. (24.11.2026)
- **Server im Internet für echte Tester:** Seit Benjamins Wunsch vom 24.11.2026 (23:22 Uhr) Vorrang 1 (oben), mit
  Konten, dauerhafter Speicherung und Reel-Import. Was damals notiert wurde und dort mitzudenken ist: HTTPS, dauerhafter
  Speicher (auf kostenlosen Cloud-Diensten gehen Dateien unter `server/data/` beim Neustart verloren), `CORS_ORIGINS` mit
  der Pages-Adresse, `EXPO_PUBLIC_API_URL` beim Bauen der Web-Version, `ALLOW_DEV_LOGIN` aus. KI über Claude (kostet)
  oder eine Weiterleitung an Ollama auf dem Laptop – dazu Punkt 9 (Kosten begrenzen), die Einwilligung und Teil B der
  Datenschutzerklärung. (24.11.2026)
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
  löschen. Klein und für Tester spürbar. Benjamin am 24.11.2026: nicht dringend, nicht vor Punkt 8 vorziehen. (24.11.2026)
- **Rechtstexte an zwei Stellen:** Die Entwürfe mit Erklärungen stehen in `docs/recht/`, die angezeigte Fassung in
  `app/src/legal/texte.ts`. Wer eines ändert, muss das andere nachziehen. Idee, falls das oft vorkommt: die App-Fassung
  beim Bauen aus den Markdown-Dateien erzeugen (Hinweise für Benjamin dort als Kommentare). (24.11.2026)
- ✅ **Datenschutzerklärung, „1. Verantwortlich“:** Dort stand wie im Impressum (Variante A) nur der Wohnort; Art. 13
  DSGVO verlangt Name und „Kontaktdaten“ – ob der Ort neben der E-Mail-Adresse genügt, war offen. (24.11.2026) Erledigt
  24.11.2026 mit Impressum Variante B: Dort steht jetzt dieselbe volle Anschrift wie im Impressum.
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
- **Postgres nur mit pg-mem getestet:** Die Tests laufen auf SQLite und auf pg-mem (Postgres nachgebaut im Speicher).
  pg-mem rollt Transaktionen nicht zurück (das prüfen die SQLite-Tests) und versteht `CREATE TABLE IF NOT EXISTS` für
  schon vorhandene Tabellen nicht (umgangen). Vor dem Start mit Neon einmal gegen ein echtes Postgres prüfen (9.3 bzw.
  9.5): Tabellen anlegen, registrieren, anmelden, Server neu starten, noch angemeldet. Seit 9.2 Teil 2 dazu das
  Tagebuch: zwei Geräte gleichzeitig abgleichen lassen – gleichzeitige Abgleiche desselben Kontos sollen nacheinander
  laufen (Zeilensperre in `sync_revisions`; pg-mem kennt keine Sperren). (27.11.2026)
- **Neuer Server, alte Abgleich-Marken:** Die App merkt sich beim Tagebuch nur Besitzer und Revision, nicht, welcher
  Server bzw. welche Datenbank. Zieht der Server auf eine neue, leere Datenbank um (z. B. vom Laptop zu Render mit Neon)
  oder bekommt die App eine andere Server-Adresse, schicken Geräte, die schon abgeglichen hatten, nur noch ihre neuen
  Änderungen – die neue Datenbank hätte nur einen Teil der Historie, und ein neues Gerät bekäme nicht alles (auf den
  Geräten selbst bleibt alles). Lösung mit 9.2 „Server-Adresse“: Der Server nennt beim Abgleich eine zufällige Kennung
  seiner Datenbank (einmal in `storage_meta` angelegt), die App merkt sie sich mit der Marke und gleicht bei einer anderen
  Kennung von vorn ab (alles hoch, alles zurück). Der Umzug aus `data/diary/` behält die Revisionen und ist davon nicht
  betroffen. (27.11.2026)
- **`node:sqlite` gilt in Node 22 als experimentell:** `npm start` blendet die Warnung „SQLite is an experimental
  feature“ aus (`--disable-warning=ExperimentalWarning`), die Tests zeigen sie. Die genutzte Schnittstelle
  (`DatabaseSync`, `prepare`, `exec`) gibt es unverändert seit Node 22.13; ändert eine künftige Node-Version etwas,
  schlagen die Tests an. Benjamin hat Node 26. (27.11.2026)
- **Letzter Admin bei Postgres:** Entmachten sich zwei Admins gleichzeitig gegenseitig, kann das bei Postgres beides
  klappen (Standard-Isolation READ COMMITTED); bei SQLite laufen Transaktionen nacheinander. Unwahrscheinlich, bei Bedarf
  mit `SELECT … FOR UPDATE` lösen. (27.11.2026)
- **Nach „Konto löschen“ geht die Historie wieder in die Sicherung pro Gerät:** Ohne Konto sichert die App das Tagebuch
  automatisch unter der Geräte-ID (so gewünscht, 8.2). Wer sein Konto löscht, damit seine Daten vom Server verschwinden,
  hat die Historie danach also wieder dort, nur unter der Geräte-ID. Zusammen mit „Sicherung der Historie startet ohne
  Nachfrage“ lösen: Sicherung abschaltbar machen und beim Löschen mit ausschalten. (26.11.2026)
- ✅ **Geräte-ID ließ sich als fremdes Konto ausgeben:** Der Server nahm als `X-Device-Id` jede Zeichenkette mit 8 bis
  100 Zeichen. Ohne Anmeldung handelt er unter der Geräte-ID, mit Anmeldung unter „user:<Konto-ID>“ – und die Konto-IDs
  stehen im Nutzerverzeichnis. Mit `X-Device-Id: user:<ID>` konnte man so ohne Passwort die Fotos und geteilten Rezepte
  eines fremden Kontos löschen und in seinem Namen bewerten (mit der neuen Übernahme hätte man sie sogar ins eigene Konto
  holen können). Beim Bau der Übernahme aufgefallen. (26.11.2026) Erledigt 26.11.2026: Geräte-IDs nur noch aus
  Buchstaben, Ziffern, „-“ und „_“ (wie die App sie erzeugt), ein Server-Test prüft die Lücke.
- **Geteilte Geräte:** Wer sich auf einem Gerät anmeldet, bekommt, was das Gerät ohne Konto auf dem Server hatte – auch
  wenn das jemand anderes war (Familien-Tablet). Das Tagebuch auf dem Gerät ging schon bisher beim ersten Abgleich ins
  angemeldete Konto. Bei einer Ernährungs-App auf dem eigenen Handy selten; falls nötig, vor der Übernahme fragen („Was
  dieses Gerät ohne Konto gespeichert hat, in dein Konto übernehmen?“). (26.11.2026)
- **Geräte-ID nicht kryptografisch zufällig:** `newId()` (Zeitstempel plus sechs Zeichen aus `Math.random`, zweimal) ist
  schwer zu erraten, aber nicht kryptografisch zufällig. Wer eine fremde Geräte-ID kennt, kann deren Daten verwalten und
  seit der Übernahme auch ins eigene Konto holen; der Server schickt Geräte-IDs nie an andere. Für neue Installationen
  `randomUUID()` aus `expo-crypto` nehmen (schon eine Abhängigkeit; vorher die Doku für SDK 58 lesen). (26.11.2026)
- **Anmeldung in Expo Go auf dem Gerät ungeprüft:** `expo-secure-store` ist in Expo Go enthalten, die Bundles für iOS
  und Android bauen, und im Browser ist alles getestet – auf iPhone und Android aber nicht. Benjamin im PR gebeten:
  anmelden, Expo Go ganz schließen, wieder öffnen → noch angemeldet. (26.11.2026)
- **„Passwort vergessen?“ mit echter Mail ungeprüft:** Der Konto-Test im Browser geht bis zum falschen Code (die Mail
  geht dort ins Leere), den richtigen Code prüfen die Server-Tests. Mit einem Gmail-App-Passwort in `server/.env` einmal
  von Hand ausprobieren. (26.11.2026)
- **Mail mit dem Code duzt auf Französisch:** Die App siezt auf Französisch („vous“), die Mail zum Zurücksetzen duzt
  („ton mot de passe“, `server/src/mail/mailer.ts`). Bei Gelegenheit angleichen. (26.11.2026)
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
  Web-Version unkritisch, in der App wird das Paket größer. Benjamin hat am 24.11.2026 Variante (a) gewählt – steht
  jetzt als Vorrang oben. (24.11.2026)
- ✅ **Konto löschen fehlt:** App und Server können ein Konto anlegen und abmelden, aber nicht löschen. Vor dem Start der
  Anmeldung nötig – Recht auf Löschung (Art. 17 DSGVO); auch Apple verlangt für Apps mit Konten eine Löschfunktion in
  der App (vor dem Einreichen in den App-Review-Richtlinien nachlesen). (24.11.2026) Erledigt 26.11.2026: im Server seit
  25.11., in der App unter 👤 Profil → „Konto verwalten“ → „Konto löschen“ (Konten mit Passwort bestätigen es mit dem
  Passwort).
- ✅ **Einwilligung vor KI-Funktionen:** Mit Server gehen Fotos, Rezepttexte und Wünsche an Anthropic; Wünsche und Fotos
  können Gesundheitsangaben enthalten (Art. 9 DSGVO: ausdrückliche Einwilligung). Vor der ersten Nutzung einmal fragen,
  im Profil widerrufbar machen (in Österreich willigen Kinder ab 14 selbst ein, bei Gesundheitsdaten laut herrschender
  Meinung auch dann nur mit den Eltern). Mindestalter: **keins** (Benjamins Entscheidung vom 24.11.2026, 23:30 Uhr).
  (24.11.2026) Erledigt 26.11.2026: Dialog vor der ersten KI-Funktion mit Eltern-Hinweis, Widerruf im Profil, ohne
  Einwilligung keine KI-Anfrage (App und Server, Header `X-AI-Consent`), Datenschutz B3 und „Mindestalter“ ergänzt
  (Vorrang 1, 9.1).
- **Claude-API für andere und Minderjährige:** Laufen die KI-Funktionen später mit der Claude-API für andere, gelten
  Anthropics Vorgaben für Produkte, die Minderjährige nutzen können
  (https://support.claude.com/en/articles/9307344) – die App hat kein Mindestalter (Vorrang 2, Antwort 3). Vor dem Start
  des Servers für andere prüfen. (25.11.2026)
- **Einwilligung nachweisen:** Art. 7 Abs. 1 DSGVO verlangt, dass der Verantwortliche eine Einwilligung nachweisen kann.
  Heute liegt sie nur auf dem Gerät (Fassung und Zeitpunkt); der Server sieht sie bei jeder KI-Anfrage im Header
  `X-AI-Consent`, speichert sie aber nicht. Mit der Speicherschicht aus 9.2 je Konto bzw. Geräte-ID Fassung, Zeitpunkt
  und Widerruf speichern (ohne Inhalte der Anfragen). (26.11.2026)
- **Einwilligung gilt pro Gerät:** Wer sich auf einem fremden Gerät anmeldet, auf dem schon jemand den KI-Funktionen
  zugestimmt hat, wird nicht noch einmal gefragt (wie bei „Geteilte Geräte“). Mit 9.2 könnte die Einwilligung zum Konto
  wandern: beim Anmelden die des Kontos übernehmen bzw. fragen. (26.11.2026)
- **Fassung der Einwilligung erhöhen:** Ändert sich, was an wen geht (z. B. ein neuer KI-Anbieter, der Reel-Import aus
  9.4 mit Ton und Standbildern), `AI_CONSENT_VERSION` in `app/src/lib/aiConsent.ts` und `server/src/ai/consent.ts`
  gemeinsam erhöhen und die Texte im Dialog (`aiConsent.*`, fünf Sprachen) und in B3 anpassen – dann fragt die App neu.
  Eine ältere App bekommt vom Server dann 403 mit „Bitte FoodTracker neu laden bzw. aktualisieren“. (26.11.2026)
- **„Passwort vergessen?“ braucht einen Mail-Dienst:** Ohne `SMTP_HOST` und `SMTP_FROM` in `server/.env` gibt es keinen
  Code per E-Mail, die App blendet den Knopf dann aus (seit dem App-Teil von 9.1). Wer dann sein Passwort vergisst,
  kommt nicht mehr ins Konto – ein Admin kann kein Passwort setzen. Kostenlos geht es z. B. mit Gmail und einem
  App-Passwort (Anleitung in `.env.example`); für viele Nutzer:innen später ein Mail-Dienst mit Gratis-Kontingent.
  (25.11.2026)
- **E-Mail-Adresse bei der Registrierung bestätigen:** Ohne Bestätigungs-Mail lässt sich bei der Registrierung nicht
  ganz verbergen, ob eine Adresse schon ein Konto hat (eine vergebene mit fremdem Passwort ergibt einen Fehler statt
  eines Kontos) – das Rate-Limit pro IP-Adresse bremst systematisches Ausprobieren. Mit Mail-Dienst: immer „Bitte
  bestätige deine Adresse“ antworten und erst nach dem Code anlegen; damit wäre auch `ADMIN_EMAILS` ohne den Umweg
  über „Passwort vergessen?“ sicher. (25.11.2026)
- **scrypt auf sehr kleinen Servern:** Eine Passwort-Prüfung kostet hier rund 0,2 s und 32 MiB; auf einem Gratis-Server
  mit 0,1 CPU eher 1–2 s. Falls das stört, die Kosten in `auth/password.ts` senken (alte Hashes werden beim nächsten
  Anmelden automatisch neu berechnet, `needsRehash`). (25.11.2026)
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
