const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const DB_PATH = process.env.DATABASE_PATH || './data/bizops.db';

function getDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE, name TEXT NOT NULL, phone TEXT, email TEXT,
    address TEXT, note TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE, customer_id INTEGER, amount REAL NOT NULL,
    status TEXT DEFAULT 'pending', order_date DATE DEFAULT (date('now')),
    note TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id)
  );
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trans_date DATE, amount REAL NOT NULL, content TEXT,
    bank_ref TEXT UNIQUE, matched_order_id INTEGER, status TEXT DEFAULT 'unmatched',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS debts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER, order_id INTEGER, type TEXT DEFAULT 'receivable',
    amount REAL NOT NULL, paid REAL DEFAULT 0, due_date DATE,
    status TEXT DEFAULT 'open', note TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id)
  );
  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    debt_id INTEGER, channel TEXT DEFAULT 'inapp', message TEXT,
    status TEXT DEFAULT 'sent', sent_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER, subject TEXT, content TEXT,
    status TEXT DEFAULT 'open', priority TEXT DEFAULT 'normal',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER, direction TEXT, content TEXT,
    channel TEXT DEFAULT 'web', created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT UNIQUE, name TEXT, qty INTEGER DEFAULT 0, price REAL DEFAULT 0
  );
  `);

  // seed nhẹ nếu trống
  const c = db.prepare('SELECT COUNT(*) v FROM customers').get().v;
  if (c === 0) {
    const ins = db.prepare('INSERT INTO customers (code,name,phone) VALUES (?,?,?)');
    ins.run('KH001', 'Cà phê Highlands Demo', '0901234567');
    ins.run('KH002', 'Tạp hóa Cô Ba', '0912345678');
    db.prepare("INSERT INTO orders (code,customer_id,amount,status,order_date) VALUES ('DH001',1,5200000,'pending',date('now','-6 days'))").run();
    db.prepare("INSERT INTO orders (code,customer_id,amount,status,order_date) VALUES ('DH002',2,1850000,'pending',date('now','-3 days'))").run();
    db.prepare("INSERT INTO debts (customer_id,order_id,type,amount,paid,due_date,status) VALUES (1,1,'receivable',5200000,2000000,date('now','-1 day'),'open')").run();
    db.prepare("INSERT INTO debts (customer_id,order_id,type,amount,paid,due_date,status) VALUES (2,2,'receivable',1850000,0,date('now','+2 days'),'open')").run();
  }
  return db;
}

if (require.main === module) { getDb(); console.log('DB ready:', DB_PATH); }
module.exports = { getDb };
