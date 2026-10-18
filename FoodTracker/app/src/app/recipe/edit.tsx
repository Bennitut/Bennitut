import { Stack, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { IngredientPicker } from "../../components/IngredientPicker";
import { Button, Card, Chip, ChipRow, ErrorText, Field, Screen, styles } from "../../components/ui";
import { useI18n } from "../../lib/i18n";
import { newId } from "../../lib/pantry";
import { useStore } from "../../lib/store";
import { MEAL_TYPES, type MealType, type Recipe } from "../../lib/types";

interface DraftIngredient {
  ingredientId: string;
  /** Menge für alle Portionen als Text, damit die Eingabe frei bleibt. */
  amount: string;
}

const parseNumber = (text: string) => parseFloat(text.replace(",", "."));
const lines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

export default function RecipeEditorScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { myRecipes, ingredients, saveRecipe } = useStore();
  const i18n = useI18n();
  const { t } = i18n;
  const existing = id ? myRecipes.find((r) => r.id === id) : undefined;
  const existingText = existing ? i18n.recipe(existing) : undefined;

  // Bestehende Rezepte werden pro Portion bearbeitet; neue für die Portionen, für die man kocht.
  const [name, setName] = useState(existingText?.name ?? "");
  const [servings, setServings] = useState(existing ? "1" : "2");
  const [cookMinutes, setCookMinutes] = useState(String(existing?.cookMinutes ?? 30));
  const [mealTypes, setMealTypes] = useState<MealType[]>(existing?.mealTypes ?? ["lunch", "dinner"]);
  const [items, setItems] = useState<DraftIngredient[]>(
    existing?.ingredients.map((ri) => ({ ingredientId: ri.ingredientId, amount: String(ri.amount) })) ?? [],
  );
  const [other, setOther] = useState(existingText?.otherIngredients.join("\n") ?? "");
  const [steps, setSteps] = useState(existingText?.steps.join("\n") ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleMealType = (m: MealType) =>
    setMealTypes((current) => (current.includes(m) ? current.filter((x) => x !== m) : [...current, m]));

  const save = () => {
    const portions = Math.max(1, parseNumber(servings) || 1);
    const parsed = items
      .map((i) => ({ ingredientId: i.ingredientId, amount: Math.round((parseNumber(i.amount) / portions) * 100) / 100 }))
      .filter((i) => i.amount > 0);
    if (!name.trim()) return setError(t("editor.nameRequired"));
    if (parsed.length === 0) return setError(t("editor.ingredientRequired"));
    if (mealTypes.length === 0) return setError(t("editor.mealTypeRequired"));

    const recipe: Recipe = {
      id: existing?.id ?? `eigen_${newId()}`,
      // Nach dem Bearbeiten gilt der Text in der aktuellen Sprache als Original; alte Übersetzungen wären veraltet.
      language: i18n.language,
      name: name.trim(),
      steps: lines(steps),
      otherIngredients: lines(other),
      mealTypes,
      ingredients: parsed,
      cookMinutes: Math.max(0, Math.round(parseNumber(cookMinutes) || 0)),
      tags: existing?.tags ?? [],
      source: existing?.source ?? { kind: "eigen" },
    };
    saveRecipe(recipe);
    router.dismissTo(`/recipe/${encodeURIComponent(recipe.id)}`);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? t("editor.editTitle") : t("editor.newTitle") }} />
      <Card>
        <Field label={t("editor.name")}>
          <TextInput style={styles.input} value={name} onChangeText={setName} accessibilityLabel={t("editor.name")} />
        </Field>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Field label={t("editor.servings")}>
              <TextInput style={styles.input} value={servings} onChangeText={setServings} keyboardType="number-pad" accessibilityLabel={t("editor.servings")} />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label={t("editor.cookMinutes")}>
              <TextInput style={styles.input} value={cookMinutes} onChangeText={setCookMinutes} keyboardType="number-pad" accessibilityLabel={t("editor.cookMinutes")} />
            </Field>
          </View>
        </View>
        <Field label={t("editor.mealTypes")}>
          <ChipRow>
            {MEAL_TYPES.map((m) => (
              <Chip key={m} label={i18n.mealType(m)} selected={mealTypes.includes(m)} onPress={() => toggleMealType(m)} />
            ))}
          </ChipRow>
        </Field>
      </Card>

      <Card title={t("editor.ingredients")}>
        {items.map((item, index) => {
          const unit = ingredients.get(item.ingredientId)?.unit ?? "g";
          return (
            <View key={item.ingredientId} style={styles.row}>
              <Text style={[styles.text, { flex: 1 }]}>{i18n.ingredientName(item.ingredientId)}</Text>
              <TextInput
                style={[styles.input, { width: 80 }]}
                value={item.amount}
                keyboardType="decimal-pad"
                accessibilityLabel={t("editor.amount")}
                onChangeText={(amount) => setItems((list) => list.map((x, i) => (i === index ? { ...x, amount } : x)))}
              />
              <Text style={[styles.muted, { width: 32 }]}>{i18n.unit(unit)}</Text>
              <Pressable onPress={() => setItems((list) => list.filter((_, i) => i !== index))} hitSlop={10} accessibilityLabel={t("common.delete")}>
                <Text style={styles.muted}>✕</Text>
              </Pressable>
            </View>
          );
        })}
        <Button label={`＋ ${t("editor.addIngredient")}`} variant="secondary" onPress={() => setPickerOpen(true)} />
      </Card>

      <Card>
        <Field label={t("editor.other")}>
          <TextInput style={[styles.input, { minHeight: 80 }]} value={other} onChangeText={setOther} multiline accessibilityLabel={t("editor.other")} />
        </Field>
        <Field label={t("editor.steps")}>
          <TextInput style={[styles.input, { minHeight: 140 }]} value={steps} onChangeText={setSteps} multiline accessibilityLabel={t("editor.steps")} />
        </Field>
      </Card>

      <ErrorText message={error} />
      <Button label={t("common.save")} onPress={save} />

      <IngredientPicker
        visible={pickerOpen}
        title={t("editor.addIngredient")}
        exclude={items.map((i) => i.ingredientId)}
        onClose={() => setPickerOpen(false)}
        onSelect={(ingredientId) => {
          setItems((list) => [...list, { ingredientId, amount: "" }]);
          setPickerOpen(false);
        }}
      />
    </Screen>
  );
}
