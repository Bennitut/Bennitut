# FoodTracker

App für iOS und Android zum Tracken von Essen, mit automatischen Ernährungsplänen,
die so geplant werden, dass **keine Reste übrig bleiben**. Gemacht für Deutschland,
Österreich und die Schweiz, dank Übersetzungsfunktion weltweit nutzbar.

## Funktionen

| Bereich | Was passiert |
|---|---|
| **Foto einer Mahlzeit** | Claude erkennt die Lebensmittel, schätzt Mengen und Nährwerte → Eintrag im Tagebuch. |
| **Foto eines Kassenbons** | Claude liest jede Position (REWE, BILLA, Migros …), ordnet sie Zutaten zu und rechnet Mengen um → Vorrat. |
| **Fragebogen** | Beim ersten Planen fragt die App nach Ernährungsweise (alles, pescetarisch, vegetarisch, vegan), religiösen Speiseregeln (halal, koscher), Unverträglichkeiten, Abneigungen, Ziel und Körperdaten (daraus der Kalorienbedarf), Personen, Mahlzeiten, Kochzeit, Lieblingsküchen, Budget und Abwechslung. |
| **Monatsplan** | Plant immer 30 Tage in vier Wochenblöcken mit je eigener Einkaufsliste; Reste und Vorräte einer Woche gehen in die nächste. Der Plan richtet sich nach den Antworten aus dem Fragebogen. Optional schlägt Claude neue Rezepte nach Wunsch vor. |
| **Profil (👤)** | Ernährungshistorie (7 Tage, 30 Tage, 1 Jahr oder alles – Kalorien pro Tag, Woche oder Monat, Durchschnitt pro erfasstem Tag, Makros, häufigste Gerichte, alle erfassten Tage zum Blättern), Essgewohnheiten jederzeit neu anpassen, Anzeigename, Sprache und Region. |
| **Historie sichern** | Das Tagebuch wird nie automatisch gelöscht und liegt in einem eigenen Speicher (auch wenn Fotos den übrigen Speicher füllen; scheitert das Speichern, erscheint ein Hinweis). Mit Server wird es automatisch gesichert – mit Konto kommt es auf einem neuen Gerät oder nach dem Löschen der Browserdaten zurück. Ohne Server und Konto: Export als Tabelle (CSV) oder Sicherung (JSON) und Import ohne Duplikate. |
| **Bilder & Videos** | Katalogrezepte haben frei lizenzierte Fotos (mit Urheber und Lizenz) und Links zu passenden YouTube-Kochvideos – je Sprache eines; die App zeigt nur Videos in der gewählten Sprache und sucht sonst auf YouTube in dieser Sprache. Dazu Suchlinks zu YouTube, TikTok und Instagram. Eigene Rezepte bekommen ein Foto (Kamera/Galerie) und einen Video-Link; importierte Rezepte behalten Vorschaubild und Originalbeitrag. |
| **Fotos & Bewertungen** | Zu jedem Rezept eigene Fotos hinzufügen – privat oder öffentlich, mit Konto auf allen eigenen Geräten. Öffentliche Fotos landen in der Galerie des Rezepts und können bewertet werden; das bestbewertete wird allen als Rezeptbild gezeigt. Rezepte lassen sich mit 1–5 Sternen bewerten: gut bewertete stehen in „Entdecken“ oben und werden im Plan öfter eingeplant. |
| **Konten & Rollen** | Konto mit E-Mail und Passwort oder Anmeldung mit Apple bzw. Google (optional – die App funktioniert auch anonym); Passwort ändern, Konto mit allen Daten löschen, Daten exportieren (im Profil unter „Konto verwalten“). Was das Gerät vorher ohne Konto auf dem Server hatte (Fotos, Sterne, geteilte Rezepte, Favoriten, Meldungen, Sicherung des Tagebuchs), gehört nach dem Anmelden dem Konto – ohne Doppeltes. Mit Konto sind **Plan, Einkaufsliste (mit Häkchen), Vorrat und Essgewohnheiten auf allen Geräten gleich** – auch nach dem Löschen der Browserdaten; ohne Konto bleiben sie auf dem Gerät. Nutzerverzeichnis aller Konten. **Admins** verwalten im Admin-Bereich Nutzer (Rollen vergeben, sperren), erledigen Meldungen, löschen Fotos und Community-Rezepte und können jedes Katalogrezept bearbeiten oder ausblenden – die Änderungen gelten für alle. |
| **Rezepte verbessern** | „Problem melden“ markiert ein Rezept (Text, Mengen, Foto) zum späteren Verbessern (`GET /api/recipes/flags` listet die Meldungen). „Text mit KI verbessern“ lässt Claude Name, Schritte und Gewürze an Zutaten und Mengen anpassen; der neue Text kann übernommen oder verworfen werden. |
| **Plan anpassen** | Einzelne Gerichte 🔒 fixieren oder ⇄ gegen ein passendes anderes Rezept tauschen; der Rest wird neu verteilt, damit trotzdem nichts übrig bleibt. Lieblingsrezepte werden bevorzugt eingeplant. |
| **Rezepte** | Eigene Rezepte anlegen und bearbeiten, Katalog- und Community-Rezepte als eigene Kopie anpassen, Favoriten markieren. |
| **Instagram & TikTok** | Link zu einem Koch-Video einfügen → Claude liest Beschreibung, Vorschaubild und (optional) Einzelbilder aus dem gespeicherten Video und macht daraus ein Rezept mit Mengen. |
| **Community** | Eigene Rezepte teilen, Rezepte anderer entdecken (beliebt/neu) und als Favorit speichern. Favoriten zählen als „Likes“. |
| **Zero Waste** | Rezepte werden so kombiniert, dass gekaufte Packungen aufgebraucht werden; vorhandene Vorräte kommen zuerst dran; Verderbliches wird nur innerhalb der Haltbarkeit eingeplant; Reste geöffneter Dosen zählen als Verschwendung. Was trotzdem übrig wäre, wird als „♻️ Reste mitverwenden“ auf passende Gerichte verteilt. |
| **Vorrat** | Eigener Tab mit dem aktuellen Lagerbestand der Küche, nach Kategorien sortiert, mit geschätzter Resthaltbarkeit („bald verbrauchen“), Mengen zum Nachzählen und Rezeptvorschlägen, die mit dem Vorhandenen kochbar sind. Was man in der Einkaufsliste abhakt, bucht ein Tipp auf „Abgehaktes in den Vorrat“ als ganze Packungen in den Vorrat – auch ohne Server; was später doch geliefert wird, kommt nicht doppelt dazu. |
| **Lieferdienst** | Die Einkaufsliste wird mit einem Tipp bestellt. Gelieferte Ware landet automatisch im Vorrat. |
| **Automatisches Tracking** | Hakt man eine geplante Mahlzeit als „Gegessen“ ab, wird sie ins Tagebuch übernommen und die Zutaten werden vom Vorrat abgezogen. |
| **Einwilligung vor der KI** | Bevor eine KI-Funktion zum ersten Mal Daten schickt (Foto einer Mahlzeit, Kassenbon, Import, Übersetzen, „Text mit KI verbessern“, Wünsche im Plan), fragt die App einmal: was an wen geht (Claude von Anthropic oder ein Modell auf dem Server selbst), ausdrückliche Einwilligung für Gesundheitsangaben und der Hinweis zur Zustimmung eines Elternteils (kein Mindestalter). „Nicht jetzt“ schickt nichts – Wünsche im Plan entfallen dann mit Hinweis. Widerrufen im Profil unter „KI-Funktionen“. Die App nennt dem Server bei jeder KI-Anfrage die Fassung der Einwilligung (`X-AI-Consent`), ohne lehnt er mit `403 ai_consent_required` ab. |
| **Impressum & Datenschutz** | Unter 👤 Profil, in der Web-Version zusätzlich oben auf jeder Seite („Impressum“): Impressum (Angaben nach § 5 E-Commerce-Gesetz und Offenlegung nach § 25 Mediengesetz) und Datenschutzerklärung (Österreich, auf Deutsch). Die eigenen Angaben stehen an einer Stelle (`app/src/legal/angaben.ts`); solange eine fehlt, zeigt die App „Entwurf“, und die Web-Version für GitHub Pages wird nicht gebaut. |

Kreislauf: **Plan → Einkaufsliste → Abhaken oder Bestellung → Vorrat → Kochen/Essen → Tagebuch.**

## Sprachen und Regionen

- **Oberfläche:** Deutsch, Englisch, Französisch, Italienisch, Spanisch – automatisch nach Gerätesprache, umstellbar unter 👤 Profil → Sprache & Region. Fehlende Übersetzungen fallen beim Kompilieren auf.
- **Regionale Begriffe:** In Österreich heißen Zutaten z. B. Erdäpfel, Paradeiser, Topfen, Schlagobers, Karfiol; in der Schweiz Rüebli, Poulet, Peperoni, Vollrahm, Randen – und es wird „ss“ statt „ß“ geschrieben.
- **Währung:** Euro für Deutschland/Österreich, Franken für die Schweiz (Richtpreise).
- **Rezepte übersetzen:** Jedes Rezept (auch eigene, importierte und Community-Rezepte) lässt sich per 🌐 von Claude in die eigene Sprache übersetzen; die Übersetzung wird gespeichert.
- **Neue Sprache hinzufügen:** `cd server && npm run translate-ui -- pt "Português"` lässt Claude die komplette Oberfläche übersetzen, prüft Schlüssel und Platzhalter und legt `app/src/i18n/pt.ts` an. Danach die Sprache in `app/src/i18n/index.ts` eintragen. Bitte von Muttersprachler:innen gegenlesen lassen.

