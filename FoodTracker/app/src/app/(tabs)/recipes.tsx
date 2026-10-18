import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { TextInput, View } from "react-native";
import { RecipeRow } from "../../components/RecipeRow";
import { Button, Card, Chip, ChipRow, Muted, Screen, styles } from "../../components/ui";
import { api } from "../../lib/api";
import { communityCache } from "../../lib/communityCache";
import { useI18n } from "../../lib/i18n";
import { useStore } from "../../lib/store";
import type { CommunityRecipe, Recipe } from "../../lib/types";

type Segment = "mine" | "favorites" | "discover";

export default function RecipesScreen() {
  const { myRecipes, favoriteIds, recipes, catalog } = useStore();
  const i18n = useI18n();
  const { t } = i18n;
  const [segment, setSegment] = useState<Segment>("mine");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"popular" | "new">("popular");
  const [community, setCommunity] = useState<CommunityRecipe[] | null>(null);
  const [communityError, setCommunityError] = useState(false);

  // Community-Rezepte bei jedem Öffnen des Tabs neu laden (Favoriten-Zähler ändern sich).
  useFocusEffect(
    useCallback(() => {
      if (segment !== "discover") return;
      let active = true;
      const timer = setTimeout(() => {
        api
          .communityRecipes(sort, query)
          .then((list) => {
            if (!active) return;
            for (const entry of list) communityCache.set(entry.recipe.id, entry);
            setCommunity(list);
            setCommunityError(false);
          })
          .catch(() => active && setCommunityError(true));
      }, 300);
      return () => {
        active = false;
        clearTimeout(timer);
      };
    }, [segment, sort, query]),
  );

  const matches = (recipe: Recipe) => !query.trim() || i18n.recipe(recipe).name.toLowerCase().includes(query.trim().toLowerCase());
  const isFavorite = (id: string) => favoriteIds.includes(id);
  const favorites = favoriteIds.map((id) => recipes.get(id)).filter((r): r is Recipe => !!r);

  return (
    <Screen>
      <ChipRow>
        {(["mine", "favorites", "discover"] as const).map((s) => (
          <Chip key={s} label={t(`recipes.${s}`)} selected={segment === s} onPress={() => setSegment(s)} />
        ))}
      </ChipRow>

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Button label={t("recipes.newRecipe")} variant="secondary" onPress={() => router.push("/recipe/edit")} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label={t("recipes.importRecipe")} variant="secondary" onPress={() => router.push("/recipe/import")} />
        </View>
      </View>

      <TextInput style={styles.input} placeholder={t("recipes.searchPlaceholder")} value={query} onChangeText={setQuery} clearButtonMode="while-editing" />

      {segment === "mine" ? (
        <Card>
          {myRecipes.length === 0 ? (
            <Muted>{t("recipes.emptyMine")}</Muted>
          ) : (
            myRecipes.filter(matches).map((r) => <RecipeRow key={r.id} recipe={r} favorite={isFavorite(r.id)} />)
          )}
        </Card>
      ) : null}

      {segment === "favorites" ? (
        <Card>
          {favorites.length === 0 ? (
            <Muted>{t("recipes.emptyFavorites")}</Muted>
          ) : (
            favorites.filter(matches).map((r) => <RecipeRow key={r.id} recipe={r} favorite />)
          )}
        </Card>
      ) : null}

      {segment === "discover" ? (
        <>
          <Card title={t("recipes.community")}>
            <ChipRow>
              <Chip label={t("recipes.sortPopular")} selected={sort === "popular"} onPress={() => setSort("popular")} />
              <Chip label={t("recipes.sortNew")} selected={sort === "new"} onPress={() => setSort("new")} />
            </ChipRow>
            {communityError ? <Muted>{t("recipes.communityOffline")}</Muted> : null}
            {(community ?? []).map((entry) => (
              <RecipeRow
                key={entry.id}
                recipe={entry.recipe}
                favorite={isFavorite(entry.recipe.id)}
                subtitle={`${t("recipes.by", { name: entry.authorName })} · ${t("recipes.likes", { n: entry.likes })}`}
              />
            ))}
          </Card>
          <Card title={t("recipes.catalog")}>
            {catalog.recipes.filter(matches).map((r) => (
              <RecipeRow key={r.id} recipe={recipes.get(r.id) ?? r} favorite={isFavorite(r.id)} />
            ))}
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
