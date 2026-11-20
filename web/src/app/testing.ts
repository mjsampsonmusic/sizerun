import { of } from 'rxjs';
import { Order, StoreLocation, Style } from './models';

/** Shared test data and a stand-in for ApiService, so component and state tests need no server. */
export const testStores: StoreLocation[] = [
  { code: 'CHI01', name: 'SizeRun Chicago', city: 'Chicago, IL' },
  { code: 'IND01', name: 'SizeRun Indianapolis', city: 'Indianapolis, IN' },
];

export const testCatalog: Style[] = [
  {
    styleCode: 'RUN1-NVY',
    name: 'Tempo Runner',
    color: 'Midnight Navy',
    priceCents: 13000,
    sizes: [
      { size: '9.5', sku: 'RUN1-NVY-095', available: 3 },
      { size: '10', sku: 'RUN1-NVY-100', available: 0 },
    ],
  },
];

export const confirmedOrder: Order = {
  id: 'a1b2c3d4-0000-4000-8000-000000000000',
  storeCode: 'IND01',
  status: 'CONFIRMED',
  reason: null,
  reservationId: 'r-1',
  totalCents: 26000,
  createdAt: '2026-11-20T15:00:00Z',
  lines: [{ sku: 'RUN1-NVY-095', quantity: 2, unitPriceCents: 13000 }],
};

export function fakeApi() {
  return {
    stores: vi.fn(() => of(testStores)),
    catalog: vi.fn((_storeCode: string) => of(testCatalog)),
    orders: vi.fn((_storeCode: string) => of([] as Order[])),
    placeOrder: vi.fn(
      (_storeCode: string, _lines: { sku: string; quantity: number }[], _idempotencyKey: string) =>
        of(confirmedOrder),
    ),
    cancel: vi.fn((_orderId: string) => of({ ...confirmedOrder, status: 'CANCELLED' as const })),
  };
}
