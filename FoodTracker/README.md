# FoodTracker

App für iOS und Android zum Tracken von Essen, mit automatischen Ernährungsplänen,
die so geplant werden, dass **keine Reste übrig bleiben**.

## Funktionen

| Bereich | Was passiert |
|---|---|
| **Foto einer Mahlzeit** | Claude erkennt die Lebensmittel, schätzt Mengen und Nährwerte → Eintrag im Tagebuch. |
| **Foto eines Kassenbons** | Claude liest jede Position, ordnet sie Zutaten zu und rechnet Mengen um → Vorrat. |
| **Ernährungsplan** | Plant Frühstück, Mittag- und Abendessen für 1–14 Tage passend zum Kalorienbedarf. Optional schlägt Claude neue Rezepte nach Wunsch vor. |
| **Zero Waste** | Rezepte werden so kombiniert, dass gekaufte Packungen aufgebraucht werden; vorhandene Vorräte kommen zuerst dran; Verderbliches wird nur innerhalb der Haltbarkeit eingeplant. Übrig gebliebene Reste werden als „♻️ Reste mitverwenden“ auf passende Gerichte verteilt. |
| **Lieferdienst** | Die Einkaufsliste wird mit einem Tipp bestellt. Gelieferte Ware landet automatisch im Vorrat. |
| **Automatisches Tracking** | Hakt man eine geplante Mahlzeit als „Gegessen“ ab, wird sie ins Tagebuch übernommen und die Zutaten werden vom Vorrat abgezogen. |

Kreislauf: **Plan → Einkaufsliste → Bestellung → Vorrat → Kochen/Essen → Tagebuch.**

## Aufbau

```
FoodTracker/
├── app/      Expo / React Native App (iOS + Android, TypeScript, Expo Router)
│   └── src/app/          Tabs: Heute, Erfassen, Plan, Einkauf
└── server/   Backend (Node, Hono, TypeScript)
    ├── src/planner/      Zero-Waste-Planer (lokale Suche + Resteverwertung)
    ├── src/ai/           Claude: Mahlzeiten-Fotos, Kassenbons, Rezeptvorschläge
    ├── src/delivery/     Lieferdienst-Schnittstelle + Demo-Anbieter
    └── src/data/         Zutaten (Packungsgrößen, Preise, Haltbarkeit) und Rezepte
```

Der API-Schlüssel für Claude liegt nur auf dem Server; die App spricht ausschließlich mit dem Backend.

## Starten

Voraussetzungen: Node.js 22+, für die App die **Expo Go**-App auf dem Handy oder ein iOS-/Android-Simulator.

```bash
# Backend
cd server
npm install
export ANTHROPIC_API_KEY=sk-ant-...   # nur für Foto-/Bon-Erkennung und KI-Rezepte nötig
npm start                              # http://localhost:3000

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

1. Für jede Mahlzeit kommen nur passende Rezepte in Frage (Frühstück/Mittag/Abend, Ernährungsfilter).
2. Eine Kostenfunktion bewertet einen Plan: übrig bleibende Anteile verderblicher Packungen
   (stark gewichtet), ungenutzte Vorräte, Einplanung nach Ablauf der Haltbarkeit,
   Abweichung vom Kalorienziel, Wiederholungen und Preis.
3. Lokale Suche (Rezept austauschen / zwei Mahlzeiten tauschen) mit mehreren Neustarts
   und festem Seed minimiert diese Kosten – reproduzierbar.
4. Portionsgrößen werden pro Tag so skaliert (0,7–1,5×), dass der Kalorienbedarf passt.
5. Was danach noch übrig wäre, wird auf Gerichte verteilt, die die Zutat schon enthalten
   (max. +50 % pro Gericht und höchstens bis 115 % des Kalorienziels pro Tag).

Im Beispiel (7 Tage, 1–4 Personen, 2000 kcal) bleiben so unter 1 % der verderblichen Einkäufe übrig.
Lange haltbare Reste (Reis, Nudeln, Öl …) gelten nicht als Verschwendung, sondern wandern in den Vorrat.

## Lieferdienste anbinden

Deutsche Lebensmittel-Lieferdienste (REWE, Knuspr, Picnic, Flink …) bieten keine offenen
Bestell-Schnittstellen; eine echte Anbindung braucht einen Partnervertrag mit dem Anbieter.
Dafür gibt es das Interface `DeliveryProvider` in `server/src/delivery/providers.ts`:
pro Anbieter eine Klasse mit `createCart` (Warenkorb anlegen, Checkout-Link zurückgeben)
und `getOrder` (Lieferstatus). Bis dahin simuliert der **Demo-Lieferdienst** Bestellung und Lieferung.

## Nächste Schritte

- Echten Lieferdienst-Partner anbinden
- Nutzerkonten und Synchronisierung zwischen Geräten (derzeit lokal auf dem Gerät gespeichert)
- Zutatenkatalog erweitern bzw. an eine Produktdatenbank (z. B. Open Food Facts) anbinden
- Barcode-Scan für verpackte Lebensmittel
- Mehrere Lieferungen pro Plan für sehr verderbliche Zutaten (Fisch, Fleisch)
