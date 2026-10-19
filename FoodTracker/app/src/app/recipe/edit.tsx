import { Stack, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Image, Pressable, Text, TextInput, View } from "react-native";
import { IngredientPicker } from "../../components/IngredientPicker";
import { Badge, Button, Card, Chip, ChipRow, ErrorText, Field, Screen, colors, styles } from "../../components/ui";
import { useI18n } from "../../lib/i18n";
import { api } from "../../lib/api";
import { newId } from "../../lib/pantry";
import { CameraDeniedError, pickRecipePhoto } from "../../lib/photos";
import { useStore } from "../../lib/store";
import { MEAL_TYPES, type MealType, type Recipe, type RecipeVideo } from "../../lib/types";

interface DraftIngredient {
  ingredientId: string;
  /** Menge für alle Portionen als Text, damit die Eingabe frei bleibt. */
  amount: string;
}

/** Plattform eines Video-Links; unbekannte Seiten gelten als "web". */
function videoFromUrl(text: string): RecipeVideo | null {
  const url = text.trim();
  if (!/^https?:\/\/\S+$/i.test(url)) return null;
  const host = url.replace(/^https?:\/\//i, "").split("/")[0]!.toLowerCase();
  const platform: RecipeVideo["platform"] = /(^|\.)(youtube\.com|youtu\.be)$/.test(host)
    ? "youtube"
    : /(^|\.)tiktok\.com$/.test(host)
      ? "tiktok"
      : /(^|\.)instagram\.com$/.test(host)
        ? "instagram"
        : "web";
  return { platform, url };
}


const parseNumber = (text: string) => parseFloat(text.replace(",", "."));
const lines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

export default function RecipeEditorScreen() {
  const { id, admin } = useLocalSearchParams<{ id?: string; admin?: string }>();
  const { myRecipes, ingredients, saveRecipe, recipes, isAdmin, refreshOverrides } = useStore();
  const i18n = useI18n();
  const { t } = i18n;
  // Admins bearbeiten Katalogrezepte für alle Nutzer:innen; sonst nur eigene Rezepte.
  const adminMode = admin === "1" && isAdmin;
  const existing = id ? (adminMode ? recipes.get(id) : myRecipes.find((r) => r.id === id)) : undefined;
  const [saving, setSaving] = useState(false);
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
  const [photo, setPhoto] = useState(existing?.media?.image);
  const [videoUrl, setVideoUrl] = useState(existing?.media?.videos?.[0]?.url ?? "");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickPhoto = async (source: "camera" | "library") => {
    setError(null);
    try {
      const uri = await pickRecipePhoto(source);
      if (uri) setPhoto({ uri });
    } catch (e) {
      setError(e instanceof CameraDeniedError ? t("scan.cameraDenied") : i18n.error(e));
    }
  };

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
    const video = videoFromUrl(videoUrl);
    // Weitere Videos (z. B. vom Import) bleiben erhalten; das erste ist das hier bearbeitete.
    const otherVideos = (existing?.media?.videos ?? []).slice(1).filter((v) => v.url !== video?.url);
    const videos = [...(video ? [video] : []), ...otherVideos];

    const media = photo || videos.length > 0 ? { ...(photo ? { image: photo } : {}), ...(videos.length > 0 ? { videos } : {}) } : undefined;
    if (adminMode && existing) {
      const text = { name: name.trim(), steps: lines(steps), otherIngredients: lines(other) };
      // Text in der Originalsprache ersetzt das Original, sonst wird es die Übersetzung dieser Sprache.
      const textPatch = i18n.language === existing.language ? text : { translations: { ...existing.translations, [i18n.language]: text } };
      setSaving(true);
      api
        .adminSaveRecipe(existing.id, {
          ...textPatch,
          mealTypes,
          ingredients: parsed,
          cookMinutes: Math.max(0, Math.round(parseNumber(cookMinutes) || 0)),
          ...(media ? { media } : {}),
        })
        .then(refreshOverrides)
        .then(() => router.dismissTo(`/recipe/${encodeURIComponent(existing.id)}`))
        .catch((e) => setError(i18n.error(e)))
        .finally(() => setSaving(false));
      return;
    }

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
      ...(media ? { media } : {}),
    };
    saveRecipe(recipe);
    router.dismissTo(`/recipe/${encodeURIComponent(recipe.id)}`);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: adminMode ? t("admin.editAsAdmin") : existing ? t("editor.editTitle") : t("editor.newTitle") }} />
      {adminMode ? <Badge label={t("admin.adminEditHint")} color={colors.warning} tint={colors.accentTint} /> : null}
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

      <Card title={t("editor.photo")} icon="📷">
        {photo ? <Image source={{ uri: photo.uri }} style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 10 }} resizeMode="cover" /> : null}
        <View style={styles.chipRow}>
          <Button label={t("scan.takePhoto")} variant="secondary" onPress={() => pickPhoto("camera")} />
          <Button label={t("editor.addPhoto")} variant="secondary" onPress={() => pickPhoto("library")} />
          {photo ? <Button label={t("editor.removePhoto")} variant="secondary" onPress={() => setPhoto(undefined)} /> : null}
        </View>
        <Field label={t("editor.video")}>
          <TextInput
            style={styles.input}
            value={videoUrl}
            onChangeText={setVideoUrl}
            autoCapitalize="none"
            keyboardType="url"
            placeholder="https://"
            accessibilityLabel={t("editor.video")}
          />
        </Field>
      </Card>

      <Card title={t("editor.ingredients")} icon="🧺">
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
      <Button label={t("common.save")} onPress={save} loading={saving} />

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
