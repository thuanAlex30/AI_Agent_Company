-- 002_storefront.sql (SQLite) — BizOps AI v6.1 P1 storefront public
-- Quyet dinh P0: COMBO tru kho theo thanh phan; gia theo gio/kenh; teabreak chi tiet; VietQR tinh + COD; tra cuu DHxxx + SDT.

-- 1. products: cot publish/SEO (cost KHONG bao gio public)
ALTER TABLE products ADD COLUMN slug TEXT NULL;
ALTER TABLE products ADD COLUMN description TEXT NULL;
ALTER TABLE products ADD COLUMN images_json TEXT DEFAULT '[]';
ALTER TABLE products ADD COLUMN badge TEXT NULL;
ALTER TABLE products ADD COLUMN sort_order INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN is_published INTEGER DEFAULT 1;
ALTER TABLE products ADD COLUMN category TEXT DEFAULT 'cafe';
ALTER TABLE products ADD COLUMN is_combo INTEGER DEFAULT 0;

-- 2. services (dich vu ban: teabreak / giao / VAT)
CREATE TABLE IF NOT EXISTS services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'other' CHECK (type IN ('teabreak','delivery','vat','other')),
  price BIGINT NOT NULL DEFAULT 0 CHECK (price >= 0),
  unit TEXT DEFAULT 'goi',
  description TEXT NULL,
  is_published INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. service_requests (dat lich / bao gia chi tiet: ca, so nguoi, dia diem, MST)
CREATE TABLE IF NOT EXISTS service_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  service_id BIGINT NULL REFERENCES services(id) ON DELETE RESTRICT,
  customer_id BIGINT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NULL,
  slot_time TIMESTAMP NULL,
  party_size INTEGER NULL CHECK (party_size IS NULL OR party_size > 0),
  location TEXT NULL,
  tax_code TEXT NULL,
  note TEXT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','quoted','booked','done','cancelled')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_svc_req_phone ON service_requests(phone);
CREATE INDEX IF NOT EXISTS idx_svc_req_status ON service_requests(status);

-- 4. customers: hash contact cho tra cuu 2 yeu to (ma don + SDT/email)
ALTER TABLE customers ADD COLUMN contact_hash TEXT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);

-- 5. order_lookup_tokens (token phu cho trang xac nhan; tra cuu chinh dung ma + SDT)
CREATE TABLE IF NOT EXISTS order_lookup_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_lookup_order ON order_lookup_tokens(order_id);

-- 6. pay_webhook_logs (VietQR tinh + COD: chong replay + idempotency, phuc vu I5)
CREATE TABLE IF NOT EXISTS pay_webhook_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL DEFAULT 'vietqr' CHECK (provider IN ('vietqr','payos','bank','cod')),
  bank_ref TEXT UNIQUE NOT NULL,
  payload_hash TEXT NOT NULL,
  signature_ok INTEGER DEFAULT 0,
  processed_at TIMESTAMP NULL,
  note TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. tickets.order_id + orders.source/lookup_code
ALTER TABLE tickets ADD COLUMN order_id BIGINT NULL REFERENCES orders(id) ON DELETE RESTRICT;
ALTER TABLE orders ADD COLUMN source TEXT DEFAULT 'erp' CHECK (source IN ('erp','storefront'));
ALTER TABLE orders ADD COLUMN lookup_code TEXT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_lookup ON orders(lookup_code);
CREATE INDEX IF NOT EXISTS idx_orders_source ON orders(source);

-- 8. banners + promotions (hero carousel + flash-sale kieu Viettel)
CREATE TABLE IF NOT EXISTS banners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  image_url TEXT NOT NULL,
  link TEXT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS promotions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. product_combos (COMBO-SANG tru kho theo thanh phan: 1 combo = N CF + M BANH)
CREATE TABLE IF NOT EXISTS product_combos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_sku TEXT NOT NULL REFERENCES products(sku) ON DELETE RESTRICT,
  child_sku TEXT NOT NULL REFERENCES products(sku) ON DELETE RESTRICT,
  qty INTEGER NOT NULL CHECK (qty > 0),
  UNIQUE (parent_sku, child_sku)
);

-- 10. product_prices (gia theo gio/kenh: channel + khung gio + uu tien)
CREATE TABLE IF NOT EXISTS product_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sku TEXT NOT NULL REFERENCES products(sku) ON DELETE RESTRICT,
  channel TEXT NOT NULL DEFAULT 'all' CHECK (channel IN ('all','web','store','delivery')),
  start_time TEXT NULL,
  end_time TEXT NULL,
  price BIGINT NOT NULL CHECK (price > 0),
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pprices_sku ON product_prices(sku);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
