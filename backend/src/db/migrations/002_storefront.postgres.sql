-- 002_storefront.postgres.sql (Postgres 15) — P1 storefront public, logic giong SQLite
ALTER TABLE products ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS images_json TEXT DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS badge TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT TRUE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'cafe';
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_combo BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS services (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'other' CHECK (type IN ('teabreak','delivery','vat','other')),
  price BIGINT NOT NULL DEFAULT 0 CHECK (price >= 0),
  unit TEXT DEFAULT 'goi',
  description TEXT,
  is_published BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS service_requests (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  service_id BIGINT REFERENCES services(id) ON DELETE RESTRICT,
  customer_id BIGINT REFERENCES customers(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  slot_time TIMESTAMPTZ,
  party_size INTEGER CHECK (party_size IS NULL OR party_size > 0),
  location TEXT,
  tax_code TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','quoted','booked','done','cancelled')),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_svc_req_phone ON service_requests(phone);
CREATE INDEX IF NOT EXISTS idx_svc_req_status ON service_requests(status);

ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

CREATE TABLE IF NOT EXISTS order_lookup_tokens (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_lookup_order ON order_lookup_tokens(order_id);

CREATE TABLE IF NOT EXISTS pay_webhook_logs (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'vietqr' CHECK (provider IN ('vietqr','payos','bank','cod')),
  bank_ref TEXT UNIQUE NOT NULL,
  payload_hash TEXT NOT NULL,
  signature_ok BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS order_id BIGINT REFERENCES orders(id) ON DELETE RESTRICT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'erp' CHECK (source IN ('erp','storefront'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS lookup_code TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_orders_source ON orders(source);

CREATE TABLE IF NOT EXISTS banners (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  image_url TEXT NOT NULL,
  link TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS promotions (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_date DATE,
  end_date DATE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS product_combos (
  id BIGSERIAL PRIMARY KEY,
  parent_sku TEXT NOT NULL REFERENCES products(sku) ON DELETE RESTRICT,
  child_sku TEXT NOT NULL REFERENCES products(sku) ON DELETE RESTRICT,
  qty INTEGER NOT NULL CHECK (qty > 0),
  UNIQUE (parent_sku, child_sku)
);
CREATE TABLE IF NOT EXISTS product_prices (
  id BIGSERIAL PRIMARY KEY,
  sku TEXT NOT NULL REFERENCES products(sku) ON DELETE RESTRICT,
  channel TEXT NOT NULL DEFAULT 'all' CHECK (channel IN ('all','web','store','delivery')),
  start_time TEXT,
  end_time TEXT,
  price BIGINT NOT NULL CHECK (price > 0),
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pprices_sku ON product_prices(sku);
