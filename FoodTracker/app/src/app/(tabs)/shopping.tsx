import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Text, View } from "react-native";
import { Button, Card, Chip, ChipRow, ErrorText, Muted, Screen, styles } from "../../components/ui";
import { api } from "../../lib/api";
import { useI18n } from "../../lib/i18n";
import { useStore } from "../../lib/store";
import type { DeliveryProviderInfo } from "../../lib/types";

export default function ShoppingScreen() {
  const { plan, orders, saveOrder, addPantryItems } = useStore();
  const i18n = useI18n();
  const { t } = i18n;
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
      .catch((e) => setError(i18n.error(e)));
  }, [i18n]);

  const toBuy = (plan?.shoppingList.filter((i) => i.packs > 0) ?? []).sort((a, b) =>
    i18n.ingredientName(a.ingredientId).localeCompare(i18n.ingredientName(b.ingredientId), i18n.language),
  );
  const carryOver = plan?.shoppingList.filter((i) => i.durable && i.leftover > 0 && i.packs > 0) ?? [];

  // Der Demo-Anbieter ist übersetzt; echte Anbieter heißen überall gleich.
  const providerName = (p: DeliveryProviderInfo) => (p.id === "demo" ? t("shopping.providers.demo") : p.name);
  const providerDescription = (p: DeliveryProviderInfo) => (p.id === "demo" ? t("shopping.providers.demoDescription") : p.description);

  const placeOrder = async () => {
    if (!providerId || toBuy.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const order = await api.order(providerId, toBuy);
      saveOrder(order);
      if (order.checkoutUrl) await Linking.openURL(order.checkoutUrl);
    } catch (e) {
      setError(i18n.error(e));
    } finally {
      setLoading(false);
    }
  };

  // Gelieferte Bestellungen werden genau einmal in den Vorrat gebucht.
  const refreshOrder = async (orderProviderId: string, orderId: string) => {
    try {
      const { order, pantry: delivered } = await api.orderStatus(orderProviderId, orderId);
      const previous = orders.find((o) => o.id === orderId);
      if (order.status === "geliefert" && previous?.status !== "geliefert") addPantryItems(delivered);
      saveOrder(order);
    } catch (e) {
      setError(i18n.error(e));
    }
  };

  return (
    <Screen>
      <Card title={t("shopping.list")}>
        {!plan ? (
          <Muted>{t("shopping.needPlan")}</Muted>
        ) : toBuy.length === 0 ? (
          <Muted>{t("shopping.allThere")}</Muted>
        ) : (
          toBuy.map((item) => (
            <View key={item.ingredientId} style={styles.row}>
              <Text style={[styles.text, { flex: 1 }]}>
                {item.packs}× {i18n.ingredientName(item.ingredientId)}{" "}
                <Text style={styles.muted}>{t("shopping.pack", { size: i18n.number(item.packSize), unit: i18n.unit(item.unit) })}</Text>
              </Text>
              <Text style={styles.muted}>{i18n.price(item.price)}</Text>
            </View>
          ))
        )}
        {plan && toBuy.length > 0 ? (
          <Muted>
            {t("shopping.sumHint", { price: i18n.price(plan.totalPrice) })} {t("common.estimatedPrices")}
          </Muted>
        ) : null}
        {carryOver.map((item) => (
          <Muted key={item.ingredientId}>
            ↪ {i18n.ingredientName(item.ingredientId)}: {t("shopping.carryOver", { amount: i18n.number(item.leftover), unit: i18n.unit(item.unit) })}
          </Muted>
        ))}
      </Card>

      {toBuy.length > 0 ? (
        <Card title={t("shopping.deliver")}>
          <ChipRow>
            {providers.map((p) => (
              <Chip key={p.id} label={providerName(p)} selected={providerId === p.id} onPress={() => setProviderId(p.id)} />
            ))}
          </ChipRow>
          {providers
            .filter((p) => p.id === providerId)
            .map((p) => (
              <Muted key={p.id}>{providerDescription(p)}</Muted>
            ))}
          <Button label={t("shopping.order")} onPress={placeOrder} loading={loading} disabled={!providerId} />
          <ErrorText message={error} />
        </Card>
      ) : null}

      {orders.length > 0 ? (
        <Card title={t("shopping.orders")}>
          {orders.map((order) => (
            <View key={order.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.text}>
                  {t("shopping.articles", { date: new Date(order.createdAt).toLocaleDateString(i18n.language), n: order.lines.length })}
                </Text>
                <Muted>{t(`shopping.status.${order.status}`)}</Muted>
              </View>
              {order.status !== "geliefert" ? (
                <Button label={t("shopping.checkStatus")} variant="secondary" onPress={() => refreshOrder(order.providerId, order.id)} />
              ) : null}
            </View>
          ))}
        </Card>
      ) : null}

      <Button label={`🥫 ${t("shopping.pantry")} ›`} variant="secondary" onPress={() => router.push("/pantry")} />
    </Screen>
  );
}
