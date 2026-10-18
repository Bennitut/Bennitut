import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { useI18n } from "../lib/i18n";
import type { Nutrients } from "../lib/types";

export const colors = {
  background: "#F6F7F4",
  card: "#FFFFFF",
  text: "#1D2420",
  muted: "#66706A",
  primary: "#2F7D4F",
  primaryText: "#FFFFFF",
  border: "#E1E4DF",
  warning: "#B5651D",
  danger: "#B3261E",
  selected: "#DCEFE3",
};

export function Screen({ children }: { children: ReactNode }) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      {children}
    </ScrollView>
  );
}

export function Card({ title, children, style }: { title?: string; children: ReactNode; style?: ViewStyle }) {
  return (
    <View style={[styles.card, style]}>
      {title ? <Text style={styles.cardTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  loading?: boolean;
  disabled?: boolean;
}) {
  const primary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonSecondary,
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? colors.primaryText : colors.primary} />
      ) : (
        <Text style={[styles.buttonText, { color: primary ? colors.primaryText : colors.primary }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

export function ErrorText({ message }: { message: string | null }) {
  return message ? <Text style={styles.error}>{message}</Text> : null;
}

export function NutrientRow({ nutrients }: { nutrients: Nutrients }) {
  const { t } = useI18n();
  return (
    <Text style={styles.muted}>
      {t("common.nutrients", {
        kcal: Math.round(nutrients.kcal),
        protein: Math.round(nutrients.protein),
        carbs: Math.round(nutrients.carbs),
        fat: Math.round(nutrients.fat),
      })}
    </Text>
  );
}

export function Chip({ label, selected = false, onPress, disabled }: { label: string; selected?: boolean; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      onPress={onPress}
      disabled={disabled}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <View style={styles.chipRow}>{children}</View>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {hint ? <Muted>{hint}</Muted> : null}
    </View>
  );
}

export function ProgressBar({ value, max }: { value: number; max: number }) {
  const ratio = Math.min(value / Math.max(max, 1), 1);
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${ratio * 100}%`, backgroundColor: value > max ? colors.warning : colors.primary }]} />
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  screenContent: { padding: 16, gap: 12, paddingBottom: 40 },
  card: { backgroundColor: colors.card, borderRadius: 14, padding: 16, gap: 8, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontSize: 17, fontWeight: "600", color: colors.text },
  text: { fontSize: 15, color: colors.text },
  heading: { fontSize: 28, fontWeight: "700", color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
  error: { fontSize: 14, color: colors.danger },
  warning: { fontSize: 13, color: colors.warning },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  button: { borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, alignItems: "center" },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonSecondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.primary },
  buttonText: { fontSize: 15, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.card,
  },
  chip: { borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.primary },
  chipSelected: { backgroundColor: colors.selected },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  label: { fontSize: 14, fontWeight: "600", color: colors.text },
  progressTrack: { height: 10, borderRadius: 5, backgroundColor: colors.border, overflow: "hidden" },
  progressFill: { height: 10, borderRadius: 5 },
});
