import { StatusBar } from "expo-status-bar";
import { Tabs } from "expo-router/js-tabs";
import { Text } from "react-native";
import { colors } from "../components/ui";
import { StoreProvider } from "../lib/store";

const icon = (emoji: string) => () => <Text style={{ fontSize: 20 }}>{emoji}</Text>;

export default function RootLayout() {
  return (
    <StoreProvider>
      <StatusBar style="dark" />
      <Tabs screenOptions={{ tabBarActiveTintColor: colors.primary, headerShadowVisible: false }}>
        <Tabs.Screen name="index" options={{ title: "Heute", tabBarIcon: icon("📊") }} />
        <Tabs.Screen name="scan" options={{ title: "Erfassen", tabBarIcon: icon("📷") }} />
        <Tabs.Screen name="plan" options={{ title: "Plan", tabBarIcon: icon("🗓️") }} />
        <Tabs.Screen name="shopping" options={{ title: "Einkauf", tabBarIcon: icon("🛒") }} />
      </Tabs>
    </StoreProvider>
  );
}
