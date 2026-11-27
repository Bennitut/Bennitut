// Impressum und Datenschutzerklärung, wie App und Web-Version sie zeigen (Bildschirm src/app/legal.tsx).
//
// Quelle sind die Entwürfe in docs/recht/ (dort mit Erklärungen, Varianten und Quellen) – Änderungen an beiden Stellen
// nachziehen. Übernommen sind Impressum Variante B (Angaben nach § 5 E-Commerce-Gesetz und Offenlegung nach § 25
// Mediengesetz; Benjamins Entscheidung vom 24.11.2026) und Teil A der Datenschutzerklärung (ohne Server). Teil B und
// das Mindestalter erscheinen nur, wenn die App einen Server kennt – dort stehen die offenen Punkte noch als
// Platzhalter, und die App zeigt „Entwurf“.
// Rezeptfotos: Benjamin hat am 24.11.2026 „selbst ausliefern“ gewählt (Variante a). Abschnitt 4 beschreibt den Stand,
// bis alle Fotos aus dem eigenen Projekt kommen; danach anpassen (BACKLOG.md, Vorrang „Rezeptfotos selbst ausliefern“).
// Deine Angaben kommen aus angaben.ts; fehlt eine, steht dort ein Platzhalter [[ANGABE: …]]. Wie der Server läuft
// (Weg a oder b aus docs/SERVER-HOSTING.md, welche KI), steht dort unter BETRIEB – danach richten sich „Kurz gesagt“
// mit Server, B1 und B3. Angaben zu Cloudflare, Render, Neon und Anthropic: Stand laut deren Seiten, abgerufen am
// 27.11.2026 (Quellen in docs/recht/README.md).
import { contactLine, missingIn, orPlaceholder, type LegalSection, type Placeholder } from "../lib/legal";
import { ANGABEN, BETRIEB, type Angaben, type Betrieb } from "./angaben";

export interface LegalOptions {
  /** Ob die App einen Server nutzt (dann gilt Teil B der Datenschutzerklärung). */
  withServer: boolean;
}

export interface LegalDocuments {
  impressum: LegalSection[];
  datenschutz: LegalSection[];
}

function fields(a: Angaben) {
  const email = orPlaceholder(a.email, "E-Mail-Adresse");
  const strasse = orPlaceholder(a.strasse, "Straße");
  const hausnummer = orPlaceholder(a.hausnummer, "Hausnummer mit Stiege und Tür");
  const plz = orPlaceholder(a.plz, "Postleitzahl");
  const ort = orPlaceholder(a.ort, "Ort");
  return {
    name: orPlaceholder(a.name, "Vor- und Nachname"),
    /** Volle Anschrift in drei Zeilen: Straße mit Hausnummer, PLZ und Ort, Land. */
    anschrift: [`${strasse} ${hausnummer}`, `${plz} ${ort}`, "Österreich"].join("\n"),
    email: email.includes("[[") ? email : `[${email}](mailto:${email})`,
    kontakt: contactLine(a.zweiterKontakt, "Zweiter Kontaktweg, z. B. Telefonnummer"),
    stand: orPlaceholder(a.stand, "Datum („Stand“)"),
    webAdresse: orPlaceholder(a.webAdresse, "Adresse der Web-Version, z. B. bennitut.github.io"),
  };
}

const PHOTO_CREDIT =
  "**Bildnachweis:** Die Rezeptfotos stammen von Wikimedia Commons und Flickr und stehen unter freien Lizenzen " +
  "(CC BY, CC BY-SA, CC0) oder sind gemeinfrei. Urheber:in und Lizenz stehen jeweils unter dem Foto; ein Tipp darauf " +
  "öffnet die Originalseite.";

const PHOTO_IP_SUMMARY =
  "- Beim Aufruf der Web-Version und beim Laden der Rezeptfotos erfahren die Server von GitHub, Wikimedia und Flickr " +
  "technisch bedingt deine IP-Adresse (Abschnitte 3 und 4).";

// ── Betrieb des Servers (BETRIEB in angaben.ts): Platzhalter, solange nichts entschieden ist ─────────────────────────

const WEG_OFFEN =
  "[[ENTSCHEIDUNG: Weg des Servers aus docs/SERVER-HOSTING.md – in angaben.ts unter BETRIEB.weg eintragen: a = Laptop " +
  "mit Cloudflare Tunnel, b = Render mit Neon]]";
const KI_OFFEN =
  "[[ENTSCHEIDUNG: KI des Servers – in angaben.ts unter BETRIEB.ki eintragen: claude, ollama, ollama-laptop oder keine]]";
const KI_LAPTOP_NUR_B =
  "[[ENTSCHEIDUNG: „KI vom Laptop“ gibt es nur bei Weg b – bei Weg a läuft Ollama auf dem Server-Rechner selbst, dann " +
  "BETRIEB.ki = ollama]]";

/** Ob die KI-Anfragen von Render über Cloudflare Tunnel zu Ollama auf dem Laptop gehen („KI vom Laptop“). */
const aiViaTunnel = (b: Betrieb) => b.weg === "b" && b.ki === "ollama-laptop";

/**
 * Cloudflare Tunnel bei Weg a (alle Anfragen, mit der IP-Adresse deines Geräts) und bei „KI vom Laptop“ (nur die
 * KI-Anfragen, die der Server bei Render stellt).
 */
