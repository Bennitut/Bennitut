import { createTransport } from "nodemailer";

/** Versand von E-Mails (bisher nur der Code zum Zurücksetzen des Passworts); in Tests ein Nachbau. */
export interface Mailer {
  send(message: { to: string; subject: string; text: string }): Promise<void>;
}

/**
 * SMTP aus server/.env (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE). Ohne SMTP_HOST und
 * SMTP_FROM gibt es keinen Versand – dann blendet die App „Passwort vergessen?“ aus.
 */
export function mailerFromEnv(env: NodeJS.ProcessEnv = process.env): Mailer | null {
  const host = env.SMTP_HOST?.trim();
  const from = env.SMTP_FROM?.trim();
  if (!host || !from) return null;
  const port = Number(env.SMTP_PORT ?? 587);
  const transport = createTransport({
    host,
    port,
    // Port 465 spricht von Anfang an TLS, 587 wechselt mit STARTTLS (dann SMTP_SECURE weglassen).
    secure: env.SMTP_SECURE ? env.SMTP_SECURE === "1" || env.SMTP_SECURE === "true" : port === 465,
    requireTLS: port !== 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? "" } : undefined,
  });
  return {
    async send(message) {
      await transport.sendMail({ from, ...message });
    },
  };
}

const RESET_TEXTS: Record<string, { subject: string; text: (code: string, minutes: number) => string }> = {
  de: {
    subject: "FoodTracker: Code zum Zurücksetzen deines Passworts",
    text: (code, minutes) =>
      `Hallo,\n\njemand (hoffentlich du) möchte das Passwort deines FoodTracker-Kontos zurücksetzen.\n\nDein Code: ${code}\n\nGib ihn in der App ein. Er gilt ${minutes} Minuten und nur einmal. Warst du das nicht, ignoriere diese E-Mail – dein Passwort bleibt, wie es ist.\n`,
  },
  en: {
    subject: "FoodTracker: code to reset your password",
    text: (code, minutes) =>
      `Hello,\n\nsomeone (hopefully you) asked to reset the password of your FoodTracker account.\n\nYour code: ${code}\n\nEnter it in the app. It is valid for ${minutes} minutes and only once. If this wasn't you, ignore this email – your password stays as it is.\n`,
  },
  fr: {
    subject: "FoodTracker : code pour réinitialiser ton mot de passe",
    text: (code, minutes) =>
      `Bonjour,\n\nquelqu'un (toi, espérons-le) souhaite réinitialiser le mot de passe de ton compte FoodTracker.\n\nTon code : ${code}\n\nSaisis-le dans l'application. Il est valable ${minutes} minutes et une seule fois. Si ce n'était pas toi, ignore cet e-mail : ton mot de passe ne change pas.\n`,
  },
  it: {
    subject: "FoodTracker: codice per reimpostare la password",
    text: (code, minutes) =>
      `Ciao,\n\nqualcuno (speriamo tu) vuole reimpostare la password del tuo account FoodTracker.\n\nIl tuo codice: ${code}\n\nInseriscilo nell'app. È valido ${minutes} minuti e una sola volta. Se non sei stato tu, ignora questa e-mail: la tua password resta invariata.\n`,
  },
  es: {
    subject: "FoodTracker: código para restablecer tu contraseña",
    text: (code, minutes) =>
      `Hola:\n\nalguien (esperamos que tú) quiere restablecer la contraseña de tu cuenta de FoodTracker.\n\nTu código: ${code}\n\nIntrodúcelo en la app. Es válido durante ${minutes} minutos y una sola vez. Si no has sido tú, ignora este correo: tu contraseña no cambia.\n`,
  },
};

/** Betreff und Text der Mail mit dem Code, in der Sprache der App (de-AT usw. zählen als de). */
export function resetMail(language: string, code: string, minutes: number) {
  const texts = RESET_TEXTS[language.slice(0, 2).toLowerCase()] ?? RESET_TEXTS.de!;
  return { subject: texts.subject, text: texts.text(code, minutes) };
}
