import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { Badge, Button, Card, Chip, ChipRow, ErrorText, HeroCard, IconBubble, Muted, ProgressBar, Screen, colors, styles } from "../../components/ui";
import { CATEGORY_ORDER, CATEGORY_STYLE, ingredientEmoji } from "../../lib/emoji";
import { api } from "../../lib/api";
import { weekOfDay } from "../../lib/catalog";
import { addDays, daysBetween, formatDay } from "../../lib/dates";
import { today } from "../../lib/pantry";
import { useI18n } from "../../lib/i18n";
import { useStore } from "../../lib/store";
import type { DeliveryProviderInfo } from "../../lib/types";

export default function ShoppingScreen() {
  const { plan, orders, saveOrder, addPantryItems, ingredients, shoppingChecked, toggleShoppingItem } = useStore();
  const [leftoversOpen, setLeftoversOpen] = useState(false);
  const i18n = useI18n();
  const { t } = i18n;
  const [providers, setProviders] = useState<DeliveryProviderInfo[]>([]);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const todayIndex = plan ? daysBetween(plan.startDate, today()) : 0;
  const [selectedWeek, setSelectedWeek] = useState(() => weekOfDay(Math.min(Math.max(0, todayIndex), 29)));
  const week = plan?.weeks[Math.min(selectedWeek, (plan?.weeks.length ?? 1) - 1)];

  useEffect(() => {
    api
      .providers()
      .then((list) => {
        setProviders(list);
        setProviderId((current) => current ?? list[0]?.id ?? null);
      })
      .catch((e) => setError(i18n.error(e)));
  }, [i18n]);

  const toBuy = (week?.shoppingList.filter((i) => i.packs > 0) ?? []).sort((a, b) =>
    i18n.ingredientName(a.ingredientId).localeCompare(i18n.ingredientName(b.ingredientId), i18n.language),
  );
  const weekIndex = plan && week ? plan.weeks.indexOf(week) : 0;
  const checkKey = (ingredientId: string) => `${weekIndex}:${ingredientId}`;
  const checkedCount = toBuy.filter((i) => shoppingChecked.includes(checkKey(i.ingredientId))).length;
  const groups = CATEGORY_ORDER.map((category) => ({
    category,
    items: toBuy.filter((i) => ingredients.get(i.ingredientId)?.category === category),
  })).filter((g) => g.items.length > 0);

  // Reste nach der Woche: angebrochen, deshalb zählt die kürzere Haltbarkeit nach dem Öffnen.
  const carryOver = (week?.shoppingList.filter((i) => i.durable && i.leftover > 0 && i.packs > 0) ?? [])
    .map((item) => {
      const ingredient = ingredients.get(item.ingredientId);
      const shelfLife = ingredient ? Math.min(ingredient.shelfLifeDays, ingredient.openedShelfLifeDays ?? Infinity) : 0;
      return { item, daysLeft: Math.max(0, shelfLife - (week?.days ?? 7)) };
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);

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
      {plan && plan.weeks.length > 1 ? (
        <ChipRow>
          {plan.weeks.map((w, i) => (
            <Chip
              key={i}
              label={`${t("plan.week", { n: i + 1 })} · ${formatDay(addDays(plan.startDate, w.startDay), i18n.language)}`}
              selected={week === w}
              onPress={() => setSelectedWeek(i)}
            />
          ))}
        </ChipRow>
      ) : null}
      {!plan ? (
        <Card title={t("shopping.list")} icon="🛒">
          <Muted>{t("shopping.needPlan")}</Muted>
        </Card>
      ) : toBuy.length === 0 ? (
        <Card title={t("shopping.list")} icon="🎉">
          <Muted>{t("shopping.allThere")}</Muted>
        </Card>
      ) : (
        <>
          <HeroCard>
            <Text style={styles.heroMuted}>🛒 {t("shopping.weekTitle", { n: weekIndex + 1 })}</Text>
            <Text style={styles.heroHeading}>{t("plan.approx", { price: i18n.price(week!.totalPrice) })}</Text>
            <ProgressBar value={checkedCount} max={toBuy.length} light />
            <Text style={styles.heroText}>{t("shopping.inCart", { done: checkedCount, total: toBuy.length })}</Text>
            <Text style={styles.heroMuted}>
              {t("shopping.tapHint")} {t("common.estimatedPrices")}
            </Text>
          </HeroCard>
          {groups.map(({ category, items }) => {
            const style = CATEGORY_STYLE[category];
            return (
              <Card key={category} title={t(`pantry.categories.${category}`)} icon={style.emoji} tint={style.tint}>
                {items.map((item) => {
                  const checked = shoppingChecked.includes(checkKey(item.ingredientId));
                  return (
                    <Pressable
                      key={item.ingredientId}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked }}
                      onPress={() => toggleShoppingItem(checkKey(item.ingredientId))}
                      style={[styles.row, { paddingVertical: 4, opacity: checked ? 0.5 : 1 }]}
                    >
                      <IconBubble emoji={ingredientEmoji(ingredients.get(item.ingredientId))} tint={style.tint} size={40} />
                      <View style={{ flex: 1, gap: 1 }}>
                        <Text style={[styles.text, { fontWeight: "600" }, checked && { textDecorationLine: "line-through" }]}>
                          {i18n.ingredientName(item.ingredientId)}
                        </Text>
                        <Muted>{t("shopping.packs", { packs: item.packs, size: i18n.number(item.packSize), unit: i18n.unit(item.unit) })}</Muted>
                      </View>
                      <Text style={[styles.text, { color: style.color, fontWeight: "700" }]}>{i18n.price(item.price)}</Text>
                      <View
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 13,
                          borderWidth: 2,
                          borderColor: checked ? colors.primary : colors.border,
                          backgroundColor: checked ? colors.primary : "transparent",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {checked ? <Text style={{ color: colors.primaryText, fontWeight: "800" }}>✓</Text> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </Card>
            );
          })}
        </>
      )}

      {carryOver.length > 0 ? (
        <Card>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: leftoversOpen }}
            onPress={() => setLeftoversOpen((open) => !open)}
            style={styles.row}
          >
            <IconBubble emoji="⏳" tint={colors.accentTint} />
            <Text style={[styles.cardTitle, { flex: 1 }]}>{t("shopping.leftoversTitle", { n: carryOver.length })}</Text>
            <Text style={[styles.cardTitle, { color: colors.accent }]}>{leftoversOpen ? "▾" : "▸"}</Text>
          </Pressable>
          {leftoversOpen ? (
            <>
              <Muted>{t("shopping.leftoversHint")}</Muted>
              {carryOver.map(({ item, daysLeft }) => (
                <View key={item.ingredientId} style={[styles.row, { paddingVertical: 3 }]}>
                  <Text style={{ fontSize: 20 }}>{ingredientEmoji(ingredients.get(item.ingredientId))}</Text>
                  <Text style={[styles.text, { flex: 1 }]}>
                    {i18n.ingredientName(item.ingredientId)}{" "}
                    <Text style={styles.muted}>{i18n.amount(item.leftover, item.unit)}</Text>
                  </Text>
                  {daysLeft <= 7 ? (
                    <Badge label={t("shopping.useSoon", { days: daysLeft })} color={colors.warning} tint={colors.accentTint} />
                  ) : (
                    <Muted>{t("shopping.keepsDays", { days: daysLeft })}</Muted>
                  )}
                </View>
              ))}
            </>
          ) : null}
        </Card>
      ) : null}

      {toBuy.length > 0 ? (
        <Card title={t("shopping.deliver")} icon="🚚" tint={colors.accentTint}>
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
        <Card title={t("shopping.orders")} icon="📦">
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

      <Button label={`🧺 ${t("shopping.pantry")} ›`} variant="secondary" onPress={() => router.push("/pantry")} />
    </Screen>
  );
}
