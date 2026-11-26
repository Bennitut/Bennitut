import { router } from "expo-router";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { PASSWORD_MIN_LENGTH, looksLikeEmail, passwordProblem } from "../lib/account";
import { api, type AuthConfig } from "../lib/api";
import { useI18n } from "../lib/i18n";
import type { Session } from "../lib/session";
import { Button, Chip, ChipRow, ErrorText, Field, Muted, colors, styles } from "./ui";

type Mode = "signIn" | "register" | "forgot" | "reset";

/**
 * Hinweis bei der Registrierung und vor der ersten Nutzung der KI-Funktionen (`text`): kein Mindestalter, aber die
 * Zustimmung eines Elternteils (Benjamins Entscheidung vom 24.11.2026).
 */
export function ParentalNotice({ text }: { text?: string }) {
  const { t } = useI18n();
  return (
    <View style={{ backgroundColor: colors.selected, borderRadius: 12, padding: 12 }}>
      <Text style={{ fontSize: 13, color: colors.text }}>👪 {text ?? t("account.parentalNotice")}</Text>
    </View>
  );
}

/** Passwortfeld mit den Angaben, die Passwort-Manager und die Tastatur brauchen. */
export function PasswordInput({
  value,
  onChange,
  label,
  isNew,
  show,
  onSubmit,
}: {
  value: string;
  onChange: (text: string) => void;
  label: string;
  isNew: boolean;
  show: boolean;
  onSubmit?: () => void;
}) {
  return (
    <TextInput
      style={styles.input}
      value={value}
      onChangeText={onChange}
      secureTextEntry={!show}
      autoCapitalize="none"
      autoCorrect={false}
      autoComplete={isNew ? "new-password" : "current-password"}
      textContentType={isNew ? "newPassword" : "password"}
      maxLength={200}
      accessibilityLabel={label}
      onSubmitEditing={onSubmit}
      returnKeyType={onSubmit ? "go" : "next"}
    />
  );
}

/**
 * Anmelden und Registrieren mit E-Mail und Passwort, dazu „Passwort vergessen?“ mit einem Code per E-Mail (nur, wenn
 * der Server einen Mail-Dienst hat). Prüft Adresse und Passwortlänge schon vor dem Absenden wie der Server.
 */
export function PasswordSignIn({ config, onDone }: { config: AuthConfig; onDone: (login: Session) => void }) {
  const i18n = useI18n();
  const { t } = i18n;
  const min = config.passwordMinLength ?? PASSWORD_MIN_LENGTH;
  const [mode, setMode] = useState<Mode>("signIn");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const switchTo = (next: Mode) => {
    setMode(next);
    setPassword("");
    setCode("");
    setError(null);
    setInfo(null);
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(i18n.error(e));
    } finally {
      setBusy(false);
    }
  };

  /** Fehlertext, falls das neue Passwort nicht passt; sonst null. */
  const newPasswordError = () => {
    const problem = passwordProblem(password, min);
    return problem ? t(problem === "too_short" ? "account.passwordTooShort" : "account.passwordTooLong", { min }) : null;
  };

  const submit = () => {
    if (busy) return;
    const address = email.trim();
    if (!looksLikeEmail(address)) {
      setError(t("account.invalidEmail"));
      return;
    }
    if (mode === "signIn") {
      if (!password) return;
      void run(async () => onDone(await api.loginPassword(address, password)));
    } else if (mode === "register") {
      const problem = newPasswordError();
      if (problem) {
        setError(problem);
        return;
      }
      void run(async () => onDone(await api.register(address, password, name.trim() || undefined)));
    } else if (mode === "forgot") {
      void run(async () => {
        await api.forgotPassword(address, i18n.language);
        setMode("reset");
        setInfo(t("account.codeSent"));
      });
    } else {
      const problem = code.trim() ? newPasswordError() : t("account.codeMissing");
      if (problem) {
        setError(problem);
        return;
      }
      void run(async () => onDone(await api.resetPassword(address, code.trim(), password)));
    }
  };

  const isNew = mode !== "signIn";
  const emailField = (
    <Field label={t("account.emailLabel")}>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        maxLength={254}
        accessibilityLabel={t("account.emailLabel")}
        onSubmitEditing={mode === "forgot" ? submit : undefined}
      />
    </Field>
  );
  const passwordField = (
    <>
      <Field
        label={t(mode === "reset" ? "account.newPassword" : "account.password")}
        hint={isNew ? t("account.passwordHint", { min }) : undefined}
      >
        <PasswordInput
          value={password}
          onChange={setPassword}
          label={t(mode === "reset" ? "account.newPassword" : "account.password")}
          isNew={isNew}
          show={show}
          onSubmit={submit}
        />
      </Field>
      <ChipRow>
        <Chip label={t("account.showPassword")} selected={show} onPress={() => setShow((s) => !s)} />
      </ChipRow>
    </>
  );

  return (
    <View style={{ gap: 10 }}>
      {mode === "signIn" || mode === "register" ? (
        <ChipRow>
          <Chip label={t("account.modeSignIn")} selected={mode === "signIn"} onPress={() => switchTo("signIn")} />
          <Chip label={t("account.modeRegister")} selected={mode === "register"} onPress={() => switchTo("register")} />
        </ChipRow>
      ) : (
        <Text style={styles.label}>{t("account.forgotTitle")}</Text>
      )}

      {mode === "register" ? (
        <Field label={t("account.nameOptional")} hint={t("account.nameHint")}>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            maxLength={40}
            autoComplete="nickname"
            textContentType="nickname"
            accessibilityLabel={t("account.nameOptional")}
          />
        </Field>
      ) : null}

      {mode === "forgot" ? <Muted>{t("account.forgotText")}</Muted> : null}
      {mode === "reset" && info ? <Text style={styles.text}>{info}</Text> : null}
      {emailField}

      {mode === "reset" ? (
        <Field label={t("account.code")}>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={12}
            accessibilityLabel={t("account.code")}
          />
        </Field>
      ) : null}
      {mode !== "forgot" ? passwordField : null}

      {mode === "register" ? (
        <>
          <ParentalNotice />
          <Muted>{t("account.privacyText")}</Muted>
          <Button label={`§ ${t("account.privacyLink")}`} variant="secondary" onPress={() => router.push("/legal")} />
        </>
      ) : null}

      <ErrorText message={error} />
      <Button
        label={t(
          mode === "signIn" ? "account.signInButton" : mode === "register" ? "account.registerButton" : mode === "forgot" ? "account.sendCode" : "account.resetButton",
        )}
        onPress={submit}
        loading={busy}
        disabled={!email.trim() || (mode !== "forgot" && !password) || (mode === "reset" && !code.trim())}
      />
      {mode === "signIn" && config.passwordReset ? (
        <Button label={t("account.forgot")} variant="secondary" onPress={() => switchTo("forgot")} />
      ) : null}
      {mode === "forgot" || mode === "reset" ? (
        <Button label={`‹ ${t("account.backToSignIn")}`} variant="secondary" onPress={() => switchTo("signIn")} />
      ) : null}
    </View>
  );
}
