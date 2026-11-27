# FoodTracker-Server im Internet – Schritt für Schritt

Zum Testen im eigenen WLAN reicht `start-test.cmd` (README, „Zum Testen auf dem Laptop“). Damit **andere** FoodTracker
mit Konto, Sicherung, Abgleich zwischen Geräten und KI-Funktionen nutzen können – oder du selbst unterwegs –, muss der
Server aus dem Internet erreichbar sein, über https. Diese Anleitung beschreibt zwei kostenlose Wege:

- **Weg (a): dein Laptop plus Cloudflare Tunnel** – in zehn Minuten eingerichtet, KI kostenlos über Ollama auf der
  Grafikkarte, aber nur erreichbar, solange der Laptop läuft.
- **Weg (b): Render plus Neon** – ein kostenloser Cloud-Dienst für den Server und eine kostenlose Datenbank mit
  Speicher für Fotos; immer erreichbar (mit Schlafpausen), aber ohne Grafikkarte: Die KI kommt dort von der Claude-API
  (kostet) oder über eine Weiterleitung von deinem Laptop (kostenlos, nur wenn er läuft).

Alles, was der Server dafür braucht, ist fertig im Repository (Konten, Datenbank, Objektspeicher, Dockerfile,
Health-Check, CORS für die Web-Version, Weiterleitung zu Ollama). **Was nur du tun kannst**, steht in den Schritten mit
👤: Konten bei den Diensten anlegen, Einstellungen eintragen, die Adresse in der App eintragen. Die Nachtschicht legt
keine Konten an und veröffentlicht nichts.

> Angaben zu den Diensten: Stand 27.11.2026 laut deren Seiten (Render: render.com/docs/free; Neon: Preise und FAQ vom
> 3./4.11.2026; Cloudflare: Doku zu Quick Tunnels vom 30.09.2026 und zu Fehler 524 vom 23.07.2026). Gratis-Angebote
> ändern sich – vor dem Anlegen kurz nachsehen.

## Welcher Weg?

| | (a) Laptop + Cloudflare Tunnel | (b) Render + Neon |
|---|---|---|
| Kosten | 0 € | 0 € im Gratis-Rahmen (ohne Zahlungsmethode pausieren die Dienste, statt etwas zu berechnen) |
| Konten | keins (Quick Tunnel) | Render und Neon, beide ohne Kreditkarte |
| Erreichbar | nur, solange der Laptop an, wach und online ist | immer; nach 15 Minuten ohne Anfrage schläft der Server, die erste Anfrage danach dauert etwa eine Minute |
| Adresse | Quick Tunnel: bei jedem Start eine neue (`https://….trycloudflare.com`); fest nur mit eigener Domain (kostet) oder Tailscale Funnel | fest: `https://<name>.onrender.com` |
| KI | kostenlos über Ollama auf dem Laptop | Claude-API (kostet API-Guthaben) oder Weiterleitung zu Ollama auf dem Laptop (kostenlos, nur wenn er läuft) oder keine |
| Daten | SQLite-Datei und Fotos auf dem Laptop (`server\data`) | Postgres bei Neon (1 GB), Fotos im Objektspeicher bei Neon (5 GB) |
| „Passwort vergessen?“ | Gmail mit App-Passwort geht | Render gratis sperrt die üblichen Mail-Ports – nur mit einem Mail-Dienst auf Port 2525 |
| Gut für | selbst unterwegs testen, mit ein paar Leuten ausprobieren, während du am Laptop bist | Tester:innen, die jederzeit testen wollen |

**Vorschlag:** Mit (a) anfangen – das zeigt ohne ein einziges Konto, ob alles klappt. Für echte Tester:innen dann (b),
die KI über die Weiterleitung vom Laptop („KI vom Laptop“ unten) oder vorerst ohne KI.

## Bevor andere den Server nutzen (beide Wege)

