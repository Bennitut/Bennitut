import { useState } from "react";
import { TextInput } from "react-native";
import { IngredientPicker } from "../components/IngredientPicker";
import { Button, Card, Chip, ChipRow, Field, Screen, styles } from "../components/ui";
import { LANGUAGE_NAMES, REGIONS, UI_LANGUAGES } from "../i18n";
import { useI18n } from "../lib/i18n";
import { useStore } from "../lib/store";
import { ALLERGENS, DIETS, MEAL_TYPES, type Allergen, type MealType } from "../lib/types";

const COOK_LIMITS = [0, 15, 30, 45, 60];

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

export default function SettingsScreen() {
  const { settings, updateSettings } = useStore();
  const i18n = useI18n();
  const { t } = i18n;
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <Screen>
      <Card title={t("settings.profile")}>
        <Field label={t("settings.displayName")} hint={t("settings.displayNameHint")}>
          <TextInput
            style={styles.input}
            defaultValue={settings.displayName}
            accessibilityLabel={t("settings.displayName")}
            maxLength={40}
            onChangeText={(text) => updateSettings({ displayName: text.trim() })}
          />
        </Field>
      </Card>

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

      <Card title={t("settings.nutrition")}>
        <Field label={t("settings.diet")}>
          <ChipRow>
            {DIETS.map((diet) => (
              <Chip key={diet} label={t(`diets.${diet}`)} selected={settings.diet === diet} onPress={() => updateSettings({ diet })} />
            ))}
          </ChipRow>
        </Field>
        <Field label={t("settings.allergies")}>
          <ChipRow>
            {ALLERGENS.map((a: Allergen) => (
              <Chip
                key={a}
                label={t(`allergens.${a}`)}
                selected={settings.allergens.includes(a)}
                onPress={() => updateSettings({ allergens: toggle(settings.allergens, a) })}
              />
            ))}
          </ChipRow>
        </Field>
        <Field label={t("settings.dislikes")}>
          <ChipRow>
            {settings.excludeIngredients.map((id) => (
              <Chip
                key={id}
                label={`${i18n.ingredientName(id)} ✕`}
                selected
                onPress={() => updateSettings({ excludeIngredients: settings.excludeIngredients.filter((x) => x !== id) })}
              />
            ))}
          </ChipRow>
          <Button label={`＋ ${t("settings.addDislike")}`} variant="secondary" onPress={() => setPickerOpen(true)} />
        </Field>
        <Field label={t("settings.maxCook")}>
          <ChipRow>
            {COOK_LIMITS.map((n) => (
              <Chip
                key={n}
                label={n === 0 ? t("settings.noLimit") : t("common.minutes", { n })}
                selected={settings.maxCookMinutes === n}
                onPress={() => updateSettings({ maxCookMinutes: n })}
              />
            ))}
          </ChipRow>
        </Field>
        <Field label={t("settings.mealsPerDay")}>
          <ChipRow>
            {MEAL_TYPES.map((m: MealType) => (
              <Chip
                key={m}
                label={i18n.mealType(m)}
                selected={settings.mealTypes.includes(m)}
                // Mindestens eine Mahlzeit muss bleiben.
                onPress={() => {
                  const next = toggle(settings.mealTypes, m);
                  if (next.length > 0) updateSettings({ mealTypes: MEAL_TYPES.filter((x) => next.includes(x)) });
                }}
              />
            ))}
          </ChipRow>
        </Field>
      </Card>

      <IngredientPicker
        visible={pickerOpen}
        title={t("settings.addDislike")}
        exclude={settings.excludeIngredients}
        onClose={() => setPickerOpen(false)}
        onSelect={(id) => {
          updateSettings({ excludeIngredients: [...settings.excludeIngredients, id] });
          setPickerOpen(false);
        }}
      />
    </Screen>
  );
}
