import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { Text, TextInput, View } from "react-native";
import { IngredientPicker } from "../components/IngredientPicker";
import { Button, Card, Chip, ChipRow, Field, Muted, Screen, colors, styles } from "../components/ui";
import { useI18n } from "../lib/i18n";
import { dailyKcal } from "../lib/profile";
import { useStore } from "../lib/store";
import {
  ACTIVITIES,
  ALLERGENS,
  BUDGETS,
  CUISINES,
  DIETS,
  FOOD_RULES,
  GOALS,
  MEAL_TYPES,
  SEXES,
  VARIETIES,
  type Body,
  type Settings,
} from "../lib/types";

/** Häufig ungeliebte Zutaten als Schnellauswahl. */
const COMMON_DISLIKES = ["champignons", "aubergine", "rote_bete", "ingwer", "kokosmilch", "tofu", "sauerkraut", "rosinen", "feta", "lachs"];
const COOK_LIMITS = [0, 20, 30, 45, 60];
const DEFAULT_BODY: Body = { sex: "w", age: 30, heightCm: 170, weightKg: 70, activity: "mittel" };

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <View style={{ flex: 1 }}>
      <Field label={label}>
        <TextInput
          style={styles.input}
          keyboardType="number-pad"
          defaultValue={String(value)}
          accessibilityLabel={label}
          onChangeText={(text) => {
            const n = parseInt(text, 10);
            if (!Number.isNaN(n) && n > 0) onChange(n);
          }}
        />
      </Field>
    </View>
  );
}

