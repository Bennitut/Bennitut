import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { Button, Card, ErrorText, Muted, Screen, colors, styles } from "../components/ui";
import { api } from "../lib/api";
import { useStore } from "../lib/store";
import type { MealType } from "../lib/types";

const MEAL_LABEL: Record<MealType, string> = { breakfast: "Frühstück", lunch: "Mittag", dinner: "Abend" };
const DIET_FILTERS = [
  { label: "ohne Fleisch", tag: "fleisch" },
  { label: "ohne Fisch", tag: "fisch" },
];

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Muted>{label}</Muted>
      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        defaultValue={String(value)}
        onEndEditing={(e) => {
          const n = parseInt(e.nativeEvent.text, 10);
          if (!Number.isNaN(n)) onChange(n);
        }}
      />
    </View>
  );
}

export default function PlanScreen() {
  const { settings, updateSettings, pantry, plan, setPlan, eatenMeals, markMealEaten } = useStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createPlan = async () => {
    setLoading(true);
    setError(null);
    try {
      const [catalog, result] = await Promise.all([
        api.catalog(),
        api.plan({
          days: settings.days,
          people: settings.people,
          kcalPerPersonPerDay: settings.kcalPerPersonPerDay,
          mealTypes: ["breakfast", "lunch", "dinner"],
          pantry,
          excludeTags: settings.excludeTags,
          preferences: settings.preferences.trim() || undefined,
        }),
      ]);
      setPlan(result.plan, [...catalog.recipes, ...result.extraRecipes]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Plan konnte nicht erstellt werden");
    } finally {
      setLoading(false);
    }
  };

  const toggleTag = (tag: string) =>
    updateSettings({
      excludeTags: settings.excludeTags.includes(tag)
        ? settings.excludeTags.filter((t) => t !== tag)
        : [...settings.excludeTags, tag],
    });

  const days = plan ? [...new Set(plan.meals.map((m) => m.day))] : [];

  return (
    <Screen>
      <Card title="Ernährungsplan erstellen">
        <View style={styles.row}>
          <NumberField label="kcal pro Person/Tag" value={settings.kcalPerPersonPerDay} onChange={(n) => updateSettings({ kcalPerPersonPerDay: n })} />
          <NumberField label="Personen" value={settings.people} onChange={(n) => updateSettings({ people: n })} />
          <NumberField label="Tage" value={settings.days} onChange={(n) => updateSettings({ days: n })} />
        </View>
        <View style={[styles.row, { justifyContent: "flex-start" }]}>
          {DIET_FILTERS.map((f) => (
            <Pressable
              key={f.tag}
              onPress={() => toggleTag(f.tag)}
              style={[styles.chip, settings.excludeTags.includes(f.tag) && { backgroundColor: "#DCEFE3" }]}
            >
              <Text style={styles.text}>{f.label}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          style={styles.input}
          placeholder="Wünsche für neue KI-Rezepte (optional), z. B. „mehr Eiweiß, schnell gekocht“"
          defaultValue={settings.preferences}
          onEndEditing={(e) => updateSettings({ preferences: e.nativeEvent.text })}
        />
        <Muted>Vorhandene Vorräte ({pantry.length} Zutaten) werden zuerst verplant.</Muted>
        <Button label={plan ? "Neuen Plan erstellen" : "Plan erstellen"} onPress={createPlan} loading={loading} />
        <ErrorText message={error} />
      </Card>

      {plan ? (
        <Card title="Zusammenfassung">
          <Text style={styles.text}>
            ♻️ Reste: {(plan.wasteRatio * 100).toFixed(1)} % der verderblichen Einkäufe · 💶 {plan.totalPrice.toFixed(2)} €
          </Text>
          <Muted>Ø {Math.round(plan.dailyKcalPerPerson.reduce((a, b) => a + b, 0) / plan.dailyKcalPerPerson.length)} kcal pro Person und Tag</Muted>
          {plan.spoilageWarnings.map((w) => (
            <Text key={w} style={styles.warning}>
              ⚠️ {w}
            </Text>
          ))}
        </Card>
      ) : null}

      {days.map((day) => (
        <Card key={day} title={`Tag ${day + 1}`}>
          {plan!.meals.map((meal, index) =>
            meal.day !== day ? null : (
              <View key={index} style={[styles.row, { paddingVertical: 4 }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Muted>{MEAL_LABEL[meal.mealType]}</Muted>
                  <Text style={styles.text}>{meal.recipeName}</Text>
                  <Muted>
                    {meal.portions} Portion(en) · {meal.nutrientsPerPortion.kcal} kcal p. P.
                  </Muted>
                  {meal.extras.length > 0 ? (
                    <Text style={[styles.muted, { color: colors.primary }]}>
                      ♻️ Reste mitverwenden: {meal.extras.map((e) => `${e.amount} ${e.unit} ${e.name}`).join(", ")}
                    </Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => markMealEaten(index)}
                  disabled={eatenMeals.includes(index)}
                  style={[styles.chip, eatenMeals.includes(index) && { backgroundColor: "#DCEFE3" }]}
                  accessibilityLabel="Als gegessen markieren"
                >
                  <Text style={styles.text}>{eatenMeals.includes(index) ? "✓" : "Gegessen"}</Text>
                </Pressable>
              </View>
            ),
          )}
        </Card>
      ))}
    </Screen>
  );
}
