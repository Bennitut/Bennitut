# Rechtstexte – Entwürfe

Stand: 24.11.2026 (Backlog-Punkt 7), Teil B zuletzt am 27.11.2026 ergänzt (Betrieb des Servers: Cloudflare, Render,
Neon, Anthropic). Entwürfe für Österreich, geschrieben von der Nachtschicht – **keine
Rechtsberatung**. Vor dem Veröffentlichen ausfüllen und am besten von jemandem mit Rechtskenntnis gegenlesen lassen.

| Datei | Inhalt |
|---|---|
| [`impressum.md`](impressum.md) | Impressum: Variante B (Angaben nach § 5 ECG und Offenlegung nach § 25 MedienG, gewählt am 24.11.2026), Variante A zum Vergleich |
| [`datenschutz.md`](datenschutz.md) | Datenschutzerklärung. Teil A gilt heute (Web-Version und App ohne Server), Teil B erst, wenn ein Server läuft |

**In der App** (seit 24.11.2026): 👤 Profil → „§ Impressum & Datenschutz“, in der Web-Version zusätzlich „Impressum“
oben rechts auf jeder Seite. Gezeigt werden Impressum Variante B und Teil A der Datenschutzerklärung (Teil B und das
Mindestalter nur, wenn die App einen Server kennt), ohne die Hinweise für dich. Die Texte stehen in
`app/src/legal/texte.ts` – Änderungen hier bitte dort nachziehen (und umgekehrt).

**Deine Angaben trägst du nur an einer Stelle ein: `app/src/legal/angaben.ts`.** Solange dort ein Platzhalter steht,
zeigt die App über den Texten „Entwurf“ mit der Liste, und `npm run web:pages` – damit auch der GitHub-Pages-Workflow
nach dem Mergen – bricht mit dieser Liste ab. So geht keine Web-Version ohne Offenlegung online.

## Platzhalter

Alles in doppelten eckigen Klammern muss vor dem Veröffentlichen ausgefüllt oder gelöscht werden. Suchen mit
`git grep -n "\[\[" -- FoodTracker/docs/recht`.

- `[[ANGABE: …]]` – deine Daten (Name, Anschrift, E-Mail …). Die Nachtschicht trägt sie bewusst nicht ein: Das Repo
  ist öffentlich, und was im Impressum steht, entscheidest du.
- `[[ENTSCHEIDUNG: …]]` – eine Variante wählen, die andere löschen.
- `[[PRÜFEN: …]]` – konnte ich nicht sicher klären oder ändert sich mit der Zeit (z. B. Angaben fremder Dienste).

## Was du ausfüllen musst

Alles in `app/src/legal/angaben.ts` (Variante B):

1. **Name** (Vor- und Nachname) – eingetragen am 24.11.2026.
2. **Volle Anschrift:** Straße, Hausnummer mit Stiege und Tür (z. B. „12/3/4“), Postleitzahl und Ort; „Österreich“
   steht schon im Text. Die WKO verlangt die „volle geografische Anschrift der tatsächlichen Niederlassung“ – bei dir
   also die Wohnadresse, solange es kein Büro gibt. Dieselbe Anschrift steht in der Datenschutzerklärung unter
   „1. Verantwortlich“ (Art. 13 DSGVO: Name und Kontaktdaten); damit ist auch die frühere Frage erledigt, ob dort der
   Wohnort genügt.
3. **E-Mail-Adresse**, die du liest (auch für Anfragen nach der DSGVO). Tipp: eine eigene Adresse nur für FoodTracker.
4. **Zweiter Kontaktweg** – laut WKO „mindestens zwei, z. B. E-Mail plus Telefon oder Web-Formular“. Ein Formular
   braucht einen Server, ohne Server bleibt also die Telefonnummer (eine reine Nummer erscheint als „Telefon: …“).
5. Nur falls vorhanden (heute nicht): Gewerbe, Gewerbebehörde, Mitgliedschaft bei der Wirtschaftskammer,
   UID-Nummer, Firmenbuch – dann in `texte.ts` und `angaben.ts` ergänzen (Vorlage in `impressum.md`).
