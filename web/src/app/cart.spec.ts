import { CartLine, addToCart, cartCount, cartTotal, setQuantity, syncWithCatalog } from './cart';
import { Style } from './models';

const runner = {
  sku: 'RUN1-NVY-095',
  styleName: 'Tempo Runner',
  color: 'Midnight Navy',
  size: '9.5',
  priceCents: 13000,
  available: 2,
};

describe('cart', () => {
  it('adds a pair, then counts up only to what the store has', () => {
    let cart = addToCart([], runner);
    cart = addToCart(cart, runner);
    cart = addToCart(cart, runner);

    expect(cart).toEqual([{ ...runner, quantity: 2 }]);
  });

  it('never adds a sold-out size', () => {
    expect(addToCart([], { ...runner, available: 0 })).toEqual([]);
  });

  it('removes a line when its quantity drops to zero', () => {
    expect(setQuantity(addToCart([], runner), runner.sku, 0)).toEqual([]);
  });

  it('totals price times quantity', () => {
    const cart: CartLine[] = [
      { ...runner, quantity: 2 },
      { ...runner, sku: 'CRT-WHT-100', priceCents: 9500, quantity: 1 },
    ];

    expect(cartTotal(cart)).toBe(35500);
    expect(cartCount(cart)).toBe(3);
  });

  it('trims lines to the latest stock and drops sizes that sold out', () => {
    const cart: CartLine[] = [
      { ...runner, available: 5, quantity: 4 },
      { ...runner, sku: 'RUN1-NVY-100', size: '10', available: 1, quantity: 1 },
    ];
    const catalog: Style[] = [
      {
        styleCode: 'RUN1-NVY',
        name: 'Tempo Runner',
        color: 'Midnight Navy',
        priceCents: 13000,
        sizes: [
          { size: '9.5', sku: 'RUN1-NVY-095', available: 2 },
          { size: '10', sku: 'RUN1-NVY-100', available: 0 },
        ],
      },
    ];

    expect(syncWithCatalog(cart, catalog)).toEqual([{ ...runner, available: 2, quantity: 2 }]);
  });
});
