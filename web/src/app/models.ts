export interface StoreLocation {
  code: string;
  name: string;
  city: string;
}

export interface SizeOption {
  size: string;
  sku: string;
  available: number;
}

/** One style and color with its full size run, as the inventory service returns it. */
export interface Style {
  styleCode: string;
  name: string;
  color: string;
  priceCents: number;
  sizes: SizeOption[];
}

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED';

export interface OrderLine {
  sku: string;
  quantity: number;
  unitPriceCents: number | null;
}

export interface Order {
  id: string;
  storeCode: string;
  status: OrderStatus;
  reason: string | null;
  reservationId: string | null;
  totalCents: number | null;
  createdAt: string;
  lines: OrderLine[];
}
