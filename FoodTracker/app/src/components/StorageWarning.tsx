import { Text, View } from "react-native";
import { useI18n } from "../lib/i18n";
import { useStore } from "../lib/store";
import { colors, styles } from "./ui";

/** Hellrot hinter `colors.danger` (Kontrast 4,8 : 1). */
const DANGER_TINT = "#FDECEA";

/** Hinweis unter „Heute“ und im Profil, wenn Tagebuch oder übriger Zustand nicht gespeichert werden konnten. */
export function StorageWarning() {
  const { storageIssues } = useStore();
  const { t } = useI18n();
  const key =
    storageIssues.diary === "unreadable"
      ? "storage.diaryUnreadable"
      : storageIssues.diary === "failed"
        ? "storage.diaryFailed"
        : storageIssues.state
          ? "storage.stateFailed"
          : null;
  if (!key) return null;
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: DANGER_TINT, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colors.danger }}>
      <Text style={[styles.text, { color: colors.danger, fontWeight: "600" }]}>{t(key)}</Text>
    </View>
  );
}
