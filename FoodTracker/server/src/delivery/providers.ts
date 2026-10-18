import { randomUUID } from "node:crypto";
import type { PantryItem, ShoppingItem } from "../types.js";

export interface OrderLine {
  ingredientId: string;
  packs: number;
  packSize: number;
  unit: string;
}

export interface Order {
  id: string;
  providerId: string;
  status: "warenkorb" | "bestellt" | "geliefert";
  lines: OrderLine[];
  /** Link, unter dem Nutzer:innen den Warenkorb beim Anbieter prüfen und bezahlen. */
  checkoutUrl: string | null;
  createdAt: string;
}

/**
 * Schnittstelle für Lieferdienste. Echte Anbieter (z. B. REWE, Knuspr, Picnic, Flink in
 * Deutschland, BILLA/gurkerl.at in Österreich, Migros/Coop in der Schweiz)
 * bieten keine offenen Bestell-APIs; eine Anbindung braucht einen Partnervertrag.
 * Jeder Anbieter wird als eigene Implementierung dieses Interfaces ergänzt.
 */
export interface DeliveryProvider {
  id: string;
  name: string;
  description: string;
  createCart(lines: OrderLine[]): Promise<Order>;
  getOrder(orderId: string): Promise<Order | undefined>;
}

/** Demo-Anbieter: simuliert Warenkorb, Bestellung und Lieferung im Speicher. */
export class DemoProvider implements DeliveryProvider {
  id = "demo";
  name = "Demo-Lieferdienst";
  description = "Simuliert Bestellung und Lieferung – zum Ausprobieren ohne echten Anbieter.";
  private orders = new Map<string, Order>();

  async createCart(lines: OrderLine[]): Promise<Order> {
    const order: Order = {
      id: randomUUID(),
      providerId: this.id,
      status: "bestellt",
      lines,
      checkoutUrl: null,
      createdAt: new Date().toISOString(),
    };
    this.orders.set(order.id, order);
    return order;
  }

  async getOrder(orderId: string): Promise<Order | undefined> {
    const order = this.orders.get(orderId);
    // Die Demo liefert sofort beim ersten Statusabruf.
    if (order?.status === "bestellt") order.status = "geliefert";
    return order;
  }
}

export const providers: DeliveryProvider[] = [new DemoProvider()];

export function findProvider(id: string): DeliveryProvider | undefined {
  return providers.find((p) => p.id === id);
}

export function linesFromShoppingList(items: ShoppingItem[]): OrderLine[] {
  return items
    .filter((i) => i.packs > 0)
    .map((i) => ({ ingredientId: i.ingredientId, packs: i.packs, packSize: i.packSize, unit: i.unit }));
}

/** Gelieferte Ware landet automatisch im Vorrat – so wird der Einkauf mitgetrackt. */
export function pantryFromOrder(order: Order): PantryItem[] {
  return order.lines.map((l) => ({ ingredientId: l.ingredientId, amount: l.packs * l.packSize }));
}