- **Kein Dev-Login:** In `server\.env` die Zeile `ALLOW_DEV_LOGIN=1` löschen (oder ein `#` davorsetzen). Über einen
  Tunnel oder Proxy lehnt der Server den Dev-Login ohnehin ab (er erkennt solche Anfragen an den Headern, die Cloudflare
  und andere Proxys setzen), im Docker-Image wirkt er gar nicht – trotzdem löschen.
- **Datenschutzerklärung Teil B:** Sobald andere ihre Daten an den Server schicken, muss Teil B vollständig sein –
  vor allem B1: wer den Server betreibt, wo er läuft, welche Dienste beteiligt sind (Weg a: dein Laptop und Cloudflare;
  Weg b: Render, Neon und bei „KI vom Laptop“ zusätzlich Cloudflare und dein Laptop), Verträge zur
  Auftragsverarbeitung (Art. 28 DSGVO) mit diesen Diensten. Die Texte für beide Wege und alle KI-Varianten sind fertig
  (Stand der Dienste 27.11.2026): 👤 in `app/src/legal/angaben.ts` unter `BETRIEB` den Weg (`weg: "a"` oder `"b"`)
  und die KI (`ki: "claude"`, `"ollama"`, `"ollama-laptop"` oder `"keine"`) eintragen, dann zeigt die App nur die
  passenden Sätze. Übrig bleiben ein paar `[[PRÜFEN]]` (z. B. der Vertrag mit Cloudflare – nur mit Konto) und die
  anderen Platzhalter in Teil B (`docs/recht/README.md`). Mit Server-Adresse in der Web-Version (`FOODTRACKER_API_URL`,
  unten) bricht `npm run web:pages` ab, solange dort Platzhalter stehen – gewollt.
- **Admin:** `ADMIN_EMAILS=<deine Adresse>`. Ein Konto mit Passwort wird damit erst Admin, wenn die Adresse bestätigt
  ist (einmal „Passwort vergessen?“ – braucht den Mail-Dienst).
