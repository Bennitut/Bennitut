import { Link } from "expo-router";
import { Tabs } from "expo-router/js-tabs";
import { Text } from "react-native";
import { colors } from "../../components/ui";
import { useI18n } from "../../lib/i18n";

const icon = (emoji: string) => () => <Text style={{ fontSize: 20 }}>{emoji}</Text>;

export default function TabsLayout() {
  const { t } = useI18n();
  const settingsButton = () => (
    <Link href="/settings" accessibilityLabel={t("settings.title")} style={{ fontSize: 20, paddingHorizontal: 16 }}>
      {t("settings.open")}
    </Link>
  );
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: colors.primary, headerShadowVisible: false, headerRight: settingsButton }}>
      <Tabs.Screen name="index" options={{ title: t("tabs.today"), tabBarIcon: icon("📊") }} />
      <Tabs.Screen name="scan" options={{ title: t("tabs.scan"), tabBarIcon: icon("📷") }} />
      <Tabs.Screen name="plan" options={{ title: t("tabs.plan"), tabBarIcon: icon("🗓️") }} />
      <Tabs.Screen name="recipes" options={{ title: t("tabs.recipes"), tabBarIcon: icon("📖") }} />
      <Tabs.Screen name="pantry" options={{ title: t("tabs.pantry"), tabBarIcon: icon("🥫") }} />
      <Tabs.Screen name="shopping" options={{ title: t("tabs.shopping"), tabBarIcon: icon("🛒") }} />
    </Tabs>
  );
}
