import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { colors } from "../components/ui";
import { useI18n } from "../lib/i18n";
import { StoreProvider } from "../lib/store";

function RootStack() {
  const { t } = useI18n();
  return (
    <Stack screenOptions={{ headerShadowVisible: false, headerTintColor: colors.primary, headerBackButtonDisplayMode: "minimal" }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="recipe/[id]" options={{ title: "" }} />
      <Stack.Screen name="recipe/edit" options={{ title: t("editor.newTitle"), presentation: "modal" }} />
      <Stack.Screen name="recipe/import" options={{ title: t("import.title"), presentation: "modal" }} />
      <Stack.Screen name="settings" options={{ title: t("settings.title") }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <StoreProvider>
      <StatusBar style="dark" />
      <RootStack />
    </StoreProvider>
  );
}
