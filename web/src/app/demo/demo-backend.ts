import { Injectable, signal } from '@angular/core';
import { Order, OrderLine, OrderStatus, StoreLocation, Style } from '../models';
import { newUuid } from '../uuid';

/** What the demo interceptor turns into an HTTP response. */
export interface DemoResponse {
  status: number;
  body: unknown;
}

/** The query parameters of a request; Angular's HttpParams fits this shape. */
export interface QueryParams {
  get(name: string): string | null;
}

interface Product {
  sku: string;
  styleCode: string;
  styleName: string;
  color: string;
  size: number;
  priceCents: number;
}

interface Reservation {
  id: string;
  status: 'ACTIVE' | 'RELEASED';
  storeCode: string;
  lines: { sku: string; quantity: number; unitPriceCents: number }[];
  totalCents: number;
}

/** The same stores and styles that the inventory service's database seed creates. */
const STORES: (StoreLocation & { id: number })[] = [
  { id: 1, code: 'CHI01', name: 'SizeRun Chicago', city: 'Chicago, IL' },
  { id: 2, code: 'IND01', name: 'SizeRun Indianapolis', city: 'Indianapolis, IN' },
  { id: 3, code: 'NYC01', name: 'SizeRun New York', city: 'New York, NY' },
];

const STYLES = [
  { styleCode: 'CRT-WHT', styleName: 'Court Classic', color: 'White and Gum', priceCents: 9500 },
  { styleCode: 'RUN1-NVY', styleName: 'Tempo Runner', color: 'Midnight Navy', priceCents: 13000 },
  { styleCode: 'TRL2-GRN', styleName: 'Ridge Trail 2', color: 'Moss Green', priceCents: 14500 },
  { styleCode: 'WLK-CHR', styleName: 'Daily Walker', color: 'Charcoal', priceCents: 11000 },
];

/** Sizes 7 to 13 in half sizes, in tenths, so SKUs match the database (size 9.5 is RUN1-NVY-095). */
const SIZES_IN_TENTHS = Array.from({ length: 13 }, (_, index) => 70 + index * 5);

const MAX_LINES = 20;
const MAX_PER_SIZE = 10;

const STATUS_CODES: Record<OrderStatus, number> = {
  CONFIRMED: 201,
  REJECTED: 409,
  PENDING: 503,
  CANCELLED: 200,
};

const TITLES: Record<number, string> = {
  400: 'Bad request',
  404: 'Not found',
  409: 'Conflict',
  422: 'Unprocessable content',
  503: 'Service unavailable',
};

class InventoryUnavailable extends Error {}

/**
 * Stands in for both back-end services in the GitHub Pages demo. It follows their rules: orders
 * reserve every size or none, an Idempotency-Key replay returns the original order, orders wait as
 * PENDING while inventory is down, and a cancel puts stock back once. State lives in memory, so a
 * page refresh starts over.
 */
@Injectable({ providedIn: 'root' })
export class DemoBackend {
  /** When on, the order service cannot reach inventory, so new orders wait as PENDING. */
  readonly outage = signal(false);

  private readonly products: Product[] = STYLES.flatMap((style) =>
    SIZES_IN_TENTHS.map((tenths) => ({
      sku: `${style.styleCode}-${String(tenths).padStart(3, '0')}`,
      styleCode: style.styleCode,
      styleName: style.styleName,
      color: style.color,
      size: tenths / 10,
      priceCents: style.priceCents,
    })),
  );
  private readonly productBySku = new Map(this.products.map((product) => [product.sku, product]));
  private readonly stock = new Map<string, number>();
  private readonly reservations = new Map<string, Reservation>();
  private readonly reservationByOrder = new Map<string, string>();
  private readonly orders: Order[] = [];
  private readonly orderByKey = new Map<string, Order>();

  constructor() {
    // Same formula as V2__seed_stores_products_stock.sql, so the demo opens with the same stock.
    for (const store of STORES) {
      for (const product of this.products) {
        const quantity = (store.id * 3 + Math.round(product.size * 2) + product.styleName.length) % 7;
        this.stock.set(stockKey(store.code, product.sku), quantity);
      }
    }
  }

