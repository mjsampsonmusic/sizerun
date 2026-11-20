import { CurrencyPipe, DatePipe, TitleCasePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Order } from './models';
import { Shop, shortId } from './shop';

@Component({
  selector: 'app-order-list',
  imports: [CurrencyPipe, DatePipe, TitleCasePipe],
  template: `
    <section class="card panel" aria-labelledby="orders-title">
      <h2 id="orders-title">Recent orders</h2>
      @for (order of shop.orders(); track order.id) {
        <div class="order">
          <div>
            <p class="order-id">
              #{{ shortId(order.id) }}
              <span class="pill" [attr.data-status]="order.status">{{ order.status | titlecase }}</span>
            </p>
            <p class="muted small">
              {{ order.createdAt | date: 'MMM d, h:mm a' }} · {{ pairs(order) }}
              {{ pairs(order) === 1 ? 'pair' : 'pairs' }}
              @if (order.totalCents !== null) {
                · {{ order.totalCents / 100 | currency: 'USD' }}
              }
            </p>
            @if (order.reason) {
              <p class="small reason">{{ order.reason }}</p>
            }
          </div>
          @if (order.status === 'CONFIRMED') {
            <button type="button" class="ghost" [disabled]="shop.busy()" (click)="shop.cancel(order)">
              Cancel
            </button>
          }
        </div>
      } @empty {
        <p class="muted">No orders at this store yet.</p>
      }
    </section>
  `,
})
export class OrderList {
  protected readonly shop = inject(Shop);
  protected readonly shortId = shortId;

  protected pairs(order: Order): number {
    return order.lines.reduce((count, line) => count + line.quantity, 0);
  }
}
