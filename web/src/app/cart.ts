import { Style } from './models';

export interface CartLine {
  sku: string;
  styleName: string;
  color: string;
  size: string;
  priceCents: number;
  available: number;
  quantity: number;
}

/** Same limit the order service enforces. */
export const MAX_PER_SIZE = 10;

function limitFor(line: Pick<CartLine, 'available'>): number {
  return Math.min(line.available, MAX_PER_SIZE);
}

/** Adds one pair of a size, never more than the store has on hand. */
export function addToCart(cart: CartLine[], item: Omit<CartLine, 'quantity'>): CartLine[] {
  const existing = cart.find((line) => line.sku === item.sku);
  if (!existing) {
    return limitFor(item) > 0 ? [...cart, { ...item, quantity: 1 }] : cart;
  }
  if (existing.quantity >= limitFor(existing)) {
    return cart;
  }
  return cart.map((line) => (line.sku === item.sku ? { ...line, quantity: line.quantity + 1 } : line));
}

/** Sets a line's quantity; zero or less removes the line. */
export function setQuantity(cart: CartLine[], sku: string, quantity: number): CartLine[] {
  if (quantity <= 0) {
    return cart.filter((line) => line.sku !== sku);
  }
  return cart.map((line) =>
    line.sku === sku ? { ...line, quantity: Math.min(quantity, limitFor(line)) } : line,
  );
}

/** After stock changes, trims each line to what is still on hand and drops sold-out sizes. */
export function syncWithCatalog(cart: CartLine[], catalog: Style[]): CartLine[] {
  const onHand = new Map(catalog.flatMap((style) => style.sizes.map((size) => [size.sku, size.available])));
  return cart
    .map((line) => {
      const available = onHand.get(line.sku) ?? 0;
      return { ...line, available, quantity: Math.min(line.quantity, available, MAX_PER_SIZE) };
    })
    .filter((line) => line.quantity > 0);
}

export function cartTotal(cart: CartLine[]): number {
  return cart.reduce((sum, line) => sum + line.priceCents * line.quantity, 0);
}

export function cartCount(cart: CartLine[]): number {
  return cart.reduce((count, line) => count + line.quantity, 0);
}
