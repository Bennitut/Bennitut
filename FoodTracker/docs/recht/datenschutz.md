# Datenschutzerklärung – Entwurf

> **Für Benjamin, vor dem Veröffentlichen löschen:** Alle `[[…]]` ausfüllen oder löschen. **Teil A** beschreibt
> FoodTracker, wie es heute ist (Web-Version auf GitHub Pages und App ohne Server). **Teil B** beschreibt die
> Funktionen, die einen Server brauchen und heute „Bald verfügbar“ zeigen – Teil B erst veröffentlichen und
> vervollständigen, wenn ein Server läuft. Erklärungen, Entscheidungen und Quellen: [`README.md`](README.md).

Stand: [[ANGABE: Datum]]

## Kurz gesagt

- FoodTracker funktioniert ohne Konto und ohne Anmeldung.
- Was du in FoodTracker eingibst – Antworten aus dem Fragebogen, Monatsplan, Einkaufsliste, Vorrat, Tagebuch,
  eigene Rezepte und Fotos – bleibt auf deinem Gerät. Ich bekomme diese Daten nicht.
- Keine Werbung, keine Analyse- oder Tracking-Werkzeuge, keine Cookies.
- Beim Aufruf der Web-Version und beim Laden der Rezeptfotos erfahren die Server von GitHub, Wikimedia und Flickr
  technisch bedingt deine IP-Adresse (Abschnitte 3 und 4). [[PRÜFEN: Sobald alle Fotos selbst ausgeliefert werden
  (README, Entscheidung 2, gewählt am 24.11.2026), hier nur noch GitHub nennen und Abschnitt 4 löschen.]]

## 1. Verantwortlich

[[ANGABE: Vor- und Nachname]]  
[[ANGABE: volle Anschrift wie im Impressum (Variante B): Straße, Hausnummer mit Stiege und Tür, PLZ, Ort]]  
Österreich  
E-Mail: [[ANGABE: E-Mail-Adresse]]

Fragen zum Datenschutz und Anfragen zu deinen Rechten (Abschnitt 6) bitte an diese E-Mail-Adresse.
[[PRÜFEN: Ein Datenschutzbeauftragter ist nicht bestellt. Pflicht wird er nach Art. 37 DSGVO erst, wenn die
Kerntätigkeit in der umfangreichen Verarbeitung z. B. von Gesundheitsdaten besteht – mit Server (Teil B) neu
prüfen.]]

---

## Teil A – FoodTracker heute (ohne Server)

### 2. Daten auf deinem Gerät

FoodTracker speichert auf deinem Gerät – in der App in ihrem eigenen Speicher, in der Web-Version im lokalen Speicher
des Browsers („Local Storage“) für die Adresse der Web-Version:

- deine Antworten aus dem Fragebogen: Ernährungsweise, Speiseregeln (z. B. halal oder koscher), Unverträglichkeiten
  und Abneigungen, Ziel, Angaben zur Berechnung des Kalorienbedarfs (Geschlecht, Alter, Größe, Gewicht,
  Aktivität), Personen, Mahlzeiten, Kochzeit, Lieblingsküchen, Budget und Abwechslung,
- Monatsplan, Einkaufsliste mit Abgehaktem, Vorrat und Tagebuch (gegessene Mahlzeiten mit Nährwerten),
- eigene Rezepte und Fotos, Favoriten, Sprache, Region und einen selbst gewählten Anzeigenamen,
- eine zufällig erzeugte Geräte-Kennung (ohne Server wird sie nirgendwohin geschickt) und
- in der Web-Version, ob du den Hinweis „Als App nutzen“ mit „Später“ ausgeblendet hast.

Im Profil kannst du deine Ernährungshistorie als Datei speichern („Als Tabelle (CSV)“ oder „Als Sicherung (JSON)“)
und eine solche Sicherung wieder importieren. Die Datei landet dort, wo du sie speicherst oder hin teilst – FoodTracker
schickt sie nirgendwohin.

Diese Daten verlassen dein Gerät nicht; ich habe keinen Zugriff darauf. Einige davon sind sensibel
(Unverträglichkeiten und Körperdaten sind Gesundheitsdaten, Speiseregeln können auf deine Religion schließen lassen)
– auch sie bleiben ausschließlich auf deinem Gerät.

