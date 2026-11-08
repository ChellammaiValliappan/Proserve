-- Default business settings (all editable from Admin → Configuration)
INSERT INTO settings (key, value) VALUES
  ('min_order_paise',       '100000'),   -- ₹1,000
  ('free_delivery_paise',   '300000'),   -- ₹3,000
  ('premium_paise',         '500000'),   -- ₹5,000
  ('delivery_fee_paise',    '6000'),     -- ₹60 (placeholder – set real fee in admin)
  ('serviceable_pins',      '["600"]'),  -- PIN prefixes / full PINs served (placeholder: Chennai 600xxx)
  ('order_cutoff_hour',     '20'),       -- orders after 8 PM IST deliver a day later
  ('no_delivery_weekdays',  '[0]'),      -- 0 = Sunday
  ('cancel_allowed_until',  '"paid"'),   -- customer may cancel until packing starts
  ('support_phone',         '""'),
  ('support_whatsapp',      '""')
ON CONFLICT (key) DO NOTHING;

INSERT INTO categories (id, name_ta, name_en, kind, tint, sort) VALUES
  ('rice',  'அரிசி, மாவு',  'Rice & Grains', 'sack',  '#FBF0D9', 1),
  ('dal',   'பருப்பு',       'Pulses & Dals', 'dal',   '#FDE7C4', 2),
  ('oil',   'எண்ணெய்',      'Cooking Oil',   'oil',   '#FFF4BF', 3),
  ('sugar', 'சர்க்கரை',     'Sugar',         'sugar', '#E9EEF6', 4),
  ('ess',   'மற்றவை',       'Essentials',    'salt',  '#E2F1E6', 5)
ON CONFLICT (id) DO NOTHING;

-- Sample catalogue with SAMPLE prices – replace from Admin → Products before launch
INSERT INTO products (sku, category_id, name_ta, name_en, pack_size, mrp_paise, price_paise, stock, kind, sort) VALUES
  ('RICE-PONNI-25', 'rice',  'பொன்னி அரிசி',        'Ponni Rice',     '25 kg', 145000, 124000, 20, 'sack',  1),
  ('RICE-IDLI-25',  'rice',  'இட்லி அரிசி',          'Idli Rice',      '25 kg', 115000,  99000, 12, 'sack',  2),
  ('ATTA-5',        'rice',  'கோதுமை மாவு',         'Wheat Atta',     '5 kg',   29000,  24500, 30, 'flour', 3),
  ('DAL-TOOR-1',    'dal',   'துவரம் பருப்பு',       'Toor Dal',       '1 kg',   18000,  14800, 40, 'dal',   4),
  ('DAL-URAD-1',    'dal',   'உளுத்தம் பருப்பு',     'Urad Dal',       '1 kg',   16500,  13600, 35, 'dal',   5),
  ('DAL-MOONG-1',   'dal',   'பாசிப் பருப்பு',       'Moong Dal',      '1 kg',   15000,  12400,  0, 'dal',   6),
  ('SUGAR-5',       'sugar', 'சர்க்கரை',             'Sugar',          '5 kg',   26000,  22200, 25, 'sugar', 7),
  ('OIL-SUN-1',     'oil',   'சூரியகாந்தி எண்ணெய்',  'Sunflower Oil',  '1 L',    17500,  14600, 50, 'oil',   8),
  ('OIL-GN-1',      'oil',   'கடலை எண்ணெய்',         'Groundnut Oil',  '1 L',    22000,  18800, 30, 'oil',   9),
  ('SALT-1',        'ess',   'உப்பு',                'Salt',           '1 kg',    2800,   2200, 60, 'salt', 10)
ON CONFLICT (sku) DO NOTHING;
