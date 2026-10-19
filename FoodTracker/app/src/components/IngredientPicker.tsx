import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, Text, TextInput, View } from "react-native";
import { useI18n } from "../lib/i18n";
import { useStore } from "../lib/store";
import { Button, Muted, styles } from "./ui";

/** Auswahl einer Zutat aus dem Katalog, durchsuchbar in der eigenen Sprache und auf Deutsch/Englisch. */
export function IngredientPicker({
  visible,
  title,
  exclude = [],
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  exclude?: string[];
  onSelect: (ingredientId: string) => void;
  onClose: () => void;
}) {
  const { catalog } = useStore();
  const i18n = useI18n();
  const [query, setQuery] = useState("");

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.ingredients
      .filter((i) => !exclude.includes(i.id))
      .map((i) => ({ id: i.id, label: i18n.ingredientName(i.id), unit: i.unit, search: [i18n.ingredientName(i.id), ...Object.values(i.name)].join(" ").toLowerCase() }))
      .filter((i) => !q || i.search.includes(q))
      .sort((a, b) => a.label.localeCompare(b.label, i18n.language));
  }, [catalog.ingredients, exclude, query, i18n]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.screen, { padding: 16, gap: 12 }]}>
        <View style={styles.row}>
          <Text style={[styles.cardTitle, { flex: 1 }]}>{title}</Text>
          <Button label={i18n.t("common.close")} variant="secondary" onPress={onClose} />
        </View>
        <TextInput style={styles.input} placeholder={i18n.t("editor.searchIngredient")} value={query} onChangeText={setQuery} autoFocus />
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                onSelect(item.id);
                setQuery("");
              }}
              style={[styles.row, { paddingVertical: 10 }]}
            >
              <Text style={styles.text}>{item.label}</Text>
              <Muted>{i18n.unit(item.unit)}</Muted>
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}
