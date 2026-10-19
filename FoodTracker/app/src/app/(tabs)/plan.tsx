import { Link, router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Button, Card, Chip, ChipRow, ErrorText, Muted, Screen, colors, styles } from "../../components/ui";
import { ApiError, api } from "../../lib/api";
import { MONTH_WEEKS, PlanError, matchesPreferences, planMonth, weekOfDay } from "../../lib/catalog";
import { addDays, daysBetween, formatDay } from "../../lib/dates";
import { useI18n } from "../../lib/i18n";
import { aggregatePantry, today } from "../../lib/pantry";
import { planOptions } from "../../lib/profile";
import { mealKey, useStore } from "../../lib/store";
import type { LockedMeal, MonthPlan, PlannedMeal, WeekPlan } from "../../lib/types";

/** Kleinere Suchtiefe auf dem Handy: gleiche Qualität, halbe Rechenzeit. */
const DEVICE_EFFORT = 0.5;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function PlanScreen() {
  const store = useStore();
  const { settings, pantry, plan, setPlan, eatenMeals, markMealEaten, toggleLock, recipes, userRecipes, favoriteIds, catalog, ingredients } = store;
  const i18n = useI18n();
  const { t } = i18n;
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [swap, setSwap] = useState<PlannedMeal | null>(null);
  const [alternatives, setAlternatives] = useState<string[]>([]);
  const todayIndex = plan ? daysBetween(plan.startDate, today()) : 0;
  const [selectedWeek, setSelectedWeek] = useState(() => weekOfDay(Math.max(0, todayIndex)));
  const loading = progress !== null;

  const options = planOptions(settings);

  /**
   * Plant den Monat ab Woche `fromWeek` (frühere Wochen bleiben, wie sie sind).
   * Mit Wünschen schlägt Claude über den Server neue Rezepte vor; sonst rechnet das Handy selbst.
   */
  const createPlan = async (fromWeek = 0, extraLock?: LockedMeal) => {
    if (!settings.onboarded) {
      router.push("/onboarding");
      return;
    }
    setError(null);
    setNotice(null);
    setProgress(fromWeek + 1);
    const startDate = plan && (fromWeek > 0 || plan.startDate === today()) ? plan.startDate : today();
    const keepWeeks = plan && fromWeek > 0 ? plan.weeks.slice(0, fromWeek) : [];
    const locked: LockedMeal[] = (plan && plan.startDate === startDate ? plan.weeks.flatMap((w) => w.meals) : [])
      .filter((m) => m.locked && settings.mealTypes.includes(m.mealType))
      .filter((m) => !(extraLock && m.day === extraLock.day && m.mealType === extraLock.mealType))
      .map(({ day, mealType, recipeId }) => ({ day, mealType, recipeId }));
    if (extraLock) locked.push(extraLock);
    const request = {
      ...options,
      people: settings.people,
      kcalPerPersonPerDay: settings.kcalPerPersonPerDay,
      mealTypes: settings.mealTypes,
      pantry: aggregatePantry(pantry),
      favoriteRecipeIds: favoriteIds,
      locked,
      effort: DEVICE_EFFORT,
    };

    const wishes = settings.preferences.trim();
    if (wishes && fromWeek === 0) {
      try {
        const result = await api.plan({ ...request, startDate, recipes: userRecipes, preferences: wishes, language: i18n.language });
        setPlan(result.plan, result.extraRecipes);
        setProgress(null);
        return;
      } catch (e) {
        if (!(e instanceof ApiError) || e.code !== "network") {
          setError(i18n.error(e));
          setProgress(null);
          return;
        }
        setNotice(t("plan.aiOffline"));
      }
    }

    try {
      let month: MonthPlan = { startDate, weeks: keepWeeks };
      for (let week = keepWeeks.length; week < MONTH_WEEKS.length; week++) {
        setProgress(week + 1);
        // Kurz Luft holen, damit die Fortschrittsanzeige erscheint.
        await wait(30);
        month = planMonth({
          request,
          recipes: [...catalog.recipes, ...userRecipes],
          ingredients,
          startDate,
          keepWeeks: month.weeks,
          untilWeek: week + 1,
        });
      }
      setPlan(month, []);
      setSelectedWeek(Math.max(fromWeek, weekOfDay(Math.max(0, daysBetween(startDate, today())))));
    } catch (e) {
      setError(e instanceof PlanError ? t(`errors.plan_${e.code}`) : i18n.error(e));
    } finally {
      setProgress(null);
    }
  };

  // Nach dem Fragebogen direkt den ersten Plan erstellen.
  useEffect(() => {
    if (store.pendingPlan && settings.onboarded) {
      store.setPendingPlan(false);
      createPlan(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.pendingPlan, settings.onboarded]);

  const openSwap = (meal: PlannedMeal) => {
    const ids = [...new Map([...catalog.recipes, ...userRecipes].map((r) => [r.id, r])).values()]
      .filter((r) => r.mealTypes.includes(meal.mealType) && matchesPreferences(r, options, ingredients))
      .map((r) => r.id);
    // Favoriten zuerst.
    setAlternatives(ids.sort((a, b) => Number(favoriteIds.includes(b)) - Number(favoriteIds.includes(a))));
    setSwap(meal);
  };

  const chooseAlternative = (recipeId: string) => {
    if (!swap) return;
    const target = swap;
    setSwap(null);
    // Ab der Woche des getauschten Gerichts neu planen, damit die Einkäufe wieder aufgehen.
    createPlan(weekOfDay(target.day), { day: target.day, mealType: target.mealType, recipeId });
  };

  const prefSummary = [
    t(`diets.${settings.diet}`),
    ...settings.rules.map((r) => t(`rules.${r}`)),
    settings.allergens.length > 0 ? t("plan.allergiesShort", { list: settings.allergens.map((a) => t(`allergens.${a}`)).join(", ") }) : null,
    t("common.perPerson", { kcal: settings.kcalPerPersonPerDay }),
  ].filter(Boolean);

  const week: WeekPlan | undefined = plan?.weeks[selectedWeek];
  const days = week ? Array.from({ length: week.days }, (_, i) => week.startDay + i) : [];
  const allDailyKcal = plan ? plan.weeks.flatMap((w) => w.dailyKcalPerPerson) : [];
  const monthPrice = plan ? plan.weeks.reduce((s, w) => s + w.totalPrice, 0) : 0;
  const avgKcal = allDailyKcal.length ? Math.round(allDailyKcal.reduce((a, b) => a + b, 0) / allDailyKcal.length) : 0;

  const renderMeal = (meal: PlannedMeal) => {
    const recipe = recipes.get(meal.recipeId);
    const name = recipe ? i18n.recipe(recipe).name : meal.recipeName;
    const eaten = eatenMeals.includes(mealKey(meal));
    const image = recipe?.media?.image?.uri;
    return (
      <View key={mealKey(meal)} style={{ gap: 4, paddingVertical: 6, borderTopWidth: 1, borderColor: colors.border }}>
        <Pressable onPress={() => router.push(`/recipe/${encodeURIComponent(meal.recipeId)}`)} style={[styles.row, { justifyContent: "flex-start" }]}>
          {image ? <Image source={{ uri: image }} style={{ width: 64, height: 36, borderRadius: 8 }} /> : null}
          <View style={{ flex: 1, gap: 2 }}>
            <Muted>
              {i18n.mealType(meal.mealType)}
              {meal.locked ? " · 🔒" : ""}
              {favoriteIds.includes(meal.recipeId) ? " · ♥" : ""}
            </Muted>
            <Text style={[styles.text, { fontWeight: "600" }]}>{name}</Text>
            <Muted>
              {t("common.portions", { n: i18n.number(meal.portions) })} · {t("common.perPerson", { kcal: meal.nutrientsPerPortion.kcal })}
            </Muted>
          </View>
        </Pressable>
        {meal.extras.length > 0 ? (
          <Text style={[styles.muted, { color: colors.primary }]}>
            {t("plan.extras", { list: meal.extras.map((e) => `${i18n.amount(e.amount, e.unit)} ${i18n.ingredientName(e.ingredientId)}`).join(", ") })}
          </Text>
        ) : null}
        <ChipRow>
          <Chip label={eaten ? t("plan.eaten") : t("plan.markEaten")} selected={eaten} disabled={eaten} onPress={() => markMealEaten(meal, name)} />
          <Chip label={meal.locked ? `🔒 ${t("plan.unlock")}` : t("plan.lock")} selected={meal.locked} onPress={() => toggleLock(meal)} />
          <Chip label={`⇄ ${t("plan.swap")}`} onPress={() => openSwap(meal)} disabled={loading} />
        </ChipRow>
      </View>
    );
  };

  return (
    <Screen>
      {!settings.onboarded ? (
        <Card title={t("plan.onboardingTitle")} icon="👋">
          <Muted>{t("plan.onboardingText")}</Muted>
          <Button label={t("plan.onboardingStart")} onPress={() => router.push("/onboarding")} />
        </Card>
      ) : (
        <Card title={plan ? t("plan.monthSummary") : t("plan.createMonth")} icon="📅">
          <Text style={styles.text}>{prefSummary.join(" · ")}</Text>
          <Link href="/onboarding" style={[styles.text, { color: colors.primary }]}>
            {t("plan.editPreferences")} ›
          </Link>
          <TextInput
            style={styles.input}
            placeholder={t("plan.wishesPlaceholder")}
            defaultValue={settings.preferences}
            onChangeText={(preferences) => store.updateSettings({ preferences })}
          />
          <Muted>{t("plan.pantryHint", { n: aggregatePantry(pantry).length })}</Muted>
          <Button label={plan ? t("plan.recreate") : t("plan.createMonth")} onPress={() => createPlan(0)} loading={loading} />
          {loading ? <Muted>{t("plan.progress", { n: progress!, total: MONTH_WEEKS.length })}</Muted> : null}
          {plan && !loading ? <Muted>{t("plan.replanHint")}</Muted> : null}
          {notice ? <Text style={styles.warning}>{notice}</Text> : null}
          <ErrorText message={error} />
        </Card>
      )}

      {plan ? (
        <Card>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {[
              { emoji: "💶", value: t("plan.approx", { price: i18n.price(monthPrice) }), label: t("plan.statPrice"), tint: colors.accentTint, color: colors.warning },
              { emoji: "🍽️", value: String(plan.weeks.reduce((n, w) => n + w.meals.length, 0)), label: t("plan.statMeals"), tint: colors.selected, color: colors.primaryDark },
              { emoji: "🔥", value: String(avgKcal), label: t("plan.statKcal"), tint: "#ECEBF8", color: "#5B57A8" },
            ].map((stat) => (
              <View key={stat.label} style={{ flex: 1, backgroundColor: stat.tint, borderRadius: 16, padding: 10, alignItems: "center", gap: 2 }}>
                <Text style={{ fontSize: 20 }}>{stat.emoji}</Text>
                <Text style={{ fontSize: 16, fontWeight: "800", color: stat.color }} numberOfLines={1} adjustsFontSizeToFit>
                  {stat.value}
                </Text>
                <Text style={[styles.muted, { textAlign: "center" }]}>{stat.label}</Text>
              </View>
            ))}
          </View>
          {plan.weeks.flatMap((w) => w.spoilageWarnings).map((w) => (
            <Text key={`${w.ingredientId}-${w.day}`} style={styles.warning}>
              {t("plan.spoilage", { name: i18n.ingredientName(w.ingredientId), days: w.shelfLifeDays, day: w.day + 1 })}
            </Text>
          ))}
        </Card>
      ) : null}

      {plan ? (
        <ChipRow>
          {plan.weeks.map((w, i) => (
            <Chip
              key={i}
              label={`${t("plan.week", { n: i + 1 })} · ${formatDay(addDays(plan.startDate, w.startDay), i18n.language)}`}
              selected={selectedWeek === i}
              onPress={() => setSelectedWeek(i)}
            />
          ))}
        </ChipRow>
      ) : null}

      {week ? <Muted>{t("plan.weekPrice", { price: t("plan.approx", { price: i18n.price(week.totalPrice) }) })}</Muted> : null}

      {days.map((day) => {
        const isToday = day === todayIndex;
        return (
          <Card key={day} style={{ paddingTop: 0, overflow: "hidden" }}>
            {/* Farbige Kopfzeile je Tag; heute in Grün hervorgehoben. */}
            <View
              style={{
                marginHorizontal: -18,
                paddingHorizontal: 18,
                paddingVertical: 12,
                backgroundColor: isToday ? colors.primary : colors.selected,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Text style={{ fontSize: 18 }}>{isToday ? "⭐" : "📅"}</Text>
              <Text style={[styles.cardTitle, { flex: 1, color: isToday ? colors.primaryText : colors.primaryDark }]}>
                {formatDay(addDays(plan!.startDate, day), i18n.language)}
                {isToday ? ` · ${t("tabs.today")}` : ""}
              </Text>
            </View>
            {week!.meals.filter((m) => m.day === day).map(renderMeal)}
          </Card>
        );
      })}

      <Modal visible={swap !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSwap(null)}>
        <View style={[styles.screen, { padding: 16, gap: 12 }]}>
          <View style={styles.row}>
            <Text style={[styles.cardTitle, { flex: 1 }]}>
              {swap && plan ? t("plan.swapTitle", { meal: i18n.mealType(swap.mealType), day: formatDay(addDays(plan.startDate, swap.day), i18n.language) }) : ""}
            </Text>
            <Button label={t("common.close")} variant="secondary" onPress={() => setSwap(null)} />
          </View>
          <Muted>{t("plan.swapHint")}</Muted>
          {alternatives.length === 0 ? (
            <Muted>{t("plan.noAlternatives")}</Muted>
          ) : (
            <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 40 }}>
              {alternatives.map((id) => {
                const recipe = recipes.get(id);
                if (!recipe) return null;
                return (
                  <Pressable key={id} onPress={() => chooseAlternative(id)} style={[styles.card, styles.row, { justifyContent: "flex-start" }]} accessibilityRole="button">
                    {recipe.media?.image ? <Image source={{ uri: recipe.media.image.uri }} style={{ width: 64, height: 36, borderRadius: 8 }} /> : null}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.text}>
                        {favoriteIds.includes(id) ? "♥ " : ""}
                        {i18n.recipe(recipe).name}
                      </Text>
                      <Muted>{t("common.minutes", { n: recipe.cookMinutes })}</Muted>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          {loading ? <ActivityIndicator color={colors.primary} /> : null}
        </View>
      </Modal>
    </Screen>
  );
}
