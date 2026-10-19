import { router } from "expo-router";
import { Image, Pressable, Text, View } from "react-native";
import { Card, Chip, HeroCard, Muted, ProgressBar, Screen, styles } from "../../components/ui";
import { daysBetween } from "../../lib/dates";
import { useI18n } from "../../lib/i18n";
import { sumNutrients, today } from "../../lib/pantry";
import { mealKey, useStore } from "../../lib/store";

export default function TodayScreen() {
  const { diary, settings, removeDiaryEntry, plan, recipes, eatenMeals, markMealEaten } = useStore();
  const i18n = useI18n();
  const { t } = i18n;
  const dayIndex = plan ? daysBetween(plan.startDate, today()) : -1;
  const planned = plan ? plan.weeks.flatMap((w) => w.meals).filter((m) => m.day === dayIndex) : [];
  const entries = diary.filter((e) => e.date === today());
  const total = sumNutrients(entries.map((e) => e.nutrients));
  const target = settings.kcalPerPersonPerDay;

  return (
    <Screen>
      <HeroCard>
        <Text style={styles.heroMuted}>🔥 {t("today.caloriesToday")}</Text>
        <Text style={styles.heroHeading}>
          {Math.round(total.kcal)} <Text style={[styles.heroMuted, { fontSize: 16 }]}>{t("today.ofTarget", { target })}</Text>
        </Text>
        <ProgressBar value={total.kcal} max={target} light />
        <View style={[styles.row, { marginTop: 4 }]}>
          {[
            ["💪", Math.round(total.protein), t("today.protein")],
            ["🍞", Math.round(total.carbs), t("today.carbs")],
            ["🥑", Math.round(total.fat), t("today.fat")],
          ].map(([emoji, grams, label]) => (
            <View key={String(label)} style={{ flex: 1, alignItems: "center", backgroundColor: "rgba(255,255,255,0.16)", borderRadius: 14, paddingVertical: 8 }}>
              <Text style={{ fontSize: 18 }}>{emoji}</Text>
              <Text style={[styles.heroText, { fontWeight: "800" }]}>{grams} g</Text>
              <Text style={styles.heroMuted}>{label}</Text>
            </View>
          ))}
        </View>
      </HeroCard>

      {planned.length > 0 ? (
        <Card title={t("today.planned")} icon="🍽️">
          {planned.map((meal) => {
            const recipe = recipes.get(meal.recipeId);
            const name = recipe ? i18n.recipe(recipe).name : meal.recipeName;
            const eaten = eatenMeals.includes(mealKey(meal));
            const image = recipe?.media?.image?.uri;
            return (
              <View key={mealKey(meal)} style={[styles.row, { paddingVertical: 4 }]}>
                {image ? <Image source={{ uri: image }} style={{ width: 64, height: 36, borderRadius: 8 }} /> : null}
                <Pressable style={{ flex: 1, gap: 2 }} onPress={() => router.push(`/recipe/${encodeURIComponent(meal.recipeId)}`)}>
                  <Muted>{i18n.mealType(meal.mealType)}</Muted>
                  <Text style={styles.text}>{name}</Text>
                </Pressable>
                <Chip label={eaten ? t("plan.eaten") : t("plan.markEaten")} selected={eaten} disabled={eaten} onPress={() => markMealEaten(meal, name)} />
              </View>
            );
          })}
        </Card>
      ) : null}

      <Card title={t("today.meals")} icon="📝" tint="#ECEBF8">
        {entries.length === 0 ? (
          <Muted>{t("today.empty")}</Muted>
        ) : (
          entries.map((entry) => (
            <View key={entry.id} style={[styles.row, { paddingVertical: 6 }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.text}>{entry.title}</Text>
                <Muted>
                  {entry.time} · {t(`today.sources.${entry.source}`)} · {Math.round(entry.nutrients.kcal)} kcal
                </Muted>
              </View>
              <Pressable accessibilityLabel={t("today.deleteEntry")} onPress={() => removeDiaryEntry(entry.id)} hitSlop={10}>
                <Text style={styles.muted}>✕</Text>
              </Pressable>
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}
