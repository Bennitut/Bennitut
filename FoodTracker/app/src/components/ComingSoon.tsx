import { View } from "react-native";
import { useI18n } from "../lib/i18n";
import { Badge, Card, Muted, colors } from "./ui";

/** Dunkles Orange für Text auf `colors.accentTint` (Kontrast 4,9 : 1; `colors.warning` hätte nur 2,6 : 1). */
const SOON_TEXT = "#A0561A";

/** Freundlicher Hinweis statt Fehlermeldung, wenn eine Funktion den Server braucht, die App aber ohne läuft. */
export function ComingSoon() {
  const { t } = useI18n();
  return (
    <Card title={t("comingSoon.title")} icon="🚧" tint={colors.accentTint}>
      <Muted>{t("comingSoon.text")}</Muted>
    </Card>
  );
}

/**
 * Derselbe Hinweis innerhalb einer Karte, z. B. unter „Liefern lassen“: Abzeichen „🚧 Bald verfügbar“ und ein Satz,
 * was bis dahin ohne Server geht.
 */
export function ComingSoonNote({ text }: { text: string }) {
  const { t } = useI18n();
  return (
    <View style={{ gap: 6 }}>
      <Badge label={`🚧 ${t("comingSoon.title")}`} color={SOON_TEXT} tint={colors.accentTint} />
      <Muted>{text}</Muted>
    </View>
  );
}
