import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { IngredientPicker } from "../../components/IngredientPicker";
import { RecipeRow } from "../../components/RecipeRow";
import { Button, Card, Field, Muted, Screen, colors, styles } from "../../components/ui";
import { useI18n } from "../../lib/i18n";
import { daysLeft, totalOf } from "../../lib/pantry";
import { useStore } from "../../lib/store";
import type { Ingredient } from "../../lib/types";

const CATEGORY_ORDER: Ingredient["category"][] = [
  "gemuese",
  "obst",
  "milch_ei",
  "fleisch",
  "fisch",
  "pflanzlich",
  "getreide",
  "huelsenfruechte",
  "nuesse_samen",
  "vorrat",
];

/** Ab wie vielen Tagen Resthaltbarkeit ein Lebensmittel als „bald verbrauchen“ gilt. */
const SOON_DAYS = 2;

interface Row {
  ingredient: Ingredient;
  amount: number;
  daysLeft: number | null;
}

export default function PantryScreen() {
  const { pantry, ingredients, setPantryAmount, recipes, favoriteIds } = useStore();
  const i18n = useI18n();
  const { t } = i18n;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editing, setEditing] = useState<{ ingredient: Ingredient; amount: string } | null>(null);

  const rows: Row[] = useMemo(() => {
    const ids = [...new Set(pantry.map((s) => s.ingredientId))];
    return ids
      .map((id) => ingredients.get(id))
      .filter((i): i is Ingredient => !!i)
      .map((ingredient) => ({ ingredient, amount: totalOf(pantry, ingredient.id), daysLeft: daysLeft(pantry, ingredient) }))
      .filter((r) => r.amount > 0.01)
      .sort((a, b) => i18n.ingredientName(a.ingredient.id).localeCompare(i18n.ingredientName(b.ingredient.id), i18n.language));
  }, [pantry, ingredients, i18n]);

  const soon = rows.filter((r) => r.daysLeft !== null && r.daysLeft <= SOON_DAYS).sort((a, b) => a.daysLeft! - b.daysLeft!);

  // Rezepte, für die schon viel im Vorrat ist – bald Ablaufendes zählt doppelt.
  const suggestions = useMemo(() => {
    if (rows.length === 0) return [];
    const inStock = new Set(rows.map((r) => r.ingredient.id));
    const urgent = new Set(soon.map((r) => r.ingredient.id));
    return [...recipes.values()]
      .map((recipe) => {
        const have = recipe.ingredients.filter((ri) => inStock.has(ri.ingredientId)).length;
        const usesUrgent = recipe.ingredients.some((ri) => urgent.has(ri.ingredientId));
        return { recipe, have, total: recipe.ingredients.length, score: have / recipe.ingredients.length + (usesUrgent ? 0.5 : 0) };
      })
      .filter((s) => s.have / s.total >= 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [recipes, rows, soon]);

  const status = (r: Row) => {
    if (r.daysLeft === null) return "";
    if (r.daysLeft < 0) return t("pantry.expired");
    if (r.daysLeft === 0) return t("pantry.lastDay");
    return t("pantry.daysLeft", { n: r.daysLeft });
  };
  const statusColor = (r: Row) =>
    r.daysLeft !== null && r.daysLeft <= 0 ? colors.danger : r.daysLeft !== null && r.daysLeft <= SOON_DAYS ? colors.warning : colors.muted;

  const openEditor = (ingredient: Ingredient, amount: number) => setEditing({ ingredient, amount: String(Math.round(amount * 10) / 10) });

  const saveEdit = () => {
    if (!editing) return;
    const amount = parseFloat(editing.amount.replace(",", "."));
    if (!Number.isNaN(amount)) setPantryAmount(editing.ingredient.id, amount);
    setEditing(null);
  };

  const renderRow = (r: Row) => (
    <Pressable key={r.ingredient.id} onPress={() => openEditor(r.ingredient, r.amount)} style={[styles.row, { paddingVertical: 6 }]} accessibilityRole="button">
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.text}>{i18n.ingredientName(r.ingredient.id)}</Text>
        {status(r) ? <Text style={[styles.muted, { color: statusColor(r) }]}>{status(r)}</Text> : null}
      </View>
      <Text style={styles.text}>{i18n.amount(r.amount, r.ingredient.unit)}</Text>
    </Pressable>
  );

  return (
    <Screen>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Button label={t("pantry.add")} onPress={() => setPickerOpen(true)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label={t("pantry.scanReceipt")} variant="secondary" onPress={() => router.push("/scan")} />
        </View>
      </View>

      {rows.length === 0 ? (
        <Card>
          <Muted>{t("pantry.empty")}</Muted>
        </Card>
      ) : (
        <>
          {soon.length > 0 ? <Card title={`⏳ ${t("pantry.soon")}`}>{soon.map(renderRow)}</Card> : null}

          {suggestions.length > 0 ? (
            <Card title={`🍳 ${t("pantry.cookWith")}`}>
              {suggestions.map((s) => (
                <RecipeRow
                  key={s.recipe.id}
                  recipe={s.recipe}
                  favorite={favoriteIds.includes(s.recipe.id)}
                  subtitle={t("pantry.coverage", { have: s.have, total: s.total })}
                />
              ))}
            </Card>
          ) : null}

          <Muted>{t("pantry.items", { n: rows.length })}</Muted>
          {CATEGORY_ORDER.map((category) => {
            const inCategory = rows.filter((r) => r.ingredient.category === category);
            return inCategory.length === 0 ? null : (
              <Card key={category} title={t(`pantry.categories.${category}`)}>
                {inCategory.map(renderRow)}
              </Card>
            );
          })}
        </>
      )}

      <IngredientPicker
        visible={pickerOpen}
        title={t("pantry.add")}
        onClose={() => setPickerOpen(false)}
        onSelect={(id) => {
          setPickerOpen(false);
          const ingredient = ingredients.get(id);
          // Vorschlag: eine Packung zusätzlich zum vorhandenen Bestand.
          if (ingredient) openEditor(ingredient, totalOf(pantry, id) + ingredient.packSize);
        }}
      />

      <Modal visible={editing !== null} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "center", padding: 24 }}>
          {editing ? (
            <Card title={i18n.ingredientName(editing.ingredient.id)}>
              <Field label={t("pantry.amount", { unit: i18n.unit(editing.ingredient.unit) })}>
                <TextInput
                  style={styles.input}
                  value={editing.amount}
                  onChangeText={(amount) => setEditing({ ...editing, amount })}
                  keyboardType="decimal-pad"
                  autoFocus
                  selectTextOnFocus
                  accessibilityLabel={t("pantry.amount", { unit: i18n.unit(editing.ingredient.unit) })}
                />
              </Field>
              <Button label={t("common.save")} onPress={saveEdit} />
              <Button
                label={t("pantry.remove")}
                variant="secondary"
                onPress={() => {
                  setPantryAmount(editing.ingredient.id, 0);
                  setEditing(null);
                }}
              />
              <Button label={t("common.cancel")} variant="secondary" onPress={() => setEditing(null)} />
            </Card>
          ) : null}
        </View>
      </Modal>
    </Screen>
  );
}
