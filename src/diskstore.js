// diskstore.js
// One job: keep a kravitz store in an SQLite file. Points are written in the compact byte form (codec.js).
// It offers the same face as the store in memory (points.get / has / set), plus readMany, which fetches
// several points in one query (a level's shared rows arrive together).
//
// The 8-byte content key IS the table's row number (a signed 64-bit integer), so a lookup is one tree search,
// and a row stays inside its page up to nearly the page size. The first layout (a WITHOUT ROWID table keyed by
// blob) spilled any row above about a quarter page into overflow pages, which doubled the file at some
// junction sizes (measured 2026-11-15).
//
// Uses node:sqlite, built into Node 22.5 and later.

const { DatabaseSync } = require('node:sqlite');
const { encodePoint, decodePoint } = require('./codec');

const MANY_CHUNK = 400;   // keys per query in readMany

const rowOf = (key) => BigInt.asIntN(64, BigInt('0x' + key));
const keyOf = (row) => BigInt.asUintN(64, BigInt(row)).toString(16).padStart(16, '0');

function openDiskStore(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA page_size = 16384');
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
  db.exec('CREATE TABLE IF NOT EXISTS points (id INTEGER PRIMARY KEY, point BLOB NOT NULL)');
  const select = db.prepare('SELECT point FROM points WHERE id = ?');
  const insert = db.prepare('INSERT OR IGNORE INTO points (id, point) VALUES (?, ?)');
  const exists = db.prepare('SELECT 1 FROM points WHERE id = ?');

  const points = {
    get(key) { const row = select.get(rowOf(key)); return row ? decodePoint(Buffer.from(row.point), key) : undefined; },
    has(key) { return !!exists.get(rowOf(key)); },
    set(key, point) { insert.run(rowOf(key), encodePoint(point)); return points; },
  };

  function readMany(keys) {
    const found = new Map();
    const unique = [...new Set(keys)];
    for (let i = 0; i < unique.length; i += MANY_CHUNK) {
      const chunk = unique.slice(i, i + MANY_CHUNK);
      const query = db.prepare(`SELECT id, point FROM points WHERE id IN (${chunk.map(() => '?').join(',')})`);
      query.setReadBigInts(true);
      for (const row of query.all(...chunk.map(rowOf))) { const key = keyOf(row.id); found.set(key, decodePoint(Buffer.from(row.point), key)); }
    }
    return found;
  }

  // Many writes as one transaction, which is far faster than one commit per point.
  function inOneGo(work) {
    db.exec('BEGIN');
    const result = work();
    db.exec('COMMIT');
    return result;
  }

  const close = () => { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); db.close(); };
  return { points, readMany, inOneGo, close, db };
}

module.exports = { openDiskStore };
