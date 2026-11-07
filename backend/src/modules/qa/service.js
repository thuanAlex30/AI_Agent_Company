const { AppError } = require('../../common/errors');
const { writeAudit } = require('../../common/audit');
const { insertedId } = require('../../common/db');

// qa so huu: qa_checks
async function list(conn) {
  const db = require('../../common/db');
  const c = (conn && conn.run) ? conn : db;
  return c.query('SELECT * FROM qa_checks ORDER BY id DESC LIMIT 200');
}
// P2-21: mapping ref_type -> bang dich (validate ref_id TON TAI).
//
// BUG (PG-DB-08 / DATA-08): `ref_type='product'` tro toi `products` — bang
// nay khoa chinh la `sku` (TEXT), KHONG co cot `id`.
//   - Query `SELECT id FROM products WHERE id=?`:
//       SQLite: "no such column: id"
//       PostgreSQL: `column "id" does not exist`
//
// BUG (PG-DB-10): `qa_checks.ref_id` sau migration 007 la TEXT (de chua ca
// SO (order/shipment id) va MA (product sku)). => khi so sanh voi cot BIGINT
// (`orders.id`, `shipments.id`) phai chuyen sang SO, neu khong PG nem
// "invalid input syntax for type bigint" khi client gui chuoi.
const REF_TABLE = {
  order: { table: 'orders', idCol: 'id', numeric: true },
  shipment: { table: 'shipments', idCol: 'id', numeric: true },
  // products: khoa chinh TEXT `sku` -> so sanh thang chuoi.
  product: { table: 'products', idCol: 'sku', numeric: false },
};

async function create(conn, { ref_type, ref_id, result, defect = null, repeat_of = null, checker = null }) {
  const db = require('../../common/db');
  const c = (conn && conn.run) ? conn : db;
  if (!['order', 'shipment', 'product'].includes(ref_type)) throw new AppError('VALIDATION', 'ref_type khong hop le', 400);
  if (!['pass', 'fail'].includes(result)) throw new AppError('VALIDATION', 'result pass/fail', 400);
  // P2-21: validate `ref_id` TON TAI theo `ref_type` — khong cho tao QA
  // troi (ref_id bat ky) lam cham ho so lieu kiem tra chat luong.
  const tbl = REF_TABLE[ref_type];
  if (ref_id == null || ref_id === '' || !tbl) throw new AppError('VALIDATION', 'ref_id bat buoc', 400);
  // Cot so: chi so sanh khi gia tri THAT LA so (chuoi -> 404, khong nem loi).
  let lookup = ref_id;
  if (tbl.numeric) {
    const n = Number(ref_id);
    if (!Number.isInteger(n) || n <= 0) throw new AppError('NOT_FOUND', `Khong tim thay ${ref_type} ${ref_id}`, 404);
    lookup = n;
  }
  const ref = await c.get(`SELECT ${tbl.idCol} FROM ${tbl.table} WHERE ${tbl.idCol}=?`, [lookup]);
  if (!ref) throw new AppError('NOT_FOUND', `Khong tim thay ${ref_type} ${ref_id}`, 404);
  // P2-21: `repeat_of` cung phai la QA check that.
  if (repeat_of != null) {
    const rep = await c.get('SELECT id FROM qa_checks WHERE id=?', [repeat_of]);
    if (!rep) throw new AppError('NOT_FOUND', 'Khong tim thay qa_check goc (repeat_of)', 404);
  }
  const r = await c.run('INSERT INTO qa_checks(ref_type,ref_id,result,defect,repeat_of,checker) VALUES(?,?,?,?,?,?)', [ref_type, ref_id, result, defect, repeat_of, checker]);
  const id = insertedId(r, 'qa_checks');
  await writeAudit(c, checker || 'system', 'create', 'qa_checks', id, null, { ref_type, ref_id, result });
  return { id };
}
async function stats(conn) {
  const db = require('../../common/db');
  const c = (conn && conn.run) ? conn : db;
  const total = await c.get('SELECT COUNT(*) c FROM qa_checks');
  const fail = await c.get("SELECT COUNT(*) c FROM qa_checks WHERE result='fail'");
  const repeat = await c.get('SELECT COUNT(*) c FROM qa_checks WHERE repeat_of IS NOT NULL');
  const t = Number(total?.c || 0);
  return { total: t, fail: Number(fail?.c || 0), defect_rate: t ? Math.round(Number(fail?.c || 0) / t * 1000) / 10 : 0, repeat: Number(repeat?.c || 0) };
}
module.exports = { list, create, stats };