function cloudflareBlocks(what: string, withVisitorIp: boolean): string[] {
  return [
    `${what} über Cloudflare Tunnel, einen Dienst der Cloudflare, Inc. (San Francisco, USA): Die verschlüsselte ` +
      "Verbindung (https) endet bei Cloudflare, und Cloudflare leitet die Anfragen durch eine eigene verschlüsselte " +
      "Verbindung zu meinem Rechner weiter. Dabei verarbeitet Cloudflare die Anfragen samt Inhalt" +
      (withVisitorIp ? " und deine IP-Adresse" : "") +
      " als Auftragsverarbeiter nach seinem " +
      "[Auftragsverarbeitungsvertrag](https://www.cloudflare.com/cloudflare-customer-dpa/) (Fassung 6.4 vom 3. April " +
      "2026). Cloudflare betreibt Rechenzentren auf der ganzen Welt; für Übermittlungen in die USA nennt dieser Vertrag " +
      "das EU-U.S. Data Privacy Framework und die Standardvertragsklauseln der EU-Kommission.",
    "[[PRÜFEN: Der Vertrag mit Cloudflare gilt nur mit einem Cloudflare-Konto – ob er mit einem kostenlosen Konto schon " +
      "über die Nutzungsbedingungen zustande kommt, war aus der Cloud nicht lesbar. Ein Quick Tunnel ohne Konto ist laut " +
      "Cloudflare nur zum Testen gedacht: für Tester:innen mit echten Daten einen festen Tunnel mit Konto nehmen.]]",
  ];
}

/** B1: wo der Server läuft und wer daran beteiligt ist. */
function hostingBlocks(b: Betrieb): string[] {
  const noAccessLog =
    "Ein Zugriffsprotokoll führt der Server nicht; er vermerkt nur unerwartete Fehler und bei KI-Anfragen deren Art, " +
    "Dauer und Umfang – ohne Inhalte.";
  if (b.weg === "a") {
    return [
      "Der Server läuft auf meinem eigenen Rechner (einem Laptop); dort liegen auch die Datenbank und die Fotos (Galerie " +
        "der Rezepte, geteilte und eigene Rezepte). Ein Hoster ist nicht beteiligt.",
      ...cloudflareBlocks("Aus dem Internet erreichbar ist er", true),
      `${noAccessLog} Diese Meldungen zeigt er nur in seinem Fenster auf meinem Rechner an und speichert sie nicht.`,
    ];
  }
  if (b.weg === "b") {
    return [
      "Der Server läuft bei Render (Render Services, Inc., San Francisco, USA) in dessen Region Frankfurt am Main. Die " +
        "Datenbank (Konten, Sitzungen, Sicherungen und Abgleich, Community) und die Fotos (Galerie der Rezepte, geteilte und " +
        "eigene Rezepte) liegen bei Neon (Neon, LLC, ein Unternehmen der Databricks, Inc., USA), ebenfalls in der Region " +
        "Frankfurt am Main. Beide verarbeiten die Daten in meinem Auftrag (Art. 28 DSGVO).",
      "Mit Render gilt dessen [Auftragsverarbeitungsvertrag](https://render.com/dpa) (Stand 19. Dezember 2024) als Teil " +
        "der Nutzungsbedingungen. Laut diesem Vertrag verarbeitet Render Daten hauptsächlich in den USA; Übermittlungen " +
        "dorthin stützt Render auf das EU-U.S. Data Privacy Framework (Render ist seit 6. Jänner 2025 zertifiziert), " +
        "andernfalls auf die Standardvertragsklauseln der EU-Kommission.",
      "[[PRÜFEN: Vertrag zur Auftragsverarbeitung, Unterauftragsverarbeiter und Grundlage der Übermittlung in die USA bei " +
        "Neon – laut den Produktbedingungen von Neon vom 14. Oktober 2026 gelten die Verträge der Databricks, Inc.; deren " +
        "Auftragsverarbeitungsvertrag und Liste der Unterauftragsverarbeiter waren aus der Cloud nicht lesbar.]]",
      ...(aiViaTunnel(b) ? cloudflareBlocks("Für die KI-Funktionen (B3) erreicht der Server meinen Rechner", false) : []),
      `${noAccessLog} Diese Meldungen landen im Protokoll bei Render. [[PRÜFEN: Wie lange Render das Protokoll ` +
        "aufbewahrt und ob Render selbst Zugriffe mit IP-Adressen protokolliert – im Render-Konto bzw. in der Doku " +
        "nachsehen.]]",
    ];
  }
  return [
    `Der Server läuft ${WEG_OFFEN}. [[ANGABE: Vertrag zur Auftragsverarbeitung (Art. 28 DSGVO) mit dem Hoster]]. Er ` +
      "protokolliert [[ANGABE: welche Daten, z. B. IP-Adresse, Zeitpunkt, aufgerufene Adresse, Fehlermeldungen]] und " +
      "löscht die Protokolle nach [[ANGABE: Frist]].",
    "Fotos (Galerie der Rezepte, geteilte und eigene Rezepte) speichert der Server [[ANGABE: auf dem Server selbst oder " +
      "bei einem Objektspeicher-Anbieter – Name, Sitz, Standort der Server, Vertrag zur Auftragsverarbeitung]].",
  ];
}

