import { Stack, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Linking, Text, View } from "react-native";
import { Button, Card, ErrorText, Muted, NutrientRow, Screen, styles } from "../../components/ui";
import { api } from "../../lib/api";
import { communityCache } from "../../lib/communityCache";
import { needsTranslation, useI18n } from "../../lib/i18n";
import { recipeNutrients } from "../../lib/nutrition";
import { newId } from "../../lib/pantry";
import { useStore } from "../../lib/store";
import type { Recipe } from "../../lib/types";

const OWN_KINDS: Recipe["source"]["kind"][] = ["eigen", "import"];

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const store = useStore();
  const { recipes, ingredients, favoriteIds, myRecipes, shared, settings } = store;
  const i18n = useI18n();
  const { t } = i18n;
  const [busy, setBusy] = useState<"translate" | "share" | "favorite" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cached = communityCache.get(id);
  const recipe = recipes.get(id) ?? cached?.recipe;
  if (!recipe) {
    return (
      <Screen>
        <Muted>{t("recipes.notFound")}</Muted>
      </Screen>
    );
  }

  const text = i18n.recipe(recipe);
  const isOwn = myRecipes.some((r) => r.id === recipe.id) && OWN_KINDS.includes(recipe.source.kind);
  const isFavorite = favoriteIds.includes(recipe.id);
  const communityId = shared[recipe.id];
  const author = recipe.source.kind === "community" ? recipe.source.author : null;
  const sourceUrl = recipe.source.kind === "import" ? recipe.source.url : undefined;

  const run = async (kind: NonNullable<typeof busy>, action: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(i18n.error(e));
    } finally {
      setBusy(null);
    }
  };

  const toggleFavorite = () =>
    run("favorite", async () => {
      // Bei Community-Rezepten zählt der Server die Favoriten, damit beliebte Rezepte oben stehen.
      if (recipe.source.kind === "community") await api.toggleLike(recipe.source.communityId);
      store.setFavorite(recipe, !isFavorite);
    });

  const translateNow = () =>
    run("translate", async () => {
      const translated = await api.translateRecipe(
        { name: recipe.name, steps: recipe.steps, otherIngredients: recipe.otherIngredients },
        i18n.language,
      );
      store.cacheTranslation(recipe.id, i18n.language, translated);
    });

  const toggleShare = () =>
    run("share", async () => {
      if (communityId) {
        await api.unshareRecipe(communityId);
        store.setShared(recipe.id, null);
        return;
      }
      if (!settings.displayName.trim()) {
        setError(t("recipes.needName"));
        return;
      }
      const entry = await api.shareRecipe(settings.displayName.trim(), recipe);
      store.setShared(recipe.id, entry.id);
    });

  /** Kopie zum Anpassen – so lässt sich jedes Rezept an die eigenen Wünsche anpassen. */
  const copyToMine = () => {
    const copy: Recipe = { ...recipe, id: `eigen_${newId()}`, source: { kind: "eigen" } };
    store.saveRecipe(copy);
    router.replace(`/recipe/edit?id=${encodeURIComponent(copy.id)}`);
  };

  const remove = () =>
    Alert.alert(t("recipes.deleteConfirm"), text.name, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () => {
          if (communityId) api.unshareRecipe(communityId).catch(() => {});
          store.setShared(recipe.id, null);
          store.deleteRecipe(recipe.id);
          router.back();
        },
      },
    ]);

  return (
    <Screen>
      <Stack.Screen options={{ title: text.name }} />
      <Card>
        <Text style={styles.heading}>{text.name}</Text>
        <Muted>
          {[
            t(`recipes.sources.${recipe.source.kind}`),
            author ? t("recipes.by", { name: author }) : null,
            t("common.minutes", { n: recipe.cookMinutes }),
            recipe.mealTypes.map(i18n.mealType).join(", "),
          ]
            .filter(Boolean)
            .join(" · ")}
        </Muted>
        <NutrientRow nutrients={recipeNutrients(recipe, ingredients)} />
        <Muted>{t("recipes.perServing")}</Muted>
        <View style={styles.chipRow}>
          <Button label={isFavorite ? t("recipes.unfavorite") : t("recipes.favorite")} variant="secondary" onPress={toggleFavorite} loading={busy === "favorite"} />
          {needsTranslation(recipe, i18n.language) ? (
            <Button label={busy === "translate" ? t("recipes.translating") : t("recipes.translate")} variant="secondary" onPress={translateNow} loading={busy === "translate"} />
          ) : null}
          {sourceUrl ? <Button label={t("recipes.openOriginal")} variant="secondary" onPress={() => Linking.openURL(sourceUrl)} /> : null}
        </View>
        <ErrorText message={error} />
      </Card>

      <Card title={t("recipes.ingredients")}>
        {recipe.ingredients.map((ri) => {
          const ingredient = ingredients.get(ri.ingredientId);
          return (
            <View key={ri.ingredientId} style={styles.row}>
              <Text style={styles.text}>{i18n.ingredientName(ri.ingredientId)}</Text>
              <Muted>{ingredient ? i18n.amount(ri.amount, ingredient.unit) : i18n.number(ri.amount)}</Muted>
            </View>
          );
        })}
        {text.otherIngredients.length > 0 ? (
          <>
            <Text style={[styles.label, { marginTop: 8 }]}>{t("recipes.otherIngredients")}</Text>
            {text.otherIngredients.map((line, i) => (
              <Text key={i} style={styles.text}>
                • {line}
              </Text>
            ))}
          </>
        ) : null}
      </Card>

      {text.steps.length > 0 ? (
        <Card title={t("recipes.steps")}>
          {text.steps.map((step, i) => (
            <Text key={i} style={styles.text}>
              {i + 1}. {step}
            </Text>
          ))}
        </Card>
      ) : null}

      <Card>
        {isOwn ? (
          <>
            <Button label={t("common.edit")} variant="secondary" onPress={() => router.push(`/recipe/edit?id=${encodeURIComponent(recipe.id)}`)} />
            <Button label={communityId ? t("recipes.unshare") : t("recipes.share")} variant="secondary" onPress={toggleShare} loading={busy === "share"} />
            {communityId ? <Muted>{t("recipes.shared")}</Muted> : null}
            <Button label={t("common.delete")} variant="secondary" onPress={remove} />
          </>
        ) : (
          <Button label={t("recipes.copyToMine")} variant="secondary" onPress={copyToMine} />
        )}
      </Card>
    </Screen>
  );
}
