import { Order, Style } from '../models';
import { DemoBackend } from './demo-backend';

const noParams = { get: () => null };

function place(backend: DemoBackend, lines: { sku: string; quantity: number }[], key: string | null, storeCode = 'IND01') {
  return backend.handle('POST', '/api/orders', noParams, key, { storeCode, lines });
}

function catalog(backend: DemoBackend, storeCode: string): Style[] {
  return backend.handle('GET', `/api/stores/${storeCode}/catalog`, noParams, null, null).body as Style[];
}

function available(backend: DemoBackend, storeCode: string, sku: string): number {
  const size = catalog(backend, storeCode)
    .flatMap((style) => style.sizes)
    .find((candidate) => candidate.sku === sku);
  return size!.available;
}

describe('DemoBackend', () => {
  let backend: DemoBackend;

  beforeEach(() => {
    backend = new DemoBackend();
  });

  it('opens with the same stock as the inventory database seed', () => {
    // Values read from the Flyway-seeded PostgreSQL database
    expect(available(backend, 'CHI01', 'CRT-WHT-070')).toBe(2);
    expect(available(backend, 'IND01', 'RUN1-NVY-095')).toBe(2);
    expect(available(backend, 'IND01', 'TRL2-GRN-100')).toBe(4);
    expect(available(backend, 'NYC01', 'WLK-CHR-130')).toBe(5);

    const styles = catalog(backend, 'IND01');
    expect(styles.map((style) => style.styleCode)).toEqual(['CRT-WHT', 'RUN1-NVY', 'TRL2-GRN', 'WLK-CHR']);
    expect(styles[1].sizes.map((size) => size.size)).toEqual([
      '7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', '12.5', '13',
    ]);
  });

  it('confirms an order, prices it from inventory, and takes the stock', () => {
    const response = place(backend, [{ sku: 'TRL2-GRN-100', quantity: 2 }], 'key-1');

    expect(response.status).toBe(201);
    const order = response.body as Order;
    expect(order.status).toBe('CONFIRMED');
    expect(order.totalCents).toBe(29000);
    expect(order.lines).toEqual([{ sku: 'TRL2-GRN-100', quantity: 2, unitPriceCents: 14500 }]);
    expect(available(backend, 'IND01', 'TRL2-GRN-100')).toBe(2);
  });

  it('reserves every size of an order or none of them', () => {
    const response = place(
      backend,
      [
        { sku: 'TRL2-GRN-100', quantity: 1 },
        { sku: 'RUN1-NVY-095', quantity: 3 },
      ],
      'key-2',
    );

    expect(response.status).toBe(409);
    expect((response.body as Order).reason).toBe('Only 2 left of RUN1-NVY-095, 3 requested');
    expect(available(backend, 'IND01', 'TRL2-GRN-100')).toBe(4);
    expect(available(backend, 'IND01', 'RUN1-NVY-095')).toBe(2);
  });

  it('replays an Idempotency-Key instead of ordering twice, and refuses it for a different order', () => {
    const first = place(backend, [{ sku: 'TRL2-GRN-100', quantity: 1 }], 'key-3');
    const replay = place(backend, [{ sku: 'TRL2-GRN-100', quantity: 1 }], 'key-3');

    expect(replay.status).toBe(201);
    expect((replay.body as Order).id).toBe((first.body as Order).id);
    expect(available(backend, 'IND01', 'TRL2-GRN-100')).toBe(3);
    expect(place(backend, [{ sku: 'TRL2-GRN-100', quantity: 2 }], 'key-3').status).toBe(422);
  });

  it('holds an order as pending during an outage, then confirms the same order on retry', () => {
    backend.outage.set(true);
    const pending = place(backend, [{ sku: 'TRL2-GRN-100', quantity: 1 }], 'key-4');

    expect(pending.status).toBe(503);
    expect((pending.body as Order).status).toBe('PENDING');
    expect(available(backend, 'IND01', 'TRL2-GRN-100')).toBe(4);

    backend.outage.set(false);
    const confirmed = place(backend, [{ sku: 'TRL2-GRN-100', quantity: 1 }], 'key-4');

    expect(confirmed.status).toBe(201);
    expect((confirmed.body as Order).id).toBe((pending.body as Order).id);
    expect(available(backend, 'IND01', 'TRL2-GRN-100')).toBe(3);
  });

  it('puts stock back exactly once when an order is cancelled twice', () => {
    const order = place(backend, [{ sku: 'TRL2-GRN-100', quantity: 2 }], 'key-5').body as Order;
    const cancel = () => backend.handle('POST', `/api/orders/${order.id}/cancel`, noParams, null, null);

    expect(cancel().status).toBe(200);
    expect(cancel().status).toBe(200);
    expect(available(backend, 'IND01', 'TRL2-GRN-100')).toBe(4);
  });

  it('rejects malformed orders the same way the order service does', () => {
    expect(place(backend, [{ sku: 'TRL2-GRN-100', quantity: 1 }], null).status).toBe(400);
    expect(place(backend, [{ sku: 'TRL2-GRN-100', quantity: 0 }], 'key-6').status).toBe(400);
    expect(place(backend, [{ sku: 'TRL2-GRN-100', quantity: 11 }], 'key-7').status).toBe(400);
    expect(place(backend, [], 'key-8').status).toBe(400);
  });
});
