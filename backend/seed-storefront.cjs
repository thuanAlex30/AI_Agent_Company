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
 */
require('dotenv').config();
const { all, tx, businessDayVN, DIALECT } = require('./src/common/db');

async function main() {
  await tx(async (c) => {
    // 1. products publish/SEO cho 3 mon + COMBO-SANG
    await c.run(
      `UPDATE products SET slug='ca-phe-sua', description='Ca phe sua dam da pha may, thom beo', images_json='["/img/cf-sua-01.jpg"]', badge='ban-chay', sort_order=1, is_published=1, category='cafe', is_combo=0 WHERE sku='CF-SUA-01'`
    );
    await c.run(
      `UPDATE products SET slug='tra-dao', description='Tra dao tuoi mat lanh', images_json='["/img/tra-dao-01.jpg"]', badge='moi', sort_order=2, is_published=1, category='tra', is_combo=0 WHERE sku='TRA-DAO-01'`
    );
    await c.run(
      `UPDATE products SET slug='banh-ngot', description='Banh ngot moi moi ngay', images_json='["/img/banh-01.jpg"]', badge=NULL, sort_order=3, is_published=1, category='banh', is_combo=0 WHERE sku='BANH-01'`
    );
    await c.run(
      `INSERT INTO products(sku,name,price,cost,unit,stock_alert,slug,description,images_json,badge,sort_order,is_published,category,is_combo) VALUES('COMBO-SANG','Combo sang (ca phe + banh)',55000,30000,'combo',10,'combo-sang','Combo sang tiet kiem: 1 ca phe sua + 1 banh ngot','["/img/combo-sang.jpg"]','flash-sale',0,1,'combo',1) ON CONFLICT(sku) DO NOTHING`
    );
    await c.run(
      `UPDATE products SET slug='combo-sang', is_combo=1, is_published=1, badge='flash-sale', sort_order=0 WHERE sku='COMBO-SANG'`
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

    // 4. services
    await c.run(
      `INSERT INTO services(code,name,type,price,unit,description,is_published,sort_order) VALUES('DV-TEABREAK','Tiec teabreak van phong','teabreak',99000,'nguoi','Teabreak tron goi: ca phe + tra + banh, setup tan noi',1,1) ON CONFLICT(code) DO NOTHING`
    );
    await c.run(
      `INSERT INTO services(code,name,type,price,unit,description,is_published,sort_order) VALUES('DV-GIAO-TAN-NOI','Giao hang tan noi','delivery',15000,'don','Giao noi thanh 1-2 ngay, lien tinh 2-4 ngay, co ma van don',1,2) ON CONFLICT(code) DO NOTHING`
    );
    await c.run(
      `INSERT INTO services(code,name,type,price,unit,description,is_published,sort_order) VALUES('DV-HOA-DON-VAT','Xuat HD VAT + hop dong','vat',0,'lan','Xuat VAT khi co MST, legal soan hop dong trong 2 ngay',1,3) ON CONFLICT(code) DO NOTHING`
    );

    // 5. banners + promotions (dung businessDayVN thay cho date('now', ...))
    await c.run(
      `INSERT INTO banners(slug,title,image_url,link,sort_order,is_active) VALUES('hero-combo-sang','Combo sang sieu tiet kiem','/img/hero-combo.jpg','/san-pham/combo-sang',0,1) ON CONFLICT(slug) DO NOTHING`
    );
    await c.run(
      `INSERT INTO banners(slug,title,image_url,link,sort_order,is_active) VALUES('hero-teabreak','Teabreak van phong tron goi','/img/hero-teabreak.jpg','/dich-vu/DV-TEABREAK',1,1) ON CONFLICT(slug) DO NOTHING`
    );
    await c.run(
      `INSERT INTO promotions(code,title,description,start_date,end_date,is_active) VALUES('KM-SANG','Giam 5k combo truoc 9h','Ap dung kenh web 7h-9h hang ngay',?,?,1) ON CONFLICT(code) DO NOTHING`,
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