/** Wohin die KI-Funktionen Daten schicken, in wenigen Worten; offen bzw. widersprüchlich als Platzhalter. */
function aiShort(b: Betrieb): string {
  if (b.ki === "claude") return "Claude von Anthropic";
  if (b.ki === "ollama") return "ein KI-Modell auf dem Server selbst";
  if (aiViaTunnel(b)) return "ein KI-Modell auf meinem Rechner, das der Server über Cloudflare erreicht";
  return b.ki === "ollama-laptop" ? KI_LAPTOP_NUR_B : KI_OFFEN;
}

/** „Kurz gesagt“, wenn die App einen Server nutzt (Teil B gilt). */
function summaryWithServer(b: Betrieb): string[] {
  const hosting =
    b.weg === "a"
      ? "auf meinem eigenen Rechner; aus dem Internet erreichbar ist er über Cloudflare (USA), das dabei die Anfragen und " +
        "deine IP-Adresse erhält"
      : b.weg === "b"
        ? "bei Render, Datenbank und Fotos liegen bei Neon – beides Unternehmen aus den USA; Server und Datenbank laufen in " +
          "der Region Frankfurt am Main"
        : WEG_OFFEN;
  const ai =
    b.ki === "keine"
      ? "- Dieser Server hat keine KI-Funktionen (B3)."
      : `- KI-Funktionen schicken Daten nur mit deiner Einwilligung an ${aiShort(b)} (B3).`;
  return [
    "- FoodTracker funktioniert ohne Konto und ohne Anmeldung.",
    "- Was du eingibst, bleibt auf deinem Gerät – bis auf das, was die Funktionen mit Server brauchen (Teil B): Dein " +
      "Ernährungstagebuch sichert FoodTracker automatisch auf dem Server (B6), geteilte Rezepte, öffentliche Fotos, " +
      "Bewertungen und Meldungen liegen dort (B4).",
    "- Mit einem Konto gleicht FoodTracker deine Daten über den Server zwischen deinen Geräten ab, auch Gesundheitsangaben " +
      "wie Unverträglichkeiten (B2, B7). Im Profil kannst du sie exportieren und mit dem Konto löschen.",
    ai,
    `- Den Server betreibe ich ${hosting} (B1).`,
    "- Keine Werbung, keine Analyse- oder Tracking-Werkzeuge, keine Cookies.",
    PHOTO_IP_SUMMARY,
  ];
}

/** B3: an wen die KI-Funktionen Daten schicken (Einleitung vor der Liste und Absätze danach). */
function aiRecipient(b: Betrieb): { intro: string; after: string[] } {
  if (b.ki === "claude") {
    return {
      intro: "Diese Funktionen schicken Daten über den Server an Claude, ein KI-Modell von Anthropic:",
      after: [
        "Vertragspartner ist die Anthropic Ireland, Limited, 6th Floor, South Bank House, Barrow Street, Dublin 4, " +
          "D04 TR29, Irland (laut den Commercial Terms von Anthropic für Kund:innen im Europäischen Wirtschaftsraum, " +
          "Stand 17. Juni 2025). Sie verarbeitet die Daten als Auftragsverarbeiter nach dem " +
          "[Auftragsverarbeitungsvertrag von Anthropic](https://www.anthropic.com/legal/data-processing-addendum) (Stand " +
          "24. Februar 2025), der Teil dieser Bedingungen ist, und darf sie laut den Bedingungen nicht zum Training ihrer " +
          "Modelle verwenden. Dabei können Daten auch in den USA verarbeitet werden (bei Anthropic, PBC oder " +
          "Unterauftragsverarbeitern); dafür sieht der Vertrag die Standardvertragsklauseln der EU-Kommission vor. Laut " +
          "Anthropic (Stand 1. Juli 2026) werden Eingaben und Ausgaben über die API nach spätestens 30 Tagen gelöscht – " +
          "außer z. B. bei Verstößen gegen die Nutzungsrichtlinien oder wenn das Gesetz eine längere Speicherung " +
          "verlangt. Fotos für die Erkennung speichert der Server nicht.",
      ],
    };
  }
  if (b.ki === "ollama-laptop" && b.weg === "b") {
    return {
      intro:
        "Diese Funktionen schicken Daten über den Server und Cloudflare Tunnel (B1) an ein KI-Modell (Ollama) auf meinem " +
        "eigenen Rechner:",
      after: [
        "Cloudflare leitet diese Anfragen samt Inhalt weiter (B1); an einen KI-Anbieter gehen die Daten nicht. Fotos für " +
          "die Erkennung speichert der Server nicht.",
      ],
    };
  }
  if (b.ki === "ollama") {
    return {
      intro: "Diese Funktionen schicken Daten an ein KI-Modell (Ollama), das auf demselben Rechner läuft wie der Server (B1):",
      after: ["Die Daten gehen dafür an keinen KI-Anbieter. Fotos für die Erkennung speichert der Server nicht."],
    };
  }
  return { intro: `Diese Funktionen schicken Daten über den Server an ${aiShort(b)}:`, after: [] };
}

/** Impressum, Variante B: Angaben nach § 5 E-Commerce-Gesetz und Offenlegung nach § 25 Mediengesetz. */
export function impressum(a: Angaben = ANGABEN): LegalSection[] {
  const f = fields(a);
  return [
    {
      title: "Impressum",
      level: 1,
      blocks: [
        "**Angaben gemäß § 5 E-Commerce-Gesetz und Offenlegung gemäß § 25 Mediengesetz**",
        ["Medieninhaber und Diensteanbieter:", f.name, f.anschrift].join("\n"),
        [`E-Mail: ${f.email}`, f.kontakt].join("\n"),
        "Gegenstand: Entwicklung und kostenlose Bereitstellung der App „FoodTracker“ zum Planen von Mahlzeiten ohne Reste",
        PHOTO_CREDIT,
        `Stand: ${f.stand}`,
      ],
    },
  ];
}

