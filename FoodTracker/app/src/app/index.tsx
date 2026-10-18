import { Pressable, Text, View } from "react-native";
import { Card, Muted, NutrientRow, ProgressBar, Screen, styles } from "../components/ui";
import { sumNutrients, today } from "../lib/pantry";
import { useStore } from "../lib/store";

const SOURCE_LABEL = { foto: "📷 Foto", plan: "🗓️ Plan", manuell: "✍️ Manuell" } as const;

export default function TodayScreen() {
  const { diary, settings, removeDiaryEntry } = useStore();
  const entries = diary.filter((e) => e.date === today());
  const total = sumNutrients(entries.map((e) => e.nutrients));
  const target = settings.kcalPerPersonPerDay;

  return (
    <Screen>
      <Card title="Kalorien heute">
        <Text style={styles.heading}>
          {Math.round(total.kcal)} <Text style={styles.muted}>/ {target} kcal</Text>
        </Text>
        <ProgressBar value={total.kcal} max={target} />
        <NutrientRow nutrients={total} />
      </Card>

      <Card title="Mahlzeiten">
        {entries.length === 0 ? (
          <Muted>Noch nichts erfasst. Fotografiere dein Essen unter „Erfassen“ oder hake eine Mahlzeit im Plan ab.</Muted>
        ) : (
          entries.map((entry) => (
            <View key={entry.id} style={[styles.row, { paddingVertical: 6 }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.text}>{entry.title}</Text>
                <Muted>
                  {entry.time} · {SOURCE_LABEL[entry.source]} · {Math.round(entry.nutrients.kcal)} kcal
                </Muted>
              </View>
              <Pressable accessibilityLabel="Eintrag löschen" onPress={() => removeDiaryEntry(entry.id)} hitSlop={10}>
                <Text style={styles.muted}>✕</Text>
              </Pressable>
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}
