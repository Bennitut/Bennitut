import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform, View } from "react-native";
import { colors } from "../components/ui";
import { useI18n } from "../lib/i18n";
import { StoreProvider } from "../lib/store";

function RootStack() {
  const { t } = useI18n();
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerTintColor: colors.primary,
        headerBackButtonDisplayMode: "minimal",
        headerStyle: { backgroundColor: colors.background },
        headerTitleStyle: { fontWeight: "700", color: colors.text },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="recipe/[id]" options={{ title: "" }} />
      <Stack.Screen name="recipe/edit" options={{ title: t("editor.newTitle"), presentation: "modal" }} />
      <Stack.Screen name="recipe/import" options={{ title: t("import.title"), presentation: "modal" }} />
      <Stack.Screen name="settings" options={{ title: t("profile.settings") }} />
      <Stack.Screen name="profile" options={{ title: t("profile.title") }} />
      <Stack.Screen name="login" options={{ title: t("account.signIn"), presentation: "modal" }} />
      <Stack.Screen name="users" options={{ title: t("account.directoryTitle") }} />
      <Stack.Screen name="admin" options={{ title: t("admin.title") }} />
      <Stack.Screen name="onboarding" options={{ title: t("onboarding.title"), presentation: "modal" }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <StoreProvider>
      <StatusBar style="dark" />
      {Platform.OS === "web" ? (
        // Im breiten Browserfenster bleibt die App eine schmale Spalte in der Mitte, statt sich zu strecken.
        <View style={{ flex: 1, backgroundColor: colors.border }}>
          <View style={{ flex: 1, width: "100%", maxWidth: 600, alignSelf: "center", backgroundColor: colors.background }}>
            <RootStack />
          </View>
        </View>
      ) : (
        <RootStack />
      )}
    </StoreProvider>
  );
}
