# Promo-Clips für erste Tester

Drei Hochkant-Clips (1080×1920, H.264, ohne Ton, je unter 1 MB), aufgenommen aus der Web-Version der App.
Alle Inhalte stammen aus FoodTracker selbst; Bildnachweise der Rezeptfotos stehen in
[bildnachweise.md](bildnachweise.md).

| Clip | Länge | Inhalt |
|---|---|---|
| [01-monatsplan.mp4](01-monatsplan.mp4) | 20 s | Fragebogen → Monatsplan in einer Sekunde → Reste werden mitverplant |
| [02-einkaufsliste.mp4](02-einkaufsliste.mp4) | 16 s | Einkaufsliste abhaken, passende Packungen, eigene Liste pro Woche |
| [03-kochen-und-abhaken.mp4](03-kochen-und-abhaken.mp4) | 18 s | Rezept mit Foto → „Gegessen“ → Kalorien und Makros unter „Heute“ |

## Wo Interessierte die App testen können

**Link: https://bennitut.github.io/Bennitut/** – die Web-Version auf GitHub Pages. Erreichbar, sobald der
Workflow `.github/workflows/foodtracker-pages.yml` auf `feature/food-tracker-app` gelaufen ist (nach dem Mergen,
Einrichtung siehe Kopf der Workflow-Datei). Vor dem ersten Beitrag den Link einmal am Handy öffnen.
Den Link in die Bio bzw. Profilbeschreibung setzen; die Clips enden mit „Link in der Bio“.

Kurzanleitung für Tester (für Bio, angepinnten Kommentar oder Antwort auf Nachfragen):

1. Link am Handy öffnen – läuft im Browser, ohne Download und ohne Konto.
2. Unter „Plan“ die sechs Fragen beantworten und „Monatsplan erstellen“ tippen.
3. Einkaufsliste und Vorrat ausprobieren, Gerichte als „Gegessen“ abhaken.
4. Die Daten bleiben im Browser auf dem eigenen Gerät; es wird nichts hochgeladen.
5. Feedback gern als Kommentar oder Nachricht: Was fehlt, was nervt, welches Gericht passt nicht?

Foto- und Kassenbon-Erkennung, Rezept-Import und Community brauchen einen Server und sind in der Web-Version noch
nicht verfügbar – in den Beiträgen deshalb nicht versprechen.

## Beitragstexte

Hashtags sparsam (3–5) und passend zur Plattform. Musik nur aus der Bibliothek der jeweiligen Plattform, falls
gewünscht; die Clips selbst haben keinen Ton.

### Clip 1 – Monatsplan

- **TikTok:** Was koche ich diese Woche? 🤔 Sechs Fragen beantworten – und die App plant dir 30 Tage Essen samt
  Einkaufsliste. Reste werden gleich mitverplant. Kostenlos im Browser testen, Link in der Bio.
  `#mealprep #essensplan #wenigerwegwerfen #kochen`
- **Instagram (Reels):** Nie wieder „Was gibt’s heute?“ 🍽️ FoodTracker plant deinen ganzen Monat – passend zu
  Ernährungsweise, Allergien und Kochzeit. Gekaufte Packungen werden aufgebraucht, Reste wandern ins nächste Gericht.
  Ich suche gerade die ersten Tester:innen: Link in der Bio, kostenlos und ohne Konto.
  `#mealprep #essensplanung #zerowaste #vegetarisch`
- **YouTube Shorts:** Titel „30 Tage Essen planen in 1 Sekunde“ · Beschreibung: Sechs Fragen, ein Monatsplan mit
  Einkaufsliste – so geplant, dass möglichst nichts übrig bleibt. Kostenlos im Browser testen: https://bennitut.github.io/Bennitut/
  · Bildnachweise: Link auf bildnachweise.md

### Clip 2 – Einkaufsliste

- **TikTok:** Die Einkaufsliste, die sich selbst schreibt 🛒 Mengen und Packungsgrößen passen zum Plan, damit kaum
  etwas im Kühlschrank verdirbt. Link in der Bio zum Ausprobieren. `#einkaufsliste #wenigerwegwerfen #mealprep`
- **Instagram (Reels):** Einkaufen ohne Zettelchaos 🧾 Die Liste kommt direkt aus deinem Essensplan, mit
  Richtpreisen und Packungen, die aufgehen. Jede Woche eine eigene Liste. Teste die App kostenlos – Link in der Bio.
  `#einkaufsliste #zerowaste #haushalt #mealprep`
- **YouTube Shorts:** Titel „Diese Einkaufsliste plant gegen Lebensmittelverschwendung“ · Beschreibung: Mengen und
  Packungsgrößen passend zum Monatsplan, Woche für Woche. Kostenlos testen: https://bennitut.github.io/Bennitut/

### Clip 3 – Kochen und abhaken

- **TikTok:** Jeden Tag wissen, was es gibt – Rezept mit Foto, kochen, abhaken. Kalorien und Makros zählt die App
  mit ✅ Link in der Bio. `#kochen #kalorienzählen #mealprep #rezept`
- **Instagram (Reels):** Kochen, abhaken, fertig ✅ Geplante Gerichte landen mit einem Tipp im Ernährungstagebuch,
  inklusive Kalorien und Makros. Kostenlos im Browser testen – Link in der Bio. `#ernährung #kochen #rezepte #mealprep`
- **YouTube Shorts:** Titel „Essensplan, Rezept und Kalorien in einer App“ · Beschreibung: Rezept öffnen, kochen,
  als gegessen abhaken – das Tagebuch füllt sich von selbst. Kostenlos testen: https://bennitut.github.io/Bennitut/

## Clips neu aufnehmen

Wenn sich die Oberfläche ändert (dauert etwa drei Minuten, braucht Playwright, ffmpeg und die Schrift Inter):

```bash
cd FoodTracker/app && npm run web:export
cd ../marketing/clips && node make-clips.cjs        # alle Clips und bildnachweise.md
node make-clips.cjs 02-einkaufsliste                # nur einen Clip
```

Texteinblendungen und Abläufe stehen in `make-clips.cjs` (`CLIPS`). Aufgenommen wird auf Deutsch (Deutschland)
mit einem frischen Browserprofil; der Plan hängt vom Aufnahmetag ab.
