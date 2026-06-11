export interface OrderLineInput {
  product: string;
  size: string;
  color?: string;
  quantity: number;
}

const lineKey = (item: OrderLineInput): string =>
  `${item.product}-${item.size}-${item.color?.trim() || ''}`;

/** Merge duplicate cart lines before pricing (same product + size + color). */
export const mergeOrderLineItems = (items: OrderLineInput[]): OrderLineInput[] => {
  const merged = new Map<string, OrderLineInput>();

  for (const item of items) {
    const key = lineKey(item);
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      merged.set(key, {
        product: item.product,
        size: item.size,
        color: item.color?.trim() || undefined,
        quantity: item.quantity,
      });
    }
  }

  return Array.from(merged.values());
};
