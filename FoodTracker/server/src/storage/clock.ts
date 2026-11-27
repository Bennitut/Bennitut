let last = 0;

/**
 * Zeitpunkt für neue Zeilen (ISO mit Millisekunden und „Z“), streng steigend innerhalb dieses Servers: Entstehen zwei
 * Zeilen in derselben Millisekunde, bekommt die zweite eine Millisekunde mehr. So zeigt `ORDER BY created_at` die
 * Reihenfolge des Eintragens – sonst entschiede bei Gleichstand die zufällige ID (z. B. welche von zwei Meldungen eines
 * Geräts beim Anmelden ins Konto wandert).
 */
export function nowIso(now = Date.now()): string {
  last = Math.max(now, last + 1);
  return new Date(last).toISOString();
}
