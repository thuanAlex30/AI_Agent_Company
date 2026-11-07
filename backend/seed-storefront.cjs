/**
 * seed-storefront.cjs — seed du lieu storefront (2 dialect: SQLite + PostgreSQL).
 *
 * Phase 0.3: TRUOC day file nay hard-code better-sqlite3 => job CI PostgreSQL
 * LUON do (va no bat buoc dung `date('now', ...)` — SQLite-only).
 *
 * FIX:
 *   - Dung adapter `common/db.js` (da abstraction 2 dialect).
 *   - Bo `date('now','-1 day')` -> businessDayVN(-1) / businessDayVN(30).
 *   - `product_prices` khong co UNIQUE id-luu => dung WHERE NOT EXISTS de
 *     idempotent (ON CONFLICT(id) DO NOTHING se them row moi moi lan chay).
 *   - Chay trong 1 transaction (INV-2: ghi audit trong cung tx).
 *
 * BUG (PG-DB-03, xac nhan tren CI run 42340162280 job `storefront-e2e`):
 *   Script PHAI tu tao san pham co so (CF-SUA-01 / TRA-DAO-01 / BANH-01) truoc
 *   khi them combo + bang gia. Truoc day no chi UPDATE 3 san pham, nen:
 *     - DB trong (CI: `npm run migrate` xong chay thang `npm run seed:storefront`)
 *       => 3 san pham KHONG ton tai => `product_combos` FK
 *          (child_sku REFERENCES products(sku)) FAIL =>
 *          job `storefront-e2e`, `storefront-browser-e2e`, `backend-postgres` FAIL.
 *     - Da co san pham -> UPDATE im lang khong loi.
 *   => Bay gio: dam bao san pham co so ton tai (ON CONFLICT DO NOTHING) truoc
 *      khi gan combo/gia. Idempotent, va chay duoc tren DB trong.
 */
require('dotenv').config();
const { all, tx, businessDayVN, DIALECT } = require('./src/common/db');

// San pham co so (khop voi src/db/seeds/demo.sql) — FK product_combos/
// product_prices REFERENCES products(sku).
const BASE_PRODUCTS = [
  ['CF-SUA-01', 'Ca phe sua', 35000, 18000, 'ly', 20],
  ['TRA-DAO-01', 'Tra dao', 40000, 20000, 'ly', 20],
  ['BANH-01', 'Banh ngot', 25000, 12000, 'cai', 20],
];