Das Speichern auf deinem Gerät ist nötig, damit FoodTracker überhaupt funktioniert (dein Plan soll nach dem Schließen
noch da sein). Dafür braucht es keine Einwilligung (§ 165 Abs. 3 TKG 2021: Speichern, das für einen ausdrücklich
gewünschten Dienst unbedingt erforderlich ist).

**Löschen:** Die Daten bleiben, bis du sie löschst – in der App, indem du sie deinstallierst, in der Web-Version,
indem du im Browser die Websitedaten für [[ANGABE: Adresse der Web-Version, z. B. bennitut.github.io]] löschst.
[[ENTSCHEIDUNG: Sobald es in der App einen Knopf „App-Daten zurücksetzen“ gibt (steht im Backlog), hier nennen.]]

### 3. Web-Version: Bereitstellung über GitHub Pages

Die Web-Version liegt bei GitHub Pages, einem Dienst von GitHub (GitHub B.V., Prins Bernhardplein 200,
1097 JB Amsterdam, Niederlande, und GitHub, Inc., 88 Colin P. Kelly Jr. St., San Francisco, CA 94107, USA).
Beim Aufruf schickt dein Browser technisch bedingt deine IP-Adresse und übliche Angaben wie Browser und
Betriebssystem an GitHub. Laut GitHub wird beim Besuch einer GitHub-Pages-Seite die IP-Adresse protokolliert und zu
Sicherheitszwecken gespeichert. Auf diese Protokolle habe ich keinen Zugriff.

