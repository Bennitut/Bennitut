import { useI18n } from "../lib/i18n";
import { Card, Muted } from "./ui";

/** Freundlicher Hinweis statt Fehlermeldung, wenn eine Funktion den Server braucht, die App aber ohne läuft. */
export function ComingSoon() {
  const { t } = useI18n();
  return (
    <Card title={t("comingSoon.title")} icon="🚧" tint="#FFF0E5">
      <Muted>{t("comingSoon.text")}</Muted>
    </Card>
  );
}
