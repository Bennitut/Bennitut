import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Platform, Text, TextInput } from "react-native";
import { Button, Card, ErrorText, Field, Muted, Screen, styles } from "../components/ui";
import type { TKey } from "../i18n";
import { api, probeServer } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { parseServerUrl, type ServerSource, type ServerUrlError } from "../lib/serverAddress";
import { serverLine, type ServerHealth } from "../lib/serverStatus";
import { useStore } from "../lib/store";

const SOURCES: Record<ServerSource, TKey> = {
  custom: "server.sourceCustom",
  env: "server.sourceEnv",
  dev: "server.sourceDev",
  none: "server.sourceNone",
};
const ERRORS: Record<ServerUrlError, TKey> = {
  empty: "server.errorEmpty",
  invalid: "server.errorInvalid",
  scheme: "server.errorScheme",
  credentials: "server.errorCredentials",
  insecure: "server.errorInsecure",
  https: "server.errorHttps",
};

/** „https://…“ ohne Protokoll, damit die Adresse kurz bleibt. */
const short = (url: string) => url.replace(/^https?:\/\//, "");

/**
 * Profil → Server (Vorrang 1, 9.2 Teil 7): mit welchem Server die App spricht und eine andere Adresse eintragen, z. B.
 * den Server im Internet (docs/SERVER-HOSTING.md). Geprüft wird vorher mit GET /api/health ohne Geräte-ID und ohne
 * Anmeldung (lib/api.ts, probeServer).
 */
export default function ServerScreen() {
  const { server, defaultServer, setServer, auth } = useStore();
  const { t } = useI18n();
  const [input, setInput] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Geprüfte Adresse, unter der kein FoodTracker-Server antwortet – „Trotzdem verwenden“ nimmt sie. */
  const [unreachable, setUnreachable] = useState<string | null>(null);
  const [switched, setSwitched] = useState<string | null>(null);
  // undefined = wird geprüft, null = keine Antwort; bei jedem Öffnen und nach jedem Wechsel neu.
  const [health, setHealth] = useState<ServerHealth | null | undefined>(undefined);
  useFocusEffect(
    useCallback(() => {
      if (!server.url) return;
      let active = true;
      setHealth(undefined);
      api
        .health()
        .then((h) => active && setHealth(h))
        .catch(() => active && setHealth(null));
      return () => {
        active = false;
      };
    }, [server.url]),
  );
  const status = serverLine(health);

  const switchTo = (url: string | null) => {
    setServer(url);
    setInput("");
    setError(null);
    setUnreachable(null);
    setSwitched(url ?? defaultServer.url);
  };

  const check = async () => {
    setError(null);
    setUnreachable(null);
    setSwitched(null);
    const parsed = parseServerUrl(input, { pageProtocol: Platform.OS === "web" && typeof window !== "undefined" ? window.location?.protocol : undefined });
    if (!parsed.ok) {
      setError(t(ERRORS[parsed.error]));
      return;
    }
    setInput(parsed.url);
    setChecking(true);
    const found = await probeServer(parsed.url);
    setChecking(false);
    if (found) switchTo(parsed.url);
    else setUnreachable(parsed.url);
  };

  return (
    <Screen>
      <Card title={t("server.title")} icon="🖥️">
        <Text style={[styles.text, { fontWeight: "600" }]}>{server.url ? t("server.current", { url: short(server.url) }) : t("server.none")}</Text>
        <Muted>{t(SOURCES[server.source])}</Muted>
        {server.url ? <Muted>{t(status.key, { model: status.model })}</Muted> : null}
        {switched ? <Text style={styles.text}>{t("server.switched", { url: short(switched) })}</Text> : null}
        <Field label={t("server.addressLabel")} hint={t("server.addressHint")}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={(text) => {
              setInput(text);
              setUnreachable(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="url"
            keyboardType="url"
            inputMode="url"
            textContentType="URL"
            maxLength={300}
            accessibilityLabel={t("server.addressLabel")}
            placeholder="https://"
            onSubmitEditing={check}
            returnKeyType="go"
          />
        </Field>
        <ErrorText message={error} />
        {unreachable ? (
          <>
            <Text style={styles.error}>{t("server.unreachable")}</Text>
            <Button label={t("server.useAnyway")} variant="secondary" onPress={() => switchTo(unreachable)} />
          </>
        ) : null}
        <Button label={t("server.use")} onPress={check} loading={checking} disabled={!input.trim()} />
        {server.source === "custom" ? (
          <>
            <Button label={t("server.reset")} variant="secondary" onPress={() => switchTo(null)} />
            <Muted>{defaultServer.url ? t("server.defaultIs", { url: short(defaultServer.url) }) : t("server.defaultNone")}</Muted>
          </>
        ) : null}
        {auth ? <Muted>{t("server.signOutNote")}</Muted> : null}
        <Muted>{t("server.trustNote")}</Muted>
      </Card>
    </Screen>
  );
}
