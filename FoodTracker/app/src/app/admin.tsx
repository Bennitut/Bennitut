import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Image, Text, TextInput, View } from "react-native";
import { Badge, Button, Card, Chip, ChipRow, ErrorText, Muted, Screen, colors, styles } from "../components/ui";
import { api } from "../lib/api";
import { RECIPES } from "../lib/catalog";
import { useI18n } from "../lib/i18n";
import { useStore } from "../lib/store";
import type { AdminUser, FlagReason, FlagSummary, RecipePhoto } from "../lib/types";

type Tab = "users" | "flags" | "photos" | "recipes";

const PROVIDER_NAMES = { apple: "Apple", google: "Google", dev: "Test" } as const;

const REASON_KEYS: Record<FlagReason, "feedback.reasonText" | "feedback.reasonAmounts" | "feedback.reasonImage" | "feedback.reasonOther"> = {
  text: "feedback.reasonText",
  amounts: "feedback.reasonAmounts",
  image: "feedback.reasonImage",
  other: "feedback.reasonOther",
};

export default function AdminScreen() {
  const { auth, isAdmin, recipes, catalogOverrides, refreshOverrides } = useStore();
  const i18n = useI18n();
  const { t } = i18n;
  const [tab, setTab] = useState<Tab>("users");
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [flags, setFlags] = useState<FlagSummary[]>([]);
  const [photos, setPhotos] = useState<RecipePhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const date = (iso: string) => new Date(iso).toLocaleDateString(i18n.language);
  const recipeName = (id: string) => {
    const recipe = recipes.get(id) ?? RECIPES.find((r) => r.id === id);
    return recipe ? i18n.recipe(recipe).name : id;
  };

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setError(null);
    try {
      if (tab === "users") setUsers(await api.adminUsers(query));
      if (tab === "flags") setFlags(await api.flags());
      if (tab === "photos") setPhotos(await api.adminPhotos());
      if (tab === "recipes") await refreshOverrides();
    } catch (e) {
      setError(i18n.error(e));
    }
  }, [tab, query, isAdmin, i18n, refreshOverrides]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  const run = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      await load();
    } catch (e) {
      setError(i18n.error(e));
    }
  };

  const confirm = (title: string, action: () => Promise<unknown>) =>
    Alert.alert(title, "", [
      { text: t("common.cancel"), style: "cancel" },
      { text: "OK", style: "destructive", onPress: () => run(action) },
    ]);

  if (!auth || !isAdmin) {
    return (
      <Screen>
        <Card title={t("admin.title")} icon="🛠️">
          <Muted>{t("errors.auth_forbidden")}</Muted>
        </Card>
      </Screen>
    );
  }

  const changed = Object.entries(catalogOverrides).sort((a, b) => b[1].updatedAt.localeCompare(a[1].updatedAt));

  return (
    <Screen>
      <ChipRow>
        {(["users", "flags", "photos", "recipes"] as const).map((key) => (
          <Chip key={key} label={t(`admin.${key}`)} selected={tab === key} onPress={() => setTab(key)} />
        ))}
      </ChipRow>
      <ErrorText message={error} />

      {tab === "users" ? (
        <>
          <TextInput style={styles.input} value={query} onChangeText={setQuery} placeholder={t("account.search")} accessibilityLabel={t("account.search")} />
          {users.map((user) => (
            <Card key={user.id}>
              <View style={styles.row}>
                <Text style={[styles.cardTitle, { flex: 1 }]}>{user.name}</Text>
                <Badge
                  label={user.role === "admin" ? t("account.roleAdmin") : t("account.roleUser")}
                  color={user.role === "admin" ? colors.warning : colors.primary}
                  tint={user.role === "admin" ? colors.accentTint : colors.selected}
                />
              </View>
              <Muted>
                {user.email ?? "—"} · {t("account.via", { provider: PROVIDER_NAMES[user.provider] })}
              </Muted>
              <Muted>
                {t("account.joined", { date: date(user.createdAt) })} · {t("admin.lastLogin", { date: date(user.lastLoginAt) })}
              </Muted>
              <Muted>{t("account.stats", { photos: user.photos, recipes: user.recipes })}</Muted>
              {user.blocked ? <Badge label={t("admin.blocked")} color={colors.danger} tint="#FBE3E6" /> : null}
              {user.id !== auth.user.id ? (
                <ChipRow>
                  <Chip
                    label={user.role === "admin" ? t("admin.makeUser") : t("admin.makeAdmin")}
                    onPress={() => run(() => api.adminUpdateUser(user.id, { role: user.role === "admin" ? "user" : "admin" }))}
                  />
                  <Chip
                    label={user.blocked ? t("admin.unblock") : t("admin.block")}
                    onPress={() =>
                      user.blocked
                        ? run(() => api.adminUpdateUser(user.id, { blocked: false }))
                        : confirm(`${t("admin.block")}: ${user.name}`, () => api.adminUpdateUser(user.id, { blocked: true }))
                    }
                  />
                </ChipRow>
              ) : null}
            </Card>
          ))}
        </>
      ) : null}

      {tab === "flags" ? (
        flags.length === 0 ? (
          <Card>
            <Muted>{t("admin.noFlags")}</Muted>
          </Card>
        ) : (
          flags.map((flag) => (
            <Card key={flag.recipeId} title={recipeName(flag.recipeId)} icon="⚠️" tint={colors.accentTint}>
              <Muted>
                {t("admin.reported", { n: flag.count })} · {date(flag.lastAt)}
              </Muted>
              <ChipRow>
                {(Object.entries(flag.reasons) as [FlagReason, number][]).map(([reason, n]) => (
                  <Badge key={reason} label={`${t(REASON_KEYS[reason])} ${n}×`} color={colors.warning} tint={colors.accentTint} />
                ))}
              </ChipRow>
              {flag.notes.map((note, i) => (
                <Text key={i} style={styles.text}>
                  „{note}“
                </Text>
              ))}
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Button label={t("admin.openRecipe")} variant="secondary" onPress={() => router.push(`/recipe/${encodeURIComponent(flag.recipeId)}`)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label={t("admin.resolve")} onPress={() => run(() => api.resolveFlags(flag.recipeId))} />
                </View>
              </View>
            </Card>
          ))
        )
      ) : null}

      {tab === "photos" ? (
        photos.length === 0 ? (
          <Card>
            <Muted>{t("admin.noPhotos")}</Muted>
          </Card>
        ) : (
          photos.map((photo) => (
            <Card key={photo.id}>
              <Image source={{ uri: photo.uri }} style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 12 }} />
              <Text style={[styles.text, { fontWeight: "600" }]}>{recipeName(photo.recipeId)}</Text>
              <Muted>
                {t("feedback.by", { name: photo.authorName || t("feedback.anonymous") })} · {date(photo.createdAt)}
                {photo.count ? ` · ${t("feedback.avg", { avg: i18n.number(photo.avg), n: photo.count })}` : ""}
              </Muted>
              <Button label={t("admin.deletePhoto")} variant="secondary" onPress={() => confirm(t("admin.deletePhoto"), () => api.adminDeletePhoto(photo.id))} />
            </Card>
          ))
        )
      ) : null}

      {tab === "recipes" ? (
        <Card title={t("admin.changed")} icon="📝">
          {changed.length === 0 ? <Muted>{t("admin.noChanges")}</Muted> : null}
          {changed.map(([id, entry]) => (
            <View key={id} style={{ gap: 4, paddingVertical: 6, borderTopWidth: 1, borderColor: colors.border }}>
              <View style={styles.row}>
                <Text style={[styles.text, { flex: 1, fontWeight: "600" }]} onPress={() => router.push(`/recipe/${encodeURIComponent(id)}`)}>
                  {recipeName(id)}
                </Text>
                {entry.patch.hidden ? <Badge label={t("admin.hidden")} color={colors.muted} tint={colors.border} /> : null}
              </View>
              <Muted>{t("admin.changedBy", { name: entry.updatedBy, date: date(entry.updatedAt) })}</Muted>
              <Chip label={t("admin.reset")} onPress={() => confirm(t("admin.reset"), () => api.adminResetRecipe(id))} />
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