- **Claude-API für andere:** Nur falls du Claude nimmst: Vorher Anthropics Vorgaben für Produkte prüfen, die auch
  Minderjährige nutzen können (https://support.claude.com/en/articles/9307344) – FoodTracker hat kein Mindestalter.

---

## Weg (a): Laptop plus Cloudflare Tunnel

Der Server läuft wie beim Testen auf deinem Laptop; `cloudflared` baut eine verschlüsselte Verbindung zu Cloudflare
auf, und Cloudflare leitet Anfragen an eine https-Adresse durch diese Verbindung zum Laptop. Am Router und an der
Windows-Firewall muss dafür nichts geöffnet werden.

### Einmalig

1. 👤 **cloudflared installieren** – in PowerShell:

   ```powershell
   winget install --id Cloudflare.cloudflared
   ```

   Danach PowerShell schließen und neu öffnen. (Ohne winget: die Datei `cloudflared-windows-amd64.msi` von
   https://github.com/cloudflare/cloudflared/releases/latest.) Unter Windows aktualisiert sich cloudflared nicht von
   selbst – ab und zu `winget upgrade --id Cloudflare.cloudflared`.

2. 👤 **`FoodTracker\server\.env` anpassen** (mit dem Editor öffnen; `start-test.cmd` hat sie beim ersten Start
   angelegt):

   ```env
   # ALLOW_DEV_LOGIN=1          ← auskommentieren oder löschen
   TRUST_PROXY=cloudflare
   CORS_ORIGINS=https://bennitut.github.io
   ADMIN_EMAILS=deine.adresse@example.com
   ```

   - `TRUST_PROXY=cloudflare`: Über den Tunnel kommen alle Anfragen von `cloudflared` auf dem Laptop. Ohne die Zeile
     hielte das Rate-Limit alle für eine Person – wer sich ein paarmal vertippt, sperrte dann alle aus. Mit der Zeile
     nimmt der Server die echte Adresse aus `CF-Connecting-IP`, den Cloudflare bei jeder Anfrage selbst setzt (andere
     Header kann jede:r mitschicken). Fehlt die Zeile, sagt es das Server-Fenster bei der ersten Anfrage über den Tunnel.
     (Bis 27.11. stand hier `TRUST_PROXY=1` – geht mit Cloudflare auch, `cloudflare` ist genauer.)
   - `CORS_ORIGINS`: damit die Web-Version auf GitHub Pages den Server aus dem Browser nutzen darf.
   - Optional „Passwort vergessen?“: `SMTP_*` mit einem Gmail-App-Passwort (Anleitung in `server/.env.example`).

   Danach den Server neu starten.

3. 👤 **Laptop wach halten:** in den Windows-Einstellungen unter „Netzbetrieb und Akku“ den Energiesparmodus im
   Netzbetrieb auf „Nie“ stellen – im Energiesparmodus ist der Server nicht erreichbar.

### Jedes Mal

1. `FoodTracker\start-test.cmd` doppelklicken (für den Tunnel muss nur das Server-Fenster laufen).
2. Ein **zweites PowerShell-Fenster** öffnen:

   ```powershell
   cloudflared tunnel --url http://localhost:3000
   ```

   Nach ein paar Sekunden steht im Fenster eine Adresse wie `https://vier-zufaellige-woerter-hier.trycloudflare.com`.
   Das Fenster offen lassen.
3. **Prüfen:** `<Adresse>/api/health` im Browser öffnen, am besten am Handy im Mobilfunknetz – erscheint
   `{"ok":true,…}`, ist der Server aus dem Internet erreichbar.
4. **In der App:** 👤 Profil → 🖥️ Server → Adresse eintragen → „Prüfen und verwenden“. Tester:innen öffnen die
   Web-Version https://bennitut.github.io/Bennitut/ (sobald GitHub Pages eingeschaltet ist) und tragen dort unter
   Profil → Server dieselbe Adresse ein. Konten gehen dann mit E-Mail und Passwort.
5. **Beenden:** im cloudflared-Fenster Strg+C – danach ist der Server aus dem Internet nicht mehr erreichbar (im WLAN
   weiter wie gewohnt).

### Ehrliche Grenzen

- **Nur, solange der Laptop läuft:** aus, Energiesparmodus, kein Internet, Windows-Update mit Neustart – dann ist der
  Server weg. Die App funktioniert weiter (alles liegt auch auf dem Gerät) und gleicht ab, sobald er wieder da ist.
- **Quick Tunnel:** laut Cloudflare zum Testen und Entwickeln gedacht, ohne Garantie für die Verfügbarkeit, höchstens
  200 Anfragen gleichzeitig (danach Fehler 429). **Bei jedem Start eine neue Adresse** – dann tragen alle sie neu ein
  und melden sich neu an (eine Anmeldung gilt je Server-Adresse; mit Konto kommen die Daten beim Anmelden zurück). Für
  die Web-Version mit fest eingebauter Adresse (`FOODTRACKER_API_URL`) taugt das nicht.
- **Lange KI-Antworten:** Cloudflare bricht Anfragen ab, auf die nach 125 Sekunden noch keine Antwort kam (Fehler 524,
  ändern kann man das nur im Enterprise-Tarif) – das gilt auch für den Tunnel. Ollama braucht meist 20–90 Sekunden;
  nur die erste Anfrage nach dem Laden des Modells kann länger dauern. Dann einfach noch einmal versuchen.
- **Deine Leitung:** Alles läuft über deinen Internetanschluss, Fotos auch über dessen Upload.
- **Daten auf dem Laptop:** Sichern musst du selbst (unten, „Sichern“).
- **Datenschutz:** Die Verschlüsselung endet bei Cloudflare; Cloudflare leitet alle Anfragen weiter und sieht sie. Ein
  Quick Tunnel ohne Konto heißt auch: kein Vertrag mit Cloudflare. Für Tester:innen mit echten Daten Teil B1 der
  Datenschutzerklärung ausfüllen und klären, wie ein Vertrag zur Auftragsverarbeitung mit Cloudflare zustande kommt
  (mit Konto und festem Tunnel, siehe unten).

### Feste Adresse (optional)

- **Eigene Domain bei Cloudflare** (kostet, meist um die 10 € im Jahr): 👤 Cloudflare-Konto anlegen, Domain dort
  hinzufügen (Cloudflare verlangt laut Doku „a domain on Cloudflare“ für veröffentlichte Adressen), dann im Dashboard
  unter Networking → Tunnels → „Create Tunnel“ einen Tunnel anlegen, als Umgebung Windows wählen und den angezeigten
  Befehl `cloudflared.exe service install <TOKEN>` in einer Eingabeaufforderung **als Administrator** ausführen – der
  Tunnel läuft dann als Windows-Dienst, auch nach einem Neustart. Unter Routes → „Add route“ → „Published
  application“ z. B. `api.<deine-domain>` auf `http://localhost:3000` zeigen lassen. Diese Adresse bleibt und taugt
  auch für `FOODTRACKER_API_URL`.
- **Tailscale Funnel** (kostenlos, laut Tailscale noch Beta, von der Nachtschicht nicht ausprobiert): 👤 Tailscale für
  Windows installieren und anmelden (Gratis-Tarif „Personal“), dann `tailscale funnel 3000`. Die Adresse
  `https://<gerät>.<tailnet>.ts.net` setzt sich aus dem Namen des Laptops und deines Tailnets zusammen, ändert sich also
  nicht bei jedem Start. Die Bandbreite begrenzt Tailscale, ohne eine Zahl zu nennen. Voraussetzung sind MagicDNS und
  HTTPS-Zertifikate in der Tailscale-Verwaltung; die Freigabe für Funnel holt der Befehl beim ersten Aufruf ein. Funnel
  nimmt nur https an (Ports 443, 8443 und 10000). Welche Header Funnel an den Server weitergibt, dokumentiert Tailscale
  nicht – vermutlich `X-Forwarded-For`, also `TRUST_PROXY=1` statt `cloudflare` (ungeprüft; passt es nicht, sagt es das
  Server-Fenster bei den ersten Anfragen).

---

## Weg (b): Render plus Neon

Der Server läuft als Docker-Container bei [Render](https://render.com) (Gratis-Tarif). Weil Render-Gratisdienste beim
Neustart alle Dateien verlieren, liegen die Daten in einer Postgres-Datenbank bei [Neon](https://neon.com) und die
Fotos in Neons Objektspeicher. Beide in derselben Region (Frankfurt), damit der Weg zwischen Server und Datenbank kurz
ist.

### 1. Datenbank und Fotos bei Neon

1. 👤 Bei https://neon.com registrieren (GitHub, Google oder E-Mail). Laut Neon ist der Gratis-Tarif dauerhaft und
   braucht keine Kreditkarte.
2. 👤 **Projekt anlegen:** Name z. B. `foodtracker`, Region **AWS Europe Central 1 (Frankfurt)**, Postgres-Version wie
   vorgeschlagen.
3. 👤 **Verbindungsadresse kopieren:** „Connect“ → die Adresse, die mit `postgresql://` beginnt. Sie enthält das
   Passwort der Datenbank – nur in Render eintragen (Schritt 2), nirgends sonst. Mit oder ohne „Connection pooling“
   geht beides (der Server hält höchstens fünf Verbindungen). Die Tabellen legt der Server beim ersten Start selbst an.
4. 👤 **Objektspeicher für die Fotos:** im Projekt unter „Storage“ einen Bucket anlegen (z. B. `foodtracker-fotos`,
   im Haupt-Branch), dazu einen Schlüssel mit Lesen und Schreiben – wie im README unter „Fotos im Objektspeicher“
   beschrieben (Zeile „Neon“ der Tabelle). Das ergibt `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID` und
   `S3_SECRET_ACCESS_KEY`. Andere Anbieter (Cloudflare R2, Backblaze B2, Supabase) gehen genauso, siehe dieselbe Tabelle.

**Grenzen von Neon gratis:** 1 GB Datenbank pro Projekt; 100 CU-Stunden Rechenzeit im Monat (bei der kleinsten Größe,
0,25 CU, wären das 400 Stunden aktive Datenbank); die Datenbank schläft nach 5 Minuten ohne Anfrage und wacht in
einigen hundert Millisekunden wieder auf – der Server fragt sie nur, wenn jemand die App nutzt; 5 GB Datentransfer im
Monat für Datenbank und Fotos zusammen (jedes Foto, das der Server für die App holt, zählt mit); ist Rechenzeit oder
Datentransfer aufgebraucht, pausiert die Datenbank bis zum nächsten Monat – es entstehen keine Kosten, die Daten
bleiben. Wiederherstellen geht nur für die letzten 6 Stunden, dazu ein manueller Snapshot. Wegen Inaktivität löscht
Neon laut FAQ nichts.

### 2. Server bei Render

1. 👤 Bei https://render.com mit GitHub registrieren. Gratis-Dienste laufen laut Render-Doku auch ohne hinterlegte
   Zahlungsmethode.
2. 👤 „New“ → „Web Service“ → GitHub verbinden und Render nur das Repository `Bennitut/Bennitut` freigeben.
3. 👤 **Einstellungen:**

   | Feld | Wert |
   |---|---|
   | Name | `foodtracker` – die Adresse wird dann `https://foodtracker.onrender.com` (ist der Name vergeben, hängt Render etwas an) |
   | Language | Docker |
   | Branch | `feature/food-tracker-app` (nach dem Mergen). Vorher zum Ausprobieren `claude/nightly` – dann baut Render nach jedem Lauf der Nachtschicht neu, der den Server ändert. |
   | Region | Frankfurt (EU Central) |
   | Root Directory | `FoodTracker/server` |
   | Dockerfile Path | `./Dockerfile` |
   | Instance Type | Free |

4. 👤 **Environment Variables** (die Werte gehören nur hierher, nie ins Repository):

   | Variable | Wert |
   |---|---|
   | `DATABASE_URL` | die Verbindungsadresse von Neon |
   | `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | vom Objektspeicher bei Neon |
   | `TRUST_PROXY` | `cloudflare` (Render läuft laut Berichten hinter Cloudflare; sonst sehen die Rate-Limits nicht die echten Adressen – passt es nicht, steht nach den ersten Anfragen ein Hinweis im Log) |
   | `ADMIN_EMAILS` | deine Adresse |
   | KI | siehe Schritt 3 |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | optional, für „Passwort vergessen?“ – nur über Port 2525 (siehe Grenzen) |

   Nicht eintragen: `PORT` (setzt Render selbst), `NODE_ENV` und `CORS_ORIGINS` (setzt das Docker-Image: Betrieb ohne
   Dev-Login, Web-Version auf GitHub Pages erlaubt; für eigene Domains siehe README, „Server im Internet (Docker)“).
5. 👤 Unter „Advanced“: **Health Check Path** `/api/health/live`. Auto-Deploy eingeschaltet lassen – Render baut nur
   neu, wenn sich etwas unter `FoodTracker/server` ändert.
6. 👤 „Create Web Service“. Render baut das Image (einige Minuten) und startet es. Im Log stehen dann
   „FoodTracker-Server läuft.“, „Daten: Postgres …“ und „Fotos: Objektspeicher (S3) …“. Startet der Server nicht,
   steht der Grund im Log, z. B. eine falsche `DATABASE_URL` oder ein S3-Schlüssel ohne die nötigen Rechte (der Server
   probiert den Objektspeicher beim Start aus und nennt die vermutlich falsche Variable).
7. **Prüfen:** `https://<name>.onrender.com/api/health` → `{"ok":true,…}`.
8. **In der App:** 👤 Profil → 🖥️ Server → Adresse eintragen → „Prüfen und verwenden“ (schläft der Server gerade,
   dauert es bis zu einer Minute; notfalls „Trotzdem verwenden“). **Web-Version mit fester Adresse:** im Repository
   unter Settings → Secrets and variables → Actions → Variables die Variable `FOODTRACKER_API_URL` mit der Adresse
   anlegen; der Pages-Workflow baut dann mit dieser Adresse (vorher Teil B der Datenschutzerklärung ausfüllen, siehe
   oben).

**Grenzen von Render gratis:**

- **Schlafen:** nach 15 Minuten ohne Anfrage; die erste Anfrage danach dauert etwa eine Minute.
- **750 Gratis-Stunden im Monat** für alle Gratis-Dienste deines Render-Kontos zusammen – ein Dienst rund um die Uhr
  braucht in einem Monat mit 31 Tagen 744 Stunden, schlafende Dienste zählen nicht. Sind sie aufgebraucht, pausiert
  Render die Gratis-Dienste bis zum Monatsende.
- **512 MB Arbeitsspeicher und weniger als eine CPU:** Anmelden dauert etwas länger (die Prüfung des Passworts ist
  absichtlich rechenintensiv), der geplante Import hochgeladener Videos wird dort langsam.
- **Dateien gehen bei jedem Neustart verloren** – deshalb Datenbank und Fotos bei Neon. Render kann Gratis-Dienste
  jederzeit neu starten; laut Render sind sie nicht für den Betrieb (Produktion) gedacht, und wer ungewöhnlich viel
  Verkehr nach außen erzeugt, kann gesperrt werden.
- **Mail:** Render gratis sperrt die Ports 25, 465 und 587, über die Gmail & Co. Mails annehmen – „Passwort
  vergessen?“ mit Gmail geht dort nicht. Ausweg: ein Mail-Dienst, der auch Port 2525 annimmt, z. B. Brevo (gratis bis
  300 Mails am Tag, ohne Kreditkarte; laut Brevo den Absender bzw. die Domain bestätigen und den SMTP-Versand
  eventuell beim Support freischalten lassen), mit `SMTP_PORT=2525`. Von der Nachtschicht nicht ausprobiert.
- **Datentransfer:** Render rechnet ihn auf ein monatliches Kontingent an; ohne Zahlungsmethode pausieren die
  Gratis-Dienste, wenn es aufgebraucht ist, statt dass Kosten entstehen.
- Die **Gratis-Datenbank von Render** selbst läuft nach 30 Tagen ab – deshalb Neon.

### 3. KI für den Server bei Render

Render hat keine Grafikkarte, Ollama läuft dort nicht sinnvoll. Drei Möglichkeiten:

- **Claude-API:** `ANTHROPIC_API_KEY` von https://console.anthropic.com – kostet API-Guthaben (nicht im Claude-Abo
  enthalten). Am besten dort ein Ausgabenlimit setzen; Punkt 9 im Backlog (KI-Kosten im Server begrenzen) ist noch
  offen.
- **KI vom Laptop** (kostenlos, nächster Abschnitt): Der Server schickt KI-Anfragen über eine Weiterleitung an Ollama
  auf deinem Laptop. Nur, solange der Laptop läuft – sonst melden Foto, Kassenbon, Import, Übersetzen und KI-Wünsche
  „Die KI ist gerade nicht erreichbar“, alles andere geht weiter.
- **Ohne KI:** einfach nichts eintragen. Die KI-Funktionen melden dann „Auf dem Server ist keine KI eingerichtet“.

---

## KI vom Laptop: Weiterleitung zu Ollama

Ollama selbst kennt keine Schlüssel und darf nie direkt ins Internet. Deshalb gibt es eine kleine **Weiterleitung**
(`npm run ollama:relay`): Sie läuft auf dem Laptop, lauscht nur dort (127.0.0.1, Port 11435) und lässt nur durch, wer
den Schlüssel kennt – und nur drei Arten von Anfragen: Modelle auflisten, Version und Chat (mehr braucht der
FoodTracker-Server nicht). Modelle herunterladen, anlegen oder löschen geht von außen nicht. Ein Tunnel macht die
Weiterleitung über https erreichbar; der Server bei Render schickt den Schlüssel bei jeder Anfrage mit
(`Authorization: Bearer …`) und startet gar nicht erst, wenn der Schlüssel unverschlüsselt über http ginge.

1. Auf dem Laptop läuft Ollama wie beim Testen (`ollama pull gemma4:e4b` einmal vorher).
2. PowerShell im Ordner `FoodTracker\server` (dort war `start-test.cmd` schon einmal, sonst vorher `npm install`):

   ```powershell
   npm run ollama:relay
   ```

   Beim ersten Start legt die Weiterleitung einen zufälligen Schlüssel an, schreibt ihn als `OLLAMA_RELAY_KEY` in
   `server\.env` und zeigt ihn an. Geheim halten: Wer ihn kennt, kann die KI auf deinem Laptop nutzen.
3. Zweites PowerShell-Fenster:

   ```powershell
   cloudflared tunnel --url http://127.0.0.1:11435
   ```

   (wie bei Weg a; `127.0.0.1` statt `localhost`, weil die Weiterleitung nur dort lauscht). Prüfen: die angezeigte
   Adresse im Browser öffnen – es erscheint „FoodTracker: Weiterleitung zu Ollama. Anfragen nur mit Schlüssel.“
4. 👤 Bei Render unter „Environment“ eintragen und speichern (Render startet den Server dann neu):

   | Variable | Wert |
   |---|---|
   | `OLLAMA_URL` | die https-Adresse aus Schritt 3 |
   | `OLLAMA_API_KEY` | der Schlüssel aus Schritt 2 (`OLLAMA_RELAY_KEY` in `server\.env`) |
   | `AI_PROVIDER` | `ollama` – dann nimmt der Server nie aus Versehen Claude |

   Im Log von Render steht danach „KI: Ollama mit gemma4:e4b unter https://… – kostenlos.“ Steht dort „lehnt den
   Schlüssel ab“, passt `OLLAMA_API_KEY` nicht zu `OLLAMA_RELAY_KEY`.
5. Beide Fenster offen lassen, solange die KI erreichbar sein soll. Im Fenster der Weiterleitung steht jede Anfrage in
   einer Zeile (ohne Inhalt und ohne Schlüssel).

Grenzen: Mit einem Quick Tunnel ändert sich die Adresse bei jedem Start – dann `OLLAMA_URL` bei Render jedes Mal neu
eintragen. Fest wird sie mit einer eigenen Domain oder Tailscale Funnel (`tailscale funnel 11435`), siehe „Feste
Adresse“ bei Weg (a). Die 125-Sekunden-Grenze von Cloudflare gilt auch hier. Fotos und Texte für die KI gehen dann
von Render über Cloudflare zu deinem Laptop – so steht es in B1 und B3 der Datenschutzerklärung, sobald in
`app/src/legal/angaben.ts` `BETRIEB` auf `weg: "b"` und `ki: "ollama-laptop"` steht. Der Dialog vor der ersten
KI-Funktion nennt diesen Weg seit 27.11.2026 (Fassung 2 der Einwilligung).

---

## Wechsel und Umzug

- **Laptop → Render (oder umgekehrt):** Ein Werkzeug, das die Datenbank mitnimmt, gibt es noch nicht. Der neue Server
  beginnt mit einer leeren Datenbank: **Konten müssen neu registriert werden.** Danach laden die Geräte Tagebuch,
  Plan, Vorrat, eigene Rezepte und Fotos von selbst hoch (die App merkt an der Kennung der Datenbank, dass sie von vorn
  abgleichen muss). Was nur in der Datenbank des alten Servers liegt, bleibt dort: geteilte Rezepte der Community,
  öffentliche Fotos der Galerie und Sterne. `npm run photos:copy` hilft dabei nicht weiter – ohne die Datenbank kennt
  der neue Server die Fotos nicht.
- **Neue Adresse in der App:** 👤 Profil → 🖥️ Server. Die App meldet sich beim alten Server ab (eine Anmeldung gilt
  nur für den Server, bei dem sie entstanden ist) und beim neuen neu an.
- **Datenbank und Fotos gehören zusammen:** Wer einen Server umzieht und alles behalten will, nimmt beides mit – bei
  Weg (a) den ganzen Ordner `server\data`.

## Sichern

- **Weg (a):** Server beenden (Fenster schließen), dann den Ordner `FoodTracker\server\data` kopieren, z. B. auf einen
  USB-Stick – darin liegen die Datenbank `foodtracker.db` und der Ordner `photos`. Zurückspielen: Server beenden,
  Ordner zurückkopieren.
- **Weg (b):** Neon gratis stellt nur die letzten 6 Stunden wieder her, dazu ein manueller Snapshot. Eine eigene
  Sicherung der Datenbank geht mit `pg_dump "<DATABASE_URL>" > foodtracker.sql` (braucht die Postgres-Werkzeuge auf
  dem Laptop). Die Fotos holt `npm run photos:copy -- in-ordner` im Ordner `FoodTracker\server` aus dem Bucket – die
  vier `S3_*`-Werte und einen eigenen Zielordner dafür nur in diesem PowerShell-Fenster setzen (sie gehen dort vor
  `server\.env`), damit der Server auf dem Laptop weiter seinen eigenen Ordner nutzt:

  ```powershell
  $env:S3_ENDPOINT="…"; $env:S3_BUCKET="…"; $env:S3_ACCESS_KEY_ID="…"; $env:S3_SECRET_ACCESS_KEY="…"
  $env:PHOTOS_DIR="data/sicherung-fotos"
  npm run photos:copy -- in-ordner
  ```
- **Ältere Sicherung eingespielt?** Dann die Kennung der Datenbank löschen, damit alle Geräte einmal von vorn
  abgleichen (`DELETE FROM storage_meta WHERE key = 'database_id';`, README, Abschnitt „Datenbank“).
- **Jede:r selbst:** In der App unter 👤 Profil „Meine Daten exportieren“ (mit Konto) und „Historie exportieren“.

## Prüfliste nach dem Einrichten

1. `https://<adresse>/api/health` zeigt `{"ok":true,…}` und unter `ai`, welche KI aktiv ist.
2. In der App ein Konto registrieren, einen Plan anlegen, etwas ins Tagebuch eintragen.
3. Abmelden, in einem anderen Browser (oder nach dem Löschen der Browserdaten) anmelden – Plan und Tagebuch sind wieder
   da.
4. Mit KI: ein Foto erkennen lassen oder ein Rezept importieren.
5. Im Log (Server-Fenster bzw. Render → Logs) stehen keine Fehler – und kein „Hinweis: … TRUST_PROXY …“. Steht dort
   einer, passt `TRUST_PROXY` nicht zum Weg der Anfragen; der Hinweis sagt, welcher Wert stimmt.
6. `http://<adresse>/api/health` (ohne „s“) leitet auf https um; in der App nimmt 👤 Profil → Server eine Adresse mit
   `http://` ins Internet gar nicht erst an.

## Was es kostet

Alles hier ist kostenlos, solange du im Gratis-Rahmen bleibst und keine Zahlungsmethode hinterlegst: Render und Neon
pausieren dann, statt etwas zu berechnen. Geld kosten nur die Claude-API, eine eigene Domain und ein Wechsel in einen
bezahlten Tarif.
