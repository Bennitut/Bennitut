import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { useI18n } from "../lib/i18n";
import { useStore } from "../lib/store";
import type { Recipe } from "../lib/types";
import { RecipeThumb } from "./RecipeThumb";
import { Muted, styles } from "./ui";

export function RecipeRow({ recipe, favorite, subtitle }: { recipe: Recipe; favorite: boolean; subtitle?: string }) {
  const i18n = useI18n();
  const { t } = i18n;
  const { imageFor, ratings } = useStore();
  const image = imageFor(recipe);
  const rating = ratings[recipe.id];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/recipe/${encodeURIComponent(recipe.id)}`)}
      style={[styles.row, { paddingVertical: 8 }]}
    >
      <RecipeThumb uri={image?.uri} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.text}>{i18n.recipe(recipe).name}</Text>
        <Muted>
          {[
            rating?.count ? `★ ${i18n.number(rating.avg)}` : null,
            t(`recipes.sources.${recipe.source.kind}`),
            t("common.minutes", { n: recipe.cookMinutes }),
            subtitle,
          ].filter(Boolean).join(" · ")}
        </Muted>
      </View>
      <Text style={styles.text}>{favorite ? "♥" : ""} ›</Text>
    </Pressable>
  );
}