/** Datenschutzerklärung: Teil A immer, Teil B und das Mindestalter nur mit Server (`betrieb`: wie er läuft). */
export function datenschutz({ withServer }: LegalOptions, a: Angaben = ANGABEN, betrieb: Betrieb = BETRIEB): LegalSection[] {
  const f = fields(a);
  const sections: LegalSection[] = [
    { title: "Datenschutzerklärung", level: 1, blocks: [`Stand: ${f.stand}`] },
    {
      title: "Kurz gesagt",
      level: 2,
      blocks: withServer
        ? summaryWithServer(betrieb)
        : [
            "- FoodTracker funktioniert ohne Konto und ohne Anmeldung.",
            "- Was du in FoodTracker eingibst – Antworten aus dem Fragebogen, Monatsplan, Einkaufsliste, Vorrat, Tagebuch, " +
              "eigene Rezepte und Fotos – bleibt auf deinem Gerät. Ich bekomme diese Daten nicht.",
            "- Keine Werbung, keine Analyse- oder Tracking-Werkzeuge, keine Cookies.",
            PHOTO_IP_SUMMARY,
          ],
    },
    {
      title: "1. Verantwortlich",
      level: 2,
      blocks: [
        [f.name, f.anschrift, `E-Mail: ${f.email}`].join("\n"),
        "Fragen zum Datenschutz und Anfragen zu deinen Rechten (Abschnitt 6) bitte an diese E-Mail-Adresse.",
      ],
    },
    { title: "Teil A – FoodTracker heute (ohne Server)", level: 2, blocks: [] },
    {
      title: "2. Daten auf deinem Gerät",
      level: 3,
      blocks: [
        "FoodTracker speichert auf deinem Gerät – in der App in ihrem eigenen Speicher, in der Web-Version im lokalen " +
          "Speicher des Browsers („Local Storage“) für die Adresse der Web-Version:",
        "- deine Antworten aus dem Fragebogen: Ernährungsweise, Speiseregeln (z. B. halal oder koscher), Unverträglichkeiten " +
          "und Abneigungen, Ziel, Angaben zur Berechnung des Kalorienbedarfs (Geschlecht, Alter, Größe, Gewicht, " +
          "Aktivität), Personen, Mahlzeiten, Kochzeit, Lieblingsküchen, Budget und Abwechslung,",
        "- Monatsplan, Einkaufsliste mit Abgehaktem, Vorrat und Tagebuch (gegessene Mahlzeiten mit Nährwerten),",
        "- eigene Rezepte und Fotos, Favoriten, Sprache, Region und einen selbst gewählten Anzeigenamen,",
        "- eine zufällig erzeugte Geräte-Kennung (ohne Server wird sie nirgendwohin geschickt), eine unter Profil → " +
          "Server eingetragene Server-Adresse mit einer eigenen Geräte-Kennung je Adresse und",
        "- in der Web-Version, ob du den Hinweis „Als App nutzen“ mit „Später“ ausgeblendet hast.",
        "Im Profil kannst du deine Ernährungshistorie als Datei speichern („Als Tabelle (CSV)“ oder „Als Sicherung " +
          "(JSON)“) und eine solche Sicherung wieder importieren. Die Datei landet dort, wo du sie speicherst oder hin " +
          "teilst – FoodTracker schickt sie nirgendwohin.",
        "Diese Daten verlassen dein Gerät nicht; ich habe keinen Zugriff darauf. Einige davon sind sensibel " +
          "(Unverträglichkeiten und Körperdaten sind Gesundheitsdaten, Speiseregeln können auf deine Religion schließen " +
          "lassen) – auch sie bleiben ausschließlich auf deinem Gerät.",
        "Das Speichern auf deinem Gerät ist nötig, damit FoodTracker überhaupt funktioniert (dein Plan soll nach dem " +
          "Schließen noch da sein). Dafür braucht es keine Einwilligung (§ 165 Abs. 3 TKG 2021: Speichern, das für einen " +
          "ausdrücklich gewünschten Dienst unbedingt erforderlich ist).",
        "**Löschen:** Die Daten bleiben, bis du sie löschst – in der App, indem du sie deinstallierst, in der Web-Version, " +
          `indem du im Browser die Websitedaten für ${f.webAdresse} löschst.`,
      ],
    },
    {
      title: "3. Web-Version: Bereitstellung über GitHub Pages",
      level: 3,
      blocks: [
        "Die Web-Version liegt bei GitHub Pages, einem Dienst von GitHub (GitHub B.V., Prins Bernhardplein 200, " +
          "1097 JB Amsterdam, Niederlande, und GitHub, Inc., 88 Colin P. Kelly Jr. St., San Francisco, CA 94107, USA). " +
          "Beim Aufruf schickt dein Browser technisch bedingt deine IP-Adresse und übliche Angaben wie Browser und " +
          "Betriebssystem an GitHub. Laut GitHub wird beim Besuch einer GitHub-Pages-Seite die IP-Adresse protokolliert " +
          "und zu Sicherheitszwecken gespeichert. Auf diese Protokolle habe ich keinen Zugriff.",
        "GitHub gibt an, für Übermittlungen in die USA nach dem EU-U.S. Data Privacy Framework zertifiziert zu sein und " +
          "außerdem Standardvertragsklauseln der EU-Kommission zu nutzen. Mehr in der " +
          "[Datenschutzerklärung von GitHub](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).",
        "Rechtsgrundlage ist mein berechtigtes Interesse, die Web-Version sicher und kostenlos bereitzustellen " +
          "(Art. 6 Abs. 1 lit. f DSGVO).",
      ],
    },
    {
      title: "4. Rezeptfotos von Wikimedia Commons und Flickr",
      level: 3,
      blocks: [
        "Die Fotos der Katalogrezepte werden direkt von den Servern von Wikimedia Commons (upload.wikimedia.org) und " +
          "Flickr (live.staticflickr.com) geladen, sobald eine Liste oder ein Rezept mit Foto erscheint. Dabei erhalten " +
          "diese Dienste deine IP-Adresse, Angaben zu Browser bzw. Gerät und in der Web-Version gegebenenfalls die " +
          "Adresse der Web-Version, von der aus das Foto geladen wird.",
        "- **Wikimedia Commons** betreibt die Wikimedia Foundation, Inc. (USA).",
        "- **Flickr** betreibt Flickr, Inc., 548 Market St, STE 32047, San Francisco, CA 94104-5401, USA. Laut seiner " +
          "[Datenschutzerklärung](https://www.flickr.com/help/privacy-policy) protokolliert Flickr dabei unter anderem " +
          "die IP-Adresse.",
        "Beide sitzen in den USA. Rechtsgrundlage ist mein berechtigtes Interesse an einer ansprechenden Darstellung der " +
          "Rezepte (Art. 6 Abs. 1 lit. f DSGVO).",
        "Urheber:in und Lizenz stehen unter jedem Foto; ein Tipp darauf öffnet die Originalseite (dann gilt dort die " +
          "Datenschutzerklärung des jeweiligen Dienstes).",
      ],
    },
    {
      title: "5. Links, Kamera und Fotos",
      level: 3,
      blocks: [
        "- **Links zu anderen Diensten:** Kochvideos und Suchen bei YouTube, TikTok und Instagram sowie die " +
          "Originalseiten der Fotos öffnet FoodTracker nur, wenn du darauf tippst – dann im Browser bzw. in der App des " +
          "Dienstes, und es gilt dessen Datenschutzerklärung. FoodTracker bettet keine Videos ein.",
        "- **Kamera und Fotos (App):** FoodTracker fragt nur nach Zugriff auf Kamera bzw. Fotos, wenn du ein Foto " +
          "aufnehmen oder auswählen willst. Eigene Rezeptfotos werden verkleinert und auf deinem Gerät gespeichert " +
          "(Abschnitt 2). " +
          (withServer
            ? "Das Erkennen von Mahlzeiten und Kassenbons läuft über den Server (Teil B, B3)."
            : "Das Erkennen von Mahlzeiten und Kassenbons braucht den Server und ist heute noch nicht verfügbar."),
        "- **Kein Tracking:** keine Werbung, keine Analyse- oder Tracking-Werkzeuge, keine Cookies, kein Verkauf von " +
          "Daten. Der Monatsplan wird auf deinem Gerät berechnet; er ist ein Vorschlag, keine automatisierte Entscheidung " +
          "im Sinne von Art. 22 DSGVO.",
      ],
    },
  ];

  if (withServer) sections.push(...partB(betrieb));

  let number = 6;
  sections.push({
    title: `${number++}. Deine Rechte`,
    level: 2,
    blocks: [
      "Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der " +
        "Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch gegen Verarbeitungen auf Grundlage " +
        "berechtigter Interessen (Art. 21). Eine Einwilligung kannst du jederzeit mit Wirkung für die Zukunft widerrufen " +
        "(Art. 7 Abs. 3). Schreib dafür an die E-Mail-Adresse in Abschnitt 1. Daten, die nur auf deinem Gerät liegen " +
        "(Abschnitt 2), kann ich nicht einsehen – die löschst du selbst.",
      "Du kannst dich bei der Datenschutzbehörde beschweren:\nÖsterreichische Datenschutzbehörde, Barichgasse 40–42, " +
        "1030 Wien, Telefon +43 1 521 52 25 69, E-Mail [dsb@dsb.gv.at](mailto:dsb@dsb.gv.at), " +
        "[www.dsb.gv.at](https://www.dsb.gv.at)",
    ],
  });
  if (withServer) {
    // Kein Mindestalter (Benjamins Entscheidung vom 24.11.2026, nachdem er die Folgen kannte), aber der Hinweis zur
    // Zustimmung eines Elternteils – so steht er auch bei der Registrierung und vor der ersten KI-Funktion.
    sections.push({
      title: `${number++}. Mindestalter`,
      level: 2,
      blocks: [
        "FoodTracker hat kein Mindestalter und fragt nicht nach deinem Alter – auch Konto und KI-Funktionen stehen allen " +
          "offen. Bist du unter 14, brauchst du für ein Konto und die KI-Funktionen die Zustimmung eines Elternteils; für " +
          "Gesundheitsangaben wie Allergien oder dein Ernährungstagebuch gilt das bis 18 (§ 4 Abs. 4 DSG, Art. 8 und 9 " +
          "DSGVO). Darauf weist FoodTracker bei der Registrierung und vor der ersten Nutzung der KI-Funktionen hin.",
      ],
    });
  }
  sections.push({
    title: `${number++}. Änderungen`,
    level: 2,
    blocks: [
      "Ändert sich FoodTracker – etwa wenn die Funktionen mit Server starten –, passe ich diese Datenschutzerklärung an. " +
        "Es gilt die jeweils hier veröffentlichte Fassung.",
    ],
  });
  return sections;
}

