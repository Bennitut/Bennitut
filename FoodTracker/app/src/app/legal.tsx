import { Text } from "react-native";
import { DRAFT_TEXT, LegalText, legalDraftState } from "../components/Legal";
import { Badge, Card, Muted, Screen, colors, styles } from "../components/ui";
import { HAS_SERVER } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { describePlaceholder } from "../lib/legal";
import { legalDocuments } from "../legal/texte";

/** Wo Benjamin seine Angaben einträgt (genau eine Stelle im Code). */
const ANGABEN_FILE = "FoodTracker/app/src/legal/angaben.ts";

/**
 * Impressum und Datenschutzerklärung (Texte auf Deutsch, aus src/legal/texte.ts). Fehlen Angaben, steht oben
 * deutlich „Entwurf“ mit der Liste; Teil B der Datenschutzerklärung erscheint nur, wenn die App einen Server kennt.
 */
export default function LegalScreen() {
  const { t, language } = useI18n();
  const { missing, serverDraft, draft } = legalDraftState();
  const docs = legalDocuments({ withServer: HAS_SERVER });

  return (
    <Screen>
      {language !== "de" ? <Muted>{t("legal.germanOnly")}</Muted> : null}
      {draft ? (
        <Card style={{ backgroundColor: colors.accentTint }}>
          <Badge label={`📝 ${t("legal.draftBadge")}`} color={DRAFT_TEXT} tint={colors.card} />
          {missing.length > 0 ? (
            <Text style={[styles.text, { color: DRAFT_TEXT }]}>
              {t("legal.draftText", { list: missing.map(describePlaceholder).join(", "), file: ANGABEN_FILE })}
            </Text>
          ) : null}
          {serverDraft ? <Text style={[styles.text, { color: DRAFT_TEXT }]}>{t("legal.draftServer")}</Text> : null}
        </Card>
      ) : null}
      <Card>
        <LegalText sections={docs.impressum} />
      </Card>
      <Card>
        <LegalText sections={docs.datenschutz} />
      </Card>
    </Screen>
  );
}