async function main() {
  await tx(async (c) => {
    // 0. Dam bao san pham co so ton tai (FK yeu cauu).
    //    `products` khoa chinh la `sku` (TEXT) — khong co cot `id`.
    for (const [sku, name, price, cost, unit, stockAlert] of BASE_PRODUCTS) {
      await c.run(
        `INSERT INTO products(sku,name,price,cost,unit,stock_alert) VALUES(?,?,?,?,?,?) ON CONFLICT(sku) DO NOTHING`,
        [sku, name, price, cost, unit, stockAlert]
      );
    }

    // 1. products publish/SEO cho 3 mon + COMBO-SANG
    // BUG (PG-DB-02): cot `is_published`/`is_combo` kieu BOOLEAN tren PostgreSQL
    // (INTEGER tren SQLite). Literal `1`/`0` => PG loi
    // "invalid input syntax for type boolean". Keyword TRUE/FALSE chay duoc tren
    // CA 2 dialect (SQLite tu dich sang 1/0) => dung TRUE/FALSE.
    await c.run(
      `UPDATE products SET slug='ca-phe-sua', description='Ca phe sua dam da pha may, thom beo', images_json='["/img/cf-sua-01.jpg"]', badge='ban-chay', sort_order=1, is_published=TRUE, category='cafe', is_combo=FALSE WHERE sku='CF-SUA-01'`
    );
    await c.run(
      `UPDATE products SET slug='tra-dao', description='Tra dao tuoi mat lanh', images_json='["/img/tra-dao-01.jpg"]', badge='moi', sort_order=2, is_published=TRUE, category='tra', is_combo=FALSE WHERE sku='TRA-DAO-01'`
    );
    await c.run(
      `UPDATE products SET slug='banh-ngot', description='Banh ngot moi moi ngay', images_json='["/img/banh-01.jpg"]', badge=NULL, sort_order=3, is_published=TRUE, category='banh', is_combo=FALSE WHERE sku='BANH-01'`
    );
    await c.run(
      `INSERT INTO products(sku,name,price,cost,unit,stock_alert,slug,description,images_json,badge,sort_order,is_published,category,is_combo) VALUES('COMBO-SANG','Combo sang (ca phe + banh)',55000,30000,'combo',10,'combo-sang','Combo sang tiet kiem: 1 ca phe sua + 1 banh ngot','["/img/combo-sang.jpg"]','flash-sale',0,TRUE,'combo',TRUE) ON CONFLICT(sku) DO NOTHING`
    );
    await c.run(
      `UPDATE products SET slug='combo-sang', is_combo=TRUE, is_published=TRUE, badge='flash-sale', sort_order=0 WHERE sku='COMBO-SANG'`
    );

    // 2. combo thanh phan: 1 COMBO = 1 CF + 1 BANH
    await c.run(
      `INSERT INTO product_combos(parent_sku,child_sku,qty) VALUES('COMBO-SANG','CF-SUA-01',1) ON CONFLICT(parent_sku,child_sku) DO NOTHING`
    );
    await c.run(
      `INSERT INTO product_combos(parent_sku,child_sku,qty) VALUES('COMBO-SANG','BANH-01',1) ON CONFLICT(parent_sku,child_sku) DO NOTHING`
    );

    // 3. gia theo gio/kenh demo: web 7-9h CF 32k; delivery +5k ban dem
    // product_prices khong co UNIQUE (sku,channel,start_time) => WHERE NOT EXISTS.
    await c.run(
      `INSERT INTO product_prices(sku,channel,start_time,end_time,price,priority)
       SELECT 'CF-SUA-01','web','07:00','09:00',32000,10
        WHERE NOT EXISTS (SELECT 1 FROM product_prices WHERE sku='CF-SUA-01' AND channel='web' AND start_time='07:00')`
    );
    await c.run(
      `INSERT INTO product_prices(sku,channel,start_time,end_time,price,priority)
       SELECT 'CF-SUA-01','delivery',NULL,NULL,40000,5
        WHERE NOT EXISTS (SELECT 1 FROM product_prices WHERE sku='CF-SUA-01' AND channel='delivery')`
    );

    // 4. services (cot is_published: BOOLEAN tren PG => dung TRUE/FALSE)
    await c.run(
      `INSERT INTO services(code,name,type,price,unit,description,is_published,sort_order) VALUES('DV-TEABREAK','Tiec teabreak van phong','teabreak',99000,'nguoi','Teabreak tron goi: ca phe + tra + banh, setup tan noi',TRUE,1) ON CONFLICT(code) DO NOTHING`
    );
    await c.run(
      `INSERT INTO services(code,name,type,price,unit,description,is_published,sort_order) VALUES('DV-GIAO-TAN-NOI','Giao hang tan noi','delivery',15000,'don','Giao noi thanh 1-2 ngay, lien tinh 2-4 ngay, co ma van don',TRUE,2) ON CONFLICT(code) DO NOTHING`
    );
    await c.run(
      `INSERT INTO services(code,name,type,price,unit,description,is_published,sort_order) VALUES('DV-HOA-DON-VAT','Xuat HD VAT + hop dong','vat',0,'lan','Xuat VAT khi co MST, legal soan hop dong trong 2 ngay',TRUE,3) ON CONFLICT(code) DO NOTHING`
    );

    // 5. banners + promotions (dung businessDayVN thay cho date('now', ...))
    // (is_active: BOOLEAN tren PG => TRUE/FALSE)
    await c.run(
      `INSERT INTO banners(slug,title,image_url,link,sort_order,is_active) VALUES('hero-combo-sang','Combo sang sieu tiet kiem','/img/hero-combo.jpg','/san-pham/combo-sang',0,TRUE) ON CONFLICT(slug) DO NOTHING`
    );
    await c.run(
      `INSERT INTO banners(slug,title,image_url,link,sort_order,is_active) VALUES('hero-teabreak','Teabreak van phong tron goi','/img/hero-teabreak.jpg','/dich-vu/DV-TEABREAK',1,TRUE) ON CONFLICT(slug) DO NOTHING`
    );
    await c.run(
      `INSERT INTO promotions(code,title,description,start_date,end_date,is_active) VALUES('KM-SANG','Giam 5k combo truoc 9h','Ap dung kenh web 7h-9h hang ngay',?,?,TRUE) ON CONFLICT(code) DO NOTHING`,
      [businessDayVN(-1), businessDayVN(30)]
    );
  });

  console.log(`seed-storefront OK (dialect=${DIALECT})`);
  console.log('products:', await all('SELECT sku,slug,price,is_combo FROM products ORDER BY sku'));
  console.log('services:', await all('SELECT code,price FROM services ORDER BY code'));
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error('SEED-STOREFRONT FAIL:', e.message); process.exit(1); });
