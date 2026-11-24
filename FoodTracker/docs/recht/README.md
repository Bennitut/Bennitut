# Rechtstexte – Entwürfe

Stand: 24.11.2026 (Backlog-Punkt 7). Entwürfe für Österreich, geschrieben von der Nachtschicht – **keine
Rechtsberatung**. Vor dem Veröffentlichen ausfüllen und am besten von jemandem mit Rechtskenntnis gegenlesen lassen.

| Datei | Inhalt |
|---|---|
| [`impressum.md`](impressum.md) | Impressum bzw. Offenlegung, zwei Varianten (A: rein privat, B: sobald FoodTracker Geld bringen soll) |
| [`datenschutz.md`](datenschutz.md) | Datenschutzerklärung. Teil A gilt heute (Web-Version und App ohne Server), Teil B erst, wenn ein Server läuft |

**In der App** (seit 24.11.2026): 👤 Profil → „§ Impressum & Datenschutz“, in der Web-Version zusätzlich „Impressum“
oben rechts auf jeder Seite. Gezeigt werden Impressum Variante A und Teil A der Datenschutzerklärung (Teil B und das
Mindestalter nur, wenn die App einen Server kennt), ohne die Hinweise für dich und mit den Vorgaben aus dem PR, solange
du nichts anderes entscheidest (Fotos: Variante c). Die Texte stehen in `app/src/legal/texte.ts` – Änderungen hier
bitte dort nachziehen (und umgekehrt).

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

1. **Name** (Vor- und Nachname).
2. **Wohnort** – für Variante A genügt der Ort (die Gemeinde); für Variante B die **volle Anschrift** (Straße,
   Hausnummer, PLZ, Ort). Die WKO verlangt dafür die „volle geografische Anschrift der tatsächlichen Niederlassung“ –
   bei dir also wohl die Wohnadresse, solange es kein Büro gibt. Derselbe Eintrag steht in der Datenschutzerklärung
   unter „1. Verantwortlich“. `[[PRÜFEN: Art. 13 DSGVO verlangt dort Name und „Kontaktdaten“ – die E-Mail-Adresse ist
   eine; ob neben ihr der Ort genügt oder dort die volle Anschrift stehen sollte, konnte ich nicht sicher klären.]]`
3. **E-Mail-Adresse**, die du liest (auch für Anfragen nach der DSGVO). Tipp: eine eigene Adresse nur für FoodTracker.
4. Nur Variante B: **zweiter Kontaktweg** – laut WKO „mindestens zwei, z. B. E-Mail plus Telefon oder Web-Formular“.
   Ein Formular braucht einen Server, ohne Server bleibt also nur die Telefonnummer.
5. Nur Variante B und nur, falls vorhanden: Gewerbe, Gewerbebehörde, Mitgliedschaft bei der Wirtschaftskammer,
   UID-Nummer, Firmenbuch.
6. Das **Datum** („Stand“) in beiden Texten.

## Deine Entscheidungen

1. **Variante A oder B im Impressum.** Für jede Website gilt die Offenlegung nach § 25 Mediengesetz (laut USP ist
   „jegliche Website“ ein periodisches elektronisches Medium); für eine kleine Website, die nur die App vorstellt,
   reichen Name, Wohnort und Gegenstand (§ 25 Abs. 5 MedienG) – das ist Variante A. Die vollen Angaben nach § 5
   E-Commerce-Gesetz (Variante B) braucht ein „Diensteanbieter“; ob das schon für eine kostenlose Testversion ohne
   Werbung gilt, konnte ich nicht sicher klären (das ECG meint Dienste, die „in der Regel gegen Entgelt“ erbracht
   werden). **Spätestens mit Premium, Werbung oder Spenden gilt Variante B.** Variante B macht deine Wohnadresse
   öffentlich.
2. **Rezeptfotos.** Die Fotos kommen heute direkt von den Servern von Wikimedia Commons und Flickr (beide USA). Dabei
   erfahren diese Dienste die IP-Adresse – ohne dass jemand gefragt wurde. Möglichkeiten:
   - (a) **Fotos selbst ausliefern** (in die App bzw. Web-Version packen; die freien Lizenzen erlauben das mit
     Namensnennung). Dann entfällt Abschnitt 4 der Datenschutzerklärung ganz. Meine Empfehlung; kostet nichts, macht
     die App aber größer.
   - (b) Fotos erst nach einem Tipp laden („Fotos anzeigen“, merkt sich die Wahl).
   - (c) So lassen und in der Datenschutzerklärung erklären (Entwurf, Abschnitt 4). Rechtlich die unsicherste
     Variante.
3. **Mindestalter.** In Österreich können Kinder ab 14 selbst in Online-Dienste einwilligen (§ 4 Abs. 4 DSG laut
   Bird & Bird); für sensible Daten (Gesundheit, Religion) verlangt die herrschende Meinung auch über 14 die
   Zustimmung der Eltern. Ohne Server bekommst du keine Daten, mit Server schon (Teil B). Vorschlag: „ab 16“ oder
   „ab 18“ für Konto und KI-Funktionen.
4. **Später, mit Server:** Teil B der Datenschutzerklärung ergänzen (Hoster, Vertragspartner bei Anthropic,
   Lieferdienst, Speicherfristen) und vor dem ersten Senden sensibler Angaben eine ausdrückliche Einwilligung
   einholen (Art. 9 DSGVO). Konto löschen fehlt noch in App und Server (Recht auf Löschung, Art. 17 DSGVO).

## Wo die Texte stehen

- **Web-Version:** „Impressum“ oben rechts auf jeder Seite führt zur Seite „Impressum & Datenschutz“ (`/legal`). Die
  WKO verlangt, dass die Angaben „ständig leicht und unmittelbar auffindbar“ sind, und rät, das Impressum direkt auf
  der eigenen Seite zu veröffentlichen statt nur zu verlinken – die Texte stehen deshalb in der Web-Version selbst.
- **App:** Profil → „§ Impressum & Datenschutz“. Die WKO-Regeln gelten laut WKO „auch für Apps“.
- **App Stores:** verlangen später einen Link zur Datenschutzerklärung (Backlog-Punkt 10).

**Wichtig vor dem Mergen:** Nach dem Mergen geht die Web-Version auf GitHub Pages online. Dann sollte mindestens
Variante A ausgefüllt und verlinkt sein – laut USP drohen bei fehlender Offenlegung bis zu 20.000 Euro
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

Nicht erreichbar waren aus der Cloud das RIS (Gesetzestexte; die Paragrafen stammen deshalb aus den Erläuterungen
von WKO und USP) und die Datenschutzerklärung der Wikimedia Foundation – beides vor dem Veröffentlichen einmal selbst
ansehen.
