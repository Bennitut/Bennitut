import { router } from "expo-router";
import { Image, Pressable, Text, View } from "react-native";
import { useI18n } from "../lib/i18n";
import type { Recipe } from "../lib/types";
import { Muted, colors, styles } from "./ui";

export function RecipeRow({ recipe, favorite, subtitle }: { recipe: Recipe; favorite: boolean; subtitle?: string }) {
  const i18n = useI18n();
  const { t } = i18n;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/recipe/${encodeURIComponent(recipe.id)}`)}
      style={[styles.row, { paddingVertical: 8 }]}
    >
      {recipe.media?.image ? (
        <Image source={{ uri: recipe.media.image.uri }} style={{ width: 64, height: 36, borderRadius: 8 }} />
      ) : (
        <View style={{ width: 64, height: 36, borderRadius: 8, backgroundColor: colors.border, alignItems: "center", justifyContent: "center" }}>
          <Text>🍽️</Text>
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.text}>{i18n.recipe(recipe).name}</Text>
        <Muted>
          {[t(`recipes.sources.${recipe.source.kind}`), t("common.minutes", { n: recipe.cookMinutes }), subtitle].filter(Boolean).join(" · ")}
        </Muted>
      </View>
      <Text style={styles.text}>{favorite ? "♥" : ""} ›</Text>
    </Pressable>
  );
}
