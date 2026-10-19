import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Image, Text, View } from "react-native";
import { Button, Card, Chip, ChipRow, ErrorText, Muted, NutrientRow, Screen, styles } from "../../components/ui";
import { api, toMediaType } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { useStore } from "../../lib/store";
import type { MealAnalysis, PantryItem, ReceiptAnalysis } from "../../lib/types";

type Mode = "meal" | "receipt";

const PORTIONS = [0.5, 1, 1.5];

export default function ScanScreen() {
  const { addDiaryEntry, addPantryItems, ingredients } = useStore();
  const i18n = useI18n();
  const { t } = i18n;
  const [mode, setMode] = useState<Mode>("meal");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meal, setMeal] = useState<MealAnalysis | null>(null);
  const [portion, setPortion] = useState(1);
  const [receipt, setReceipt] = useState<{ receipt: ReceiptAnalysis; pantry: PantryItem[] } | null>(null);
  const [saved, setSaved] = useState(false);

  const reset = (nextMode: Mode) => {
    setMode(nextMode);
    setImageUri(null);
    setMeal(null);
    setReceipt(null);
    setError(null);
    setSaved(false);
  };

  const pick = async (source: "camera" | "library") => {
    setError(null);
    if (source === "camera") {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError(t("scan.cameraDenied"));
        return;
      }
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: "images", base64: true, quality: 0.5 };
    const result =
      source === "camera" ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset?.base64) return;

    reset(mode);
    setImageUri(asset.uri);
    setLoading(true);
    try {
      const image = { data: asset.base64, mediaType: toMediaType(asset.mimeType) };
      if (mode === "meal") {
        setMeal(await api.analyzeMeal(image, i18n.language));
        setPortion(1);
      } else {
        setReceipt(await api.analyzeReceipt(image, i18n.language));
      }
    } catch (e) {
      setError(i18n.error(e));
    } finally {
      setLoading(false);
    }
  };

  const saveMeal = () => {
    if (!meal) return;
    addDiaryEntry({
      title: meal.description,
      source: "foto",
      nutrients: {
        kcal: meal.total.kcal * portion,
        protein: meal.total.protein * portion,
        carbs: meal.total.carbs * portion,
        fat: meal.total.fat * portion,
      },
    });
    setSaved(true);
  };

  const saveReceipt = () => {
    if (!receipt) return;
    addPantryItems(receipt.pantry);
    setSaved(true);
  };

  return (
    <Screen>
      <ChipRow>
        {(["meal", "receipt"] as const).map((m) => (
          <Chip key={m} label={t(m === "meal" ? "scan.meal" : "scan.receipt")} selected={mode === m} onPress={() => reset(m)} />
        ))}
      </ChipRow>

      <Card title={t(mode === "meal" ? "scan.mealTitle" : "scan.receiptTitle")} icon={mode === "meal" ? "🍽️" : "🧾"}>
        <Muted>{t(mode === "meal" ? "scan.mealHint" : "scan.receiptHint")}</Muted>
        <Button label={t("scan.takePhoto")} onPress={() => pick("camera")} loading={loading} />
        <Button label={t("scan.fromLibrary")} variant="secondary" onPress={() => pick("library")} disabled={loading} />
        <ErrorText message={error} />
      </Card>

      {imageUri ? <Image source={{ uri: imageUri }} style={{ width: "100%", height: 220, borderRadius: 14 }} /> : null}

      {meal ? (
        <Card title={meal.description}>
          {meal.items.map((item, i) => (
            <View key={i} style={styles.row}>
              <Text style={[styles.text, { flex: 1 }]}>
                {item.name} <Text style={styles.muted}>~{Math.round(item.estimatedGrams)} g</Text>
              </Text>
              <Text style={styles.muted}>{Math.round(item.nutrients.kcal)} kcal</Text>
            </View>
          ))}
          <NutrientRow nutrients={meal.total} />
          <Muted>
            {t("scan.confidence", { level: t(`scan.confidenceLevels.${meal.confidence}`) })} {meal.notes}
          </Muted>
          <Text style={styles.text}>{t("scan.howMuch")}</Text>
          <ChipRow>
            {PORTIONS.map((p) => (
              <Chip key={p} label={p === 1 ? t("scan.all") : `${i18n.number(p)}×`} selected={portion === p} onPress={() => setPortion(p)} />
            ))}
          </ChipRow>
          <Button label={saved ? t("scan.inDiary") : t("scan.addToDiary")} onPress={saveMeal} disabled={saved} />
        </Card>
      ) : null}

      {receipt ? (
        <Card title={receipt.receipt.store ?? t("scan.receiptFallbackTitle")}>
          {receipt.receipt.items.map((item, i) => {
            const ingredient = item.ingredientId ? ingredients.get(item.ingredientId) : undefined;
            return (
              <View key={i} style={styles.row}>
                <Text style={[styles.text, { flex: 1, opacity: item.isFood ? 1 : 0.5 }]}>{item.name}</Text>
                <Text style={styles.muted}>
                  {ingredient
                    ? t("scan.mapped", { name: i18n.ingredientName(ingredient.id), amount: i18n.number(item.quantity), unit: i18n.unit(ingredient.unit) })
                    : t(item.isFood ? "scan.notMapped" : "scan.notFood")}
                </Text>
              </View>
            );
          })}
          {receipt.receipt.total != null ? (
            <Muted>{t("scan.total", { amount: `${i18n.number(receipt.receipt.total)} ${receipt.receipt.currency ?? ""}`.trim() })}</Muted>
          ) : null}
          <Button
            label={saved ? t("scan.inPantry") : t("scan.addToPantry", { n: receipt.pantry.length })}
            onPress={saveReceipt}
            disabled={saved || receipt.pantry.length === 0}
          />
        </Card>
      ) : null}
    </Screen>
  );
}