6. Das **Datum** („Stand“) in beiden Texten.

## Deine Entscheidungen

1. ✅ **Impressum: Variante B** (entschieden am 24.11.2026). Für jede Website gilt die Offenlegung nach § 25
   Mediengesetz (laut USP ist „jegliche Website“ ein periodisches elektronisches Medium); für eine kleine Website, die
   nur die App vorstellt, hätten Name, Wohnort und Gegenstand gereicht (§ 25 Abs. 5 MedienG, Variante A). Variante B
   ergänzt die vollen Angaben nach § 5 E-Commerce-Gesetz – nötig spätestens mit Premium, Werbung oder Spenden und
   damit schon jetzt auf der sicheren Seite. Sie macht deine Wohnadresse öffentlich.
2. ✅ **Rezeptfotos: (a) selbst ausliefern** (entschieden am 24.11.2026). Die Fotos kamen direkt von den Servern von
   Wikimedia Commons und Flickr (beide USA), die dabei die IP-Adresse erfahren. Künftig liefert FoodTracker sie selbst
   aus (verkleinert, mit Urheber:in, Lizenz und Quelle unter jedem Foto; die freien Lizenzen erlauben das mit
   Namensnennung). Sobald alle Fotos umgezogen sind, entfällt Abschnitt 4 der Datenschutzerklärung; bis dahin gilt er
   für die restlichen (Fortschritt in `BACKLOG.md`, Vorrang „Rezeptfotos selbst ausliefern“). Nicht gewählt: (b) erst
   nach einem Tipp laden, (c) so lassen.
3. ✅ **Mindestalter: keins** (entschieden am 24.11.2026, nachdem du die Folgen kanntest). Die App bleibt für alle
   offen, auch Konto und KI-Funktionen; keine Altersgrenze und keine Altersprüfung. In Österreich können Kinder ab 14
   selbst in Online-Dienste einwilligen (§ 4 Abs. 4 DSG laut Bird & Bird); für sensible Daten (Gesundheit, Religion)
   verlangt die herrschende Meinung auch über 14 die Zustimmung der Eltern. Deshalb weist FoodTracker bei der
   Registrierung und vor der ersten Nutzung der KI-Funktionen darauf hin, dass Kinder unter 14 – und bei
   Gesundheitsangaben Minderjährige unter 18 – nur mit Zustimmung eines Elternteils einwilligen; Abschnitt 7 der
   Datenschutzerklärung sagt dasselbe. Ohne Server zeigt die App den Abschnitt nicht (dann bekommst du keine Daten).
4. **Später, mit Server:** Teil B der Datenschutzerklärung ergänzen (Lieferdienst, Speicherfristen). Die ausdrückliche
   Einwilligung vor den KI-Funktionen (Art. 9 DSGVO) fragt die App seit 26.11.2026 vor der ersten Nutzung ab (im Profil
   widerrufbar); offen ist sie noch für die Sicherung der Ernährungshistorie (B6). Konto löschen gibt es seit 26.11.2026
   in App und Server (Recht auf Löschung, Art. 17 DSGVO).
5. **Betrieb des Servers** (kommt mit Vorrang 1, 9.5 – die Nachtschicht fragt dich, welchen Weg aus
   [`../SERVER-HOSTING.md`](../SERVER-HOSTING.md) du nimmst): In `app/src/legal/angaben.ts` unter `BETRIEB` den Weg
   (`weg`: „a“ = Laptop mit Cloudflare Tunnel, „b“ = Render mit Neon) und die KI (`ki`: „claude“, „ollama“,
   „ollama-laptop“ = KI vom Laptop, nur bei Weg b, oder „keine“) eintragen. Dann zeigt die App in „Kurz gesagt“, B1
   und B3 nur die passenden Sätze; die Texte zu Cloudflare, Render, Neon und Anthropic sind seit 27.11.2026 fertig
   (Stand der Dienste unten bei den Quellen). Offen bleiben je Weg ein paar `[[PRÜFEN]]` – vor allem der Vertrag zur
   Auftragsverarbeitung mit Cloudflare (nur mit Konto, ein Quick Tunnel ist laut Cloudflare nur zum Testen gedacht) und
   der Vertrag mit Neon bzw. Databricks. Wechselt die KI später, fragt die App vor der nächsten KI-Funktion neu, sobald
   die Nachtschicht die Fassung der Einwilligung erhöht (zuletzt am 27.11.2026 auf 2).

