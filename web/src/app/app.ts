import { Component, OnInit, inject } from '@angular/core';
import { environment } from '../environments/environment';
import { CartPanel } from './cart-panel';
import { Catalog } from './catalog';
import { DemoBanner } from './demo/demo-banner';
import { OrderList } from './order-list';
import { Shop } from './shop';

@Component({
  selector: 'app-root',
  imports: [Catalog, CartPanel, DemoBanner, OrderList],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  protected readonly shop = inject(Shop);
  protected readonly demo = environment.demo;

  ngOnInit(): void {
    void this.shop.init();
  }

  protected onStoreChange(event: Event): void {
    void this.shop.selectStore((event.target as HTMLSelectElement).value);
  }
}
