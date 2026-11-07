// scripts/e2e-browser.cjs — WEB-02: Browser E2E checkout + lookup qua
// ORIGIN storefront (khong phai goi API truc tiep).
//
//   node scripts/e2e-browser.cjs [baseUrl]
//
//   baseUrl mac dinh: http://127.0.0.1:5174 (storefront qua Nginx/Vite proxy)
//
// Kiem tra:
//   WEB-API-001  /api/public/products tren cung origin tra JSON (khong phai HTML)
//   WEB-02       Checkout: them san pham -> gio -> thanh toan -> don duoc tao
//   WEB-02       Lookup: tra cuu don vua tao bang ma + sdt
//   WEB-02       Token sai -> khong lo du lieu
//   WEB-02       Idempotency: 5 request cung key -> CHI 1 don
//
// Can Chrome da cai (CHROME_PATH) + puppeteer-core (devDependency).
const puppeteer = require('puppeteer-core');

const BASE = process.argv[2] || process.env.STOREFRONT_URL || 'http://127.0.0.1:5174';
const CHROME =
  process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeout = 15000, step = 250) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    await sleep(step);
  }
  return null;
}

/**
 * Helper chay TRONG trinh duyet. Dung `evaluateOnNewDocument` de duoc nap
 * lai sau moi lan navigate (context moi khong giu global).
 */
