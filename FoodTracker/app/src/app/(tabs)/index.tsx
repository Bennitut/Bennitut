import { router } from "expo-router";
import { Image, Pressable, Text, View } from "react-native";
import { Card, Chip, Muted, NutrientRow, ProgressBar, Screen, styles } from "../../components/ui";
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
      <Card title={t("today.caloriesToday")}>
        <Text style={styles.heading}>
          {Math.round(total.kcal)} <Text style={styles.muted}>{t("today.ofTarget", { target })}</Text>
        </Text>
        <ProgressBar value={total.kcal} max={target} />
        <NutrientRow nutrients={total} />
      </Card>

      {planned.length > 0 ? (
        <Card title={t("today.planned")}>
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

      <Card title={t("today.meals")}>
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