## Aufbau

```
FoodTracker/
├── app/      Expo / React Native App (iOS, Android und Web, TypeScript, Expo Router)
│   ├── src/app/(tabs)/   Heute, Erfassen, Plan, Rezepte, Vorrat, Einkauf
│   ├── src/app/          Profil, Fragebogen (onboarding), Sprache & Region, Server (Adresse eintragen)
│   ├── src/app/recipe/   Rezept-Detail, Editor, Import
│   ├── src/i18n/         Übersetzungen (de, en, fr, it, es)
│   ├── src/legal/        Impressum und Datenschutzerklärung: angaben.ts (eigene Angaben, nur hier eintragen), texte.ts
│   └── test/             Tests der App-Logik (Datum, Vorrat, Einkaufsliste → Vorrat, Nährwerte, Planer, Neuplanen, Übersetzungen, Rezepttexte, Rezeptlisten, Tagebuch und Historie, Abgleich mit dem Konto, Einwilligung vor der KI)
├── docs/recht/   Entwürfe für Impressum und Datenschutzerklärung (Österreich) mit Platzhaltern für die eigenen Angaben
├── marketing/clips/  Promo-Clips (Hochkant), Beitragstexte und das Aufnahme-Skript make-clips.cjs
├── reports/      Tagesberichte der Nachtschicht als PDF (make-report.cjs, Test: node --test reports/make-report.test.cjs)
└── server/   Backend (Node, Hono, TypeScript); Dockerfile für einen Server im Internet (siehe „Server im Internet (Docker)“)
    ├── src/planner/      Zero-Waste-Planer (Simulated Annealing + Resteverwertung) und Monatsplaner
    ├── src/ai/           KI für Fotos, Kassenbons, Rezept-Import, Übersetzung, Rezeptvorschläge: Prompts in tasks.ts,
    │                     Claude oder Ollama über provider.ts (eine Stelle für alle KI-Anfragen), Einwilligung in consent.ts
    ├── src/social/       Instagram/TikTok-Beiträge laden (nur erlaubte Hosts)
    ├── src/community/    Geteilte Rezepte und Favoriten, Fotos, Sterne und „Problem melden“ (in der Datenbank)
    ├── src/delivery/     Lieferdienst-Schnittstelle + Demo-Anbieter
    ├── src/diary/        Sicherung der Ernährungshistorie (in der Datenbank, pro Konto bzw. Gerät)
    ├── src/sync/         Abgleich von Einstellungen, Plan mit Häkchen, Vorrat, eigenen Rezepten (Fotos in den
    │                     Bildspeicher), Favoriten, Rezepttexten und eigenen Fotos der Galerie eines Kontos (userData.ts)
    ├── src/storage/      Speicherschicht: SQLite-Datei (data/foodtracker.db) oder Postgres (DATABASE_URL),
    │                     versionierte Migrationen, Tabelle für den Abgleich mit der App (sync.ts), Bildspeicher für
    │                     Fotos (images.ts, data/photos/), einmaliger Umzug aus den JSON-Dateien älterer Fassungen
    ├── src/data/         125 Zutaten (5 Sprachen, Allergene, Packungen, Haltbarkeit) und 236 Rezepte mit Küche, Foto und
    │                     Kochvideos je Sprache (videos/de.ts … es.ts, geprüft per YouTube-oEmbed)
    └── scripts/          translate-ui: neue App-Sprache mit Claude erzeugen
```

Der API-Schlüssel für Claude liegt nur auf dem Server; die App spricht ausschließlich mit dem Backend. Statt Claude
kann der Server auch Ollama nutzen – kostenlos, auf dem eigenen Rechner (siehe unten).

## Starten

### Zum Testen auf dem Laptop (Windows, kostenlos)

