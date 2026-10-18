import { Pressable, Text, View } from "react-native";
import { Card, Muted, NutrientRow, ProgressBar, Screen, styles } from "../../components/ui";
import { useI18n } from "../../lib/i18n";
import { sumNutrients, today } from "../../lib/pantry";
import { useStore } from "../../lib/store";

export default function TodayScreen() {
  const { diary, settings, removeDiaryEntry } = useStore();
  const { t } = useI18n();
  const entries = diary.filter((e) => e.date === today());
  const total = sumNutrients(entries.map((e) => e.nutrients));
  const target = settings.kcalPerPersonPerDay;

  return (
    <Screen>
      <Card title={t("today.caloriesToday")}>
        <Text style={styles.heading}>
          {Math.round(total.kcal)} <Text style={styles.muted}>{t("today.ofTarget", { target })}</Text>
        </Text>
        <ProgressBar value={total.kcal} max={target} />
        <NutrientRow nutrients={total} />
      </Card>

      <Card title={t("today.meals")}>
        {entries.length === 0 ? (
          <Muted>{t("today.empty")}</Muted>
        ) : (
          entries.map((entry) => (
            <View key={entry.id} style={[styles.row, { paddingVertical: 6 }]}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.text}>{entry.title}</Text>
                <Muted>
                  {entry.time} · {t(`today.sources.${entry.source}`)} · {Math.round(entry.nutrients.kcal)} kcal
                </Muted>
              </View>
              <Pressable accessibilityLabel={t("today.deleteEntry")} onPress={() => removeDiaryEntry(entry.id)} hitSlop={10}>
                <Text style={styles.muted}>✕</Text>
              </Pressable>
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}
