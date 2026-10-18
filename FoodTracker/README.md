# FoodTracker

App für iOS und Android zum Tracken von Essen, mit automatischen Ernährungsplänen,
die so geplant werden, dass **keine Reste übrig bleiben**. Gemacht für Deutschland,
Österreich und die Schweiz, dank Übersetzungsfunktion weltweit nutzbar.

## Funktionen

| Bereich | Was passiert |
|---|---|
| **Foto einer Mahlzeit** | Claude erkennt die Lebensmittel, schätzt Mengen und Nährwerte → Eintrag im Tagebuch. |
| **Foto eines Kassenbons** | Claude liest jede Position (REWE, BILLA, Migros …), ordnet sie Zutaten zu und rechnet Mengen um → Vorrat. |
| **Ernährungsplan** | Plant Frühstück, Mittag- und Abendessen für 1–14 Tage passend zu Kalorienbedarf, Ernährungsform (alles, pescetarisch, vegetarisch, vegan), Allergien, Abneigungen und maximaler Kochzeit. Optional schlägt Claude neue Rezepte nach Wunsch vor. |
| **Plan anpassen** | Einzelne Gerichte 🔒 fixieren oder ⇄ gegen ein passendes anderes Rezept tauschen; der Rest wird neu verteilt, damit trotzdem nichts übrig bleibt. Lieblingsrezepte werden bevorzugt eingeplant. |
| **Rezepte** | Eigene Rezepte anlegen und bearbeiten, Katalog- und Community-Rezepte als eigene Kopie anpassen, Favoriten markieren. |
| **Instagram & TikTok** | Link zu einem Koch-Video einfügen → Claude liest Beschreibung, Vorschaubild und (optional) Einzelbilder aus dem gespeicherten Video und macht daraus ein Rezept mit Mengen. |
| **Community** | Eigene Rezepte teilen, Rezepte anderer entdecken (beliebt/neu) und als Favorit speichern. Favoriten zählen als „Likes“. |
| **Zero Waste** | Rezepte werden so kombiniert, dass gekaufte Packungen aufgebraucht werden; vorhandene Vorräte kommen zuerst dran; Verderbliches wird nur innerhalb der Haltbarkeit eingeplant; Reste geöffneter Dosen zählen als Verschwendung. Was trotzdem übrig wäre, wird als „♻️ Reste mitverwenden“ auf passende Gerichte verteilt. |
| **Lieferdienst** | Die Einkaufsliste wird mit einem Tipp bestellt. Gelieferte Ware landet automatisch im Vorrat. |
| **Automatisches Tracking** | Hakt man eine geplante Mahlzeit als „Gegessen“ ab, wird sie ins Tagebuch übernommen und die Zutaten werden vom Vorrat abgezogen. |

Kreislauf: **Plan → Einkaufsliste → Bestellung → Vorrat → Kochen/Essen → Tagebuch.**

## Sprachen und Regionen

- **Oberfläche:** Deutsch, Englisch, Französisch, Italienisch, Spanisch – automatisch nach Gerätesprache, umstellbar in ⚙️ Einstellungen. Fehlende Übersetzungen fallen beim Kompilieren auf.
- **Regionale Begriffe:** In Österreich heißen Zutaten z. B. Erdäpfel, Paradeiser, Topfen, Schlagobers, Karfiol; in der Schweiz Rüebli, Poulet, Peperoni, Vollrahm, Randen – und es wird „ss“ statt „ß“ geschrieben.
- **Währung:** Euro für Deutschland/Österreich, Franken für die Schweiz (Richtpreise).
- **Rezepte übersetzen:** Jedes Rezept (auch eigene, importierte und Community-Rezepte) lässt sich per 🌐 von Claude in die eigene Sprache übersetzen; die Übersetzung wird gespeichert.
- **Neue Sprache hinzufügen:** `cd server && npm run translate-ui -- pt "Português"` lässt Claude die komplette Oberfläche übersetzen, prüft Schlüssel und Platzhalter und legt `app/src/i18n/pt.ts` an. Danach die Sprache in `app/src/i18n/index.ts` eintragen. Bitte von Muttersprachler:innen gegenlesen lassen.

## Aufbau

