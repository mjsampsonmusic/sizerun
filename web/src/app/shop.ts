import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api';
import { CartLine, addToCart, cartCount, cartTotal, setQuantity, syncWithCatalog } from './cart';
import { Order, SizeOption, StoreLocation, Style } from './models';
import { newUuid } from './uuid';

export interface Notice {
  kind: 'success' | 'warning' | 'error';
  text: string;
  /** Show a Retry button that resends the same order with the same Idempotency-Key. */
  retry?: boolean;
}

/** App state, held in signals so the screen updates as soon as anything changes. */
@Injectable({ providedIn: 'root' })
export class Shop {
  private readonly api = inject(ApiService);

  readonly stores = signal<StoreLocation[]>([]);
  readonly storeCode = signal('');
  readonly catalog = signal<Style[]>([]);
  readonly cart = signal<CartLine[]>([]);
  readonly orders = signal<Order[]>([]);
  readonly busy = signal(false);
  readonly notice = signal<Notice | null>(null);
  readonly cartTotal = computed(() => cartTotal(this.cart()));
  readonly cartCount = computed(() => cartCount(this.cart()));

  /** Kept while an order is unanswered, so a retry can never create a second order. */
  private pendingKey: string | null = null;

  async init(): Promise<void> {
    try {
      const stores = await firstValueFrom(this.api.stores());
      this.stores.set(stores);
      const first = stores.find((store) => store.code === 'IND01') ?? stores[0];
      if (first) {
        await this.selectStore(first.code);
      }
    } catch {
      this.notice.set({ kind: 'error', text: 'Could not reach the inventory service.' });
    }
  }

  async selectStore(code: string): Promise<void> {
    this.storeCode.set(code);
    this.cart.set([]);
    this.pendingKey = null;
    this.notice.set(null);
    await this.refresh();
  }

  add(style: Style, size: SizeOption): void {
    this.cart.update((cart) =>
      addToCart(cart, {
        sku: size.sku,
        styleName: style.name,
        color: style.color,
        size: size.size,
        priceCents: style.priceCents,
        available: size.available,
      }),
    );
    this.startNewOrder();
  }

  setQuantity(sku: string, quantity: number): void {
    this.cart.update((cart) => setQuantity(cart, sku, quantity));
    this.startNewOrder();
  }

  inCart(sku: string): number {
    return this.cart().find((line) => line.sku === sku)?.quantity ?? 0;
  }

  async placeOrder(): Promise<void> {
    const cart = this.cart();
    if (cart.length === 0 || this.busy()) {
      return;
    }
    const key = (this.pendingKey ??= newUuid());
    const lines = cart.map((line) => ({ sku: line.sku, quantity: line.quantity }));
    this.busy.set(true);
    try {
      const order = await firstValueFrom(this.api.placeOrder(this.storeCode(), lines, key));
      const pairs = cartCount(cart);
      this.pendingKey = null;
      this.cart.set([]);
      this.notice.set({
        kind: 'success',
        text: `Order #${shortId(order.id)} confirmed: ${pairs} ${pairs === 1 ? 'pair' : 'pairs'} reserved.`,
      });
    } catch (error) {
      this.showOrderError(error);
    } finally {
      this.busy.set(false);
      await this.refresh();
    }
  }

  async cancel(order: Order): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.cancel(order.id));
      this.notice.set({
        kind: 'success',
        text: `Order #${shortId(order.id)} cancelled. Its stock is back on the shelf.`,
      });
    } catch (error) {
      this.notice.set({ kind: 'error', text: problemDetail(error) ?? 'The order could not be cancelled.' });
    } finally {
      this.busy.set(false);
      await this.refresh();
    }
  }

  private startNewOrder(): void {
    this.pendingKey = null;
    if (this.notice()?.retry) {
      this.notice.set(null);
    }
  }

  private showOrderError(error: unknown): void {
    const response = error instanceof HttpErrorResponse ? error : null;
    const order = response?.error as Partial<Order> | null | undefined;

    if (response?.status === 409 && order?.status === 'REJECTED') {
      this.pendingKey = null;
      this.notice.set({ kind: 'error', text: `Order rejected. ${order.reason ?? ''}`.trim() });
    } else if (response?.status === 503 && order?.status === 'PENDING') {
      this.notice.set({
        kind: 'warning',
        text: 'Inventory did not answer, so the order is saved as pending. Retrying is safe: it will not order twice.',
        retry: true,
      });
    } else if (response && (response.status === 0 || response.status >= 500)) {
      this.notice.set({
        kind: 'warning',
        text: 'Could not reach the order service. Retrying is safe: it will not order twice.',
        retry: true,
      });
    } else {
      this.pendingKey = null;
      this.notice.set({ kind: 'error', text: problemDetail(error) ?? 'The order could not be placed.' });
    }
  }

  private async refresh(): Promise<void> {
    const code = this.storeCode();
    if (!code) {
      return;
    }
    try {
      const [catalog, orders] = await Promise.all([
        firstValueFrom(this.api.catalog(code)),
        firstValueFrom(this.api.orders(code)),
      ]);
      this.catalog.set(catalog);
      this.orders.set(orders);
      this.cart.update((cart) => syncWithCatalog(cart, catalog));
    } catch {
      if (!this.notice()) {
        this.notice.set({ kind: 'error', text: 'Could not load stock and orders for this store.' });
      }
    }
  }
}

export function shortId(id: string): string {
  return id.slice(0, 8);
}

function problemDetail(error: unknown): string | undefined {
  if (error instanceof HttpErrorResponse && error.error && typeof error.error === 'object') {
    const detail = (error.error as { detail?: unknown }).detail;
    return typeof detail === 'string' ? detail : undefined;
  }
  return undefined;
}
