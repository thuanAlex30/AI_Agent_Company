const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const DIALECT = process.env.PG_HOST ? 'pg' : 'sqlite';
const SQLITE_PATH = process.env.DATABASE_PATH || './data/bizops.db';
const MIG_DIR = __dirname + '/migrations';

async function migrate() {
  const files = DIALECT === 'pg'
    ? ['001_init.postgres.sql', '002_storefront.postgres.sql']
    : ['001_init.sql', '002_storefront.sql'];

  if (DIALECT === 'pg') {
    const { Pool } = require('pg');
    const pool = new Pool({
      host: process.env.PG_HOST, port: process.env.PG_PORT || 5432,
      user: process.env.PG_USER, password: process.env.PG_PASSWORD,
      database: process.env.PG_DB,
    });
    const client = await pool.connect();
    try {
      for (const file of files) {
        const sql = fs.readFileSync(path.join(MIG_DIR, file), 'utf8');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations(version, applied_at) VALUES($1, CURRENT_TIMESTAMP) ON CONFLICT(version) DO NOTHING',
          [file.replace('.postgres.sql', '').replace('.sql', '')]
        );
        console.log('Migrated:', file);
      }
    } finally { client.release(); await pool.end(); }
  } else {
    const Database = require('better-sqlite3');
    fs.mkdirSync(path.dirname(SQLITE_PATH), { recursive: true });
    const db = new Database(SQLITE_PATH, { timeout: 10000 });
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 10000');
    db.pragma('foreign_keys = ON');
    for (const file of files) {
      const sql = fs.readFileSync(path.join(MIG_DIR, file), 'utf8');
      try { db.exec(sql); } catch (e) {
        // ALTER TABLE ADD COLUMN lap lai (DB cu da migrate) -> bo qua loi duplicate column
        if (/duplicate column/i.test(e.message)) console.log('Skip (da co cot):', file);
        else throw e;
      }
      const ver = file.replace('.sql', '');
      db.prepare(
        "INSERT INTO schema_migrations(version, applied_at) VALUES(?, CURRENT_TIMESTAMP) ON CONFLICT(version) DO NOTHING"
      ).run(ver);
      console.log('Migrated:', file);
    }
    db.close();
  }

  // seed dev only
  const { get } = require('../common/db');
  const u = await get('SELECT COUNT(*) c FROM users');
  const wantSeed = process.argv.includes('--seed') || (u && Number(u.c) === 0 && process.env.NODE_ENV !== 'production');
  if (wantSeed) await seedDemo();
  else console.log('Seed skipped (users exist or NODE_ENV=production).');
}

async function seedDemo() {
  const seedPath = path.join(__dirname, 'seeds/demo.sql');
  let sql = fs.readFileSync(seedPath, 'utf8');
  const adminHash = await bcrypt.hash('Admin@123', 10);
  const userHash = await bcrypt.hash('User@123', 10);
  sql = sql.replaceAll('__ADMIN_HASH__', adminHash).replaceAll('__USER_HASH__', userHash);

  if (DIALECT === 'pg') {
    const { Pool } = require('pg');
    const pool = new Pool({
      host: process.env.PG_HOST, port: process.env.PG_PORT || 5432,
      user: process.env.PG_USER, password: process.env.PG_PASSWORD,
      database: process.env.PG_DB,
    });
    const client = await pool.connect();
    try { await client.query(sql); } finally { client.release(); await pool.end(); }
  } else {
    const Database = require('better-sqlite3');
    const db = new Database(SQLITE_PATH);
    db.pragma('foreign_keys = ON');
    db.exec(sql);
    db.close();
  }
  console.log('Seeded demo.');
}

if (require.main === module) {
  migrate().then(() => { console.log('DB ready'); process.exit(0); })
    .catch(e => { console.error('MIGRATE FAIL:', e.message); process.exit(1); });
}
module.exports = { migrate };
