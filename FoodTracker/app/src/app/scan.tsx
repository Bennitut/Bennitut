import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { Button, Card, ErrorText, Muted, NutrientRow, Screen, styles } from "../components/ui";
import { api, type ImageMediaType } from "../lib/api";
import { useStore } from "../lib/store";
import type { MealAnalysis, PantryItem, ReceiptAnalysis } from "../lib/types";

type Mode = "meal" | "receipt";

const PORTIONS = [0.5, 1, 1.5];

function toMediaType(mimeType: string | undefined): ImageMediaType {
  return mimeType === "image/png" || mimeType === "image/webp" || mimeType === "image/gif" ? mimeType : "image/jpeg";
}

export default function ScanScreen() {
  const { addDiaryEntry, addPantryItems, ingredients } = useStore();
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
        setError("Ohne Kamerazugriff kann kein Foto aufgenommen werden.");
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
      const mediaType = toMediaType(asset.mimeType);
      if (mode === "meal") {
        setMeal(await api.analyzeMeal(asset.base64, mediaType));
        setPortion(1);
      } else {
        setReceipt(await api.analyzeReceipt(asset.base64, mediaType));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analyse fehlgeschlagen");
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
      <View style={[styles.row, { justifyContent: "flex-start" }]}>
        {(["meal", "receipt"] as const).map((m) => (
          <Pressable
            key={m}
            onPress={() => reset(m)}
            style={[styles.chip, mode === m && { backgroundColor: "#DCEFE3" }]}
            accessibilityRole="button"
          >
            <Text style={styles.text}>{m === "meal" ? "🍽️ Mahlzeit" : "🧾 Kassenbon"}</Text>
          </Pressable>
        ))}
      </View>

      <Card title={mode === "meal" ? "Mahlzeit fotografieren" : "Kassenbon fotografieren"}>
        <Muted>
          {mode === "meal"
            ? "Die KI erkennt Lebensmittel und schätzt Menge und Nährwerte."
            : "Die KI liest den Bon und übernimmt gekaufte Lebensmittel in deinen Vorrat."}
        </Muted>
        <Button label="📷 Foto aufnehmen" onPress={() => pick("camera")} loading={loading} />
        <Button label="Aus Galerie wählen" variant="secondary" onPress={() => pick("library")} disabled={loading} />
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
            Sicherheit: {meal.confidence}. {meal.notes}
          </Muted>
          <Text style={styles.text}>Wie viel davon hast du gegessen?</Text>
          <View style={[styles.row, { justifyContent: "flex-start" }]}>
            {PORTIONS.map((p) => (
              <Pressable
                key={p}
                onPress={() => setPortion(p)}
                style={[styles.chip, portion === p && { backgroundColor: "#DCEFE3" }]}
              >
                <Text style={styles.text}>{p === 1 ? "Alles" : `${p}×`}</Text>
              </Pressable>
            ))}
          </View>
          <Button label={saved ? "✓ Im Tagebuch" : "Ins Tagebuch übernehmen"} onPress={saveMeal} disabled={saved} />
        </Card>
      ) : null}

      {receipt ? (
        <Card title={receipt.receipt.store ?? "Kassenbon"}>
          {receipt.receipt.items.map((item, i) => {
            const ingredient = item.ingredientId ? ingredients.get(item.ingredientId) : undefined;
            return (
              <View key={i} style={styles.row}>
                <Text style={[styles.text, { flex: 1, opacity: item.isFood ? 1 : 0.5 }]}>{item.name}</Text>
                <Text style={styles.muted}>
                  {ingredient ? `→ ${ingredient.name} (${item.quantity} ${ingredient.unit})` : item.isFood ? "nicht zugeordnet" : "kein Lebensmittel"}
                </Text>
              </View>
            );
          })}
          {receipt.receipt.total != null ? <Muted>Summe: {receipt.receipt.total.toFixed(2)} €</Muted> : null}
          <Button
            label={saved ? "✓ Im Vorrat" : `${receipt.pantry.length} Lebensmittel in den Vorrat`}
            onPress={saveReceipt}
            disabled={saved || receipt.pantry.length === 0}
          />
        </Card>
      ) : null}
    </Screen>
  );
}
