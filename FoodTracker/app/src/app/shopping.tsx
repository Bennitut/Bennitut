import { useEffect, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { Button, Card, ErrorText, Muted, Screen, styles } from "../components/ui";
import { api } from "../lib/api";
import { useStore } from "../lib/store";
import type { DeliveryProviderInfo } from "../lib/types";

const STATUS_LABEL = { warenkorb: "Im Warenkorb", bestellt: "Bestellt", geliefert: "Geliefert" } as const;

export default function ShoppingScreen() {
  const { plan, pantry, ingredients, orders, saveOrder, addPantryItems } = useStore();
  const [providers, setProviders] = useState<DeliveryProviderInfo[]>([]);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .providers()
      .then((list) => {
        setProviders(list);
        setProviderId((current) => current ?? list[0]?.id ?? null);
      })
      .catch(() => setError("Lieferdienste konnten nicht geladen werden."));
  }, []);

  const toBuy = plan?.shoppingList.filter((i) => i.packs > 0) ?? [];

  const placeOrder = async () => {
    if (!providerId || toBuy.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const order = await api.order(providerId, toBuy);
      saveOrder(order);
      if (order.checkoutUrl) await Linking.openURL(order.checkoutUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bestellung fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  };

  // Gelieferte Bestellungen werden genau einmal in den Vorrat gebucht.
  const refreshOrder = async (providerId: string, orderId: string) => {
    try {
      const { order, pantry: delivered } = await api.orderStatus(providerId, orderId);
      const previous = orders.find((o) => o.id === orderId);
      if (order.status === "geliefert" && previous?.status !== "geliefert") addPantryItems(delivered);
      saveOrder(order);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Status konnte nicht geladen werden");
    }
  };

  return (
    <Screen>
      <Card title="Einkaufsliste">
        {!plan ? (
          <Muted>Erstelle zuerst einen Plan – die Einkaufsliste wird daraus automatisch berechnet.</Muted>
        ) : toBuy.length === 0 ? (
          <Muted>Alles da! Dein Vorrat reicht für den ganzen Plan.</Muted>
        ) : (
          toBuy.map((item) => (
            <View key={item.ingredientId} style={styles.row}>
              <Text style={[styles.text, { flex: 1 }]}>
                {item.packs}× {item.name} <Text style={styles.muted}>à {item.packSize} {item.unit}</Text>
              </Text>
              <Text style={styles.muted}>{item.price.toFixed(2)} €</Text>
            </View>
          ))
        )}
        {plan && toBuy.length > 0 ? (
          <Muted>
            Summe {plan.totalPrice.toFixed(2)} € · Packungsgrößen sind so gewählt, dass möglichst nichts übrig bleibt.
          </Muted>
        ) : null}
      </Card>

      {toBuy.length > 0 ? (
        <Card title="Liefern lassen">
          {providers.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => setProviderId(p.id)}
              style={[styles.chip, { alignSelf: "stretch" }, providerId === p.id && { backgroundColor: "#DCEFE3" }]}
            >
              <Text style={styles.text}>{p.name}</Text>
              <Muted>{p.description}</Muted>
            </Pressable>
          ))}
          <Button label="Einkauf bestellen" onPress={placeOrder} loading={loading} disabled={!providerId} />
          <ErrorText message={error} />
        </Card>
      ) : null}

      {orders.length > 0 ? (
        <Card title="Bestellungen">
          {orders.map((order) => (
            <View key={order.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.text}>
                  {new Date(order.createdAt).toLocaleDateString("de-DE")} · {order.lines.length} Artikel
                </Text>
                <Muted>{STATUS_LABEL[order.status]}</Muted>
              </View>
              {order.status !== "geliefert" ? (
                <Button label="Status prüfen" variant="secondary" onPress={() => refreshOrder(order.providerId, order.id)} />
              ) : null}
            </View>
          ))}
        </Card>
      ) : null}

      <Card title="Vorrat">
        {pantry.length === 0 ? (
          <Muted>Leer. Gelieferte Bestellungen und fotografierte Kassenbons landen automatisch hier.</Muted>
        ) : (
          pantry.map((item) => {
            const ingredient = ingredients.get(item.ingredientId);
            return (
              <View key={item.ingredientId} style={styles.row}>
                <Text style={styles.text}>{ingredient?.name ?? item.ingredientId}</Text>
                <Text style={styles.muted}>
                  {item.amount} {ingredient?.unit ?? ""}
                </Text>
              </View>
            );
          })
        )}
      </Card>
    </Screen>
  );
}
