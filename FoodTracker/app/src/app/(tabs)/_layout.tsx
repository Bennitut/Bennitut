import { Link } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { Text, View } from "react-native";
import { colors } from "../../components/ui";
import { useI18n } from "../../lib/i18n";

/** Emoji-Symbol; der aktive Tab bekommt einen farbigen Hintergrund. */
const icon =
  (emoji: string) =>
  ({ focused }: { focused: boolean }) => (
    <View
      style={{
        width: 40,
        height: 26,
        borderRadius: 13,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: focused ? colors.selected : "transparent",
      }}
    >
      <Text style={{ fontSize: 17, lineHeight: 22, opacity: focused ? 1 : 0.55 }}>{emoji}</Text>
    </View>
  );

export default function TabsLayout() {
  const { t } = useI18n();
  const profileButton = () => (
    <Link href="/profile" accessibilityLabel={t("profile.title")} style={{ marginRight: 16 }}>
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.selected, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 18 }}>{t("profile.open")}</Text>
      </View>
    </Link>
  );
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { fontSize: 22, fontWeight: "800", color: colors.text },
        headerTitleAlign: "left",
        headerShadowVisible: false,
        headerRight: profileButton,
      }}
    >
      <Tabs.Screen name="index" options={{ title: t("tabs.today"), tabBarIcon: icon("☀️") }} />
      <Tabs.Screen name="scan" options={{ title: t("tabs.scan"), tabBarIcon: icon("📸") }} />
      <Tabs.Screen name="plan" options={{ title: t("tabs.plan"), tabBarIcon: icon("📅") }} />
      <Tabs.Screen name="recipes" options={{ title: t("tabs.recipes"), tabBarIcon: icon("🍳") }} />
      <Tabs.Screen name="pantry" options={{ title: t("tabs.pantry"), tabBarIcon: icon("🧺") }} />
      <Tabs.Screen name="shopping" options={{ title: t("tabs.shopping"), tabBarIcon: icon("🛒") }} />
    </Tabs>
  );
}
