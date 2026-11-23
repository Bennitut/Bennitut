import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { useI18n } from "../lib/i18n";
import { Button, Card, Muted } from "./ui";

const DISMISSED_KEY = "foodtracker/installHintDismissed";

/** Installationsangebot von Chrome, Edge und Android (fehlt in den DOM-Typen von TypeScript). */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

function shouldShow(): boolean {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  const installed = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  if (installed) return false;
  try {
    return localStorage.getItem(DISMISSED_KEY) !== "1";
  } catch {
    return true;
  }
}

/** Hinweis „Zum Home-Bildschirm hinzufügen“ – nur im Browser und nur, solange die Web-App nicht installiert ist. */
export function InstallHint() {
  const { t } = useI18n();
  const [visible, setVisible] = useState(shouldShow);
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    if (!visible) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, [visible]);

  if (!visible) return null;

  // iPadOS meldet sich als Mac, hat aber einen Touchscreen.
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Ohne Speicher (privater Modus) bleibt der Hinweis nur für diese Sitzung weg.
    }
    setVisible(false);
  };
  const install = async () => {
    await promptEvent?.prompt();
    dismiss();
  };

  return (
    <Card title={t("install.title")} icon="📲">
      <Muted>{t(ios ? "install.ios" : "install.other")}</Muted>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {promptEvent ? (
          <View style={{ flex: 1 }}>
            <Button label={t("install.install")} onPress={install} />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Button label={t("install.later")} variant="secondary" onPress={dismiss} />
        </View>
      </View>
    </Card>
  );
}
