import type { ReactNode } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { useI18n } from "../lib/i18n";
import type { Nutrients } from "../lib/types";

export const colors = {
  background: "#F2F5F0",
  card: "#FFFFFF",
  text: "#17201B",
  muted: "#6B746E",
  primary: "#1E9E5A",
  primaryDark: "#14774A",
  primaryText: "#FFFFFF",
  accent: "#FF8A3D",
  accentTint: "#FFF0E5",
  border: "#E4E9E2",
  warning: "#D9822B",
  danger: "#C2362B",
  selected: "#DFF3E7",
  input: "#F7F9F6",
};

/** Weicher Schatten für Karten (iOS/Web) bzw. Elevation (Android). */
const shadow: ViewStyle = Platform.select({
  android: { elevation: 2 },
  default: { shadowColor: "#1B3A2A", shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
}) as ViewStyle;

export function Screen({ children }: { children: ReactNode }) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.screenContent}>
      {children}
    </ScrollView>
  );
}

export function Card({ title, icon, tint, children, style }: { title?: string; icon?: string; tint?: string; children: ReactNode; style?: ViewStyle }) {
  return (
    <View style={[styles.card, style]}>
      {title ? (
        <View style={styles.cardHeader}>
          {icon ? <IconBubble emoji={icon} tint={tint} /> : null}
          <Text style={[styles.cardTitle, { flex: 1 }]}>{title}</Text>
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** Farbige Hauptkarte, z. B. für Tagesziel oder Wochensumme. */
export function HeroCard({ children, color = colors.primary }: { children: ReactNode; color?: string }) {
  return <View style={[styles.card, { backgroundColor: color }]}>{children}</View>;
}

/** Emoji in einem farbigen Kreis. */
export function IconBubble({ emoji, tint = colors.selected, size = 36 }: { emoji: string; tint?: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: tint, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ fontSize: size * 0.5 }}>{emoji}</Text>
    </View>
  );
}

/** Kleines farbiges Etikett. */
export function Badge({ label, color = colors.primary, tint = colors.selected }: { label: string; color?: string; tint?: string }) {
  return (
    <View style={{ backgroundColor: tint, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: "flex-start" }}>
      <Text style={{ color, fontSize: 12, fontWeight: "700" }}>{label}</Text>
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
      <Text style={[styles.chipText, selected && { color: colors.primaryText }]}>{label}</Text>
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

export function ProgressBar({ value, max, light = false }: { value: number; max: number; light?: boolean }) {
  const ratio = Math.min(value / Math.max(max, 1), 1);
  const fill = light ? colors.primaryText : value > max ? colors.accent : colors.primary;
  return (
    <View style={[styles.progressTrack, light && { backgroundColor: "rgba(255,255,255,0.3)" }]}>
      <View style={[styles.progressFill, { width: `${ratio * 100}%`, backgroundColor: fill }]} />
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  screenContent: { padding: 16, gap: 14, paddingBottom: 48 },
  card: { backgroundColor: colors.card, borderRadius: 20, padding: 18, gap: 10, ...shadow },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  text: { fontSize: 15, color: colors.text },
  heading: { fontSize: 30, fontWeight: "800", color: colors.text },
  muted: { fontSize: 13, color: colors.muted },
  error: { fontSize: 14, color: colors.danger },
  warning: { fontSize: 13, color: colors.warning },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  button: { borderRadius: 14, paddingVertical: 13, paddingHorizontal: 18, alignItems: "center" },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonSecondary: { backgroundColor: colors.selected },
  buttonText: { fontSize: 15, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.input,
  },
  chip: { borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 14, color: colors.text, fontWeight: "500" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  label: { fontSize: 14, fontWeight: "700", color: colors.text },
  progressTrack: { height: 12, borderRadius: 6, backgroundColor: colors.border, overflow: "hidden" },
  progressFill: { height: 12, borderRadius: 6 },
  heroText: { color: colors.primaryText, fontSize: 15 },
  heroMuted: { color: "rgba(255,255,255,0.8)", fontSize: 13 },
  heroHeading: { color: colors.primaryText, fontSize: 32, fontWeight: "800" },
});
