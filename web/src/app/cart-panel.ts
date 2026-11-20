import { CurrencyPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Shop } from './shop';

@Component({
  selector: 'app-cart-panel',
  imports: [CurrencyPipe],
  template: `
    <section class="card panel" aria-labelledby="cart-title">
      <h2 id="cart-title">New order</h2>

      @if (shop.cart().length === 0) {
        <p class="muted empty">Tap a size to add a pair.</p>
      } @else {
        <ul class="lines">
          @for (line of shop.cart(); track line.sku) {
            <li class="line">
              <div>
                <p class="line-name">{{ line.styleName }}</p>
                <p class="muted small">Size {{ line.size }} · {{ line.color }}</p>
              </div>
              <div class="stepper">
                <button
                  type="button"
                  [attr.aria-label]="'One fewer ' + line.styleName + ' size ' + line.size"
                  (click)="shop.setQuantity(line.sku, line.quantity - 1)"
                >
                  &minus;
                </button>
                <span aria-live="polite">{{ line.quantity }}</span>
                <button
                  type="button"
                  [attr.aria-label]="'One more ' + line.styleName + ' size ' + line.size"
                  [disabled]="line.quantity >= line.available"
                  (click)="shop.setQuantity(line.sku, line.quantity + 1)"
                >
                  +
                </button>
              </div>
              <p class="line-total">{{ (line.priceCents * line.quantity) / 100 | currency: 'USD' }}</p>
            </li>
          }
        </ul>
        <p class="total">
          <span>{{ shop.cartCount() }} {{ shop.cartCount() === 1 ? 'pair' : 'pairs' }}</span>
          <strong>{{ shop.cartTotal() / 100 | currency: 'USD' }}</strong>
        </p>
      }

      <button
        type="button"
        class="primary"
        [disabled]="shop.cart().length === 0 || shop.busy()"
        (click)="shop.placeOrder()"
      >
        {{ shop.busy() ? 'Placing order...' : 'Place order' }}
      </button>

      @if (shop.notice(); as notice) {
        <div class="notice" [attr.data-kind]="notice.kind" role="status">
          <span>{{ notice.text }}</span>
          @if (notice.retry) {
            <button type="button" class="ghost" [disabled]="shop.busy()" (click)="shop.placeOrder()">
              Retry
            </button>
          }
        </div>
      }
    </section>
  `,
})
export class CartPanel {
  protected readonly shop = inject(Shop);
}
