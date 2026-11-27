import { Link } from "expo-router";
import { Linking, Text, View, type TextStyle } from "react-native";
import { hasServer } from "../lib/api";
import { useI18n } from "../lib/i18n";
import { bulletText, describePlaceholder, parseInline, type LegalSection } from "../lib/legal";
import { missingLegalInfo } from "../legal/texte";
import { colors, styles } from "./ui";

/** Dunkles Orange auf `colors.accentTint` (Kontrast 4,9 : 1), wie bei „Bald verfügbar“. */
export const DRAFT_TEXT = "#A0561A";

/** Was in den Texten dieser App noch fehlt: ohne Server (Impressum, Teil A) und zusätzlich mit Server (Teil B). */
export function legalDraftState() {
  const missing = missingLegalInfo({ withServer: false });
  const serverDraft = hasServer() && missingLegalInfo({ withServer: true }).length > missing.length;
  return { missing, serverDraft, draft: missing.length > 0 || serverDraft };
}

/**
 * Kleiner Link „Impressum“ oben rechts – in der Web-Version auf jeder Seite (WKO: „ständig leicht auffindbar“).
 * `edge`: steht allein am rechten Rand (Unterseiten) und bekommt dort Abstand.
 */
export function LegalHeaderLink({ edge = false }: { edge?: boolean }) {
  const { t } = useI18n();
  return (
    <Link
      href="/legal"
      style={{ fontSize: 13, color: colors.muted, textDecorationLine: "underline", paddingHorizontal: 6, paddingVertical: 8, marginRight: edge ? 10 : 0 }}
    >
      {t("legal.short")}
    </Link>
  );
}

const HEADING: Record<LegalSection["level"], TextStyle> = {
  1: { fontSize: 24, fontWeight: "800", color: colors.text },
  2: { fontSize: 18, fontWeight: "700", color: colors.text, marginTop: 6 },
  3: { fontSize: 16, fontWeight: "700", color: colors.text, marginTop: 4 },
};
const placeholderStyle: TextStyle = { backgroundColor: colors.accentTint, color: DRAFT_TEXT, fontWeight: "700" };
const linkStyle: TextStyle = { color: colors.primaryDark, textDecorationLine: "underline" };

/** Ein Absatz mit **fett**, Links und [[Platzhaltern]] (orange hinterlegt). */
function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((segment, i) => {
        if (segment.kind === "placeholder") {
          return <Text key={i} style={placeholderStyle}>{`[${describePlaceholder(segment)}]`}</Text>;
        }
        if (segment.kind === "link") {
          return (
            <Text key={i} style={[linkStyle, segment.bold && { fontWeight: "700" }]} accessibilityRole="link" onPress={() => Linking.openURL(segment.url)}>
              {segment.text}
            </Text>
          );
        }
        return (
          <Text key={i} style={segment.bold ? { fontWeight: "700" } : undefined}>
            {segment.text}
          </Text>
        );
      })}
    </>
  );
}

/** Abschnitte eines Rechtstexts: Überschriften, Absätze und Aufzählungen. */
export function LegalText({ sections }: { sections: LegalSection[] }) {
  return (
    <View style={{ gap: 10 }}>
      {sections.map((section) => (
        <View key={section.title} style={{ gap: 8 }}>
          <Text style={HEADING[section.level]} accessibilityRole="header">
            <Inline text={section.title} />
          </Text>
          {section.blocks.map((block, i) => {
            const bullet = bulletText(block);
            return bullet === null ? (
              <Text key={i} style={[styles.text, { lineHeight: 22 }]}>
                <Inline text={block} />
              </Text>
            ) : (
              <View key={i} style={{ flexDirection: "row", gap: 8, paddingLeft: 4 }}>
                <Text style={styles.text}>•</Text>
                <Text style={[styles.text, { flex: 1, lineHeight: 22 }]}>
                  <Inline text={bullet} />
                </Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}
