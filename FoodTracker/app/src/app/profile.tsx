import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { Button, Card, Chip, ChipRow, Field, Muted, NutrientRow, Screen, colors, styles } from "../components/ui";
import { addDays, formatDay } from "../lib/dates";
import { useI18n } from "../lib/i18n";
import { sumNutrients, today } from "../lib/pantry";
import { useStore } from "../lib/store";

const RANGES = [7, 30] as const;

export default function ProfileScreen() {
  const { settings, updateSettings, diary } = useStore();
  const i18n = useI18n();
  const { t } = i18n;
  const [range, setRange] = useState<(typeof RANGES)[number]>(7);
  const target = settings.kcalPerPersonPerDay;
  const list = (items: string[]) => (items.length > 0 ? items.join(", ") : t("profile.none"));

  const history = useMemo(() => {
    const end = today();
    const days = Array.from({ length: range }, (_, i) => addDays(end, -i));
    const perDay = days.map((date) => {
      const entries = diary.filter((e) => e.date === date);
      return { date, entries, total: sumNutrients(entries.map((e) => e.nutrients)) };
    });
    const logged = perDay.filter((d) => d.entries.length > 0);
    const avg = sumNutrients(logged.map((d) => d.total));
    const n = Math.max(1, logged.length);
    const counts = new Map<string, number>();
    for (const d of logged) for (const e of d.entries) counts.set(e.title, (counts.get(e.title) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    return {
      perDay,
      logged: logged.length,
      avg: { kcal: avg.kcal / n, protein: avg.protein / n, carbs: avg.carbs / n, fat: avg.fat / n },
      top,
    };
  }, [diary, range]);

  const maxKcal = Math.max(target * 1.3, ...history.perDay.map((d) => d.total.kcal));

  return (
    <Screen>
      <Card title={t("profile.you")} icon="🙋">
        <Field label={t("settings.displayName")} hint={t("settings.displayNameHint")}>
          <TextInput
            style={styles.input}
            defaultValue={settings.displayName}
            accessibilityLabel={t("settings.displayName")}
            maxLength={40}
            onChangeText={(text) => updateSettings({ displayName: text.trim() })}
          />
        </Field>
        <Text style={styles.text}>
          {t(`goals.${settings.goal}`)} · {t("profile.kcal", { kcal: target })}
        </Text>
        {settings.body ? (
          <Muted>
            {t(`sex.${settings.body.sex}`)} ·{" "}
            {t("profile.body", { age: settings.body.age, height: settings.body.heightCm, weight: settings.body.weightKg })} ·{" "}
            {t(`activity.${settings.body.activity}`)}
          </Muted>
        ) : null}
      </Card>

      <Card title={t("profile.habits")} icon="🥗">
        <Text style={styles.text}>
          {[t(`diets.${settings.diet}`), ...settings.rules.map((r) => t(`rules.${r}`))].join(" · ")}
        </Text>
        <Muted>{t("profile.allergiesLabel", { list: list(settings.allergens.map((a) => t(`allergens.${a}`))) })}</Muted>
        <Muted>{t("profile.dislikesLabel", { list: list(settings.excludeIngredients.map((id) => i18n.ingredientName(id))) })}</Muted>
        <Muted>{t("profile.cuisinesLabel", { list: list(settings.cuisines.map((c) => t(`cuisines.${c}`))) })}</Muted>
        <Muted>
          👥 {settings.people} · {settings.mealTypes.map((m) => i18n.mealType(m)).join(", ")} · ⏱{" "}
          {settings.maxCookMinutes === 0 ? t("settings.noLimit") : t("common.minutes", { n: settings.maxCookMinutes })}
        </Muted>
        <Muted>
          {t("onboarding.budgetTitle")}: {t(`budget.${settings.budget}`)} · {t(`variety.${settings.variety}`)}
        </Muted>
        <Button label={t("profile.editHabits")} onPress={() => router.push("/onboarding")} />
      </Card>

      <Card title={t("profile.history")} icon="📈" tint={colors.accentTint}>
        <ChipRow>
          {RANGES.map((r) => (
            <Chip key={r} label={t(r === 7 ? "profile.days7" : "profile.days30")} selected={range === r} onPress={() => setRange(r)} />
          ))}
        </ChipRow>
        {history.logged === 0 ? (
          <Muted>{t("profile.noHistory")}</Muted>
        ) : (
          <>
            <Text style={styles.text}>{t("profile.avgKcal", { kcal: Math.round(history.avg.kcal), target })}</Text>
            <Muted>
              {t("profile.avgMacros", {
                protein: Math.round(history.avg.protein),
                carbs: Math.round(history.avg.carbs),
                fat: Math.round(history.avg.fat),
              })}
            </Muted>
            <Muted>{t("profile.daysLogged", { n: history.logged, total: range })}</Muted>
            {/* Balken pro Tag, älteste links; die Linie markiert das Kalorienziel. */}
            <View style={{ height: 90, flexDirection: "row", alignItems: "flex-end", gap: range === 7 ? 6 : 2, marginTop: 8 }}>
              <View
                style={{ position: "absolute", left: 0, right: 0, bottom: (target / maxKcal) * 90, height: 1, backgroundColor: colors.muted }}
              />
              {[...history.perDay].reverse().map((d) => (
                <View
                  key={d.date}
                  style={{
                    flex: 1,
                    height: Math.max(2, (d.total.kcal / maxKcal) * 90),
                    borderRadius: 3,
                    backgroundColor: d.total.kcal > target * 1.1 ? "#d98b3a" : d.entries.length > 0 ? colors.primary : colors.border,
                  }}
                />
              ))}
            </View>
            {history.top.length > 0 ? (
              <Field label={t("profile.topMeals")}>
                {history.top.map(([title, n]) => (
                  <Muted key={title}>
                    {n}× {title}
                  </Muted>
                ))}
              </Field>
            ) : null}
            {history.perDay
              .filter((d) => d.entries.length > 0)
              .map((d) => (
                <View key={d.date} style={{ gap: 2, paddingVertical: 6, borderTopWidth: 1, borderColor: colors.border }}>
                  <View style={styles.row}>
                    <Text style={[styles.text, { flex: 1, fontWeight: "600" }]}>{formatDay(d.date, i18n.language)}</Text>
                    <Muted>
                      {Math.round(d.total.kcal)} kcal · {t("profile.entries", { n: d.entries.length })}
                    </Muted>
                  </View>
                  <Muted>{d.entries.map((e) => e.title).join(", ")}</Muted>
                  <NutrientRow nutrients={d.total} />
                </View>
              ))}
          </>
        )}
      </Card>

      <Button label={`🌐 ${t("profile.settings")} ›`} variant="secondary" onPress={() => router.push("/settings")} />
    </Screen>
  );
}
