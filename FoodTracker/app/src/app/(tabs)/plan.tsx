import { Link, router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Button, Card, Chip, ErrorText, Field, Muted, Screen, colors, styles } from "../../components/ui";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { useStore } from "../../lib/store";
import type { LockedMeal, MealType } from "../../lib/types";

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <View style={{ flex: 1 }}>
      <Field label={label}>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          defaultValue={String(value)}
          onChangeText={(text) => {
            const n = parseInt(text, 10);
            if (!Number.isNaN(n) && n > 0) onChange(n);
          }}
        />
      </Field>
    </View>
  );
}

interface SwapTarget {
  index: number;
  day: number;
  mealType: MealType;
}

export default function PlanScreen() {
  const store = useStore();
  const { settings, updateSettings, pantry, plan, setPlan, eatenMeals, markMealEaten, toggleLock, recipes, userRecipes, favoriteIds } = store;
  const i18n = useI18n();
  const { t } = i18n;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [swap, setSwap] = useState<SwapTarget | null>(null);
  const [alternatives, setAlternatives] = useState<string[] | null>(null);

  const preferences = {
    diet: settings.diet,
    allergens: settings.allergens,
    excludeIngredients: settings.excludeIngredients,
    maxCookMinutes: settings.maxCookMinutes,
  };

  const createPlan = async (extraLock?: LockedMeal) => {
    setLoading(true);
    setError(null);
    try {
      const locked: LockedMeal[] = (plan?.meals ?? [])
        .filter((m) => m.locked && m.day < settings.days && settings.mealTypes.includes(m.mealType))
        .filter((m) => !(extraLock && m.day === extraLock.day && m.mealType === extraLock.mealType))
        .map(({ day, mealType, recipeId }) => ({ day, mealType, recipeId }));
      if (extraLock) locked.push(extraLock);
      const result = await api.plan({
        ...preferences,
        days: settings.days,
        people: settings.people,
        kcalPerPersonPerDay: settings.kcalPerPersonPerDay,
        mealTypes: settings.mealTypes,
        pantry,
        favoriteRecipeIds: favoriteIds,
        locked,
        recipes: userRecipes,
        preferences: settings.preferences.trim() || undefined,
        language: i18n.language,
      });
      setPlan(result.plan, result.extraRecipes);
    } catch (e) {
      setError(i18n.error(e));
    } finally {
      setLoading(false);
    }
  };

  const openSwap = async (target: SwapTarget) => {
    setSwap(target);
    setAlternatives(null);
    try {
      const { recipeIds } = await api.matchingRecipes({ ...preferences, mealType: target.mealType, recipes: userRecipes });
      // Favoriten zuerst.
      setAlternatives([...recipeIds].sort((a, b) => Number(favoriteIds.includes(b)) - Number(favoriteIds.includes(a))));
    } catch (e) {
      setSwap(null);
      setError(i18n.error(e));
    }
  };

  const chooseAlternative = (recipeId: string) => {
    if (!swap) return;
    const target = swap;
    setSwap(null);
    createPlan({ day: target.day, mealType: target.mealType, recipeId });
  };

  const days = plan ? [...new Set(plan.meals.map((m) => m.day))] : [];
  const prefParts = [
    t("plan.preferences", { diet: t(`diets.${settings.diet}`), meals: settings.mealTypes.map(i18n.mealType).join(", ") }),
    settings.allergens.length > 0 ? t("plan.allergiesShort", { list: settings.allergens.map((a) => t(`allergens.${a}`)).join(", ") }) : null,
    settings.maxCookMinutes > 0 ? t("plan.cookShort", { n: settings.maxCookMinutes }) : null,
  ].filter(Boolean);

  return (
    <Screen>
      <Card title={t("plan.createTitle")}>
        <View style={styles.row}>
          <NumberField label={t("plan.kcal")} value={settings.kcalPerPersonPerDay} onChange={(n) => updateSettings({ kcalPerPersonPerDay: n })} />
          <NumberField label={t("plan.people")} value={settings.people} onChange={(n) => updateSettings({ people: n })} />
          <NumberField label={t("plan.days")} value={settings.days} onChange={(n) => updateSettings({ days: n })} />
        </View>
        <Text style={styles.text}>{prefParts.join(" · ")}</Text>
        {favoriteIds.length > 0 ? <Muted>{t("plan.favoritesShort", { n: favoriteIds.length })}</Muted> : null}
        <Link href="/settings" style={[styles.text, { color: colors.primary }]}>
          {t("plan.editPreferences")} ›
        </Link>
        <TextInput
          style={styles.input}
          placeholder={t("plan.wishesPlaceholder")}
          defaultValue={settings.preferences}
          onChangeText={(preferences) => updateSettings({ preferences })}
        />
        <Muted>{t("plan.pantryHint", { n: pantry.length })}</Muted>
        <Button label={plan ? t("plan.recreate") : t("plan.create")} onPress={() => createPlan()} loading={loading} />
        {plan ? <Muted>{t("plan.replanHint")}</Muted> : null}
        <ErrorText message={error} />
      </Card>

      {plan ? (
        <Card title={t("plan.summary")}>
          <Text style={styles.text}>
            {t("plan.waste", { pct: i18n.number(plan.wasteRatio * 100) })} · {t("plan.price", { price: i18n.price(plan.totalPrice) })}
          </Text>
          <Muted>
            {t("plan.avgKcal", { kcal: Math.round(plan.dailyKcalPerPerson.reduce((a, b) => a + b, 0) / plan.dailyKcalPerPerson.length) })}
          </Muted>
          {plan.spoilageWarnings.map((w) => (
            <Text key={w.ingredientId} style={styles.warning}>
              {t("plan.spoilage", { name: i18n.ingredientName(w.ingredientId), days: w.shelfLifeDays, day: w.day + 1 })}
            </Text>
          ))}
        </Card>
      ) : null}

      {days.map((day) => (
        <Card key={day} title={t("plan.day", { n: day + 1 })}>
          {plan!.meals.map((meal, index) => {
            if (meal.day !== day) return null;
            const recipe = recipes.get(meal.recipeId);
            const name = recipe ? i18n.recipe(recipe).name : meal.recipeName;
            const eaten = eatenMeals.includes(index);
            return (
              <View key={index} style={{ gap: 4, paddingVertical: 6, borderTopWidth: index === 0 ? 0 : 1, borderColor: colors.border }}>
                <Muted>
                  {i18n.mealType(meal.mealType)}
                  {meal.locked ? " · 🔒" : ""}
                  {favoriteIds.includes(meal.recipeId) ? " · ♥" : ""}
                </Muted>
                <Pressable onPress={() => router.push(`/recipe/${encodeURIComponent(meal.recipeId)}`)}>
                  <Text style={[styles.text, { fontWeight: "600" }]}>{name}</Text>
                </Pressable>
                <Muted>
                  {t("common.portions", { n: i18n.number(meal.portions) })} · {t("common.perPerson", { kcal: meal.nutrientsPerPortion.kcal })}
                </Muted>
                {meal.extras.length > 0 ? (
                  <Text style={[styles.muted, { color: colors.primary }]}>
                    {t("plan.extras", { list: meal.extras.map((e) => `${i18n.amount(e.amount, e.unit)} ${i18n.ingredientName(e.ingredientId)}`).join(", ") })}
                  </Text>
                ) : null}
                <View style={[styles.chipRow, { marginTop: 4 }]}>
                  <Chip label={eaten ? t("plan.eaten") : t("plan.markEaten")} selected={eaten} disabled={eaten} onPress={() => markMealEaten(index, name)} />
                  <Chip label={meal.locked ? `🔒 ${t("plan.unlock")}` : t("plan.lock")} selected={meal.locked} onPress={() => toggleLock(index)} />
                  <Chip label={`⇄ ${t("plan.swap")}`} onPress={() => openSwap({ index, day: meal.day, mealType: meal.mealType })} disabled={loading} />
                </View>
              </View>
            );
          })}
        </Card>
      ))}

      <Modal visible={swap !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSwap(null)}>
        <View style={[styles.screen, { padding: 16, gap: 12 }]}>
          <View style={styles.row}>
            <Text style={[styles.cardTitle, { flex: 1 }]}>
              {swap ? t("plan.swapTitle", { meal: i18n.mealType(swap.mealType), day: swap.day + 1 }) : ""}
            </Text>
            <Button label={t("common.close")} variant="secondary" onPress={() => setSwap(null)} />
          </View>
          <Muted>{t("plan.swapHint")}</Muted>
          {alternatives === null ? (
            <ActivityIndicator color={colors.primary} />
          ) : alternatives.length === 0 ? (
            <Muted>{t("plan.noAlternatives")}</Muted>
          ) : (
            <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 40 }}>
              {alternatives.map((id) => {
                const recipe = recipes.get(id);
                if (!recipe) return null;
                return (
                  <Pressable key={id} onPress={() => chooseAlternative(id)} style={styles.card} accessibilityRole="button">
                    <Text style={styles.text}>
                      {favoriteIds.includes(id) ? "♥ " : ""}
                      {i18n.recipe(recipe).name}
                    </Text>
                    <Muted>{t("common.minutes", { n: recipe.cookMinutes })}</Muted>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      </Modal>
    </Screen>
  );
}
