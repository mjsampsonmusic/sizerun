import { Component, OnInit, inject } from '@angular/core';
import { CartPanel } from './cart-panel';
import { Catalog } from './catalog';
import { OrderList } from './order-list';
import { Shop } from './shop';

@Component({
  selector: 'app-root',
  imports: [Catalog, CartPanel, OrderList],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  protected readonly shop = inject(Shop);

  ngOnInit(): void {
    void this.shop.init();
  }

  protected onStoreChange(event: Event): void {
    void this.shop.selectStore((event.target as HTMLSelectElement).value);
  }
}
