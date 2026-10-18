import { File } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import * as VideoThumbnails from "expo-video-thumbnails";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";
import { Button, Card, ErrorText, Field, Muted, Screen, styles } from "../../components/ui";
import { api, type ImagePayload } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { useStore } from "../../lib/store";
import type { Recipe } from "../../lib/types";

/** So viele Einzelbilder schicken wir aus einem Video an Claude. */
const FRAME_COUNT = 6;

/** Verteilt Einzelbilder gleichmäßig über das Video (Anfang und Ende auslassen). */
async function extractFrames(uri: string, durationMs: number): Promise<ImagePayload[]> {
  const frames: ImagePayload[] = [];
  for (let i = 1; i <= FRAME_COUNT; i++) {
    const time = Math.round((durationMs * i) / (FRAME_COUNT + 1));
    try {
      const thumb = await VideoThumbnails.getThumbnailAsync(uri, { time, quality: 0.5 });
      frames.push({ data: await new File(thumb.uri).base64(), mediaType: "image/jpeg" });
    } catch {
      // Einzelne Bilder dürfen fehlen.
    }
  }
  return frames;
}

export default function ImportRecipeScreen() {
  const { saveRecipe, ingredients } = useStore();
  const i18n = useI18n();
  const { t } = i18n;
  const [url, setUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [frames, setFrames] = useState<ImagePayload[]>([]);
  const [loading, setLoading] = useState<"frames" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recipe, setRecipe] = useState<Recipe | null>(null);

  const pickVideo = async () => {
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: "videos" });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    setLoading("frames");
    try {
      // `duration` ist in Millisekunden; ohne Angabe nehmen wir die ersten 60 Sekunden an.
      setFrames(await extractFrames(asset.uri, asset.duration ?? 60_000));
    } finally {
      setLoading(null);
    }
  };

  const start = async () => {
    setLoading("import");
    setError(null);
    try {
      const result = await api.importRecipe({
        url: url.trim() || undefined,
        caption: caption.trim() || undefined,
        frames,
        language: i18n.language,
      });
      setRecipe(result.recipe);
    } catch (e) {
      setError(i18n.error(e));
    } finally {
      setLoading(null);
    }
  };

  const save = () => {
    if (!recipe) return;
    saveRecipe(recipe);
    router.dismissTo(`/recipe/${encodeURIComponent(recipe.id)}`);
  };

  return (
    <Screen>
      <Card>
        <Muted>{t("import.hint")}</Muted>
        <Field label={t("import.url")}>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={setUrl}
            placeholder={t("import.urlPlaceholder")}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </Field>
        <Field label={t("import.caption")} hint={t("import.captionHint")}>
          <TextInput style={[styles.input, { minHeight: 80 }]} value={caption} onChangeText={setCaption} multiline />
        </Field>
        <Field label={t("import.video")} hint={t("import.videoHint")}>
          <Button label={t("import.pickVideo")} variant="secondary" onPress={pickVideo} loading={loading === "frames"} />
        </Field>
        {frames.length > 0 ? <Muted>✓ {t("import.frames", { n: frames.length })}</Muted> : null}
        <Button
          label={t("import.start")}
          onPress={start}
          loading={loading === "import"}
          disabled={loading !== null || (!url.trim() && !caption.trim() && frames.length === 0)}
        />
        <ErrorText message={error} />
      </Card>

      {recipe ? (
        <Card title={recipe.name}>
          <Muted>{t("import.review")}</Muted>
          <Muted>
            {t("common.minutes", { n: recipe.cookMinutes })} · {recipe.mealTypes.map(i18n.mealType).join(", ")}
          </Muted>
          <Text style={styles.label}>{t("recipes.ingredients")}</Text>
          {recipe.ingredients.map((ri) => (
            <View key={ri.ingredientId} style={styles.row}>
              <Text style={styles.text}>{i18n.ingredientName(ri.ingredientId)}</Text>
              <Muted>{i18n.amount(ri.amount, ingredients.get(ri.ingredientId)?.unit ?? "g")}</Muted>
            </View>
          ))}
          {recipe.otherIngredients.map((line, i) => (
            <Muted key={i}>• {line}</Muted>
          ))}
          <Text style={styles.label}>{t("recipes.steps")}</Text>
          {recipe.steps.map((step, i) => (
            <Text key={i} style={styles.text}>
              {i + 1}. {step}
            </Text>
          ))}
          <Button label={t("common.save")} onPress={save} />
        </Card>
      ) : null}
    </Screen>
  );
}