## Wo die Texte stehen

- **Web-Version:** „Impressum“ oben rechts auf jeder Seite führt zur Seite „Impressum & Datenschutz“ (`/legal`). Die
  WKO verlangt, dass die Angaben „ständig leicht und unmittelbar auffindbar“ sind, und rät, das Impressum direkt auf
  der eigenen Seite zu veröffentlichen statt nur zu verlinken – die Texte stehen deshalb in der Web-Version selbst.
- **App:** Profil → „§ Impressum & Datenschutz“. Die WKO-Regeln gelten laut WKO „auch für Apps“.
- **App Stores:** verlangen später einen Link zur Datenschutzerklärung (Backlog-Punkt 10).

**Wichtig vor dem Mergen:** Nach dem Mergen geht die Web-Version auf GitHub Pages online. Dann muss das Impressum
(Variante B) ausgefüllt und verlinkt sein – laut USP drohen bei fehlender Offenlegung bis zu 20.000 Euro
(Verwaltungsübertretung).

## Was ich bewusst weggelassen habe

- **Haftungsausschlüsse und „Urheberrecht“-Absätze** aus Mustervorlagen: weder ECG noch Mediengesetz verlangen sie.
  Stattdessen ein kurzer Bildnachweis (alle Rezeptfotos stehen unter CC BY, CC BY-SA, CC0 oder sind gemeinfrei –
  kommerzielle Nutzung ist bei allen erlaubt, Urheber:in und Lizenz stehen in der App unter jedem Foto).
- **Link zur EU-Plattform für Online-Streitbeilegung:** Die OS-Plattform ist seit 20.07.2025 eingestellt (IHK,
  WKO OÖ „Änderungen im Impressum notwendig“); alte Vorlagen enthalten den Link noch.
- **Cookie-Banner:** FoodTracker setzt keine Cookies und speichert nur, was die App selbst braucht (Plan, Vorrat …).
  Das ist ohne Einwilligung erlaubt, wenn es „unbedingt erforderlich“ für den ausdrücklich gewünschten Dienst ist
  (§ 165 Abs. 3 TKG 2021, laut DSB-FAQ für jede Speicherung auf dem Endgerät). GitHub Pages hat bei einer Stichprobe
  am 24.11.2026 ebenfalls keine Cookies gesetzt.

## Quellen (abgerufen am 24.11.2026)

