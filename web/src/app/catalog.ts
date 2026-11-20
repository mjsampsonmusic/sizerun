import { CurrencyPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Shop } from './shop';

/** Each style's size run. Tap a size to add a pair; sold-out sizes are disabled. */
@Component({
  selector: 'app-catalog',
  imports: [CurrencyPipe],
  template: `
    @for (style of shop.catalog(); track style.styleCode) {
      <article class="card style">
        <header class="style-head">
          <div>
            <h3>{{ style.name }}</h3>
            <p class="muted small">{{ style.color }} · {{ style.styleCode }}</p>
          </div>
          <p class="price">{{ style.priceCents / 100 | currency: 'USD' }}</p>
        </header>
        <div class="sizes" role="group" [attr.aria-label]="style.name + ' sizes'">
          @for (size of style.sizes; track size.sku) {
            <button
              type="button"
              class="size"
              [class.sold-out]="size.available === 0"
              [class.low]="size.available > 0 && size.available <= 2"
              [class.in-cart]="shop.inCart(size.sku) > 0"
              [disabled]="size.available === 0 || shop.inCart(size.sku) >= size.available"
              [attr.aria-label]="
                'Size ' + size.size + ', ' + (size.available === 0 ? 'sold out' : size.available + ' left')
              "
              (click)="shop.add(style, size)"
            >
              <span class="size-label">{{ size.size }}</span>
              <span class="size-stock">{{ size.available === 0 ? 'Sold out' : size.available + ' left' }}</span>
              @if (shop.inCart(size.sku) > 0) {
                <span class="badge">{{ shop.inCart(size.sku) }}</span>
              }
            </button>
          }
        </div>
      </article>
    } @empty {
      <p class="muted">Loading stock...</p>
    }
  `,
})
export class Catalog {
  protected readonly shop = inject(Shop);
}