/** Teil B: Funktionen mit Server – noch mit Platzhaltern, bis ein Server für andere läuft. */
function partB(b: Betrieb): LegalSection[] {
  const ai = aiRecipient(b);
  return [
    {
      title: "Teil B – Funktionen mit Server",
      level: 2,
      blocks: ["[[ENTSCHEIDUNG: Teil B vervollständigen, bevor ein Server für andere läuft – bis dahin nur zum Testen.]]"],
    },
    {
      title: "B1. Server",
      level: 3,
      blocks: [
        ...hostingBlocks(b),
        "Gegen Missbrauch – etwa das Durchprobieren von Passwörtern oder massenhafte KI-Anfragen – zählt der Server " +
          "Anfragen je IP-Adresse (bei Anfragen über Cloudflare die Adresse, die Cloudflare meldet) und je Konto. Diese " +
          "Zähler liegen nur im Arbeitsspeicher, nicht in der Datenbank, und verschwinden nach höchstens etwa einer Stunde " +
          "bzw. beim Neustart. In sein eigenes Protokoll schreibt der Server keine IP-Adressen, E-Mail-Adressen, " +
          "Passwörter oder Tokens. Rechtsgrundlage ist mein berechtigtes Interesse an einem sicheren Betrieb (Art. 6 " +
          "Abs. 1 lit. f DSGVO).",
        "Mit jeder Anfrage schickt FoodTracker die zufällige Geräte-Kennung aus Abschnitt 2. Sie enthält keinen Namen und " +
          "dient dazu, Favoriten, Bewertungen, eigene Fotos und geteilte Rezepte deinem Gerät zuzuordnen – bis du dich " +
          "anmeldest, dann gehören sie deinem Konto (B2).",
        "Für den Monatsplan mit Wünschen schickt FoodTracker deine Planungsangaben an den Server (Ernährungsweise, " +
          "Unverträglichkeiten, Speiseregeln, Abneigungen, Kalorien pro Person, Mahlzeiten, Vorrat, Favoriten); der " +
          "Server rechnet den Plan und speichert diese Angaben nicht.",
        "Unter 👤 Profil → Server kannst du eine andere Server-Adresse eintragen. Dann gehen die Daten aus Teil B an den " +
          "Server unter dieser Adresse; verantwortlich dafür ist, wer ihn betreibt – diese Datenschutzerklärung gilt " +
          "dafür nicht. Vor dem Wechsel fragt FoodTracker dort nur, ob ein FoodTracker-Server antwortet (ohne " +
          "Geräte-Kennung und ohne Anmeldung). Beim Wechsel meldet dich FoodTracker ab und nutzt dort eine eigene " +
          "Geräte-Kennung, damit der andere Server die für diesen Server nicht erfährt. Die eingetragene Adresse bleibt " +
          "auf deinem Gerät.",
      ],
    },
    {
      title: "B2. Konto (freiwillig)",
      level: 3,
      blocks: [
        "FoodTracker funktioniert auch ohne Konto. Für ein Konto meldest du dich mit E-Mail-Adresse und Passwort oder mit " +
          "Apple bzw. Google an. Der Server speichert: die Anmeldeart, deine E-Mail-Adresse (bei Apple auf Wunsch eine " +
          "Weiterleitungsadresse), bei Apple und Google deine Kennung beim Anbieter, deinen Namen, deine Rolle, ob das " +
          "Konto gesperrt ist, sowie Zeitpunkt der Registrierung und der letzten Anmeldung. Dein Passwort speichert er " +
          "nicht, nur einen Prüfwert (scrypt), mit dem er es bei der Anmeldung prüft. Für „Passwort vergessen?“ schickt " +
          "er einen Code an deine E-Mail-Adresse [[ANGABE: Mail-Dienst, über den der Server sendet, z. B. Gmail]] und " +
          "speichert davon höchstens 30 Minuten lang nur einen Prüfwert. Von Sitzungen speichert er nur einen Prüfwert " +
          "des Sitzungsschlüssels; eine Sitzung gilt 30 Tage. Auf deinem Gerät liegt die Anmeldung im Schlüsselbund bzw. " +
          "Keystore, im Browser in localStorage.",
        "Meldest du dich an, gehört dem Konto danach auch, was dieses Gerät vorher ohne Konto auf dem Server gespeichert " +
          "hat: Fotos, Sterne, geteilte Rezepte, Favoriten, Meldungen und die Sicherung deines Tagebuchs (B4, B6). Die " +
          "Sicherung unter der Geräte-Kennung wird dabei gelöscht.",
        "Im Nutzerverzeichnis sehen andere angemeldete Nutzer:innen deinen Namen, deine Rolle, seit wann du dabei bist " +
          "und wie viele Fotos und Rezepte du geteilt hast – nicht deine E-Mail-Adresse. Admins sehen im Admin-Bereich " +
          "zusätzlich E-Mail-Adresse und letzte Anmeldung.",
        "Im Profil unter „Konto verwalten“ kannst du dein Passwort ändern, alles, was der Server zu deinem Konto " +
          "speichert, als Datei herunterladen („Meine Daten exportieren“) und dein Konto löschen – mit allem, was der " +
          "Server dazu speichert (Sicherung des Tagebuchs, Plan, Einkaufsliste, Vorrat und Essgewohnheiten, geteilte " +
          "Rezepte, Favoriten, Fotos, Sterne und Meldungen). Auf deinem Gerät bleibt dabei alles erhalten.",
        "Rechtsgrundlage: Bereitstellung des gewünschten Kontos (Art. 6 Abs. 1 lit. b DSGVO). Speicherdauer: bis du dein " +
          "Konto löschst.",
      ],
    },
    {
      title: "B3. KI-Funktionen",
      level: 3,
      blocks:
        b.ki === "keine"
          ? [
              "Dieser Server bietet keine KI-Funktionen an: Mahlzeit und Kassenbon erkennen, Rezepte importieren, " +
                "übersetzen, „Text mit KI verbessern“ und Wünsche im Plan melden dann, dass keine KI eingerichtet ist, und " +
                "FoodTracker schickt dafür nichts an eine KI.",
            ]
          : [
              ai.intro,
              "- Mahlzeit fotografieren: das Foto und die Sprache",
              "- Kassenbon fotografieren: das Foto und die Sprache",
              "- Rezept aus TikTok oder Instagram übernehmen: Beschreibung des Beitrags, Vorschaubild und ausgewählte " +
                "Einzelbilder des Videos",
              "- Rezept übersetzen: Name, Schritte und Gewürze des Rezepts, Zielsprache",
              "- „Text mit KI verbessern“: Name, Zutaten mit Mengen, Schritte, Kochzeit und was du am Rezept bemängelst",
              "- Monatsplan mit Wünschen: nur der Text, den du ins Wunschfeld schreibst, und die Sprache",
              ...ai.after,
              "Rechtsgrundlage: deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO). Schreibst du Gesundheitsangaben in ein " +
                "Wunschfeld oder zeigt ein Foto solche, gilt zusätzlich Art. 9 Abs. 2 lit. a DSGVO (ausdrückliche " +
                "Einwilligung). FoodTracker fragt vor der ersten Nutzung einer KI-Funktion danach und schickt ohne deine " +
                "Zustimmung nichts an die KI; ändert sich, was an wen geht, fragt FoodTracker erneut. Im Profil unter " +
                "„KI-Funktionen“ kannst du die Einwilligung jederzeit mit Wirkung für die Zukunft widerrufen; vor der " +
                "nächsten KI-Funktion fragt FoodTracker dann wieder. Zum Alter siehe Abschnitt „Mindestalter“.",
              "Für den Rezept-Import fragt der Server mit dem Link, den du eingibst, die öffentliche Schnittstelle von " +
                "TikTok (tiktok.com) bzw. von Meta für Instagram (graph.facebook.com) ab. Deine IP-Adresse erfahren diese " +
                "Dienste dabei nicht, die Anfrage stellt der Server.",
            ],
    },
    {
      title: "B4. Community, Fotos, Bewertungen und Meldungen",
      level: 3,
      blocks: [
        "- **Rezepte teilen:** Geteilte Rezepte sind für alle sichtbar, mit deinem Anzeigenamen. Favoriten anderer zählen " +
          "als „Likes“ (gespeichert wird die Geräte-Kennung bzw. das Konto).",
        "- **Fotos:** Öffentliche Fotos (verkleinert) erscheinen mit deinem Anzeigenamen in der Galerie des Rezepts und " +
          "können bewertet werden; das bestbewertete Foto sehen alle als Rezeptbild. Der Server speichert sie als " +
          "Bilddateien, ebenso das Foto eines geteilten Rezepts. Fotos mit „Nur ich“ bleiben auf deinem Gerät.",
        "- **Sterne für Rezepte** werden je Gerät bzw. Konto gespeichert und nur als Durchschnitt angezeigt.",
        "- **„Problem melden“:** gespeichert werden Rezept, Grund, deine Notiz und die Geräte-Kennung bzw. das Konto.",
        "- Admins können Fotos, geteilte Rezepte und Meldungen sehen und löschen sowie Konten sperren.",
        "Du kannst eigene Fotos und geteilte Rezepte selbst löschen; der Server löscht dabei auch die Bilddateien. " +
          "Rechtsgrundlage: Bereitstellung der gewünschten Funktion (Art. 6 Abs. 1 lit. b DSGVO), bei Meldungen und " +
          "Moderation mein berechtigtes Interesse an richtigen Rezepten und an einer Community ohne Missbrauch (Art. 6 " +
          "Abs. 1 lit. f DSGVO). [[ANGABE: Speicherdauer]]",
      ],
    },
    {
      title: "B5. Lieferdienst",
      level: 3,
      blocks: [
        "[[ANGABE: Anbieter und was übermittelt wird (Einkaufsliste, Lieferadresse …). Heute gibt es nur einen " +
          "Demo-Lieferdienst ohne echte Lieferung.]]",
      ],
    },
    {
      title: "B6. Sicherung der Ernährungshistorie",
      level: 3,
      blocks: [
        "Sobald FoodTracker einen Server erreicht, sichert es dein Tagebuch dort automatisch: Tag und Uhrzeit, Name des " +
          "Gerichts, Kalorien, Eiweiß, Kohlenhydrate und Fett, woher der Eintrag stammt (Foto, Plan, von Hand) und wann er " +
          "zuletzt geändert wurde. Bist du angemeldet, gehört die Sicherung zu deinem Konto – so kommt deine Historie auf " +
          "einem neuen Gerät oder nach dem Löschen der Browserdaten zurück –, sonst zur zufälligen Geräte-Kennung aus " +
          "Abschnitt 2. Meldest du dich an, wandert die Sicherung der Geräte-Kennung in dein Konto (B2). Löschst du einen " +
          "Eintrag, löscht FoodTracker ihn auch auf dem Server; dort bleibt nur eine Löschmarke (Kennung des Eintrags und " +
          "Zeitpunkt, ohne Inhalt), damit er von deinen anderen Geräten nicht zurückkommt.",
        "Rechtsgrundlage: [[ENTSCHEIDUNG: Bereitstellung der gewünschten Sicherung (Art. 6 Abs. 1 lit. b DSGVO) oder – " +
          "wenn die Einträge als Gesundheitsdaten gelten – deine ausdrückliche Einwilligung (Art. 6 Abs. 1 lit. a und " +
          "Art. 9 Abs. 2 lit. a DSGVO).]] Speicherdauer: [[ANGABE: z. B. bis du dein Konto löschst]]",
        "Unabhängig vom Server kannst du deine Historie im Profil jederzeit als Datei speichern und wieder importieren " +
          "(Abschnitt 2).",
      ],
    },
    {
      title: "B7. Plan, Einkaufsliste, Vorrat, eigene Rezepte, Fotos und Essgewohnheiten (mit Konto)",
      level: 3,
      blocks: [
        "Bist du angemeldet, gleicht FoodTracker diese Daten zwischen deinen Geräten ab, damit du überall denselben Stand " +
          "hast: deine Antworten aus dem Fragebogen (Abschnitt 2, auch Unverträglichkeiten und Körperdaten), Sprache, " +
          "Region und Anzeigename, den Monatsplan mit den Rezepten, die nur darin vorkommen, was du darin als gegessen, " +
          "eingekauft und in den Vorrat gebucht abgehakt hast, deinen Vorrat (Zutat, Einkaufstag, Menge), deine eigenen " +
          "und importierten Rezepte samt Foto (und ob du sie in der Community geteilt hast), deine Favoriten (bei " +
          "Community-Rezepten mit der gespeicherten Kopie), die Rezepttexte, die die KI für dich übersetzt oder " +
          "verbessert hat, und deine eigenen Fotos aus der Galerie eines Rezepts (zu welchem Rezept, wann aufgenommen, " +
          "ob öffentlich). Der Server speichert sie zu deinem Konto, je Eintrag mit dem Zeitpunkt der letzten Änderung; " +
          "Gelöschtes bleibt als Löschmarke ohne Inhalt, damit es von anderen Geräten nicht zurückkommt. Häkchen eines " +
          "abgelösten Plans löscht er. Ohne Konto bleiben diese Daten auf deinem Gerät.",
        "Fotos eigener Rezepte und Fotos aus der Galerie, die du mit „Nur ich“ gespeichert hast, legt der Server als " +
          "Bilddatei zu deinem Konto ab, nicht in der Datenbank. Abrufbar sind sie über eine zufällige, nicht erratbare " +
          "Adresse, die nur deine Geräte bekommen; löschst du das Rezept bzw. das Foto oder ersetzt es, löscht der Server " +
          "die Datei. Auf dem Gerät, auf dem du das Foto aufgenommen hast, bleibt es zusätzlich gespeichert. Von " +
          "öffentlichen Fotos merkt sich der Server nur, welches Foto der Galerie (B4) deines ist; das Foto selbst liegt " +
          "dort einmal.",
        "[[PRÜFEN: Unverträglichkeiten und Körperdaten sind Gesundheitsdaten (Art. 9 DSGVO). Sicherer Weg wie bei B6: den " +
          "Abgleich erst nach einer ausdrücklichen Einwilligung starten und im Profil abschaltbar machen. Heute beginnt " +
          "er mit der Anmeldung – vor einem Server für andere klären.]]",
        "Rechtsgrundlage: [[ENTSCHEIDUNG: Bereitstellung des gewünschten Abgleichs (Art. 6 Abs. 1 lit. b DSGVO), für die " +
          "Gesundheitsdaten deine ausdrückliche Einwilligung (Art. 9 Abs. 2 lit. a DSGVO), siehe oben.]] Speicherdauer: " +
          "bis du dein Konto löschst; „Meine Daten exportieren“ enthält diese Daten (B2).",
      ],
    },
  ];
}

/** Beide Texte für diese App bzw. diesen Build. */
export function legalDocuments(options: LegalOptions, angaben: Angaben = ANGABEN, betrieb: Betrieb = BETRIEB): LegalDocuments {
  return { impressum: impressum(angaben), datenschutz: datenschutz(options, angaben, betrieb) };
}

/** Was in den angezeigten Texten noch fehlt (leer = fertig, kein „Entwurf“). */
export function missingLegalInfo(options: LegalOptions, angaben: Angaben = ANGABEN, betrieb: Betrieb = BETRIEB): Placeholder[] {
  const docs = legalDocuments(options, angaben, betrieb);
  return missingIn([...docs.impressum, ...docs.datenschutz]);
}
