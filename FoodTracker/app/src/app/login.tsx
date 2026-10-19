import * as AppleAuthentication from "expo-apple-authentication";
import * as Google from "expo-auth-session/providers/google";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { Platform, Text, TextInput } from "react-native";
import { Button, Card, ErrorText, Field, Muted, Screen, styles } from "../components/ui";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useStore } from "../lib/store";
import type { Account } from "../lib/types";

// Schließt das Browserfenster der Google-Anmeldung, wenn die App zurückkehrt.
WebBrowser.maybeCompleteAuthSession();

/** Google-Client-IDs aus der App-Konfiguration (EXPO_PUBLIC_…); ohne sie gibt es keinen Google-Button. */
const GOOGLE_IDS = {
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
};
const googleConfigured = Boolean(
  Platform.select({ ios: GOOGLE_IDS.iosClientId, android: GOOGLE_IDS.androidClientId, default: GOOGLE_IDS.webClientId }),
);

type Done = (login: { token: string; user: Account }) => void;

function GoogleButton({ onDone, onError }: { onDone: Done; onError: (e: unknown) => void }) {
  const { t } = useI18n();
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest(GOOGLE_IDS);

  useEffect(() => {
    if (response?.type !== "success") return;
    const idToken = response.params.id_token;
    if (idToken) api.loginGoogle(idToken).then(onDone).catch(onError);
  }, [response, onDone, onError]);

  return <Button label={`G  ${t("account.google")}`} variant="secondary" disabled={!request} onPress={() => promptAsync()} />;
}

export default function LoginScreen() {
  const { setAuth } = useStore();
  const i18n = useI18n();
  const { t } = i18n;
  const [config, setConfig] = useState<{ apple: boolean; google: boolean; dev: boolean } | null>(null);
  const [appleAvailable, setAppleAvailable] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.authConfig().then(setConfig).catch(() => setError(t("account.noServer")));
    if (Platform.OS === "ios") AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
  }, [t]);

  const done: Done = (login) => {
    setAuth(login);
    router.back();
  };
  const fail = (e: unknown) => {
    setBusy(false);
    setError(i18n.error(e));
  };

  const signInWithApple = async () => {
    setError(null);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      });
      if (!credential.identityToken) return;
      // Den Namen schickt Apple nur bei der allerersten Anmeldung.
      const fullName = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(" ") || undefined;
      setBusy(true);
      done(await api.loginApple(credential.identityToken, fullName));
    } catch (e) {
      // Abbruch durch die Nutzer:in ist kein Fehler.
      if ((e as { code?: string }).code === "ERR_REQUEST_CANCELED") return;
      fail(e);
    }
  };

  const signInDev = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      done(await api.loginDev(name.trim(), email.trim() || undefined));
    } catch (e) {
      fail(e);
    }
  };

  return (
    <Screen>
      <Card title={t("account.signInTitle")} icon="🔐">
        <Muted>{t("account.signInText")}</Muted>
        {appleAvailable && config?.apple ? (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={14}
            style={{ height: 48 }}
            onPress={signInWithApple}
          />
        ) : null}
        {config?.google && googleConfigured ? (
          <GoogleButton onDone={done} onError={fail} />
        ) : config ? (
          <Muted>{t("account.googleMissing")}</Muted>
        ) : null}
        <ErrorText message={error} />
      </Card>

      {config?.dev ? (
        <Card title={t("account.devTitle")} icon="🧪">
          <Muted>{t("account.devHint")}</Muted>
          <Field label={t("account.name")}>
            <TextInput style={styles.input} value={name} onChangeText={setName} maxLength={40} accessibilityLabel={t("account.name")} />
          </Field>
          <Field label={t("account.email")}>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              accessibilityLabel={t("account.email")}
            />
          </Field>
          <Button label={t("account.devSignIn")} onPress={signInDev} loading={busy} disabled={!name.trim()} />
        </Card>
      ) : null}
      {busy ? <Text style={styles.muted}>…</Text> : null}
    </Screen>
  );
}
