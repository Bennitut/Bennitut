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

**Stand 24.11.2026:** Benjamin hat am 24.11.2026 im Chat entschieden: (1) Die PR-Grenze von etwa 1.500 Zeilen ist
aufgehoben, neue Funktionen sind wieder erlaubt und kommen in den offenen PR #2. (2) Rezeptfotos zuerst – erledigt: die
vier unklaren Fotos ersetzt bzw. entfernt, Schlagwörter und Beschreibungen aller Fotos sowie die Videotitel vegetarischer
und veganer Rezepte geprüft, danach der Platzhalter für Rezepte ohne Foto im Plan, unter „Heute“ und im Tausch-Dialog.
(3) Vorrat: Variante (b), ein Knopf „Abgehaktes in den Vorrat“ unter der Einkaufsliste – erledigt (Vorrang unten).
Promo-Clips neu aufgenommen (Clip 2 zeigt jetzt auch den Vorrat), Punkt 5 erledigt (Teil 2: Bestellungen, Community;
Teil 3: Rezept, Übersetzen, KI-Wünsche, Anmeldung), danach Clips 1 und 3 noch einmal aufgenommen. Punkt 7 erledigt:
Entwürfe für Impressum und Datenschutzerklärung in `docs/recht/` – Benjamin trägt seine Angaben ein und entscheidet
drei Dinge (Impressum-Variante, Rezeptfotos, Mindestalter; im PR gefragt).
Als Nächstes: am 25.11. der Tagesbericht für den 24.11., dann der Vorrang „Impressum & Datenschutz in App und
Web-Version“ (unten), danach 8–10. Offen im PR: ob „Löschen geht in der Web-Version nicht“ (unten) vorher drankommen
soll – ohne Antwort nach dem Vorrang weiter mit Punkt 8.

## Daueraufgabe: Tagesbericht als PDF (Benjamins Wunsch vom 23.11.2026)

Jeden Tag einmal, direkt nach dem Setup und vor der obersten offenen Aufgabe: Fehlt
`reports/<Vortag>.pdf` (Datum des Vortags in Japan-Zeit, `JJJJ-MM-TT`) oder wurde sie noch am Vortag selbst
committet (vorläufiger Stand), und gab es am Vortag Commits auf `claude/nightly`, dann
`node FoodTracker/reports/make-report.cjs <Vortag>` ausführen, die PDF committen und pushen, im PR unter
„Tagesberichte“ verlinken und Benjamin mit SendUserFile schicken (in der Benachrichtigung kurz erwähnen).

## Vorrang: Impressum & Datenschutz in App und Web-Version (Nachtschicht, 24.11.2026)

Vor Punkt 8 erledigen. Grund: Nach dem Mergen geht die Web-Version auf GitHub Pages online, und laut USP braucht
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
- **Löschen geht in der Web-Version nicht:** `Alert.alert` ist in react-native-web eine leere Funktion. „Löschen“ bei
  eigenen Rezepten und eigenen Fotos zeigt im Browser deshalb keine Abfrage und löscht nichts (ebenso die Abfragen im
  Admin-Bereich, der ohne Server aber nicht erreichbar ist). Vorschlag: eine kleine Funktion `confirm()` in `lib/`, die
  im Browser `window.confirm` nimmt und in der App `Alert.alert`; im Web-Rauchtest ein eigenes Rezept anlegen und
  löschen. Klein und für Tester spürbar – im PR gefragt, ob es vor Punkt 7 drankommen soll. (24.11.2026)
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
- **Server ohne CORS:** Der Server schickt keine CORS-Header. Im Browser mit `npx expo start` (Taste `w`, Port 8081)
  dürften Anfragen an den Server auf Port 3000 deshalb scheitern (nicht ausprobiert; Expo Go ist nicht betroffen).
  Für eine Web-Version mit Server `hono/cors` für die eigenen Adressen einschalten. Zum Prüfen am 24.11.2026 lief die
  App deshalb hinter einem kleinen Proxy auf derselben Adresse wie der Server. (24.11.2026)
- **Web-Export mit `EXPO_PUBLIC_API_URL`:** Metro übernimmt die Variable nur mit `npx expo export --clear`; ohne
  `--clear` kam am 24.11.2026 der zwischengespeicherte Stand ohne Server heraus (und umgekehrt). Der Pages-Workflow
  baut in einer frischen Umgebung und ist nicht betroffen. (24.11.2026)
- **Video bei der Calzone zeigt Cannelloni:** `vg_calzone_spinat` verlinkt „Schnelles Cannelloni mit
  Spinat-Ricotta-Füllung“ – vegetarisch, aber ein anderes Gericht. Bei Gelegenheit ein Calzone-Video suchen. (24.11.2026)
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
