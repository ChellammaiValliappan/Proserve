-- ProServe Grocery Partner – initial schema
-- Money is stored in paise (integer) to avoid rounding errors. ₹1 = 100 paise.

CREATE TABLE IF NOT EXISTS schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- Admin-configurable business rules (minimum order, delivery fee, thresholds, PIN codes…)
CREATE TABLE settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE resellers (
  id bigserial PRIMARY KEY,
  partner_id text UNIQUE,
  phone text NOT NULL UNIQUE CHECK (phone ~ '^[6-9][0-9]{9}$'),
  name text,
  address text,
  area text,
  pin text CHECK (pin IS NULL OR pin ~ '^[1-9][0-9]{5}$'),
  lang text NOT NULL DEFAULT 'ta' CHECK (lang IN ('ta','en')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked')),
  token_version int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE otp_codes (
  phone text PRIMARY KEY,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE rate_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL,
  count int NOT NULL
);

CREATE TABLE admins (
  id serial PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','staff')),
  active boolean NOT NULL DEFAULT true,
  token_version int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE categories (
  id text PRIMARY KEY,
  name_ta text NOT NULL,
  name_en text NOT NULL,
  kind text NOT NULL DEFAULT 'sack',
  tint text NOT NULL DEFAULT '#E2F1E6',
  sort int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE products (
  id bigserial PRIMARY KEY,
  sku text UNIQUE,
  category_id text NOT NULL REFERENCES categories(id),
  name_ta text NOT NULL,
  name_en text NOT NULL,
  pack_size text NOT NULL,
  mrp_paise int CHECK (mrp_paise IS NULL OR mrp_paise > 0),
  price_paise int NOT NULL CHECK (price_paise > 0),
  cost_paise int CHECK (cost_paise IS NULL OR cost_paise >= 0),
  stock int NOT NULL DEFAULT 0 CHECK (stock >= 0),
  max_per_order int CHECK (max_per_order IS NULL OR max_per_order > 0),
  kind text NOT NULL DEFAULT 'sack',
  image_key text,
  active boolean NOT NULL DEFAULT true,
  sort int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_category_idx ON products(category_id) WHERE active;

CREATE SEQUENCE order_no_seq START 10001;

CREATE TABLE orders (
  id bigserial PRIMARY KEY,
  order_no text NOT NULL UNIQUE,
  reseller_id bigint NOT NULL REFERENCES resellers(id),
  status text NOT NULL CHECK (status IN (
    'pending_payment','payment_failed','paid','packing','dispatched','delivered','cancelled','expired')),
  subtotal_paise int NOT NULL,
  delivery_fee_paise int NOT NULL,
  total_paise int NOT NULL,
  tier text NOT NULL CHECK (tier IN ('trial','growth','premium')),
  item_count int NOT NULL,
  address jsonb NOT NULL,
  expected_delivery date NOT NULL,
  revised_delivery date,
  idempotency_key text NOT NULL,
  payment_method text,
  refund_status text CHECK (refund_status IS NULL OR refund_status IN ('pending','refunded')),
  delivery_person text,
  delivery_phone text,
  stock_released boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  UNIQUE (reseller_id, idempotency_key)
);
CREATE INDEX orders_reseller_idx ON orders(reseller_id, created_at DESC);
CREATE INDEX orders_status_idx ON orders(status, created_at DESC);

CREATE TABLE order_items (
  id bigserial PRIMARY KEY,
  order_id bigint NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id bigint NOT NULL REFERENCES products(id),
  name_ta text NOT NULL,
  name_en text NOT NULL,
  pack_size text NOT NULL,
  kind text NOT NULL,
  price_paise int NOT NULL,
  mrp_paise int,
  cost_paise int,
  qty int NOT NULL CHECK (qty > 0),
  line_total_paise int NOT NULL
);
CREATE INDEX order_items_order_idx ON order_items(order_id);

CREATE TABLE payments (
  id bigserial PRIMARY KEY,
  order_id bigint NOT NULL REFERENCES orders(id),
  provider text NOT NULL CHECK (provider IN ('razorpay','mock')),
  provider_order_id text UNIQUE,
  provider_payment_id text,
  amount_paise int NOT NULL,
  status text NOT NULL CHECK (status IN ('created','paid','failed','refund_pending','refunded')),
  method text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_order_idx ON payments(order_id);

CREATE TABLE order_events (
  id bigserial PRIMARY KEY,
  order_id bigint NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status text NOT NULL,
  note text,
  actor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_events_order_idx ON order_events(order_id, created_at);

CREATE TABLE complaints (
  id bigserial PRIMARY KEY,
  reseller_id bigint NOT NULL REFERENCES resellers(id),
  order_id bigint REFERENCES orders(id),
  type text NOT NULL CHECK (type IN ('damaged','wrong_item','missing_item','late','payment','other')),
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  admin_id int REFERENCES admins(id),
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
