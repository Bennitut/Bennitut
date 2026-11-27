import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { TextInput, View } from "react-native";
import { ComingSoonNote } from "../../components/ComingSoon";
import { RecipeRow } from "../../components/RecipeRow";
import { Button, Card, Chip, ChipRow, Muted, Screen, ShowMore, styles } from "../../components/ui";
import { api, hasServer } from "../../lib/api";
import { communityCache } from "../../lib/communityCache";
import { useI18n } from "../../lib/i18n";
import { PAGE_SIZE, firstPage, sortByRating, topRated } from "../../lib/recipeLists";
import { useStore } from "../../lib/store";
import type { CommunityRecipe, Recipe } from "../../lib/types";

type Segment = "mine" | "favorites" | "discover";

export default function RecipesScreen() {
  const { myRecipes, favoriteIds, recipes, catalog, ratings } = useStore();
  const i18n = useI18n();
  const { t } = i18n;
  const [segment, setSegment] = useState<Segment>("mine");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"popular" | "new">("popular");
  const [community, setCommunity] = useState<CommunityRecipe[] | null>(null);
  const [communityError, setCommunityError] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);

  // Community-Rezepte bei jedem Öffnen des Tabs neu laden (Favoriten-Zähler ändern sich).
  useFocusEffect(
    useCallback(() => {
      // Ohne Server gibt es keine Community – die Karte zeigt dann „Bald verfügbar“.
      if (segment !== "discover" || !hasServer()) return;
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
  const catalogSorted = sortByRating(catalog.recipes, ratings);
  const best = topRated(catalogSorted, ratings);
  // Nicht alle Katalogrezepte auf einmal: Jede Zeile lädt ein Foto (siehe PAGE_SIZE).
  const catalogPage = firstPage(catalogSorted, limit, matches);
  const search = (text: string) => {
    setQuery(text);
    setLimit(PAGE_SIZE);
  };

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

      <TextInput style={styles.input} placeholder={t("recipes.searchPlaceholder")} value={query} onChangeText={search} clearButtonMode="while-editing" />

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
          <Card title={t("recipes.community")} icon="💬" tint="#ECEBF8">
            {hasServer() ? (
              <>
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
              </>
            ) : (
              <ComingSoonNote text={t("recipes.communitySoon")} />
            )}
          </Card>
          {best.length > 0 && !query.trim() ? (
            <Card title={t("feedback.topRated")} icon="🏆" tint="#FFF4D6">
              {best.map((r) => (
                <RecipeRow key={r.id} recipe={recipes.get(r.id) ?? r} favorite={isFavorite(r.id)} />
              ))}
            </Card>
          ) : null}
          <Card title={t("recipes.catalog")} icon="📖">
            {catalogPage.shown.map((r) => (
              <RecipeRow key={r.id} recipe={recipes.get(r.id) ?? r} favorite={isFavorite(r.id)} />
            ))}
            <ShowMore shown={catalogPage.shown.length} total={catalogPage.total} onPress={() => setLimit((n) => n + PAGE_SIZE)} />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
