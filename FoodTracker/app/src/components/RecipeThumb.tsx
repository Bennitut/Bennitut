import { Image, Text, View } from "react-native";
import { colors } from "./ui";

const thumb = { width: 64, height: 36, borderRadius: 8 } as const;

/**
 * Vorschaubild eines Rezepts in Listen (Entdecken, Plan, Heute, Tauschen). Ohne Foto steht ein 🍽️-Platzhalter in
 * derselben Größe da, damit Namen und Zeilen bündig bleiben.
 */
export function RecipeThumb({ uri }: { uri?: string }) {
  if (uri) return <Image source={{ uri }} style={thumb} />;
  return (
    <View aria-hidden style={[thumb, { backgroundColor: colors.border, alignItems: "center", justifyContent: "center" }]}>
      <Text>🍽️</Text>
    </View>
  );
}