GitHub gibt an, für Übermittlungen in die USA nach dem EU-U.S. Data Privacy Framework zertifiziert zu sein und
außerdem Standardvertragsklauseln der EU-Kommission zu nutzen. Mehr in der
[Datenschutzerklärung von GitHub](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

Rechtsgrundlage ist mein berechtigtes Interesse, die Web-Version sicher und kostenlos bereitzustellen
(Art. 6 Abs. 1 lit. f DSGVO). [[PRÜFEN: Ob GitHub hier in eigener Verantwortung handelt oder als
Auftragsverarbeiter – GitHub beschreibt die Protokolle als eigene Sicherheitsmaßnahme.]]

### 4. Rezeptfotos von Wikimedia Commons und Flickr

Die Fotos der Katalogrezepte werden direkt von den Servern von Wikimedia Commons (`upload.wikimedia.org`) und Flickr
(`live.staticflickr.com`) geladen, sobald eine Liste oder ein Rezept mit Foto erscheint. Dabei erhalten diese
Dienste deine IP-Adresse, Angaben zu Browser bzw. Gerät und in der Web-Version gegebenenfalls die Adresse der
Web-Version, von der aus das Foto geladen wird.

- **Wikimedia Commons** betreibt die Wikimedia Foundation, Inc. (USA). [[PRÜFEN: Anschrift und Link zur
  Datenschutzerklärung der Wikimedia Foundation – im Seitenfuß jeder Commons-Seite unter „Datenschutz“; aus der Cloud
  nicht abrufbar.]]
- **Flickr** betreibt Flickr, Inc., 548 Market St, STE 32047, San Francisco, CA 94104-5401, USA. Laut seiner
  [Datenschutzerklärung](https://www.flickr.com/help/privacy-policy) protokolliert Flickr dabei unter anderem die
  IP-Adresse.

Beide sitzen in den USA. [[PRÜFEN: Grundlage der Übermittlung – z. B. ob die Anbieter nach dem EU-U.S. Data Privacy
Framework zertifiziert sind.]]

Rechtsgrundlage ist mein berechtigtes Interesse an einer ansprechenden Darstellung der Rezepte (Art. 6 Abs. 1
lit. f DSGVO).

[[PRÜFEN: Entschieden am 24.11.2026: (a) Fotos selbst ausliefern (README, Entscheidung 2). Bis alle Fotos aus dem
eigenen Projekt kommen, gilt dieser Abschnitt nur noch für die restlichen; danach ganz löschen (in der App:
`app/src/legal/texte.ts`).]]

Urheber:in und Lizenz stehen unter jedem Foto; ein Tipp darauf öffnet die Originalseite (dann gilt dort die
Datenschutzerklärung des jeweiligen Dienstes).

### 5. Links, Kamera und Fotos

- **Links zu anderen Diensten:** Kochvideos und Suchen bei YouTube, TikTok und Instagram sowie die Originalseiten
  der Fotos öffnet FoodTracker nur, wenn du darauf tippst – dann im Browser bzw. in der App des Dienstes, und es gilt
  dessen Datenschutzerklärung. FoodTracker bettet keine Videos ein.
- **Kamera und Fotos (App):** FoodTracker fragt nur nach Zugriff auf Kamera bzw. Fotos, wenn du ein Foto aufnehmen
  oder auswählen willst. Eigene Rezeptfotos werden verkleinert und auf deinem Gerät gespeichert (Abschnitt 2). Das
  Erkennen von Mahlzeiten und Kassenbons braucht den Server und ist heute noch nicht verfügbar.
- **Kein Tracking:** keine Werbung, keine Analyse- oder Tracking-Werkzeuge, keine Cookies, kein Verkauf von Daten.
  Der Monatsplan wird auf deinem Gerät berechnet; er ist ein Vorschlag, keine automatisierte Entscheidung im Sinne von
  Art. 22 DSGVO.
- [[ANGABE: Sobald die App im App Store oder bei Google Play erscheint: einen Satz zu den Stores ergänzen
  (Herunterladen und Updates laufen über Apple bzw. Google nach deren Bedingungen).]]

---

## Teil B – Funktionen mit Server (noch nicht aktiv)

> [[ENTSCHEIDUNG: Teil B erst veröffentlichen, wenn ein Server läuft, und dann vervollständigen. Bis dahin zeigt
> FoodTracker bei diesen Funktionen „Bald verfügbar“ und sendet nichts.]]

### B1. Server

Der Server läuft bei [[ANGABE: Hoster, Sitz, Standort der Server]]. [[ANGABE: Vertrag zur
Auftragsverarbeitung (Art. 28 DSGVO) mit dem Hoster]]. Er protokolliert [[ANGABE: welche Daten, z. B. IP-Adresse,
Zeitpunkt, aufgerufene Adresse, Fehlermeldungen]] und löscht die Protokolle nach [[ANGABE: Frist]].

Mit jeder Anfrage schickt FoodTracker die zufällige Geräte-Kennung aus Abschnitt 2. Sie enthält keinen Namen und
dient dazu, Favoriten, Bewertungen, eigene Fotos und geteilte Rezepte deinem Gerät zuzuordnen – bis du dich anmeldest,
dann gehören sie deinem Konto (B2).

Für den Monatsplan mit Wünschen schickt FoodTracker deine Planungsangaben an den Server (Ernährungsweise,
Unverträglichkeiten, Speiseregeln, Abneigungen, Kalorien pro Person, Mahlzeiten, Vorrat, Favoriten); der Server
rechnet den Plan und speichert diese Angaben nicht.

### B2. Konto (freiwillig)

FoodTracker funktioniert auch ohne Konto. Für ein Konto meldest du dich mit E-Mail-Adresse und Passwort oder mit Apple
bzw. Google an. Der Server speichert: die Anmeldeart, deine E-Mail-Adresse (bei Apple auf Wunsch eine
Weiterleitungsadresse), bei Apple und Google deine Kennung beim Anbieter, deinen Namen, deine Rolle, ob das Konto
gesperrt ist, sowie Zeitpunkt der Registrierung und der letzten Anmeldung. Dein Passwort speichert er nicht, nur einen
Prüfwert (scrypt), mit dem er es bei der Anmeldung prüft. Für „Passwort vergessen?“ schickt er einen Code an deine
E-Mail-Adresse [[ANGABE: Mail-Dienst, über den der Server sendet, z. B. Gmail]] und speichert davon höchstens 30
Minuten lang nur einen Prüfwert. Von Sitzungen speichert er nur einen Prüfwert des Sitzungsschlüssels; eine Sitzung gilt
30 Tage. Auf deinem Gerät liegt die Anmeldung im Schlüsselbund bzw. Keystore, im Browser in localStorage.

Meldest du dich an, gehört dem Konto danach auch, was dieses Gerät vorher ohne Konto auf dem Server gespeichert hat:
Fotos, Sterne, geteilte Rezepte, Favoriten, Meldungen und die Sicherung deines Tagebuchs (B4, B6). Die Sicherung unter
der Geräte-Kennung wird dabei gelöscht.

Im Nutzerverzeichnis sehen andere angemeldete Nutzer:innen deinen Namen, deine Rolle, seit wann du dabei bist und wie
viele Fotos und Rezepte du geteilt hast – nicht deine E-Mail-Adresse. Admins sehen im Admin-Bereich zusätzlich
E-Mail-Adresse und letzte Anmeldung.

Im Profil unter „Konto verwalten“ kannst du dein Passwort ändern, alles, was der Server zu deinem Konto speichert, als
Datei herunterladen („Meine Daten exportieren“) und dein Konto löschen – mit allem, was der Server dazu speichert
(Sicherung des Tagebuchs, Plan, Einkaufsliste, Vorrat und Essgewohnheiten, geteilte Rezepte, Favoriten, Fotos, Sterne
und Meldungen). Auf deinem Gerät bleibt dabei alles erhalten.

Rechtsgrundlage: Bereitstellung des gewünschten Kontos (Art. 6 Abs. 1 lit. b DSGVO). Speicherdauer: bis du dein Konto
löschst.

### B3. KI-Funktionen

Diese Funktionen schicken Daten über den Server an den Anbieter des KI-Modells [[ANGABE: Claude von Anthropic oder
ein Modell auf dem eigenen Server (Ollama) – je nach Einrichtung; mit Ollama verlassen die Daten den Server nicht]]:

| Funktion | Was übermittelt wird |
|---|---|
| Mahlzeit fotografieren | das Foto und die Sprache |
| Kassenbon fotografieren | das Foto und die Sprache |
| Rezept aus TikTok oder Instagram übernehmen | Beschreibung des Beitrags, Vorschaubild und ausgewählte Einzelbilder des Videos |
| Rezept übersetzen | Name, Schritte und Gewürze des Rezepts, Zielsprache |
| „Text mit KI verbessern“ | Name, Zutaten mit Mengen, Schritte, Kochzeit und was du am Rezept bemängelst |
| Monatsplan mit Wünschen | nur der Text, den du ins Wunschfeld schreibst, und die Sprache |

Vertragspartner ist [[ANGABE: Anthropic-Gesellschaft laut API-Vertrag, Anschrift]]. Laut Anthropic (Stand
01.07.2026) werden Eingaben und Ausgaben über die API nach spätestens 30 Tagen gelöscht – außer z. B. bei Verstößen
gegen die Nutzungsrichtlinien oder wenn das Gesetz eine längere Speicherung verlangt; standardmäßig werden sie nicht
zum Training der Modelle verwendet (Stand 18.08.2026). [[PRÜFEN: Grundlage der Übermittlung in die USA laut
Vertrag zur Auftragsverarbeitung von Anthropic; aktuelle Fristen.]] Fotos für die Erkennung speichert der Server
nicht.

Rechtsgrundlage: deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO). Schreibst du Gesundheitsangaben in ein Wunschfeld
oder zeigt ein Foto solche, gilt zusätzlich Art. 9 Abs. 2 lit. a DSGVO (ausdrückliche Einwilligung). FoodTracker fragt
vor der ersten Nutzung einer KI-Funktion danach und schickt ohne deine Zustimmung nichts an die KI. Im Profil unter
„KI-Funktionen“ kannst du die Einwilligung jederzeit mit Wirkung für die Zukunft widerrufen; vor der nächsten
KI-Funktion fragt FoodTracker dann wieder. Zum Alter siehe Abschnitt 7 „Mindestalter“.

> **Für Benjamin, vor dem Veröffentlichen löschen:** Die App merkt sich die Einwilligung (Fassung und Zeitpunkt) auf
> dem Gerät und nennt dem Server bei jeder KI-Anfrage die Fassung (Header `X-AI-Consent`); ohne lehnt der Server ab
> (`server/src/ai/consent.ts`). Ändert sich wesentlich, was an wen geht, die Fassung in `app/src/lib/aiConsent.ts` und
> im Server erhöhen – dann fragt die App neu. Auf dem Server gespeichert wird die Einwilligung bisher nicht (Nachweis
> nach Art. 7 Abs. 1 DSGVO, siehe `BACKLOG.md`).

Für den Rezept-Import fragt der Server mit dem Link, den du eingibst, die öffentliche Schnittstelle von TikTok
(`tiktok.com`) bzw. von Meta für Instagram (`graph.facebook.com`) ab. Deine IP-Adresse erfahren diese Dienste dabei
nicht, die Anfrage stellt der Server.

### B4. Community, Fotos, Bewertungen und Meldungen

- **Rezepte teilen:** Geteilte Rezepte sind für alle sichtbar, mit deinem Anzeigenamen. Favoriten anderer zählen als
  „Likes“ (gespeichert wird die Geräte-Kennung bzw. das Konto).
- **Fotos:** Öffentliche Fotos (verkleinert) erscheinen mit deinem Anzeigenamen in der Galerie des Rezepts und können
  bewertet werden; das bestbewertete Foto sehen alle als Rezeptbild. Der Server speichert sie als Bilddateien, ebenso
  das Foto eines geteilten Rezepts. Fotos mit „Nur ich“ bleiben auf deinem Gerät.
- **Sterne für Rezepte** werden je Gerät bzw. Konto gespeichert und nur als Durchschnitt angezeigt.
- **„Problem melden“:** gespeichert werden Rezept, Grund, deine Notiz und die Geräte-Kennung bzw. das Konto.
- Admins können Fotos, geteilte Rezepte und Meldungen sehen und löschen sowie Konten sperren.

Du kannst eigene Fotos und geteilte Rezepte selbst löschen; der Server löscht dabei auch die Bilddateien.
Rechtsgrundlage: Bereitstellung der gewünschten Funktion (Art. 6 Abs. 1 lit. b DSGVO), bei Meldungen und Moderation
mein berechtigtes Interesse an richtigen Rezepten und an einer Community ohne Missbrauch (Art. 6 Abs. 1 lit. f
DSGVO). [[ANGABE: Speicherdauer]]

### B5. Lieferdienst

[[ANGABE: Anbieter und was übermittelt wird (Einkaufsliste, Lieferadresse …). Heute gibt es nur einen
Demo-Lieferdienst ohne echte Lieferung.]]

### B6. Sicherung der Ernährungshistorie

Sobald FoodTracker einen Server erreicht, sichert es dein Tagebuch dort automatisch: Tag und Uhrzeit, Name des
Gerichts, Kalorien, Eiweiß, Kohlenhydrate und Fett, woher der Eintrag stammt (Foto, Plan, von Hand) und wann er
zuletzt geändert wurde. Bist du angemeldet, gehört die Sicherung zu deinem Konto – so kommt deine Historie auf einem
neuen Gerät oder nach dem Löschen der Browserdaten zurück –, sonst zur zufälligen Geräte-Kennung aus Abschnitt 2. Meldest
du dich an, wandert die Sicherung der Geräte-Kennung in dein Konto (B2).
Löschst du einen Eintrag, löscht FoodTracker ihn auch auf dem Server; dort bleibt nur eine Löschmarke (Kennung des
Eintrags und Zeitpunkt, ohne Inhalt), damit er von deinen anderen Geräten nicht zurückkommt.

[[PRÜFEN: Was und wie viel jemand isst, kann Rückschlüsse auf die Gesundheit zulassen (etwa bei einer Diät oder
Erkrankung) und dann als Gesundheitsdatum nach Art. 9 DSGVO gelten. Sicherer Weg: die Sicherung erst nach einer
ausdrücklichen Einwilligung starten (gemeinsam mit der Einwilligung für die KI-Funktionen, B3) und im Profil
abschaltbar machen. Heute startet sie ohne Nachfrage, sobald ein Server erreichbar ist – für den Test auf dem eigenen
Laptop unkritisch, vor einem Server für andere klären.]]

Rechtsgrundlage: [[ENTSCHEIDUNG: Bereitstellung der gewünschten Sicherung (Art. 6 Abs. 1 lit. b DSGVO) oder – wenn
die Einträge als Gesundheitsdaten gelten – deine ausdrückliche Einwilligung (Art. 6 Abs. 1 lit. a und Art. 9 Abs. 2
lit. a DSGVO), siehe oben.]] Speicherdauer: [[ANGABE: z. B. bis du dein Konto löschst bzw. bis … nach der letzten
Nutzung einer Geräte-Kennung]]

Unabhängig vom Server kannst du deine Historie im Profil jederzeit als Datei speichern und wieder importieren
(Abschnitt 2).

### B7. Plan, Einkaufsliste, Vorrat, eigene Rezepte, Fotos und Essgewohnheiten (mit Konto)

Bist du angemeldet, gleicht FoodTracker diese Daten zwischen deinen Geräten ab, damit du überall denselben Stand hast:
deine Antworten aus dem Fragebogen (Abschnitt 2, auch Unverträglichkeiten und Körperdaten), Sprache, Region und
Anzeigename, den Monatsplan mit den Rezepten, die nur darin vorkommen, was du darin als gegessen, eingekauft und in den
Vorrat gebucht abgehakt hast, deinen Vorrat (Zutat, Einkaufstag, Menge), deine eigenen und importierten Rezepte samt
Foto (und ob du sie in der Community geteilt hast), deine Favoriten (bei Community-Rezepten mit der gespeicherten Kopie),
die Rezepttexte, die die KI für dich übersetzt oder verbessert hat, und deine eigenen Fotos aus der Galerie eines Rezepts
(zu welchem Rezept, wann aufgenommen, ob öffentlich). Der Server speichert sie zu deinem Konto, je
Eintrag mit dem Zeitpunkt der letzten Änderung; Gelöschtes bleibt als Löschmarke ohne Inhalt, damit es von anderen
Geräten nicht zurückkommt. Häkchen eines abgelösten Plans löscht er. Ohne Konto bleiben diese Daten auf deinem Gerät.

Fotos eigener Rezepte und Fotos aus der Galerie, die du mit „Nur ich“ gespeichert hast, legt der Server als Bilddatei zu
deinem Konto ab, nicht in der Datenbank. Abrufbar sind sie über eine zufällige, nicht erratbare Adresse, die nur deine
Geräte bekommen; löschst du das Rezept bzw. das Foto oder ersetzt es, löscht der Server die Datei. Auf dem Gerät, auf dem
du das Foto aufgenommen hast, bleibt es zusätzlich gespeichert. Von öffentlichen Fotos merkt sich der Server nur, welches
Foto der Galerie (B4) deines ist; das Foto selbst liegt dort einmal.

> **Für Benjamin:** „Nicht erratbar“ heißt eine zufällige UUID (122 Bit) im Pfad `/api/images/<UUID>.jpg`. Wer den
> Pfad kennt, bekommt das Bild ohne Anmeldung – wie bei den Fotos der Galerie. Der Server schickt die Pfade eigener Fotos
> nur an das Konto selbst und bittet, sie unterwegs nicht zwischenzuspeichern („Cache-Control: private“).

[[PRÜFEN: Unverträglichkeiten und Körperdaten sind Gesundheitsdaten (Art. 9 DSGVO). Sicherer Weg wie bei B6: den
Abgleich erst nach einer ausdrücklichen Einwilligung starten und im Profil abschaltbar machen. Heute beginnt er mit der
Anmeldung – vor einem Server für andere klären.]]

Rechtsgrundlage: [[ENTSCHEIDUNG: Bereitstellung des gewünschten Abgleichs (Art. 6 Abs. 1 lit. b DSGVO), für die
Gesundheitsdaten deine ausdrückliche Einwilligung (Art. 9 Abs. 2 lit. a DSGVO), siehe oben.]] Speicherdauer: bis du dein
Konto löschst; „Meine Daten exportieren“ enthält diese Daten (B2).

---

## 6. Deine Rechte

Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der
Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch gegen Verarbeitungen auf Grundlage
berechtigter Interessen (Art. 21). Eine Einwilligung kannst du jederzeit mit Wirkung für die Zukunft widerrufen
(Art. 7 Abs. 3). Schreib dafür an die E-Mail-Adresse in Abschnitt 1. Daten, die nur auf deinem Gerät liegen
(Abschnitt 2), kann ich nicht einsehen – die löschst du selbst.

Du kannst dich bei der Datenschutzbehörde beschweren:
Österreichische Datenschutzbehörde, Barichgasse 40–42, 1030 Wien, Telefon +43 1 521 52 25 69,
E-Mail dsb@dsb.gv.at, https://www.dsb.gv.at

## 7. Mindestalter

> **Für Benjamin, vor dem Veröffentlichen löschen:** Erscheint nur mit Server (wie Teil B). Entschieden am 24.11.2026:
> kein Mindestalter, aber der Hinweis zur Zustimmung eines Elternteils ([`README.md`](README.md), Entscheidung 3).

FoodTracker hat kein Mindestalter und fragt nicht nach deinem Alter – auch Konto und KI-Funktionen stehen allen offen.
Bist du unter 14, brauchst du für ein Konto und die KI-Funktionen die Zustimmung eines Elternteils; für
Gesundheitsangaben wie Allergien oder dein Ernährungstagebuch gilt das bis 18 (§ 4 Abs. 4 DSG, Art. 8 und 9 DSGVO).
Darauf weist FoodTracker bei der Registrierung und vor der ersten Nutzung der KI-Funktionen hin.

## 8. Änderungen

Ändert sich FoodTracker – etwa wenn die Funktionen aus Teil B starten –, passe ich diese Datenschutzerklärung an. Es
gilt die jeweils hier veröffentlichte Fassung.