const PAGE_HELPERS = `
  window.__setValue = function (el, v) {
    var proto = el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.blur();
    return true;
  };
  window.__byLabel = function (reSrc) {
    var re = new RegExp(reSrc, 'i');
    var labels = document.querySelectorAll('label');
    for (var i = 0; i < labels.length; i++) {
      var lbl = labels[i];
      if (!re.test((lbl.textContent || '').trim())) continue;
      var id = lbl.getAttribute('for');
      if (id) {
        var el = document.getElementById(id);
        if (el) return el;
      }
    }
    return null;
  };
  window.__clickByText = function (text) {
    var t = (text || '').toLowerCase();
    // Uu tien nut submit trong <form> (tranh bam link dieu huong cung chu).
    var forms = document.querySelectorAll('form');
    for (var f = 0; f < forms.length; f++) {
      var btns = forms[f].querySelectorAll('button');
      for (var i = 0; i < btns.length; i++) {
        if (((btns[i].textContent || '').trim().toLowerCase()).indexOf(t) !== -1) {
          btns[i].click();
          return true;
        }
      }
    }
    var els = document.querySelectorAll('button, a, [role=button], label');
    for (var j = 0; j < els.length; j++) {
      var el = els[j];
      if (((el.textContent || '').trim().toLowerCase()).indexOf(t) !== -1) {
        el.click();
        return true;
      }
    }
    return false;
  };
`;

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, devicePixelRatio: 1 });
  await page.evaluateOnNewDocument(PAGE_HELPERS);

  const consoleErrors = [];
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !/favicon/i.test(t)) consoleErrors.push(t.slice(0, 160));
  });
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + String(e.message).slice(0, 160)));

  try {
    // ---------------------------------------------------------------
    // WEB-API-001: /api/... tren cung origin phai tra JSON.
    // Phai navigate truoc: fetch() tren about:blank co origin 'null' -> CORS block.
    // ---------------------------------------------------------------
    console.log('\n[1] WEB-API-001 — /api/... qua origin storefront');
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(500);
    const apiProbe = await page.evaluate(async (base) => {
      try {
        const r = await fetch(base + '/api/public/products?limit=1');
        const ct = r.headers.get('content-type') || '';
        const text = await r.text();
        let parsed = null;
        try { parsed = JSON.parse(text); } catch {}
        return { status: r.status, ct, isJson: !!parsed, ok: parsed && parsed.ok };
      } catch (e) {
        return { status: 0, ct: '', isJson: false, ok: false, err: String(e.message) };
      }
    }, BASE);
    check('GET /api/public/products tra JSON (khong phai HTML SPA fallback)', apiProbe.isJson,
      'status=' + apiProbe.status + ' content-type=' + apiProbe.ct);
    check('response co wrapper { ok: true }', apiProbe.ok === true);

    // ---------------------------------------------------------------
    // [2] Checkout end-to-end (nhieu buoc)
    // ---------------------------------------------------------------
    console.log('\n[2] WEB-02 — Checkout end-to-end');
    await page.goto(BASE + '/san-pham', { waitUntil: 'networkidle2', timeout: 30000 });

    // Cho danh sach san pham render xong (nut "Them gio" xuat hien).
    const hasAddBtn = await waitFor(
      () => page.evaluate(() => [...document.querySelectorAll('button')].some((b) => /thêm giỏ/i.test((b.textContent || '').trim()))),
      15000
    );
    check('trang san-pham render duoc danh sach san pham', !!hasAddBtn);

    const added = await page.evaluate(() => window.__clickByText('Thêm giỏ'));
    check('bam "Thêm giỏ" tren trang san-pham', added);
    await sleep(900);

    // Gio hang: kiem tra localStorage cart
    const cartInfo = await page.evaluate(() => {
      try {
        const raw = JSON.parse(localStorage.getItem('bizops-cart-v1') || '[]');
        return { count: raw.length, skus: raw.map((i) => i.sku) };
      } catch (e) { return { count: -1, skus: [] }; }
    });
    check('san pham da vao gio (localStorage)', cartInfo.count > 0, JSON.stringify(cartInfo.skus));

    // Fallback: neu nut them bi vong, them truc tiep vao localStorage de van
    // test phan checkout/lookup (khong phai phan them-hang).
    if (cartInfo.count === 0) {
      const injected = await page.evaluate(async () => {
        const r = await fetch('/api/public/products?limit=50');
        const j = await r.json();
        const items = (j && j.data && j.data.items) || [];
        const pick = items.find((p) => !p.is_combo && p.stock !== 'out_of_stock' && p.price > 0) || items[0];
        if (!pick) return null;
        localStorage.setItem('bizops-cart-v1', JSON.stringify([{ sku: pick.sku, qty: 1 }]));
        return pick.sku;
      });
      check('fallback: them san pham qua localStorage', !!injected, injected || 'khong lay duoc san pham');
      await sleep(400);
    }

    await page.goto(BASE + '/thanh-toan', { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(1000);

    // Buoc 1: thong tin lien he
    const filled1 = await page.evaluate(() => {
      const nameEl = window.__byLabel('h[ọo] t[êe]n');
      const phoneEl = window.__byLabel('s[đd]t|điện thoại|liên hệ');
      const addrEl = window.__byLabel('địa chỉ');
      if (nameEl) window.__setValue(nameEl, 'Khach E2E');
      if (phoneEl) window.__setValue(phoneEl, '0912345678');
      if (addrEl) window.__setValue(addrEl, '123 Duong E2E');
      return {
        name: !!nameEl, phone: !!phoneEl, addr: !!addrEl,
        nameVal: nameEl ? nameEl.value : null,
        phoneVal: phoneEl ? phoneEl.value : null,
      };
    });
    check('buoc 1: nhap ten / SĐT / dia chi', filled1.name && filled1.phone,
      JSON.stringify({ name: filled1.name, phone: filled1.phone, nameVal: filled1.nameVal, phoneVal: filled1.phoneVal }));
    await sleep(400);

    const next1 = await page.evaluate(() => window.__clickByText('Tiếp tục'));
    check('bam "Tiếp tục" -> buoc 2 (giao nhan & thanh toan)', next1);
    await sleep(700);

    const next2 = await page.evaluate(() => window.__clickByText('Xem lại đơn'));
    check('bam "Xem lại đơn" -> buoc 3 (xac nhan)', next2);
    await sleep(900);

    const onConfirm = await page.evaluate(() =>
      /xác nhận đặt hàng/i.test((document.body.innerText || '').toLowerCase())
    );
    check('hien thi buoc xac nhan don', onConfirm);

    // Buoc 3: bam "Đặt hàng"
    const submitted = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const b = btns.find((x) => /đặt hàng/i.test((x.textContent || '').trim()));
      if (!b) return false;
      b.click();
      return true;
    });
    check('bam nut "Dat hang"', submitted);

    // Cho chuyen trang xac nhan (/xac-nhan)
    const confirmed = await waitFor(async () => page.url().includes('/xac-nhan'), 25000);
    check('chuyen sang trang xac nhan (/xac-nhan)', !!confirmed, page.url());
    await sleep(1500);

    const orderCode = await page.evaluate(() => {
      const txt = document.body.innerText || '';
      const m = txt.match(/DHW-[A-Z0-9-]+/);
      return m ? m[0] : null;
    });
    check('lay duoc ma don tren trang xac nhan', !!orderCode, orderCode || '(khong tim thay ma don)');

    // ---------------------------------------------------------------
    // [3] Lookup don vua tao (2 yeu to: ma don + SĐT)
    // ---------------------------------------------------------------
    console.log('\n[3] WEB-02 — Tra cuu don');
    await page.goto(BASE + '/tra-cuu', { waitUntil: 'networkidle2', timeout: 30000 });
    await sleep(900);

    const lookupFilled = await page.evaluate((code) => {
      const inputs = [...document.querySelectorAll('input:not([type=hidden]):not([type=radio]):not([type=checkbox])')];
      const codeEl = window.__byLabel('m[ãa] đ[ơo]n') || inputs[0];
      const phoneEl = window.__byLabel('s[đd]t|email') || inputs[1];
      if (codeEl && code) window.__setValue(codeEl, code);
      if (phoneEl) window.__setValue(phoneEl, '0912345678');
      return { code: !!codeEl, phone: !!phoneEl };
    }, orderCode);
    check('form tra cuu co truong ma don + SĐT', lookupFilled.code && lookupFilled.phone, JSON.stringify(lookupFilled));
    await sleep(400);

    const clicked = await page.evaluate(() => window.__clickByText('Tra cứu'));
    check('bam "Tra cuu"', clicked);
    await sleep(2500);

    const lookupText = (await page.evaluate(() => document.body.innerText || '')).toLowerCase();
    check('tra cuu tra ve thong tin don', !!orderCode && lookupText.includes(orderCode.toLowerCase()),
      orderCode ? 'tim thay ma don trong ket qua' : 'khong co ma don');
    check('khong bao loi "khong tim thay don"', !/không tìm thấy đơn/i.test(lookupText));

    // Token sai -> khong lo du lieu
    const badLookup = await page.evaluate(async (base) => {
      try {
        const r = await fetch(base + '/api/public/orders/KH-DO-EXIST-999999?contact=0912345678', {
          headers: { 'X-Lookup-Token': 'token-sai-hoan-toan' },
        });
        const t = await r.text();
        return { status: r.status, leak: /0912345678|Khach E2E/i.test(t) };
      } catch (e) { return { status: 0, leak: false }; }
    }, BASE);
    check('tra cuu don sai KHONG lo du lieu khach', !badLookup.leak, 'status=' + badLookup.status);

    // ---------------------------------------------------------------
    // [4] Idempotency tren cung origin: 5 request cung key -> 1 don
    // ---------------------------------------------------------------
    console.log('\n[4] WEB-02 — Idempotency tren origin storefront');
    const idem = await page.evaluate(async (base) => {
      const key = 'e2e-browser-' + Math.random().toString(36).slice(2) + Date.now();
      const cat = await (await fetch(base + '/api/public/products?limit=50')).json();
      const items = (cat && cat.data && cat.data.items) || [];
      const pick = items.find((p) => !p.is_combo && p.stock !== 'out_of_stock') || items[0];
      if (!pick) return { error: 'khong lay duoc san pham' };
      const payload = {
        name: 'Khach E2E Idem',
        phone: '0912345678',
        address: '123 Duong E2E',
        pay_method: 'cash',
        items: [{ sku: pick.sku, qty: 1 }],
      };
      const codes = [];
      for (let i = 0; i < 5; i++) {
        const r = await fetch(base + '/api/public/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
          body: JSON.stringify(payload),
        });
        const b = await r.json().catch(() => null);
        const d = (b && b.data) || {};
        if (d.code) codes.push(d.code);
      }
      return { key, codes: [...new Set(codes)] };
    }, BASE);
    check('5 request cung Idempotency-Key -> CHI 1 don', !idem.error && idem.codes && idem.codes.length === 1,
      JSON.stringify(idem.codes || idem.error));

    // ---------------------------------------------------------------
    console.log('\n[5] Console errors');
    const realErrors = consoleErrors.filter((e) => !/404|favicon/i.test(e));
    check('khong co console error uncaught', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));
  } catch (e) {
    check('E2E chay khong loi', false, String(e && e.message));
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.pass);
  console.log('\nKET QUA: ' + (results.length - failed.length) + '/' + results.length + ' PASS');
  if (failed.length) {
    console.log('FAIL:');
    for (const f of failed) console.log('  - ' + f.name + (f.detail ? ' (' + f.detail + ')' : ''));
  }
  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error('LOI:', e && e.message);
  process.exit(1);
});
