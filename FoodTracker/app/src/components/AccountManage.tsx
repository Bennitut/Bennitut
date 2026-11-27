import { useState } from "react";
import { Text, View } from "react-native";
import { PASSWORD_MIN_LENGTH, accountExportName, passwordProblem } from "../lib/account";
import { ApiError, api } from "../lib/api";
import { offerFile } from "../lib/historyFiles";
import { useI18n } from "../lib/i18n";
import { today } from "../lib/pantry";
import type { Session } from "../lib/session";
import { useStore } from "../lib/store";
import { PasswordInput } from "./PasswordSignIn";
import { Button, Card, Chip, ChipRow, Field, Muted, colors, styles } from "./ui";

type Open = "password" | "delete" | null;
type Busy = "password" | "export" | "delete" | null;

/**
 * „Konto verwalten“ im Profil: Passwort ändern (nur Konten mit Passwort), „Meine Daten exportieren“ (Art. 15 und 20
 * DSGVO) und „Konto löschen“ (Art. 17 DSGVO, auch Apple verlangt es in der App). Rückfragen stehen direkt hier statt in
 * Alert.alert, das im Browser nichts anzeigt.
 */
export function AccountManage({ auth, onDeleted }: { auth: Session; onDeleted: () => void }) {
  const { setAuth } = useStore();
  const i18n = useI18n();
  const { t } = i18n;
  const hasPassword = auth.user.provider === "password";
  const [open, setOpen] = useState<Open>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const toggle = (which: Exclude<Open, null>) => {
    setOpen((o) => (o === which ? null : which));
    setCurrent("");
    setNext("");
    setMessage(null);
  };
  /** Falsches Passwort heißt hier nicht „E-Mail-Adresse oder Passwort stimmt nicht“. */
  const errorText = (e: unknown) => (e instanceof ApiError && e.code === "auth_invalid_credentials" ? t("account.wrongPassword") : i18n.error(e));

  const changePassword = async () => {
    const problem = passwordProblem(next, PASSWORD_MIN_LENGTH);
    if (problem) {
      setMessage({ text: t(problem === "too_short" ? "account.passwordTooShort" : "account.passwordTooLong", { min: PASSWORD_MIN_LENGTH }), error: true });
      return;
    }
    setBusy("password");
    setMessage(null);
    try {
      await api.changePassword(current, next);
      setOpen(null);
      setCurrent("");
      setNext("");
      setMessage({ text: t("account.passwordChanged"), error: false });
    } catch (e) {
      setMessage({ text: errorText(e), error: true });
    } finally {
      setBusy(null);
    }
  };

  const exportData = async () => {
    setBusy("export");
    setMessage(null);
    const name = accountExportName(today());
    try {
      const data = await api.exportAccount();
      if ((await offerFile(name, JSON.stringify(data, null, 2), "json", t("account.exportData"))) === "downloaded") {
        setMessage({ text: t("history.exportDone", { name }), error: false });
      }
    } catch (e) {
      setMessage({ text: e instanceof ApiError ? i18n.error(e) : t("history.exportFailed"), error: true });
    } finally {
      setBusy(null);
    }
  };

  const deleteAccount = async () => {
    setBusy("delete");
    setMessage(null);
    try {
      await api.deleteAccount(hasPassword ? current : undefined);
      setAuth(null);
      onDeleted();
    } catch (e) {
      setMessage({ text: errorText(e), error: true });
      setBusy(null);
    }
  };

  return (
    <Card title={t("account.manageTitle")} icon="⚙️">
      {hasPassword ? <Button label={t("account.changePassword")} variant="secondary" onPress={() => toggle("password")} /> : null}
      {open === "password" ? (
        <View style={{ gap: 10 }}>
          <Field label={t("account.currentPassword")}>
            <PasswordInput value={current} onChange={setCurrent} label={t("account.currentPassword")} isNew={false} show={show} />
          </Field>
          <Field label={t("account.newPassword")} hint={t("account.passwordHint", { min: PASSWORD_MIN_LENGTH })}>
            <PasswordInput value={next} onChange={setNext} label={t("account.newPassword")} isNew show={show} onSubmit={changePassword} />
          </Field>
          <ChipRow>
            <Chip label={t("account.showPassword")} selected={show} onPress={() => setShow((s) => !s)} />
          </ChipRow>
          <Muted>{t("account.otherDevicesHint")}</Muted>
          <Button label={t("account.savePassword")} onPress={changePassword} loading={busy === "password"} disabled={!current || !next} />
        </View>
      ) : null}

      <Button label={t("account.exportData")} variant="secondary" onPress={exportData} loading={busy === "export"} />
      <Muted>{t("account.exportHint")}</Muted>

      <Button label={t("account.delete")} variant="secondary" onPress={() => toggle("delete")} />
      {open === "delete" ? (
        <View style={{ gap: 10, borderWidth: 1, borderColor: colors.danger, borderRadius: 12, padding: 12 }}>
          <Text style={styles.text}>{t("account.deleteText")}</Text>
          {hasPassword ? (
            <Field label={t("account.deletePassword")}>
              <PasswordInput value={current} onChange={setCurrent} label={t("account.deletePassword")} isNew={false} show={false} />
            </Field>
          ) : null}
          <Button
            label={t("account.deleteConfirm")}
            variant="danger"
            onPress={deleteAccount}
            loading={busy === "delete"}
            disabled={hasPassword && !current}
          />
          <Button label={t("common.cancel")} variant="secondary" onPress={() => toggle("delete")} />
        </View>
      ) : null}

      {message ? <Text style={message.error ? styles.error : styles.text}>{message.text}</Text> : null}
    </Card>
  );
}