```
FoodTracker/
├── app/      Expo / React Native App (iOS + Android, TypeScript, Expo Router)
│   ├── src/app/(tabs)/   Heute, Erfassen, Plan, Rezepte, Einkauf
│   ├── src/app/recipe/   Rezept-Detail, Editor, Import
│   └── src/i18n/         Übersetzungen (de, en, fr, it, es)
└── server/   Backend (Node, Hono, TypeScript)
    ├── src/planner/      Zero-Waste-Planer (Simulated Annealing + Resteverwertung)
    ├── src/ai/           Claude: Fotos, Kassenbons, Rezept-Import, Übersetzung, Rezeptvorschläge
    ├── src/social/       Instagram/TikTok-Beiträge laden (nur erlaubte Hosts)
    ├── src/community/    Geteilte Rezepte und Favoriten
    ├── src/delivery/     Lieferdienst-Schnittstelle + Demo-Anbieter
    ├── src/data/         104 Zutaten (5 Sprachen, Allergene, Packungen, Haltbarkeit) und 52 Rezepte
    └── scripts/          translate-ui: neue App-Sprache mit Claude erzeugen
```

Der API-Schlüssel für Claude liegt nur auf dem Server; die App spricht ausschließlich mit dem Backend.

## Starten

Voraussetzungen: Node.js 22+, für die App die **Expo Go**-App auf dem Handy oder ein iOS-/Android-Simulator.

```bash
# Backend
cd server
npm install
export ANTHROPIC_API_KEY=sk-ant-...   # für Fotos, Kassenbons, Import, Übersetzung, KI-Rezepte
export META_OEMBED_TOKEN=...          # optional: Instagram-oEmbed (APP_ID|CLIENT_TOKEN einer Meta-App)
npm start                              # http://localhost:3000, Community-Rezepte in data/community.json

# App (zweites Terminal)
cd app
npm install
EXPO_PUBLIC_API_URL=http://<IP-deines-Rechners>:3000 npx expo start
```

QR-Code mit der Kamera (iOS) bzw. Expo Go (Android) scannen. Auf einem echten Gerät muss
`EXPO_PUBLIC_API_URL` die LAN-IP des Rechners sein, nicht `localhost`.

Für App-Store-/Play-Store-Builds: `npx eas-cli@latest build --platform all`.

## Tests

```bash
cd server && npm test && npm run typecheck
cd app && npm run typecheck
```

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

Über 60 Testpläne (1–4 Personen, verschiedene Ernährungsformen) bleiben im Schnitt 0,3 %
der verderblichen Einkäufe übrig, im schlechtesten Fall 4 %.

## Instagram und TikTok

Die Plattformen erlauben kein offizielles Herunterladen von Videos. Der Import nutzt deshalb:

- **TikTok:** die öffentliche oEmbed-Schnittstelle (Beschreibung + Vorschaubild, ohne Schlüssel).
- **Instagram:** oEmbed mit Meta-App-Token, sonst die Vorschau-Metadaten der Seite. Je nach Beitrag
  liefert Instagram ohne Anmeldung wenig – dann die Caption in das Textfeld kopieren.
- **Gespeichertes Video (beide):** Die App schneidet 6 Einzelbilder aus dem Video, Claude liest
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

- Community-Rezepte liegen in einer JSON-Datei, Nutzer:innen sind nur über eine anonyme
  Geräte-ID unterschieden. Für den echten Betrieb braucht es Konten, eine Datenbank und Moderation.
- Nährwerte und Preise im Katalog sind gerundete Richtwerte; Preise in AT/CH sind grob umgerechnet.
- Rezepttexte im Katalog gibt es auf Deutsch und Englisch; andere Sprachen übersetzt Claude auf Knopfdruck.

## Nächste Schritte

- Echten Lieferdienst-Partner anbinden
- Nutzerkonten und Synchronisierung zwischen Geräten
- Zutatenkatalog an eine Produktdatenbank (z. B. Open Food Facts) anbinden, Barcode-Scan
- „Teilen“-Menü von Instagram/TikTok direkt in die App (Share Extension)
- Mehrere Lieferungen pro Plan für sehr verderbliche Zutaten (Fisch, Fleisch)
