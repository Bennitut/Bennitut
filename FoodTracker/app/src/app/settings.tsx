import { Card, Chip, ChipRow, Field, Screen } from "../components/ui";
import { LANGUAGE_NAMES, REGIONS, UI_LANGUAGES } from "../i18n";
import { useI18n } from "../lib/i18n";
import { useStore } from "../lib/store";

/** Sprache und Region; Essgewohnheiten und Persönliches liegen im Profil. */
export default function SettingsScreen() {
  const { settings, updateSettings } = useStore();
  const { t } = useI18n();

  return (
    <Screen>
      <Card title={t("settings.languageRegion")}>
        <Field label={t("settings.language")}>
          <ChipRow>
            {UI_LANGUAGES.map((language) => (
              <Chip key={language} label={LANGUAGE_NAMES[language]} selected={settings.language === language} onPress={() => updateSettings({ language })} />
            ))}
          </ChipRow>
        </Field>
        <Field label={t("settings.region")}>
          <ChipRow>
            {REGIONS.map((region) => (
              <Chip key={region} label={t(`settings.regions.${region}`)} selected={settings.region === region} onPress={() => updateSettings({ region })} />
            ))}
          </ChipRow>
        </Field>
      </Card>
    </Screen>
  );
}