  handle(method: string, path: string, params: QueryParams, idempotencyKey: string | null, body: unknown): DemoResponse {
    if (method === 'GET' && path === '/api/stores') {
      return ok(STORES.map(({ code, name, city }) => ({ code, name, city })));
    }
    const catalog = path.match(/^\/api\/stores\/([^/]+)\/catalog$/);
    if (method === 'GET' && catalog) {
      return this.catalog(decodeURIComponent(catalog[1]));
    }
    if (method === 'GET' && path === '/api/orders') {
      return this.listOrders(params.get('store'), Number(params.get('limit') ?? 20));
    }
    if (method === 'POST' && path === '/api/orders') {
      return this.placeOrder(idempotencyKey, body);
    }
    const cancel = path.match(/^\/api\/orders\/([^/]+)\/cancel$/);
    if (method === 'POST' && cancel) {
      return this.cancelOrder(decodeURIComponent(cancel[1]));
    }
    const order = path.match(/^\/api\/orders\/([^/]+)$/);
    if (method === 'GET' && order) {
      const found = this.orders.find((candidate) => candidate.id === decodeURIComponent(order[1]));
      return found ? ok(copy(found)) : problem(404, `No order with id ${order[1]}`);
    }
    return problem(404, `No route for ${method} ${path}`);
  }

  private catalog(storeCode: string): DemoResponse {
    if (!STORES.some((store) => store.code === storeCode)) {
      return problem(404, `No store with code ${storeCode}`);
    }
    const styles: Style[] = STYLES.map((style) => ({
      styleCode: style.styleCode,
      name: style.styleName,
      color: style.color,
      priceCents: style.priceCents,
      sizes: this.products
        .filter((product) => product.styleCode === style.styleCode)
        .map((product) => ({
          size: String(product.size),
          sku: product.sku,
          available: this.stock.get(stockKey(storeCode, product.sku)) ?? 0,
        })),
    }));
    return ok(styles);
  }

  private listOrders(storeCode: string | null, limit: number): DemoResponse {
    const capped = Math.max(1, Math.min(Number.isFinite(limit) ? limit : 20, 100));
    const orders = this.orders.filter((order) => !storeCode || order.storeCode === storeCode).slice(0, capped);
    return ok(orders.map(copy));
  }

  /** The order service: validate, save once per Idempotency-Key, then reserve the stock. */
  private placeOrder(idempotencyKey: string | null, body: unknown): DemoResponse {
    const key = (idempotencyKey ?? '').trim();
    if (!key || key.length > 64) {
      return problem(400, 'Send an Idempotency-Key header (up to 64 characters) so a retry never orders twice');
    }
    let request: ParsedOrder;
    try {
      request = parseOrder(body);
    } catch (error) {
      return problem(400, (error as Error).message);
    }

    let order = this.orderByKey.get(key);
    if (!order) {
      order = {
        id: newUuid(),
        storeCode: request.storeCode,
        status: 'PENDING',
        reason: null,
        reservationId: null,
        totalCents: null,
        createdAt: new Date().toISOString(),
        lines: [...request.quantities].map(([sku, quantity]) => ({ sku, quantity, unitPriceCents: null })),
      };
      this.orderByKey.set(key, order);
      this.orders.unshift(order);
    } else if (!sameOrder(order, request)) {
      return problem(422, 'This Idempotency-Key was already used for a different order');
    }

    if (order.status === 'PENDING') {
      this.reserveStock(order);
    }
    return { status: STATUS_CODES[order.status], body: copy(order) };
  }

  private reserveStock(order: Order): void {
    try {
      const reservation = this.reserve(order.id, order.storeCode, order.lines);
      const prices = new Map(reservation.lines.map((line) => [line.sku, line.unitPriceCents]));
      order.lines = order.lines.map((line) => ({ ...line, unitPriceCents: prices.get(line.sku) ?? null }));
      order.reservationId = reservation.id;
      order.totalCents = reservation.totalCents;
      order.status = 'CONFIRMED';
    } catch (error) {
      if (error instanceof InventoryUnavailable) {
        return; // stays PENDING; a retry with the same Idempotency-Key finishes it
      }
      order.status = 'REJECTED';
      order.reason = (error as Error).message;
    }
  }

