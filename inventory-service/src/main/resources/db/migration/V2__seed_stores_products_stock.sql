INSERT INTO store (code, name, city) VALUES
    ('CHI01', 'SizeRun Chicago',      'Chicago, IL'),
    ('IND01', 'SizeRun Indianapolis', 'Indianapolis, IN'),
    ('NYC01', 'SizeRun New York',     'New York, NY');

-- Four styles, each in a full size run: 7 to 13 in half sizes (13 sizes per style).
-- SKU = style code + size in tenths, so size 9.5 of RUN1-NVY is RUN1-NVY-095.
INSERT INTO product (sku, style_code, style_name, color, us_size, price_cents)
SELECT style.style_code || '-' || lpad(sizes.tenths::text, 3, '0'),
       style.style_code,
       style.style_name,
       style.color,
       (sizes.tenths / 10.0)::numeric(3, 1),
       style.price_cents
FROM (VALUES
        ('RUN1-NVY', 'Tempo Runner',  'Midnight Navy', 13000),
        ('TRL2-GRN', 'Ridge Trail 2', 'Moss Green',    14500),
        ('CRT-WHT',  'Court Classic', 'White and Gum',  9500),
        ('WLK-CHR',  'Daily Walker',  'Charcoal',      11000)
     ) AS style (style_code, style_name, color, price_cents)
CROSS JOIN generate_series(70, 130, 5) AS sizes (tenths);

-- Every store carries every SKU. Quantities run 0 to 6, so some sizes start sold out.
INSERT INTO stock (store_id, sku, quantity)
SELECT store.id,
       product.sku,
       (store.id * 3 + (product.us_size * 2)::int + length(product.style_name)) % 7
FROM store
CROSS JOIN product;
