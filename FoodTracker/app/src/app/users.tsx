import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { Badge, Button, Card, ErrorText, IconBubble, Muted, Screen, colors, styles } from "../components/ui";
import { api } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { useStore } from "../lib/store";
import type { DirectoryUser } from "../lib/types";

export default function UsersScreen() {
  const { auth } = useStore();
  const i18n = useI18n();
  const { t } = i18n;
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) return;
    const timer = setTimeout(() => {
      api
        .users(query)
        .then((list) => {
          setUsers(list);
          setError(null);
        })
        .catch((e) => setError(i18n.error(e)));
    }, 250);
    return () => clearTimeout(timer);
  }, [auth, query, i18n]);

  if (!auth) {
    return (
      <Screen>
        <Card title={t("account.directory")} icon="👥">
          <Muted>{t("account.needSignIn")}</Muted>
          <Button label={t("account.signIn")} onPress={() => router.push("/login")} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <TextInput style={styles.input} value={query} onChangeText={setQuery} placeholder={t("account.search")} accessibilityLabel={t("account.search")} />
      <ErrorText message={error} />
      <Card>
        {users.map((user) => (
          <View key={user.id} style={[styles.row, { paddingVertical: 6 }]}>
            <IconBubble emoji={user.name.slice(0, 1).toUpperCase()} tint={user.role === "admin" ? colors.accentTint : colors.selected} size={40} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[styles.text, { fontWeight: "600" }]}>
                {user.name}
                {user.id === auth.user.id ? ` (${t("feedback.you")})` : ""}
              </Text>
              <Muted>
                {t("account.joined", { date: new Date(user.createdAt).toLocaleDateString(i18n.language) })} ·{" "}
                {t("account.stats", { photos: user.photos, recipes: user.recipes })}
              </Muted>
            </View>
            <Badge
              label={user.role === "admin" ? t("account.roleAdmin") : t("account.roleUser")}
              color={user.role === "admin" ? colors.warning : colors.primary}
              tint={user.role === "admin" ? colors.accentTint : colors.selected}
            />
          </View>
        ))}
      </Card>
    </Screen>
  );
}