  /** The inventory service: every line of an order or none of them, keyed by order so retries are safe. */
  private reserve(orderRef: string, storeCode: string, lines: OrderLine[]): Reservation {
    if (this.outage()) {
      throw new InventoryUnavailable('Inventory service unavailable');
    }
    const existing = this.reservationByOrder.get(orderRef);
    if (existing) {
      return this.reservations.get(existing)!;
    }
    if (!STORES.some((store) => store.code === storeCode)) {
      throw new Error(`No store with code ${storeCode}`);
    }
    for (const line of lines) {
      if (!this.productBySku.has(line.sku)) {
        throw new Error(`No product with SKU ${line.sku}`);
      }
    }
    for (const line of lines) {
      const available = this.stock.get(stockKey(storeCode, line.sku)) ?? 0;
      if (available < line.quantity) {
        throw new Error(`Only ${available} left of ${line.sku}, ${line.quantity} requested`);
      }
    }
    for (const line of lines) {
      const key = stockKey(storeCode, line.sku);
      this.stock.set(key, (this.stock.get(key) ?? 0) - line.quantity);
    }
    const priced = lines.map((line) => ({
      sku: line.sku,
      quantity: line.quantity,
      unitPriceCents: this.productBySku.get(line.sku)!.priceCents,
    }));
    const reservation: Reservation = {
      id: newUuid(),
      status: 'ACTIVE',
      storeCode,
      lines: priced,
      totalCents: priced.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0),
    };
    this.reservations.set(reservation.id, reservation);
    this.reservationByOrder.set(orderRef, reservation.id);
    return reservation;
  }

  private cancelOrder(orderId: string): DemoResponse {
    const order = this.orders.find((candidate) => candidate.id === orderId);
    if (!order) {
      return problem(404, `No order with id ${orderId}`);
    }
    if (order.status === 'CANCELLED') {
      return ok(copy(order));
    }
    if (order.status !== 'CONFIRMED') {
      return problem(409, `Only confirmed orders can be cancelled; this one is ${order.status}`);
    }
    if (this.outage()) {
      return problem(503, 'The inventory service is unavailable; try the cancel again');
    }
    const reservation = this.reservations.get(order.reservationId ?? '');
    if (reservation?.status === 'ACTIVE') {
      for (const line of reservation.lines) {
        const key = stockKey(reservation.storeCode, line.sku);
        this.stock.set(key, (this.stock.get(key) ?? 0) + line.quantity);
      }
      reservation.status = 'RELEASED';
    }
    order.status = 'CANCELLED';
    return ok(copy(order));
  }
}

interface ParsedOrder {
  storeCode: string;
  quantities: Map<string, number>;
}

/** Same checks and messages as the order service's parse_order. */
function parseOrder(payload: unknown): ParsedOrder {
  if (!isRecord(payload)) {
    throw new Error('Send the order as a JSON object');
  }
  const storeCode = payload['storeCode'];
  if (typeof storeCode !== 'string' || !storeCode.trim() || storeCode.length > 10) {
    throw new Error('storeCode is required (up to 10 characters)');
  }
  const lines = payload['lines'];
  if (!Array.isArray(lines) || lines.length < 1 || lines.length > MAX_LINES) {
    throw new Error(`lines must hold 1 to ${MAX_LINES} items`);
  }
  const quantities = new Map<string, number>();
  for (const line of lines) {
    const sku = isRecord(line) ? line['sku'] : undefined;
    const quantity = isRecord(line) ? line['quantity'] : undefined;
    if (typeof sku !== 'string' || !sku.trim() || sku.length > 32) {
      throw new Error('Each line needs a sku (up to 32 characters)');
    }
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) {
      throw new Error('Each line needs a whole-number quantity of at least 1');
    }
    quantities.set(sku, (quantities.get(sku) ?? 0) + quantity);
  }
  if ([...quantities.values()].some((quantity) => quantity > MAX_PER_SIZE)) {
    throw new Error(`No more than ${MAX_PER_SIZE} of one size per order`);
  }
  // Sorted by SKU, the same order the services lock stock rows in
  const sorted = [...quantities].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return { storeCode: storeCode.trim(), quantities: new Map(sorted) };
}

function sameOrder(order: Order, request: ParsedOrder): boolean {
  return (
    order.storeCode === request.storeCode &&
    order.lines.length === request.quantities.size &&
    order.lines.every((line) => request.quantities.get(line.sku) === line.quantity)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stockKey(storeCode: string, sku: string): string {
  return `${storeCode}|${sku}`;
}

function ok(body: unknown): DemoResponse {
  return { status: 200, body };
}

/** An RFC 9457 problem response, the same error format both services use. */
function problem(status: number, detail: string): DemoResponse {
  return { status, body: { type: 'about:blank', title: TITLES[status] ?? 'Error', status, detail } };
}

/** Hands out copies so the app can never change the stand-in's state directly. */
function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
