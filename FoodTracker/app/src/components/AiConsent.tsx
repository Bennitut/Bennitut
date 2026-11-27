import { router } from "expo-router";
import { useCallback, useRef, useState, type ReactElement } from "react";
import { Modal, ScrollView, Text, View } from "react-native";
import { AI_FEATURE_TEXT, grantAiConsent, hasAiConsent, type AiFeature } from "../lib/aiConsent";
import { useI18n } from "../lib/i18n";
import { useStore } from "../lib/store";
import { ParentalNotice } from "./PasswordSignIn";
import { Button, IconBubble, Muted, colors, styles } from "./ui";

interface Pending {
  feature: AiFeature;
  resolve: (granted: boolean) => void;
}

/**
 * Vor der ersten Nutzung einer KI-Funktion um Erlaubnis fragen (lib/aiConsent.ts). `ask(feature)` liefert true, wenn
 * die Erlaubnis schon da ist oder gerade erteilt wurde, sonst false (dann nichts senden). `dialog` gehört in den
 * Bildschirm selbst – so erscheint es auch über Bildschirmen, die als Modal geöffnet sind (Rezept-Import).
 */
export function useAiConsent(): { ask: (feature: AiFeature) => Promise<boolean>; dialog: ReactElement } {
  const { aiConsent, setAiConsent } = useStore();
  const [pending, setPending] = useState<Pending | null>(null);
  // Die offene Frage auch außerhalb des Renderns kennen (Doppeltipp, Schließen des Dialogs).
  const open = useRef<Pending | null>(null);

  const settle = useCallback((granted: boolean) => {
    const current = open.current;
    open.current = null;
    setPending(null);
    current?.resolve(granted);
  }, []);

  const ask = useCallback(
    (feature: AiFeature) => {
      if (hasAiConsent(aiConsent)) return Promise.resolve(true);
      // Eine ältere offene Frage (z. B. nach einem Doppeltipp) gilt als „Nicht jetzt“, damit nichts ewig wartet.
      open.current?.resolve(false);
      return new Promise<boolean>((resolve) => {
        open.current = { feature, resolve };
        setPending(open.current);
      });
    },
    [aiConsent],
  );

  const answer = (granted: boolean) => {
    if (granted) setAiConsent(grantAiConsent());
    settle(granted);
  };

  return {
    ask,
    dialog: (
      <AiConsentDialog
        feature={pending?.feature ?? null}
        onAnswer={answer}
        onPrivacy={() => {
          settle(false);
          router.push("/legal");
        }}
      />
    ),
  };
}

/**
 * Der Dialog: was an wen geht, ausdrückliche Einwilligung für Gesundheitsangaben, Eltern-Hinweis, Widerruf. Der Text
 * scrollt, „Einverstanden“ und „Nicht jetzt“ stehen darunter fest – auch auf kleinen Bildschirmen beide gleich sichtbar.
 */
function AiConsentDialog({ feature, onAnswer, onPrivacy }: { feature: AiFeature | null; onAnswer: (granted: boolean) => void; onPrivacy: () => void }) {
  const { t } = useI18n();
  return (
    <Modal visible={feature !== null} transparent animationType="fade" onRequestClose={() => onAnswer(false)}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "center", padding: 16 }}>
        {feature ? (
          <View style={[styles.card, { width: "100%", maxWidth: 520, maxHeight: "100%", alignSelf: "center", padding: 0, gap: 0 }]}>
            <ScrollView contentContainerStyle={{ padding: 18, gap: 10 }}>
              <View style={styles.cardHeader}>
                <IconBubble emoji="🤖" />
                <Text style={[styles.cardTitle, { flex: 1 }]} accessibilityRole="header">
                  {t("aiConsent.title")}
                </Text>
              </View>
              <Text style={styles.text}>{t(AI_FEATURE_TEXT[feature])}</Text>
              <Muted>{t("aiConsent.recipient")}</Muted>
              <Muted>{t("aiConsent.scope")}</Muted>
              <Muted>{t("aiConsent.health")}</Muted>
              <ParentalNotice text={t("aiConsent.parental")} />
              <Muted>{t("aiConsent.revokeHint")}</Muted>
              <Button label={`§ ${t("account.privacyLink")}`} variant="secondary" onPress={onPrivacy} />
            </ScrollView>
            <View style={{ padding: 18, paddingTop: 12, gap: 10, borderTopWidth: 1, borderColor: colors.border }}>
              <Button label={t("aiConsent.accept")} onPress={() => onAnswer(true)} />
              <Button label={t("aiConsent.decline")} variant="secondary" onPress={() => onAnswer(false)} />
            </View>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