Der Server läuft direkt mit Node.js – XAMPP o. Ä. braucht es nicht (das bringt Apache, PHP und MySQL mit und kann den
Node-Server nicht ausführen). Als KI dient [Ollama](https://ollama.com): Open Source, kostenlos, läuft auf dem eigenen
Rechner (mit einer Grafikkarte wie der RTX 4070 Laptop mit 8 GB schnell genug, ohne dauert es länger).

Einmalig in PowerShell:

```powershell
winget install Git.Git
winget install OpenJS.NodeJS.LTS
winget install Ollama.Ollama
# PowerShell schließen und neu öffnen, dann:
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned   # sonst blockiert PowerShell npm
ollama pull gemma4:e4b                                # KI-Modell, das auch Bilder versteht (rund 9,4 GB)
```

Jedes Mal: **`FoodTracker\start-test.cmd` doppelklicken** – oder eine Verknüpfung darauf (Rechtsklick auf die Datei →
„Weitere Optionen anzeigen“ → „Senden an“ → „Desktop (Verknüpfung erstellen)“). Das Skript holt zuerst selbst den
neuesten Stand (`git pull`; ohne Aktualisieren: `start-test.cmd --ohne-pull`), installiert bei Bedarf die Pakete
(`npm install` in `server` und `app`), legt beim ersten Mal `server\.env` aus `server\.env.example` an, startet den
Server in einem eigenen Fenster und danach Expo. Im Expo-Fenster die Taste **`w`** öffnet die App im Browser; am iPhone
den QR-Code mit der Kamera scannen, unter Android in Expo Go (Handy und Laptop im selben WLAN).

Blockieren lokale Änderungen das Aktualisieren (meist ändern `npm install` und Expo selbst `package.json`,
`package-lock.json` und `tsconfig.json`), legt das Skript sie mit `git stash` beiseite und versucht es noch einmal;
zurückholen mit `git stash pop`, endgültig wegwerfen mit `git stash drop`. Meldet es „Aktualisieren hat nicht
geklappt“, startet es mit dem vorhandenen Stand; die Meldung von Git steht darüber.

Das Server-Fenster zeigt die Adresse im WLAN, welche KI aktiv ist (bzw. was noch fehlt) und – unter Windows – die
Firewall-Regel. Fürs iPhone muss die Windows-Firewall die Ports 3000 (Server) und 8081 (Expo) erlauben; einmalig in
PowerShell **als Administrator**:

```powershell
New-NetFirewallRule -DisplayName "FoodTracker Test" -Direction Inbound -Protocol TCP -LocalPort 3000,8081 -Profile Private -Action Allow
```

Das WLAN muss in Windows als „Privates Netzwerk“ eingestellt sein. Test am iPhone: in Safari
`http://<WLAN-Adresse>:3000/api/health` öffnen – erscheint `{"ok":true,…}`, passt alles. Im Profil der App zeigt eine
Zeile, ob der Server erreichbar ist und mit welcher KI (Claude, lokal, ohne KI).

**KI wählen** (in `server\.env`, danach den Server neu starten): Ohne Angabe nimmt der Server Claude, wenn
`ANTHROPIC_API_KEY` gesetzt ist (kostet API-Guthaben bei Anthropic), sonst Ollama, sobald es läuft – auch wenn Ollama
erst nach dem Server gestartet wird. Fest wählen mit `AI_PROVIDER=claude` oder `AI_PROVIDER=ollama`; anderes Modell
mit `OLLAMA_MODEL` (Alternative mit Bildverständnis: `qwen3-vl:8b`). Lokal dauert eine Antwort oft 20–90 Sekunden, die
erste länger (das Modell wird geladen). Ohne KI melden Foto, Kassenbon, Import, Übersetzen und KI-Wünsche „Auf dem
Server ist keine KI eingerichtet“ – alles andere geht auch so. Alle Variablen erklärt `server/.env.example`. Vor der
ersten KI-Funktion fragt die App einmal um Erlaubnis (widerrufbar im Profil unter „KI-Funktionen“); KI-Anfragen ohne
Einwilligung lehnt der Server ab (`403 ai_consent_required`, Header `X-AI-Consent`).

**Instagram:** Instagram gibt die Beschreibung ohne Anmeldung oft nicht heraus. Dann die Caption des Beitrags
kopieren und beim Import ins Feld „Beschreibung“ einfügen.

### Von Hand (alle Systeme)

Voraussetzungen: Node.js 22+, für die App die **Expo Go**-App für SDK 58 auf dem Handy oder ein iOS-/Android-Simulator.

```bash
# Backend – Einstellungen in server/.env (Vorlage: server/.env.example), z. B. ANTHROPIC_API_KEY oder Ollama
cd server
npm install
npm start                              # http://localhost:3000, alle Daten in data/foodtracker.db, Fotos als Dateien in data/photos/

# App (zweites Terminal)
cd app
npm install
npx expo start
```

Optional für Instagram: `META_OEMBED_TOKEN` (APP_ID|CLIENT_TOKEN einer Meta-App) in `server/.env`.

QR-Code mit der Kamera (iOS) bzw. Expo Go (Android) scannen. Handy und Rechner müssen im selben WLAN sein.
Die App findet den Server automatisch (gleicher Rechner, Port 3000); einen anderen nennt man ihr wie unter
„Server-Adresse“ beschrieben.

### Server im Internet (Docker)

Für einen Server, den auch andere erreichen, liegt in `server/` ein **Dockerfile**: Node.js 26 mit dem fertig
übersetzten JavaScript (`npm run build` → `dist/`), ohne Quelltext und Werkzeuge zum Bauen, läuft nicht als root.
Zum Testen auf dem Laptop braucht es Docker nicht (`start-test.cmd`). **Schritt für Schritt** für zwei kostenlose Wege –
Laptop mit Cloudflare Tunnel oder Render mit Neon, samt KI vom Laptop: [`docs/SERVER-HOSTING.md`](docs/SERVER-HOSTING.md).

```bash
cd server
docker build -t foodtracker-server .
docker run -d --name foodtracker -p 3000:3000 -v foodtracker-data:/app/data foodtracker-server
```

- **Einstellungen** als Umgebungsvariablen (`docker run -e NAME=Wert` bzw. in den Einstellungen des Hosters), dieselben
  wie in `server/.env.example`. Eine `.env` kommt nie ins Image: `.dockerignore` lässt nur `package*.json`,
  `tsconfig*.json` und `src/` hinein.
- **Daten:** Ohne `DATABASE_URL` liegen SQLite-Datei und Fotos in `/app/data` – dafür das Volume (`-v`), sonst sind sie
  weg, sobald der Container ersetzt wird. Hoster ohne dauerhafte Dateien brauchen `DATABASE_URL` (Postgres) und für die
  Fotos einen Objektspeicher (`S3_*`, nächster Abschnitt).
- **Web-Version (CORS):** Im Image ist `CORS_ORIGINS=https://bennitut.github.io` voreingestellt – die Web-Version auf
  GitHub Pages darf den Server aus dem Browser nutzen. Für eigene Domains die Variable setzen und die Pages-Adresse mit
  aufzählen, jede Domain einzeln (mit und ohne `www`), z. B.
  `CORS_ORIGINS=https://bennitut.github.io,https://example.org,https://www.example.org`. Die Startmeldung zeigt unter
  „Browser (CORS)“, was gilt; `localhost` und Adressen im eigenen Netz sind immer erlaubt.
- **Betrieb:** Das Image setzt `NODE_ENV=production` – `ALLOW_DEV_LOGIN` wirkt dann nicht (sonst könnte sich jede:r
  unter jedem Namen anmelden; die Startmeldung sagt es). Hinter dem HTTPS-Proxy des Hosters `TRUST_PROXY` setzen,
  damit die Rate-Limits die echten Adressen sehen – bei Render `TRUST_PROXY=cloudflare` (siehe „Sicherheit“ unten). KI: `ANTHROPIC_API_KEY` (kostet API-Guthaben) oder `OLLAMA_URL` und
  `OLLAMA_API_KEY` auf die Weiterleitung zu Ollama auf einem Rechner mit Grafikkarte (`npm run ollama:relay`,
  „KI vom Laptop“ unten); den Schlüssel schickt der Server nur über https (im eigenen Netz auch http), sonst startet er
  nicht.
- **Health-Check:** `GET /api/health/live` antwortet mit `{"ok":true}`, sobald der Server bereit ist – ohne Datenbank
  und KI zu fragen (eine kostenlose Datenbank wie Neon darf schlafen, solange niemand die App nutzt, und Ollama hinter
  einem Tunnel bekommt keine Anfragen). Docker prüft ihn alle 30 Sekunden (`docker ps` zeigt „healthy“), beim Hoster
  denselben Pfad als Health-Check eintragen. `/api/health` sagt zusätzlich, welche KI nutzbar ist (Profilzeile der App).
- **Ohne Docker** (Hoster mit Node.js): `npm ci --include=dev && npm run build`, gestartet mit `npm run start:prod`
  (Node mit `dist/index.js`, ohne `tsx`); `NODE_ENV=production` dann selbst setzen.

### Sicherheit im Internet

Was der Server selbst tut, damit er gefahrlos im Internet stehen kann (Vorrang 1, 9.3; `src/http/security.ts`,
`src/http/rateLimit.ts`, `src/http/proxy.ts`, `src/log.ts`):

- **Nur über https:** Kommt eine Anfrage laut Proxy unverschlüsselt aus dem Internet (`X-Forwarded-Proto` bzw.
  `CF-Visitor` „http“), leitet der Server GET auf https um und lehnt alles andere mit `403 https_required` ab; über https
  schickt er HSTS mit (der Browser fragt die Adresse danach ein Jahr lang nur über https). Im eigenen Netz ohne Proxy
  bleibt http, wie es ist. Die App nimmt unter 👤 Profil → Server keine Adresse mit `http://` ins Internet an (Passwort
  und Daten gingen sonst unverschlüsselt) – nur Rechner im eigenen Netz.
- **Header jeder Antwort:** `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`
  und `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` – der Server liefert nur JSON und Fotos.
- **Rate-Limits** (im Speicher, je IP-Adresse; IPv6 je /64-Netz): alle Anfragen bis 600 auf einmal, auf Dauer 2 pro
  Sekunde (außer `/api/health/live`); KI-Anfragen (Foto, Kassenbon, Import, Übersetzen, „Text verbessern“, Plan)
  höchstens `AI_REQUESTS_PER_HOUR` pro Stunde je Adresse **und** je Konto (Standard 40, `0` = ohne Grenze); Fotos,
  geteilte Rezepte und Meldungen 60 pro Stunde; die Sicherung des Tagebuchs ohne Konto 20 000 Einträge pro Stunde (eine
  Geräte-ID kann sich jede:r ausdenken). Dazu wie bisher Anmelden, Registrieren und „Passwort vergessen?“. Darüber
  antwortet der Server mit `429` und `Retry-After`; die App nennt die Wartezeit.
- **Größengrenzen je Schnittstelle** statt 30 MB für alles: Abgleich mit dem Konto 32 MB, Rezept-Import 24 MB, Foto
  bzw. Kassenbon 12 MB, Plan 8 MB, Sicherung des Tagebuchs 4 MB, geteiltes Rezept 2 MB, Foto der Galerie 1 MB, alles
  andere 512 KB; darüber `413 payload_too_large`.
- **Protokoll ohne Geheimnisse:** Unerwartete Fehler stehen ohne E-Mail-Adressen, Tokens, Passwörter, Schlüssel und
  Zugangsdaten in Adressen im Protokoll, nur mit dem Muster der Route (ohne Suchbegriffe). Kaputtes JSON ist ein
  `400 invalid_request` und landet gar nicht im Protokoll (die Meldung von `JSON.parse` enthält den Anfang des Textes).
- **`TRUST_PROXY`** – welchem Header der Server die Adresse für die Rate-Limits entnimmt:

  | Wert | Header | Wofür |
  |---|---|---|
  | (leer) | keiner, die Adresse der Verbindung | Laptop im WLAN, ohne Proxy |
  | `cloudflare` | nur `CF-Connecting-IP` (Cloudflare setzt ihn selbst und ersetzt, was mitkam) | Cloudflare Tunnel (Weg a), Render (läuft laut Berichten hinter Cloudflare) |
  | `1` … `10` | der n-te Eintrag von hinten in `X-Forwarded-For` | ein anderer Proxy davor (nginx, Caddy …; Tailscale Funnel vermutlich `1` – nicht dokumentiert, ungeprüft) |

  Anderes lässt den Server nicht starten. Passt der Wert nicht zum Weg der Anfragen (Anfragen über Cloudflare ohne
  `TRUST_PROXY`, `cloudflare` ohne Cloudflare davor, Cloudflare meldet eine andere Adresse als `X-Forwarded-For`), sagt
  der Server es einmal im Fenster bzw. Protokoll – ohne Adressen zu nennen. Die Startmeldung zeigt unter „Rate-Limit“,
  was gilt.
- **Keine Geheimnisse im Repository:** `.env`, `.env.*` (außer `.env.example`), Datenbanken und `server/data/` stehen
  in `.gitignore`; der Test `test/repoSecrets.test.ts` prüft alle eingecheckten Dateien auf Schlüssel, Passwörter in
  Adressen, private Schlüssel und solche Dateien.

### Fotos im Objektspeicher

Kostenlose Cloud-Dienste wie Render verlieren Dateien bei jedem Neustart – bei Render gratis auch, wenn der Server nach
15 Minuten ohne Anfrage schläft. Dort liegen die Daten in Postgres (`DATABASE_URL`) und die Fotos in einem
**Objektspeicher mit S3-Schnittstelle** (`src/storage/objectStorage.ts`), eingestellt mit vier Variablen (Vorlage mit
Erklärungen in `server/.env.example`):

```env
S3_ENDPOINT=https://<Konto-ID>.r2.cloudflarestorage.com
S3_BUCKET=foodtracker-fotos
S3_ACCESS_KEY_ID=…
S3_SECRET_ACCESS_KEY=…
```

- **Region:** steht bei Cloudflare R2 (`auto`), Backblaze B2 und Neon in der Adresse, sonst `S3_REGION` (z. B.
  `eu-central-1`). Mit `S3_PREFIX=fotos/` liegen die Fotos in einem Ordner im Bucket. Adressen immer im Pfad-Stil
  (`https://<Endpoint>/<Bucket>/<Schlüssel>`) – das können alle hier genannten Anbieter, Neon und Supabase nur so.
- **Privat:** Die App holt jedes Foto weiter beim Server (`GET /api/images/<Schlüssel>`), der Bucket muss nicht
  öffentlich sein. Der Schlüssel braucht in diesem Bucket Lesen, Schreiben, Löschen und Auflisten, mehr nicht.
- **Beim Start** speichert, liest und löscht der Server eine kleine Probe und liest ein Foto, das es nicht gibt (muss
  als „gibt es nicht“ kommen, nicht als „Zugriff verweigert“). Stimmt etwas nicht, startet er nicht und sagt, welche
  Variable vermutlich falsch ist. Die Startmeldung zeigt „Fotos: Objektspeicher (S3) <Bucket> bei <Adresse>“, nie die
  Schlüssel. Netzfehler und HTTP 429/5xx wiederholt er bis zu zweimal.
- **Umzug:** Server beenden, dann in `server/` mit den S3-Variablen in `server/.env`:
  `npm run photos:copy -- in-objektspeicher` kopiert die Fotos aus `data/photos/` (bzw. `PHOTOS_DIR`) in den Bucket,
  `npm run photos:copy -- in-ordner` zurück. Kopiert nur, was im Ziel fehlt, löscht nichts, darf beliebig oft laufen.
  Fotos und Datenbank gehören zusammen: Die Datenbank kennt nur die Schlüssel der Fotos.
- **Ohne AWS-SDK:** Die Signatur (AWS Signature Version 4, `src/storage/sigv4.ts`) rechnet der Server selbst – geprüft
  mit den Beispielen der AWS-Doku und gegen einen nachgebauten Objektspeicher, der jede Signatur nachrechnet.

Kostenlose Anbieter (Stand 27.11.2026 laut ihren Seiten – Angebote ändern sich, vor dem Anlegen nachsehen):

| Anbieter | Gratis | Kreditkarte | Gut zu wissen |
|---|---|---|---|
| [Neon](https://neon.com/docs/storage/overview) Object Storage | 5 GB pro Projekt | laut Doku nur fürs AI Gateway, nicht für Object Storage | Ein Konto für Datenbank und Fotos (Weg b mit Neon). Datentransfer 5 GB im Monat zusammen mit der Datenbank – auch jedes Foto, das der Server abholt. Bucket gehört zu einem Branch (den Haupt-Branch nehmen), Region z. B. Frankfurt. Adresse in der Konsole, Schlüssel mit `neon credentials create --scope storage:read --scope storage:write`. |
| [Cloudflare R2](https://developers.cloudflare.com/r2/pricing/) | 10 GB, 1 Mio. Schreib- und 10 Mio. Lese-Anfragen im Monat, Abruf kostenlos | laut Anleitungen zum Einschalten eine Zahlungsmethode (Kreditkarte oder PayPal), auch im Gratis-Rahmen | Schlüssel: R2-API-Token „Object Read & Write“ nur für diesen Bucket. Daten in der EU: Bucket mit EU-Jurisdiktion, Adresse dann `https://<Konto-ID>.eu.r2.cloudflarestorage.com`. |
| [Backblaze B2](https://www.backblaze.com/cloud-storage/pricing) | 10 GB, Abruf bis zum Dreifachen der gespeicherten Menge kostenlos | auf der Preisseite nicht erwähnt – beim Anmelden prüfen | Region wird beim Anmelden gewählt (EU: `eu-central-003`), Adresse `https://s3.<Region>.backblazeb2.com`. „Application Key“ nur für diesen Bucket. |
| [Supabase](https://supabase.com/pricing) Storage | 1 GB, 5 GB Datentransfer | auf der Preisseite nicht erwähnt | Passt zur Datenbank bei Supabase. Gratis-Projekte pausieren nach einer Woche ohne Nutzung. Adresse, Region und Schlüssel in den Storage-Einstellungen unter „S3 Connection“. |

### KI vom Laptop für den Server im Internet

Ein Cloud-Server ohne Grafikkarte kann die KI auf dem Laptop nutzen – kostenlos, solange der Laptop läuft. Ollama selbst
kennt keine Schlüssel und darf nie direkt ins Internet; davor sitzt deshalb eine kleine Weiterleitung
(`src/ai/relay.ts`):

```bash
cd server
npm run ollama:relay                                # nur auf 127.0.0.1:11435, legt beim ersten Start OLLAMA_RELAY_KEY in server/.env an
cloudflared tunnel --url http://127.0.0.1:11435     # zweites Fenster: https-Adresse für den Server im Internet
```

Beim Server im Internet `OLLAMA_URL` (Adresse des Tunnels), `OLLAMA_API_KEY` (= `OLLAMA_RELAY_KEY`) und
`AI_PROVIDER=ollama` setzen. Die Weiterleitung lässt nur `GET /api/tags`, `GET /api/version` und `POST /api/chat` durch
(kein Herunterladen oder Löschen von Modellen), nur mit `Authorization: Bearer <Schlüssel>`, bis 32 MB pro Anfrage, und
gibt weder den Schlüssel noch andere Header an Ollama weiter. Lehnt sie den Schlüssel ab, sagen es die Startmeldung und
`/api/health` (`reason: "unauthorized"`). Einzelheiten und Grenzen (wechselnde Adresse beim Quick Tunnel, Cloudflare
bricht nach 125 Sekunden ohne Antwort ab): [`docs/SERVER-HOSTING.md`](docs/SERVER-HOSTING.md), „KI vom Laptop“.

### Server-Adresse

Mit welchem Server die App spricht, steht unter 👤 Profil → **🖥️ Server**. Reihenfolge:

1. **Im Profil eingetragen:** Adresse eingeben (z. B. `https://foodtracker.onrender.com` oder `192.168.1.20:3000` –
   ohne `http://` nimmt die App für Adressen im eigenen Netz http, sonst https; eine kopierte Test-Adresse
   `…/api/health` wird gekürzt), **„Prüfen und verwenden“**. Geprüft wird mit `GET /api/health` ohne Geräte-ID und
   ohne Anmeldung; antwortet dort kein FoodTracker-Server (Gratis-Server schlafen manchmal bis zu einer Minute), bietet
   die App „Trotzdem verwenden“ an. „Zurück zur Standard-Adresse“ nimmt den Eintrag wieder heraus. Gespeichert wird
   die Adresse auf dem Gerät unter einem eigenen Schlüssel – nie im Abgleich mit dem Konto.
2. **`EXPO_PUBLIC_API_URL` beim Start bzw. Bauen:** am einfachsten eine Datei `app/.env.local` mit der Zeile
   `EXPO_PUBLIC_API_URL=https://foodtracker.onrender.com` (Expo liest sie bei `npx expo start` und `npx expo export`;
   `.env*.local` wird nicht eingecheckt) oder in PowerShell `$env:EXPO_PUBLIC_API_URL="https://…"; npx expo start
   --clear` bzw. in bash `EXPO_PUBLIC_API_URL=https://… npx expo start --clear`. Nach einer Änderung mit `--clear`
   starten, sonst nimmt Metro den alten Wert aus dem Zwischenspeicher. `EXPO_PUBLIC_API_URL=off` heißt „ohne Server“
   (so sieht man den Offline-Modus auch in Expo Go).
3. **Sonst** beim Entwickeln der Rechner, auf dem Expo läuft (Port 3000; der Laptop im WLAN), in der exportierten
   Web-Version keiner.

Für die Web-Version auf GitHub Pages: im Repository unter Settings → Secrets and variables → Actions → **Variables**
die Variable `FOODTRACKER_API_URL` mit der Adresse des Servers anlegen – der Pages-Workflow baut dann mit
`EXPO_PUBLIC_API_URL`. Der Server braucht dafür https und `CORS_ORIGINS=https://bennitut.github.io` (im Docker-Image
voreingestellt; eine Seite über https darf keinen Server ohne https fragen, die App sagt das auch, wenn man so eine
Adresse einträgt).

Beim Wechsel meldet die App beim bisherigen Server ab (das Token gehört ihm und geht nie an einen anderen Server) und
nutzt beim neuen eine eigene Geräte-ID – ein anderer Server erfährt so nie die Geräte-ID, mit der das Gerät beim
Standard-Server ohne Konto seine Daten verwaltet; beim Zurückwechseln gilt die alte wieder. Tagebuch, Plan, Vorrat und
Rezepte bleiben auf dem Gerät und gleichen sich mit dem neuen Server ab (mit Konto nach dem Anmelden dort). Hat der
Server eine andere Datenbank als beim letzten Abgleich, gleicht die App von vorn ab (siehe „Datenbank“, Kennung).

**Ohne Server** funktionieren Rezepte, Ernährungsplan, Tauschen/Fixieren, Vorrat und Tagebuch trotzdem:
Katalog und Zero-Waste-Planer sind in die App eingebaut. Den Server braucht man nur für Foto-/Bon-Erkennung,
KI-Rezepte, Import, Übersetzen, Community und Bestellungen.

**Im Browser:** In `npx expo start` die Taste `w` drücken (Entwicklung, nutzt den Server auf demselben Rechner).
`npm run web:export` baut die statische Web-Version nach `app/dist/` – eine Single-Page-App, die ohne Server
läuft und auf jedem Webspace liegen kann (Direktlinks wie `/plan` brauchen eine Weiterleitung auf `index.html`).
Daten bleiben im Browser (localStorage). „Foto aufnehmen“ öffnet im Handy-Browser die Kamera, am PC einen
Dateidialog; Einzelbilder aus Videos und die Apple-Anmeldung gibt es nur in der App. Ohne fest eingetragenen
Server (`EXPO_PUBLIC_API_URL` beim Export) fragt die Web-Version keinen Server an; Foto-/Bon-Erkennung, Import,
Übersetzen, Community, Bestellungen, Bewertungen, „Problem melden“, „Text mit KI verbessern“ und die Anmeldung zeigen
dann „🚧 Bald verfügbar“ statt einer Fehlermeldung, eigene Fotos bleiben privat, das Feld für KI-Wünsche im Plan ist
ausgeblendet. Lokal ansehen: `npm run web:export`, dann `npx expo serve` (liefert `dist/` aus; bei `/` anfangen,
Direktlinks geben dort 404).

**Online (GitHub Pages):** https://bennitut.github.io/Bennitut/ – der Workflow `.github/workflows/foodtracker-pages.yml`
baut und veröffentlicht die Web-Version bei jedem Push auf `feature/food-tracker-app`, der die App ändert.
Einmalig einrichten: siehe Kopf der Workflow-Datei. Lokal nachbauen: `npm run web:pages` (Unterpfad `/Bennitut`,
Ergebnis in `app/dist-pages/` samt `404.html` für Direktlinks), prüfen mit `npm run web:smoke -- dist-pages`.
`npm run web:pages` (und damit der Workflow) bricht ab, solange in `app/src/legal/angaben.ts` Angaben für das Impressum
fehlen – es listet sie auf. Nur zum Ausprobieren auf dem eigenen Rechner: `npm run web:pages -- --entwurf`.

**Windows: „Keine Verbindung zum Server“** – am Handy blockiert meist die Windows-Firewall Port 3000 (Regel siehe
oben); im Browser am selben Rechner läuft der Server vermutlich nicht (Server-Fenster offen?). Der Server erlaubt
Anfragen aus dem Browser (CORS) von `localhost`, `127.0.0.1` und Adressen im eigenen Netz, weitere über `CORS_ORIGINS`.

Für App-Store-/Play-Store-Builds: `npx eas-cli@latest build --platform all`.

## Tests

```bash
cd server && npm run check   # Typecheck + Tests
cd app && npm run check      # Typecheck + Lint (ESLint, ohne Warnungen) + Tests der App-Logik
cd app && npm run web:export && npm run web:smoke   # Web-Version bauen und im Browser durchklicken
cd app && npm run web:pages && npm run web:smoke -- dist-pages   # dasselbe wie auf GitHub Pages (/Bennitut/)
                                                                 # (solange Impressum-Angaben fehlen: web:pages -- --entwurf)
cd app && npm run web:account   # Konten und Einwilligung vor der KI im Browser mit echtem Server (eigener Port 3917,
                                # leere Daten im Temp-Ordner)
cd server && npm run docker:smoke   # Docker-Image bauen und als Container prüfen (braucht Docker und curl)
```

Einzeln: `npm run typecheck` und `npm test` (in beiden Ordnern) bzw. `npm run lint` (App).
Die Tests der App (`app/test/`) laufen mit dem Test-Runner von Node (`node:test`, TypeScript über `tsx`) in wenigen
Sekunden – ohne Simulator und ohne native Module. Sie prüfen die Datumslogik in mehreren Zeitzonen (auch an den Tagen
der Zeitumstellung), Vorrat und Haltbarkeit, Nährwerte und Kalorienbedarf, den Planer so, wie die App ihn ohne Server
aufruft (mit den Einkaufslisten ist jedes Gericht kochbar), Neuplanen und Tauschen (Startdatum, fixierte Gerichte),
die Übersetzungen (gleiche Platzhalter in allen Sprachen, kein doppeltes Emoji in Kartentiteln), die Rezepttexte
je Sprache (Fallback auf Englisch, wann „Übersetzen“ erscheint, mit KI verbesserte Texte), die langen Rezeptlisten
(„Entdecken“ und Tauschen zeigen zuerst 30 Rezepte, Sortierung nach Bewertung) und „Abgehaktes in den Vorrat“ (ganze
Packungen, nichts doppelt – auch nicht, wenn danach eine Bestellung geliefert wird) sowie Tagebuch und Historie (Umzug
aus dem alten Speicherort, nichts wird automatisch gelöscht, Löschmarken, Abgleich mit dem echten Server-Speicher,
Auswertung bis „Alles“, CSV und Import ohne Duplikate), Impressum/Datenschutz (Platzhalter erkennen, vollständige
Texte ohne Server, Teil B nur mit Server, lückenlose Nummerierung) und die Anmeldung (Sitzung im eigenen Speicher, Umzug
vom alten Speicherort, gesperrter Schlüsselbund; Passwortlänge genau wie im Server, E-Mail-Adresse, Wartezeit nach zu
vielen Versuchen) sowie die Einwilligung vor der KI (gilt nur für die aktuelle Fassung, Unlesbares heißt „nicht erlaubt“,
gleicher Header und gleiche Fassung wie im Server, Texte für jede KI-Funktion in allen Sprachen, Abschnitt
„Mindestalter“ ohne Platzhalter) und die Fotos aus dem Bildspeicher des Servers (Adresse des Servers erst beim
Anzeigen, ohne Server ein Platzhalter, derselbe Pfad wie im Server) sowie der Abgleich von Plan, Einkaufsliste, Vorrat
und Essgewohnheiten mit dem Konto (Einträge aus dem Zustand, Änderungen mit Zeitpunkt, ein neues Gerät bekommt alles,
Häkchen und Vorrat in beide Richtungen, beim ersten Abgleich der Stand des ersten Geräts, ein neuer Plan von einem
anderen Gerät setzt die alten Häkchen zurück, ohne die neuen zu löschen, nichts, was der Server ablehnen würde – gegen
den echten Abgleich des Servers mit derselben Prüfung der Anfrage) und von eigenen Rezepten, Favoriten und Rezepttexten
(Foto auf dem Gerät bleibt offline sichtbar, das neue Gerät bekommt den Pfad, nur der Name geändert → Foto bleibt, neues
Foto auf einem anderen Gerät → das neue gilt, Kopie eines geteilten Rezepts bekommt ein eigenes Foto, erneuter erster
Abgleich ohne doppelte Dateien, große Fotos auf mehrere Anfragen verteilt) und von eigenen Fotos der Galerie („Nur ich“
mit Foto bzw. Pfad, öffentliche nur mit der ID in der Galerie, öffentlich machen und löschen auf einem Gerät kommt auf dem
anderen an, Fotos ohne Bild vom Server werden nicht gezeigt) sowie die Kennung der Datenbank (Umzug des Servers auf eine
leere Datenbank: von vorn, danach fehlt dort nichts – auch die Fotos eigener Rezepte nicht; Marken einer älteren Fassung
einmal von vorn; ein älterer Server ohne Kennung bekommt weiter nur Neues) und die Server-Adresse (Standard aus
`EXPO_PUBLIC_API_URL` bzw. dem Rechner mit Expo, „off“, Eingaben prüfen und vereinheitlichen, kein http aus einer
https-Seite und kein `http://` zu einem Rechner im Internet, eigene Geräte-ID je Server, Anmeldung nur beim Server, bei
dem sie entstand).
Die Server-Tests (`server/test/`, Vitest) prüfen unter anderem die Speicherschicht mit SQLite und mit Postgres (pg-mem,
eine nachgebaute Postgres-Datenbank im Speicher – kein Datenbank-Server nötig: Migrationen, Konten und Sitzungen,
gleichzeitige Versuche mit dem Code, Umzug aus `users.json`), Community-Rezepte, Favoriten, Fotos, Sterne, Meldungen und
Admin-Änderungen auf beiden Datenbanken (Fotos als Dateien, nur echte Bilder, Bilddateien verschwinden mit dem Foto,
dem Rezept bzw. dem Konto, Übernahme ins Konto ohne Doppeltes, Umzug aus `community.json`, `feedback.json` und
`recipe-overrides.json`), die Auslieferung der Bilder, Planer, KI-Anbieter mit nachgebautem Ollama (auch mit Schlüssel
über die Weiterleitung `ollama:relay`: nur drei Pfade, nur mit Schlüssel, nichts davon an Ollama, Größengrenze, Ollama
aus oder zu langsam, kein Schlüssel über http ins Internet), CORS, den Dev-Login (nie über einen Proxy oder Tunnel),
den Betrieb im Container (Lebenszeichen ohne KI, Health-Check samt Zeitlimit gegen den echten Server, Dev-Login nur zum Testen,
Startmeldung ohne WLAN und ohne Zugangsdaten aus `OLLAMA_URL`, Dockerfile und `.dockerignore`), den Objektspeicher für
Fotos (Signatur mit den Beispielen der AWS-Doku; Speichern, Lesen, Löschen und seitenweises Auflisten gegen einen
nachgebauten Objektspeicher über HTTP, der jede Signatur nachrechnet – auch mit Ordner im Bucket und Adresse mit Pfad
wie bei Supabase; Wiederholen bei 503, verständliche Fehler mit Hinweis, Probe beim Start, Einstellungen aus der
Umgebung, Auslieferung über `/api/images/`, Umzug mit `photos:copy` in beide Richtungen),
die Sicherung des Tagebuchs (ebenfalls auf beiden Datenbanken: Seiten, neuere Fassung gewinnt, Grenze ohne halbe
Änderungen, viele Einträge in Paketen, gleichzeitige Abgleiche, Übernahme ins Konto, Umzug aus `data/diary/` mit
denselben Revisionen), der Abgleich von Einstellungen, Plan und Vorrat (`POST /api/sync`: nur mit Konto, zwei Geräte,
Häkchen eines abgelösten Plans verschwinden, bei gleichem Zeitpunkt gilt der Server, Prüfung von IDs und Größe, Export
und Löschen, Grenze pro Konto) sowie von eigenen Rezepten, Favoriten und Texten (Foto als Datei statt data-URI, die App
bekommt den Pfad zurück, unverändertes Foto ohne neue Datei, ersetzte und gelöschte Fotos verschwinden, Kopien
bekommen eine eigene Datei, Fotos im Netz bleiben verlinkt, Unlesbares fällt weg, Export mit Fotos, Konto löschen samt
Fotos, keine Datei bleibt übrig, wenn das Speichern scheitert), von eigenen Fotos der Galerie (private als Datei,
öffentliche mit dem Pfad der Galerie und ohne eigene Datei, „Öffentlich machen“ löscht die private Datei, die der Galerie
bleibt beim Löschen stehen, fremdes Rezept bzw. unbekannte ID ohne Pfad, Export und Konto löschen) und die Konten (Registrieren, Anmelden, Rate-Limit, gleiche Antwort für unbekannte
Adressen, Passwort ändern und per Code zurücksetzen, Konto mit allen Daten löschen, Export ohne Passwort-Hash,
Übernahme der Gerätedaten beim Anmelden ohne Doppeltes, keine Geräte-ID, die sich als Konto ausgibt) und dass ohne
Einwilligung keine Anfrage an die KI geht (`403 ai_consent_required` für jede KI-Funktion, Eingaben werden vorher
geprüft, Planen ohne Wünsche braucht keine) sowie die Sicherheit im Internet (`security.test.ts`: nur über https mit
Umleitung bzw. `403 https_required` und HSTS, Header jeder Antwort, Größengrenzen mit und ohne Content-Length,
`TRUST_PROXY` in allen Varianten – gefälschte Header helfen nicht am Rate-Limit vorbei –, Hinweise ohne Adressen,
Rate-Limits für alle Anfragen, KI je Adresse und Konto, Uploads und die Sicherung ohne Konto, Protokolle ohne
E-Mail-Adressen, Tokens und Passwörter, kaputtes JSON als 400 ohne Protokoll) und dass das Repository keine Geheimnisse
enthält (`repoSecrets.test.ts`: Schlüssel, Passwörter in Adressen, private Schlüssel, `.env`-Dateien und Datenbanken in
allen eingecheckten Dateien).
Der Web-Rauchtest öffnet jede Seite in headless Chromium und spielt Fragebogen → Monatsplan → Einkauf (zwei Zeilen
abhaken und in den Vorrat buchen) → Vorrat durch, danach „Entdecken“ und Tauschen (nicht alle Fotos auf einmal),
prüft, dass Rezept, Plan, Profil, Anmeldung und Übersetzen ohne Server keine Fehlermeldung zeigen, und zuletzt die
Ernährungshistorie (Umzug in den eigenen Speicher, „Alles“, Export, Import nach gelöschten Browserdaten, Hinweis bei
vollem Speicher) und „Impressum & Datenschutz“ (Link oben auf jeder Seite, „Entwurf“, solange Angaben fehlen); er braucht Playwright (einmalig im App-Ordner: `npm install --no-save playwright && npx playwright install chromium`).
`npm run web:account` baut die Web-Version für einen Server auf Port 3917, startet ihn mit leeren Daten und spielt im
Browser durch: Umzug einer Tagebuch-Sicherung aus `data/diary/` beim Start, Umzug von Community-Rezepten, Fotos mit
Sternen und Admin-Änderungen aus den JSON-Dateien (die App zeigt die Fotos danach vom Server: Galerie, Foto eines
geteilten Rezepts, geändertes Katalogrezept), Umzug der Anmeldung aus einer älteren Version, Fehler vor dem Absenden, Hinweis zur Zustimmung eines Elternteils, Registrieren (Sterne, die das
Gerät vorher ohne Konto vergeben hat, und sein Tagebuch gehören danach dem Konto), Anmeldung nach dem Neuladen, Passwort ändern, Abmelden, altes und neues Passwort, „Passwort vergessen?“ bis zum (falschen) Code, „Meine
Daten exportieren“ (mit Tagebuch) und Konto löschen (danach ist auch das Tagebuch des Kontos weg); dazwischen Fragebogen, Monatsplan und zwei
gebuchte Zeilen, die in einem frischen Browser (Hinweis „Anmelden“ im Plan) mit dem Konto zurückkommen, und eine dort
abgehakte Zeile, die im ersten Browser ankommt; danach die Einwilligung vor der KI („Nicht jetzt“ schickt nichts, „Einverstanden“
schickt mit Einwilligung, danach keine Frage mehr, der Server lehnt Anfragen ohne ab, Widerruf im Profil, Abschnitt
„Mindestalter“ in der Datenschutzerklärung) und zuletzt Profil → Server mit einem zweiten Test-Server (leere
Datenbank): falsche Adresse, Adresse ohne Server („Trotzdem verwenden“), Wechsel – abgemeldet auch beim bisherigen
Server, eigene Geräte-ID, das Tagebuch kommt beim neuen an; dann zieht dieser Server auf eine leere Datenbank um und die
App gleicht von vorn ab; zurück zur Standard-Adresse gilt die alte Geräte-ID.
`npm run docker:smoke` baut das Image, startet es mit einem Volume, wartet, bis der Health-Check „healthy“ meldet, und
prüft: im Image nur `dist/`, `node_modules/` (ohne Werkzeuge zum Bauen und Testen) und `package.json`, der Server läuft
nicht als root, Lebenszeichen und `/api/health`, CORS für die Web-Version (und nicht für fremde Websites), Dev-Login aus
trotz `ALLOW_DEV_LOGIN=1`, die Startmeldung im Container, ein neues Konto, das nach dem Ersetzen des Containers noch
angemeldet ist, und das rasche Beenden auf SIGTERM. Weitere Argumente für `docker build` über `DOCKER_BUILD_FLAGS`.
Offene Aufgaben und Ideen stehen in [BACKLOG.md](BACKLOG.md).

## Wie der Zero-Waste-Planer arbeitet

1. Für jede Mahlzeit kommen nur Rezepte in Frage, die zu Mahlzeit, Ernährungsform, Allergien,
   Abneigungen und Kochzeit passen. Fixierte Gerichte bleiben, wo sie sind.
2. Eine Kostenfunktion bewertet einen Plan: übrig bleibende Anteile verderblicher Packungen
   (stark gewichtet), ungenutzte Vorräte, Einplanung nach Ablauf der Haltbarkeit,
   Abweichung vom Kalorienziel, Wiederholungen und Preis. Lieblingsrezepte bringen einen Bonus.
3. Simulated Annealing (Rezept austauschen / zwei Mahlzeiten tauschen) mit mehreren Neustarts
   und festem Seed minimiert diese Kosten – reproduzierbar und unter 0,5 s.
4. Portionsgrößen werden pro Tag so skaliert (0,7–1,5×), dass der Kalorienbedarf passt.
5. Was danach noch übrig wäre, wird auf Gerichte verteilt, die die Zutat schon enthalten
   (max. +50 % pro Gericht und höchstens bis 115 % des Kalorienziels pro Tag).
6. Reste, die über das Planende hinaus noch mindestens eine Woche halten (Karotten, Kartoffeln,
   Reis …), gehen in den Vorrat und werden im nächsten Plan zuerst verbraucht.

Der Monatsplan besteht aus vier Blöcken (7, 7, 8 und 8 Tage). Jeder Block wird so geplant und
bekommt die haltbaren Reste und den Vorrat des vorherigen Blocks; Gerichte der Vorwoche werden
etwas seltener gewählt, damit der Monat abwechslungsreich bleibt. Beim Tauschen wird nur ab der
betroffenen Woche neu geplant. Auf dem Handy rechnet die App Woche für Woche mit Fortschrittsanzeige.

Über 60 Testpläne (1–4 Personen, verschiedene Ernährungsformen) bleiben im Schnitt 0,3 %
der verderblichen Einkäufe übrig, im schlechtesten Fall 4 %.

## Anmeldung und Admins einrichten

**Konten mit E-Mail und Passwort** gehen ohne weitere Einrichtung: in der App unter 👤 Profil → „Anmelden oder
registrieren“, dort auch „Passwort vergessen?“ (nur mit Mail-Dienst, siehe unten). Angemeldet bleibt man, bis man sich
abmeldet oder die Sitzung abläuft – auf dem Handy liegt sie verschlüsselt im Schlüsselbund bzw. Keystore
(`expo-secure-store`), im Browser in localStorage. Unter „Konto verwalten“ im Profil: Passwort ändern, „Meine Daten
exportieren“ und Konto löschen. Passwörter speichert der Server nur als scrypt-Hash
(`node:crypto`, mindestens 10 Zeichen), Sitzungen gelten 30 Tage und enden beim Abmelden. Gegen das Durchprobieren
gibt es Grenzen pro IP-Adresse und pro E-Mail-Adresse (`429 auth_rate_limited` mit `Retry-After`); unbekannte Adressen
und falsche Passwörter ergeben dieselbe Antwort. Endpunkte: `POST /api/auth/register`, `POST /api/auth/login`,
`POST /api/auth/password` (ändern, andere Geräte werden abgemeldet), `DELETE /api/auth/me` (Konto mit allen Daten auf
dem Server löschen, mit Passwort bestätigt), `GET /api/auth/export` („Meine Daten exportieren“ als JSON).
„Passwort vergessen?“ (`/api/auth/password/forgot` und `/reset`, ein 8-stelliger Code per E-Mail, 30 Minuten gültig)
gibt es nur mit einem Mail-Dienst (`SMTP_*` in `server/.env`, Beispiel Gmail in `.env.example`); `GET /api/auth/config`
meldet, ob er eingerichtet ist. Hinter einem Proxy (Cloudflare Tunnel, Render) `TRUST_PROXY=cloudflare` setzen, damit
die Grenzen pro IP-Adresse greifen (siehe „Sicherheit“ unter „Server im Internet (Docker)“).

**Was das Gerät ohne Konto hatte, kommt mit:** Nach jeder Anmeldung ruft die App einmal `POST /api/auth/claim-device`
auf. Fotos, Sterne, geteilte Rezepte, Favoriten und Meldungen der Geräte-ID gehören danach dem Konto, die Sicherung des
Tagebuchs unter der Geräte-ID wandert ins Konto und ist dort danach weg. Nichts doppelt: Hat das Konto dasselbe Rezept
oder Foto schon bewertet, favorisiert oder gemeldet, gilt seine Fassung; im Tagebuch gewinnt wie beim Abgleich die
neuere Fassung. Plan, Einkaufsliste, Vorrat, eigene Rezepte und Fotos, Favoriten und Essgewohnheiten gehen beim ersten
Abgleich mit dem Konto ganz hoch (Abschnitt „Datenbank“, „Abgleich mit der App“). Die Geräte-ID besteht nur aus Buchstaben,
Ziffern, „-“ und „_“ – der Server lehnt andere ab, damit sich kein Gerät als Konto (`user:<id>`) ausgeben kann.

Der Server liest außerdem diese Umgebungsvariablen:

| Variable | Bedeutung |
|---|---|
| `ADMIN_EMAILS` | Kommagetrennte E-Mail-Adressen, die bei der Anmeldung automatisch Admin werden (z. B. deine eigene). Konten mit Passwort erst mit bestätigter Adresse (bisher durch einmal „Passwort vergessen?“), sonst könnte sich jede:r mit dieser Adresse registrieren. Weitere Admins vergibst du danach im Admin-Bereich. |
| `APPLE_BUNDLE_IDS` | Bundle-IDs für „Mit Apple anmelden“. Standard `host.exp.Exponent` (Expo Go); für die eigene App `com.bennitut.foodtracker` ergänzen. |
| `GOOGLE_CLIENT_IDS` | OAuth-Client-IDs aus der Google Cloud Console (iOS, Android, Web), kommagetrennt. |
| `ALLOW_DEV_LOGIN` | `1` erlaubt eine Test-Anmeldung nur mit Name/E-Mail – **nur zum Ausprobieren, nie auf einem öffentlichen Server**. Anfragen über einen Tunnel oder Proxy (Header wie `CF-Connecting-IP` oder `X-Forwarded-For`) lehnt der Server dafür ab, im Betrieb (`NODE_ENV=production`) wirkt die Variable gar nicht. |

In der App kommen die Google-Client-IDs aus `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID`
und `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (z. B. in `app/.env`).

- **Apple** funktioniert auf dem iPhone auch in Expo Go. Für die eigene App braucht es die Funktion „Sign in with Apple“
  im Apple-Developer-Konto (in `app.json` schon aktiviert).
- **Google** braucht einen eigenen Build der App (`npx expo run:ios` bzw. EAS Build) und die Client-IDs; in Expo Go
  ist die Google-Anmeldung nicht möglich.
- Zum Ausprobieren: `ALLOW_DEV_LOGIN=1 ADMIN_EMAILS=du@example.com npm start` und in der App unter 👤 → „Anmelden
  oder registrieren“ die Test-Anmeldung mit dieser E-Mail nutzen – du bist dann Admin.

Konten, Sitzungen, Codes zum Zurücksetzen, die Sicherung der Ernährungshistorie und die Admin-Änderungen an
Katalogrezepten liegen in der Datenbank (nächster Abschnitt).

## Datenbank

Alles, was der Server speichert, liegt in einer Datenbank (`src/storage/`): Konten und Sitzungen, die Sicherung der
Ernährungshistorie, geteilte Rezepte mit Favoriten, Fotos mit Sternen, Sterne für Rezepte, „Problem melden“ und die
Admin-Änderungen an Katalogrezepten, mit Konto auch Einstellungen, Plan mit Häkchen, Vorrat, eigene Rezepte,
Favoriten, Rezepttexte und eigene Fotos der Galerie – nur die Fotos selbst nicht (siehe „Fotos“).

- **Ohne Einstellung** eine Datei auf dem eigenen Rechner: `server/data/foodtracker.db` (SQLite, in Node.js ab 22.13
  eingebaut – nichts zu installieren, keine nativen Pakete; anderer Ort mit `DATABASE_FILE`). Übersteht auch ein hart
  geschlossenes Server-Fenster. Sichern: Server beenden, Datei kopieren.
- **Mit `DATABASE_URL`** Postgres, z. B. kostenlos bei [Neon](https://neon.tech) oder Supabase – nötig auf kostenlosen
  Cloud-Diensten, wo Dateien beim Neustart verloren gehen. Die Verbindungsadresse enthält das Passwort der Datenbank:
  nur in `server/.env` bzw. beim Hoster eintragen. Ohne `sslmode=…` in der Adresse ist die Verbindung verschlüsselt
  (außer zu `localhost`).
- **Migrationen:** Beim Start legt der Server fehlende Tabellen an (`src/storage/migrations.ts`, gemerkt in
  `schema_migrations`). Hat eine neuere Fassung die Datenbank schon umgebaut, startet eine ältere nicht, statt Daten zu
  verderben. Dasselbe SQL läuft auf SQLite und Postgres.
- **Abgleich mit der App:** Was App und Server abgleichen, steht in einer gemeinsamen Tabelle `sync_records` – pro Besitzer
  (`user:<Konto-ID>` bzw. `device:<Geräte-ID>`), Art und Eintrags-ID mit Revision, Zeitpunkt der letzten Änderung und
  Inhalt als JSON oder einer Löschmarke. Die Revision zählt pro Besitzer und Art hoch (`sync_revisions`); die App fragt
  nur nach dem, was nach ihrer letzten Revision kam. Gleichzeitige Abgleiche desselben Besitzers laufen nacheinander
  (bei Postgres sperrt die Zeile in `sync_revisions`). Arten:
  - `diary` – das Tagebuch (`POST /api/diary/sync`, pro Konto, ohne Konto pro Gerät).
  - `settings`, `plan` und `pantry` – nur mit Konto (`POST /api/sync`, `src/sync/userData.ts`, in der App
    `lib/dataSync.ts`): ein Eintrag `settings` mit Profil und Fragebogen (erst nach dem Fragebogen, damit die
    Voreinstellungen eines neuen Geräts nie die des Kontos ersetzen); `plan` mit dem Monatsplan und seinen
    KI-Rezepten (ohne Fotos vom Gerät), dazu je Häkchen ein kleiner Eintrag mit dem Startdatum des Plans in der ID
    (`e:<Start>:<Tag>:<Mahlzeit>` gegessen, `c:…:<Woche>:<Zutat>` abgehakt, `b:…` in den Vorrat gebucht) – so geht kein
    Häkchen verloren, wenn zwei Geräte abhaken; Häkchen eines abgelösten Plans löscht der Server; `pantry` je
    Vorratsposten (`<Zutat>@<Einkaufstag>`) mit der Menge. Je Eintrag gewinnt die neuere Fassung, bei gleichem Zeitpunkt
    die des Servers; was ein Gerät schon vor dem Abgleich hatte, trägt den Zeitpunkt 0 – beim ersten Abgleich gelten
    Plan und Einstellungen des ersten Geräts, Vorratsposten von beiden kommen zusammen. Die App gleicht beim Start, nach
    der Anmeldung, kurz nach jeder Änderung, beim Öffnen des Profils und beim Zurückkehren in die App ab. Der Server
    prüft IDs, Größe (Plan bis 1 MB) und Pflichtfelder, nicht den ganzen Inhalt; höchstens 5000 Einträge pro Art.
  - `recipes`, `favorites` und `texts` – ebenfalls nur mit Konto, über dieselbe Anfrage: je eigenem bzw. importiertem
    Rezept ein Eintrag mit dem Rezept und, falls geteilt, der Community-ID (bis 100 KB ohne Foto, höchstens 3000); je
    Favorit ein Eintrag (bei Community-Rezepten mit der gespeicherten Kopie, ohne Fotos vom Gerät); je Rezept und
    Sprache ein Text (`t:<Sprache>:<Rezept>` von der KI übersetzt, `o:<Sprache>:<Rezept>` verbessert). **Fotos eigener
    Rezepte** schickt die App einmal als data-URI (bis rund 1,5 MB); der Server legt sie beim Speichern in den
    Bildspeicher und speichert den Pfad – die gespeicherte Fassung steht in der Antwort. Die App behält ihr Foto (offline
    sichtbar) und merkt sich daneben den Pfad (`server` am Foto), den sie künftig statt des Fotos schickt; andere Geräte
    zeigen das Foto über den Pfad vom Server. Jeder Eintrag hat seine eigene Datei: Ein Pfad, der nicht zu diesem
    Eintrag gehört (Kopie eines geteilten Rezepts, Kopie eines eigenen), bekommt eine Kopie – so bleibt das Foto, auch
    wenn das Original verschwindet. Fotos im Netz (`https://…`, Katalog) bleiben verlinkt; was der Server nicht lesen
    kann (z. B. GIF, eine Datei auf dem Gerät), fällt auf dem Server weg und bleibt auf dem Gerät. Ein ersetztes Foto,
    ein gelöschtes Rezept und „Konto löschen“ löschen die Dateien. Große Fotos verteilt die App auf mehrere Anfragen
    (bis rund 4 MB je Art und Anfrage).
  - `photos` – eigene Fotos aus der Galerie eines Rezepts, ebenfalls nur mit Konto: je Foto (ID aus der App) ein Eintrag
    `{ recipeId, createdAt, public, remoteId?, uri? }`, höchstens 2000. **Private** („Nur ich“) wie Fotos eigener
    Rezepte: einmal als data-URI, danach als Pfad, eigene Datei je Eintrag, auf dem aufnehmenden Gerät offline sichtbar.
    **Öffentliche** liegen schon in der Galerie (`recipe_photos`): Die App schickt nur die ID dort (`remoteId`), der
    Server trägt den Pfad der Galerie ein (wenn es das Foto dort zum selben Rezept gibt), legt keine eigene Datei an und
    löscht die der Galerie nie – die verschwindet mit dem Foto in der Galerie. So zeigen auch die anderen Geräte des
    Kontos das Foto (im Rezept und als Rezeptbild) und können es löschen; „Öffentlich machen“ geht nur auf dem Gerät,
    auf dem das Foto liegt.
- **Fotos** (Galerie der Rezepte, Foto eines geteilten bzw. eigenen Rezepts) speichert der Server als Bilddateien in
  `server/data/photos/` (anderer Ort mit `PHOTOS_DIR`), in der Datenbank steht nur ihr Schlüssel. Die App bekommt
  einen Pfad (`/api/images/<Schlüssel>`) statt der früheren data-URI und setzt erst beim Anzeigen die Adresse des
  Servers davor (`app/src/lib/serverImages.ts`) – so passt er auch nach einem Umzug des Servers. `GET
  /api/images/<Schlüssel>` liefert das Bild mit langem Zwischenspeicher (ein Schlüssel zeigt immer dasselbe Bild), nur
  im Browser bzw. in der App, nicht unterwegs (`Cache-Control: private`). Der Schlüssel ist eine zufällige UUID; Pfade
  zu Fotos eigener Rezepte bekommt nur das Konto selbst.
  Angenommen werden nur JPEG, PNG und WebP – erkannt an den ersten Bytes, nicht an der Angabe des Absenders (sonst `400
  invalid_image`). Löschen eines Fotos, eines geteilten Rezepts oder des Kontos löscht auch die Bilddateien; „Meine
  Daten exportieren“ enthält die eigenen Fotos wieder als data-URI. Sichern: den Ordner zusammen mit der Datenbank
  kopieren. Auf Cloud-Diensten, die Dateien beim Neustart verlieren, liegen sie in einem Objektspeicher (`S3_*`, siehe
  „Fotos im Objektspeicher“).
- **Umzug:** Liegt noch die Konten-Datei älterer Fassungen (`data/users.json`) da, übernimmt der Server sie beim Start
  einmal – mit denselben Konto-IDs (daran hängen Tagebuch-Sicherung und Fotos) und den noch gültigen Anmeldungen – und
  löscht sie danach. Ebenso die Sicherung der Ernährungshistorie aus `data/diary/` (eine Datei pro Konto bzw. Gerät,
  anderer Ort mit `DIARY_DIR`): mit denselben Revisionen, damit Geräte, die schon abgeglichen haben, nichts verpassen;
  unlesbare Dateien bleiben liegen, die Startmeldung nennt sie. Genauso `data/community.json` (geteilte Rezepte mit
  Favoriten), `data/feedback.json` (Fotos mit Sternen, Sterne für Rezepte, Meldungen) und `data/recipe-overrides.json`
  (Admin-Änderungen): mit denselben IDs, die Fotos daraus als Dateien in den Bildspeicher; was die Datenbank schon
  hat, bleibt; eine unlesbare Datei bleibt liegen (anderer Ort mit `COMMUNITY_FILE`, `FEEDBACK_FILE`,
  `OVERRIDES_FILE`).
- **Kennung der Datenbank:** Beim ersten Abgleich legt der Server in `storage_meta` eine zufällige Kennung an
  (`database_id`, `src/storage/identity.ts`) und nennt sie in jeder Antwort von `/api/diary/sync` und `/api/sync`. Die
  App merkt sie sich mit ihren Abgleich-Marken und schickt sie mit. Passt sie nicht – der Server ist auf eine neue,
  leere Datenbank umgezogen (z. B. vom Laptop zu Render mit Neon) oder die App hat eine andere Adresse –, übernimmt der
  Server nichts und antwortet mit `reset`; die App gleicht dann von vorn ab: alles hoch (eigene Fotos als Bild, nicht
  als Pfad), alles zurück. Ohne Kennung schickten Geräte, die schon abgeglichen hatten, nur noch ihre neuen Änderungen,
  und die neue Datenbank hätte nur einen Teil der Daten. Eine kopierte Datenbank behält die Kennung (die Revisionen
  stimmen dann auch). Wer eine **ältere Sicherung** einspielt, löscht die Kennung, damit alle Geräte einmal von vorn
  abgleichen: bei Postgres `DELETE FROM storage_meta WHERE key = 'database_id';`, bei der SQLite-Datei dasselbe mit
  einem SQLite-Werkzeug (der Server legt beim nächsten Abgleich eine neue an).
- **Grenze:** Eine SQLite-Datei gehört genau einem laufenden Server.

## Instagram und TikTok

Die Plattformen erlauben kein offizielles Herunterladen von Videos. Der Import nutzt deshalb:

- **TikTok:** die öffentliche oEmbed-Schnittstelle (Beschreibung + Vorschaubild, ohne Schlüssel).
- **Instagram:** oEmbed mit Meta-App-Token, sonst die Vorschau-Metadaten der Seite. Je nach Beitrag
  liefert Instagram ohne Anmeldung wenig – dann die Caption ins Feld „Beschreibung“ kopieren.
- **Gespeichertes Video (beide):** Die App schneidet 6 Einzelbilder aus dem Video, die KI liest
  daraus Texteinblendungen und Zutaten.

Der Server ruft nur Instagram-, TikTok- und deren Bild-Server über HTTPS ab, auch bei
Weiterleitungen (Schutz vor Server-Side Request Forgery).

## Lieferdienste anbinden

Lebensmittel-Lieferdienste (REWE, Knuspr, Picnic, Flink in Deutschland; BILLA, gurkerl.at in
Österreich; Migros, Coop in der Schweiz) bieten keine offenen Bestell-Schnittstellen; eine
echte Anbindung braucht einen Partnervertrag mit dem Anbieter. Dafür gibt es das Interface
`DeliveryProvider` in `server/src/delivery/providers.ts`: pro Anbieter eine Klasse mit
`createCart` (Warenkorb anlegen, Checkout-Link zurückgeben) und `getOrder` (Lieferstatus).
Bis dahin simuliert der **Demo-Lieferdienst** Bestellung und Lieferung.

## Grenzen dieser Version

- Alles, was der Server speichert, liegt in der Datenbank (SQLite oder Postgres), Fotos als Dateien in
  `data/photos/` bzw. auf Cloud-Diensten ohne dauerhafte Dateien in einem Objektspeicher (`S3_*`). Plan,
  Einkaufsliste, Vorrat, eigene Rezepte (mit Foto), Favoriten, Rezepttexte, eigene Fotos der Galerie und
  Essgewohnheiten gleicht die App mit Konto ab. Ohne Anmeldung zählt weiter eine anonyme Geräte-ID.
- Ein privates Foto der Galerie lässt sich nur auf dem Gerät öffentlich machen, auf dem es aufgenommen wurde.
- Abgleich: Kocht man auf zwei Geräten ohne Verbindung aus demselben Vorratsposten, gilt danach die zuletzt geänderte
  Menge (der andere Abzug fehlt); plant man auf zwei Geräten gleichzeitig neu, gilt der neuere Plan.
- Nährwerte und Preise im Katalog sind gerundete Richtwerte; Preise in AT/CH sind grob umgerechnet.
- Alle Rezepttexte im Katalog sind eigens für FoodTracker geschrieben und dürfen kommerziell genutzt werden.
  Fotos stammen aus freien Lizenzen (CC0, Public Domain, CC BY, CC BY-SA, über Openverse von Wikimedia Commons
  und Flickr); Urheber und Lizenz stehen unter dem Foto und verlinken die Quelle. Noch nicht jedes Rezept hat ein Foto.
  YouTube-Videos werden nur verlinkt; noch nicht jedes Rezept hat eines in jeder Sprache (Stand in `BACKLOG.md`,
  „Daueraufgabe: Videos je Sprache“), dann sucht die App auf YouTube. TikTok und Instagram bieten keine offene Suche;
  dafür gibt es Suchlinks.
- Halal/koscher prüft die Zutaten (kein Schweinefleisch, kein Fleisch mit Milch bzw. Meeresfrüchte bei koscher);
  ob Fleisch zertifiziert ist, muss man beim Einkauf selbst beachten.
- Rezepttexte im Katalog gibt es auf Deutsch und Englisch; andere Sprachen übersetzt Claude auf Knopfdruck.

## Nächste Schritte

- Echten Lieferdienst-Partner anbinden
- Zutatenkatalog an eine Produktdatenbank (z. B. Open Food Facts) anbinden, Barcode-Scan
- „Teilen“-Menü von Instagram/TikTok direkt in die App (Share Extension)
- Mehrere Lieferungen pro Plan für sehr verderbliche Zutaten (Fisch, Fleisch)
