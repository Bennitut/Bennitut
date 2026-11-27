// Gerätedaten ins Konto: Nach jeder Anmeldung fragt die App den Server einmal (POST /api/auth/claim-device), damit
// Fotos, Sterne, geteilte Rezepte, Favoriten, Meldungen und die Sicherung des Tagebuchs, die dieses Gerät ohne Konto
// auf dem Server hat, danach dem Konto gehören – ohne Doppeltes (Regeln im Server). Das Tagebuch auf dem Gerät geht
// ohnehin beim ersten Abgleich mit dem Konto ganz hoch (lib/diary.ts). Hier nur die Regeln ohne native Module.

/** Was der Server übernommen hat, je Art die Anzahl. */
export interface DeviceClaim {
  recipes: number;
  likes: number;
  photos: number;
  ratings: number;
  flags: number;
  diary: number;
}

/**
 * Ob die Daten dieses Geräts noch ins angemeldete Konto müssen. `claimedFor`: Konto, für das es zuletzt geklappt hat
 * (gespeichert, damit es nicht bei jedem Start wieder passiert). Jede An- und Abmeldung setzt es auf null zurück
 * (store.tsx, setAuth) – so übernimmt die nächste Anmeldung auch, was in der Zeit ohne Konto dazugekommen ist.
 */
export const needsDeviceClaim = (accountId: string | null, claimedFor: string | null | undefined): boolean =>
  accountId !== null && claimedFor !== accountId;

/** Ob überhaupt etwas übernommen wurde – nur dann zeigt das Profil einmal einen Hinweis. */
export const claimedAnything = (claim: Partial<DeviceClaim> | null | undefined): boolean =>
  !!claim && Object.values(claim).some((n) => typeof n === "number" && n > 0);