export default function OnboardingScreen() {
  const { settings, updateSettings, setPendingPlan } = useStore();
  const i18n = useI18n();
  const { t } = i18n;
  // Entwurf, damit Abbrechen nichts verändert.
  const [draft, setDraft] = useState<Settings>(settings);
  const [step, setStep] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const set = (patch: Partial<Settings>) => setDraft((d) => ({ ...d, ...patch }));
  const body = draft.body ?? DEFAULT_BODY;
  const setBody = (patch: Partial<Body>) => set({ body: { ...body, ...patch } });
  const kcal = draft.body ? dailyKcal(draft.body, draft.goal) : draft.kcalPerPersonPerDay;

  const steps: { title: string; content: ReactNode }[] = [
    {
      title: t("onboarding.dietTitle"),
      content: (
        <>
          <Muted>{t("onboarding.dietHint")}</Muted>
          <ChipRow>
            {DIETS.map((diet) => (
              <Chip key={diet} label={t(`diets.${diet}`)} selected={draft.diet === diet} onPress={() => set({ diet })} />
            ))}
          </ChipRow>
          <Field label={t("onboarding.rulesTitle")} hint={t("onboarding.rulesHint")}>
            <ChipRow>
              {FOOD_RULES.map((rule) => (
                <Chip key={rule} label={t(`rules.${rule}`)} selected={draft.rules.includes(rule)} onPress={() => set({ rules: toggle(draft.rules, rule) })} />
              ))}
            </ChipRow>
          </Field>
        </>
      ),
    },
    {
      title: t("onboarding.allergiesTitle"),
      content: (
        <>
          <Muted>{t("onboarding.allergiesHint")}</Muted>
          <ChipRow>
            {ALLERGENS.map((a) => (
              <Chip key={a} label={t(`allergens.${a}`)} selected={draft.allergens.includes(a)} onPress={() => set({ allergens: toggle(draft.allergens, a) })} />
            ))}
          </ChipRow>
          <Field label={t("onboarding.dislikesTitle")}>
            <ChipRow>
              {[...new Set([...COMMON_DISLIKES, ...draft.excludeIngredients])].map((id) => (
                <Chip
                  key={id}
                  label={i18n.ingredientName(id)}
                  selected={draft.excludeIngredients.includes(id)}
                  onPress={() => set({ excludeIngredients: toggle(draft.excludeIngredients, id) })}
                />
              ))}
            </ChipRow>
            <Button label={t("onboarding.moreDislikes")} variant="secondary" onPress={() => setPickerOpen(true)} />
          </Field>
        </>
      ),
    },
    {
      title: t("onboarding.goalTitle"),
      content: (
        <>
          <ChipRow>
            {GOALS.map((goal) => (
              <Chip key={goal} label={t(`goals.${goal}`)} selected={draft.goal === goal} onPress={() => set({ goal })} />
            ))}
          </ChipRow>
          <Field label={t("onboarding.bodyTitle")} hint={t("onboarding.bodyHint", { kcal: draft.kcalPerPersonPerDay })}>
            <Chip label={t("onboarding.useBody")} selected={draft.body !== null} onPress={() => set({ body: draft.body ? null : DEFAULT_BODY })} />
          </Field>
          {draft.body ? (
            <>
              <Field label={t("onboarding.sex")}>
                <ChipRow>
                  {SEXES.map((sex) => (
                    <Chip key={sex} label={t(`sex.${sex}`)} selected={body.sex === sex} onPress={() => setBody({ sex })} />
                  ))}
                </ChipRow>
              </Field>
              <View style={styles.row}>
                <NumberInput label={t("onboarding.age")} value={body.age} onChange={(age) => setBody({ age })} />
                <NumberInput label={t("onboarding.height")} value={body.heightCm} onChange={(heightCm) => setBody({ heightCm })} />
                <NumberInput label={t("onboarding.weight")} value={body.weightKg} onChange={(weightKg) => setBody({ weightKg })} />
              </View>
              <Field label={t("onboarding.activity")}>
                <ChipRow>
                  {ACTIVITIES.map((activity) => (
                    <Chip key={activity} label={t(`activity.${activity}`)} selected={body.activity === activity} onPress={() => setBody({ activity })} />
                  ))}
                </ChipRow>
              </Field>
            </>
          ) : (
            <NumberInput label={t("onboarding.kcalManual")} value={draft.kcalPerPersonPerDay} onChange={(n) => set({ kcalPerPersonPerDay: n })} />
          )}
          <Text style={[styles.text, { color: colors.primary, fontWeight: "600" }]}>{t("onboarding.kcalResult", { kcal })}</Text>
        </>
      ),
    },
    {
      title: t("onboarding.everydayTitle"),
      content: (
        <>
          <NumberInput label={t("onboarding.people")} value={draft.people} onChange={(people) => set({ people: Math.min(people, 10) })} />
          <Field label={t("onboarding.meals")}>
            <ChipRow>
              {MEAL_TYPES.map((m) => (
                <Chip
                  key={m}
                  label={i18n.mealType(m)}
                  selected={draft.mealTypes.includes(m)}
                  onPress={() => {
                    const next = toggle(draft.mealTypes, m);
                    if (next.length > 0) set({ mealTypes: MEAL_TYPES.filter((x) => next.includes(x)) });
                  }}
                />
              ))}
            </ChipRow>
          </Field>
          <Field label={t("onboarding.cookTime")}>
            <ChipRow>
              {COOK_LIMITS.map((n) => (
                <Chip
                  key={n}
                  label={n === 0 ? t("settings.noLimit") : t("common.minutes", { n })}
                  selected={draft.maxCookMinutes === n}
                  onPress={() => set({ maxCookMinutes: n })}
                />
              ))}
            </ChipRow>
          </Field>
        </>
      ),
    },
    {
      title: t("onboarding.tasteTitle"),
      content: (
        <>
          <Field label={t("onboarding.cuisinesTitle")}>
            <ChipRow>
              {CUISINES.map((c) => (
                <Chip key={c} label={t(`cuisines.${c}`)} selected={draft.cuisines.includes(c)} onPress={() => set({ cuisines: toggle(draft.cuisines, c) })} />
              ))}
            </ChipRow>
          </Field>
          <Field label={t("onboarding.budgetTitle")}>
            <ChipRow>
              {BUDGETS.map((budget) => (
                <Chip key={budget} label={t(`budget.${budget}`)} selected={draft.budget === budget} onPress={() => set({ budget })} />
              ))}
            </ChipRow>
          </Field>
          <Field label={t("onboarding.varietyTitle")}>
            <ChipRow>
              {VARIETIES.map((variety) => (
                <Chip key={variety} label={t(`variety.${variety}`)} selected={draft.variety === variety} onPress={() => set({ variety })} />
              ))}
            </ChipRow>
          </Field>
        </>
      ),
    },
    {
      title: t("onboarding.doneTitle"),
      content: <Text style={styles.text}>{t("onboarding.doneText")}</Text>,
    },
  ];

  const last = step === steps.length - 1;
  const finish = (createPlan: boolean) => {
    updateSettings({ ...draft, kcalPerPersonPerDay: kcal, onboarded: true });
    setPendingPlan(createPlan);
    router.back();
  };

  return (
    <Screen>
      <Muted>{t("onboarding.step", { n: step + 1, total: steps.length })}</Muted>
      <View style={{ flexDirection: "row", gap: 4 }}>
        {steps.map((_, i) => (
          <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? colors.primary : colors.border }} />
        ))}
      </View>
      <Card title={steps[step]!.title}>{steps[step]!.content}</Card>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          {step > 0 ? <Button label={t("common.back")} variant="secondary" onPress={() => setStep(step - 1)} /> : null}
        </View>
        <View style={{ flex: 1 }}>
          {last ? (
            <Button label={settings.onboarded ? t("onboarding.save") : t("plan.createMonth")} onPress={() => finish(!settings.onboarded)} />
          ) : (
            <Button label={t("common.next")} onPress={() => setStep(step + 1)} />
          )}
        </View>
      </View>
      {settings.onboarded && !last ? <Button label={t("onboarding.save")} variant="secondary" onPress={() => finish(false)} /> : null}

      <IngredientPicker
        visible={pickerOpen}
        title={t("onboarding.dislikesTitle")}
        exclude={draft.excludeIngredients}
        onClose={() => setPickerOpen(false)}
        onSelect={(id) => {
          set({ excludeIngredients: [...draft.excludeIngredients, id] });
          setPickerOpen(false);
        }}
      />
    </Screen>
  );
}