- WKO: [Informationspflichten nach dem E-Commerce-Gesetz …](https://www.wko.at/internetrecht/informationspflichten-nach-dem-e-commerce-gesetz--dem-unte) (Stand 07.11.2024)
- WKO: [Informationspflichten nach dem Mediengesetz für Websites](https://www.wko.at/internetrecht/informationspflichten-nach-dem-mediengesetz-fuer-websites) (Stand 15.10.2024)
- WKO: [Das korrekte Website-Impressum (PDF)](https://www.wko.at/sbg/wirtschaftsrecht-gewerberecht/das-korrekte-website-impressum.pdf) (Stand August 2025)
- USP: [Offenlegungspflicht gemäß § 25 Mediengesetz](https://www.usp.gv.at/themen/brancheninformationen/information-und-kommunikation/offenlegungspflicht-gemaess-para-25-mediengesetz.html) (Stand 01.01.2026)
- DSB: [FAQ zum Thema Cookies und Datenschutz (PDF)](https://dsb.gv.at/dam/jcr:a6ebcf0b-0874-4aa5-b88d-f79bcce5330c/DSB%20FAQ%20zum%20Thema%20Cookies%20und%20Datenschutz.pdf) (Stand 25.05.2022)
- oesterreich.gv.at: [Österreichische Datenschutzbehörde](https://www.oesterreich.gv.at/de/orgsearch/org/5319) (Anschrift, Telefon, E-Mail)
- Bird & Bird: [Children in the digital world – Austria](https://childreninthedigitalworld.twobirds.com/home/austria) (Alter 14, § 4 Abs. 4 DSG)
- IHK Osnabrück: [OS-Plattform zur Streitbeilegung seit 20.07.2025 eingestellt](https://www.ihk.de/osnabrueck/recht-und-fair-play/recht/internetrecht/einstellung-os-plattform-6474562); WKO OÖ: [Änderungen im Impressum notwendig](https://www.wko.at/ooe/aenderungen-im-impressum-notwendig)
- GitHub: [General Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement) (gültig ab 27.04.2026), [About GitHub Pages – Data collection](https://docs.github.com/en/articles/about-github-pages)
- Flickr: [Privacy Policy](https://www.flickr.com/help/privacy-policy) (Stand 20.10.2026)
- Anthropic: [How long do you store my organization's data?](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data) (Stand 01.07.2026), [Is my data used for model training?](https://privacy.claude.com/en/articles/7996868-is-my-data-used-for-model-training) (Stand 18.08.2026)

Abgerufen am 27.11.2026 (Betrieb des Servers, Teil B):

- Anthropic: [Commercial Terms of Service](https://www.anthropic.com/legal/commercial-terms) (gültig ab 17.06.2025: Vertragspartner im EWR die Anthropic Ireland, Limited; der Auftragsverarbeitungsvertrag ist Teil der Bedingungen; kein Training mit Kundeninhalten), [Data Processing Addendum](https://www.anthropic.com/legal/data-processing-addendum) (gültig ab 24.02.2025: Anthropic als Auftragsverarbeiter, Standardvertragsklauseln Modul 2 und 3), [Privacy Policy](https://www.anthropic.com/privacy) (gültig ab 10.09.2026: Anschrift der Anthropic Ireland, Limited; für Übermittlungen Angemessenheitsbeschlüsse und Standardvertragsklauseln, kein Data Privacy Framework)
- Cloudflare: [Data Processing Addendum](https://www.cloudflare.com/cloudflare-customer-dpa/) (Fassung 6.4 vom 03.04.2026: Teil des Hauptvertrags, z. B. des Self-Serve Subscription Agreement; Data Privacy Framework und Standardvertragsklauseln), [Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) (Stand 30.09.2026: „Quick Tunnels are for testing and development“, kein Konto nötig, keine Verfügbarkeitsgarantie)
- Render: [Data Processing Addendum](https://render.com/dpa) (Stand 19.12.2024: ergänzt die Nutzungsbedingungen; „primary processing operations take place in the United States“; Data Privacy Framework, sonst Standardvertragsklauseln), [Privacy Policy](https://render.com/privacy) (Stand 10.07.2026), [Zertifizierung nach dem Data Privacy Framework](https://render.com/changelog/render-achieves-certification-under-the-eu-us-data-privacy-framework) (seit 06.01.2025, mit UK-Erweiterung und Swiss-U.S. DPF)
- Neon: [neon.com/dpa](https://neon.com/dpa) und [neon.com/terms-of-service](https://neon.com/terms-of-service) zeigten beide den „Product Specific Schedule (Neon)“ (Stand 14.10.2026: „Databricks, Inc., the parent company of Neon, LLC“; es gilt das Master Cloud Services Agreement von Databricks) – einen eigenen Auftragsverarbeitungsvertrag von Neon gab es dort nicht

Nicht erreichbar waren aus der Cloud das RIS (Gesetzestexte; die Paragrafen stammen deshalb aus den Erläuterungen
von WKO und USP) und die Datenschutzerklärung der Wikimedia Foundation – beides vor dem Veröffentlichen einmal selbst
ansehen. Am 27.11.2026 außerdem nicht lesbar: das Self-Serve Subscription Agreement von Cloudflare (ob der
Auftragsverarbeitungsvertrag mit einem kostenlosen Konto gilt), der Auftragsverarbeitungsvertrag und die Liste der
Unterauftragsverarbeiter von Neon bzw. Databricks; eine Zertifizierung von Anthropic nach dem Data Privacy Framework
ist auf deren Seiten nicht erwähnt (die DPF-Liste selbst hat die Nachtschicht nicht geprüft).
