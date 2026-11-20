import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { throwError } from 'rxjs';
import { ApiService } from './api';
import { Shop } from './shop';
import { confirmedOrder, fakeApi, testCatalog } from './testing';

describe('Shop', () => {
  let api: ReturnType<typeof fakeApi>;
  let shop: Shop;
  const style = testCatalog[0];
  const size = style.sizes[0];

  beforeEach(async () => {
    api = fakeApi();
    TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: api }] });
    shop = TestBed.inject(Shop);
    await shop.init();
  });

  it('opens on the Indianapolis store with its stock loaded', () => {
    expect(shop.storeCode()).toBe('IND01');
    expect(shop.catalog()).toEqual(testCatalog);
    expect(api.catalog).toHaveBeenCalledWith('IND01');
  });

  it('places an order, clears the cart, and confirms it', async () => {
    shop.add(style, size);
    shop.add(style, size);

    await shop.placeOrder();

    expect(api.placeOrder).toHaveBeenCalledWith('IND01', [{ sku: 'RUN1-NVY-095', quantity: 2 }], expect.any(String));
    expect(shop.cart()).toEqual([]);
    expect(shop.notice()).toEqual({ kind: 'success', text: 'Order #a1b2c3d4 confirmed: 2 pairs reserved.' });
  });

  it('shows why inventory rejected an order', async () => {
    const rejected = { ...confirmedOrder, status: 'REJECTED', reason: 'Only 1 left of RUN1-NVY-095, 2 requested' };
    api.placeOrder.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409, error: rejected })));
    shop.add(style, size);

    await shop.placeOrder();

    expect(shop.notice()).toEqual({
      kind: 'error',
      text: 'Order rejected. Only 1 left of RUN1-NVY-095, 2 requested',
    });
  });

  it('retries a pending order with the same Idempotency-Key', async () => {
    const pending = { ...confirmedOrder, status: 'PENDING' };
    api.placeOrder.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 503, error: pending })));
    shop.add(style, size);

    await shop.placeOrder();
    expect(shop.notice()?.retry).toBe(true);

    await shop.placeOrder();
    const [firstKey, retryKey] = api.placeOrder.mock.calls.map((call) => call[2]);
    expect(retryKey).toBe(firstKey);
    expect(shop.notice()?.kind).toBe('success');
  });

  it('starts a fresh order key once the cart changes', async () => {
    shop.add(style, size);
    await shop.placeOrder();
    shop.add(style, size);
    await shop.placeOrder();

    const [firstKey, secondKey] = api.placeOrder.mock.calls.map((call) => call[2]);
    expect(secondKey).not.toBe(firstKey);
  });
});
