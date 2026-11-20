import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Order, StoreLocation, Style } from './models';

/** Talks to both services. Requests go to /api/stores (inventory) and /api/orders (orders). */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  stores(): Observable<StoreLocation[]> {
    return this.http.get<StoreLocation[]>('/api/stores');
  }

  catalog(storeCode: string): Observable<Style[]> {
    return this.http.get<Style[]>(`/api/stores/${encodeURIComponent(storeCode)}/catalog`);
  }

  orders(storeCode: string): Observable<Order[]> {
    return this.http.get<Order[]>('/api/orders', { params: { store: storeCode, limit: 8 } });
  }

  /** The Idempotency-Key makes a retried request return the original order instead of a new one. */
  placeOrder(
    storeCode: string,
    lines: { sku: string; quantity: number }[],
    idempotencyKey: string,
  ): Observable<Order> {
    return this.http.post<Order>(
      '/api/orders',
      { storeCode, lines },
      { headers: { 'Idempotency-Key': idempotencyKey } },
    );
  }

  cancel(orderId: string): Observable<Order> {
    return this.http.post<Order>(`/api/orders/${encodeURIComponent(orderId)}/cancel`, null);
  }
}
