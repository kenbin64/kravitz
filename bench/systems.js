#!/usr/bin/env node
// systems.js: kravitz against existing systems on the same data, on disk.
//
//   zstd file      the whole dataset as one JSON file, compressed with zstd level 19
//   SQLite rows    a normal table, one row per value or record, primary key (how most apps store data)
//   SQLite docs    one JSON document per item, primary key (how a document database stores data)
//   Git-style      content-addressed objects compressed with zlib, nested parts stored once (dedupe tools)
//   kravitz        the seed store, its points kept in an SQLite table by key, so it is on disk too
//
// Measured for each: size on disk, time to load the data, time to read one item (300 random, averaged),
// time to read everything back. Every system's read-back is checked against the data.
// Run: node bench/systems.js

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { DatabaseSync } = require('node:sqlite');
const kravitz = require('../src');

let state = 31337;
const rnd = () => { state = (state * 1103515245 + 12345) & 0x7fffffff; return state / 0x7fffffff; };
const pick = (list) => list[Math.floor(rnd() * list.length)];
const tempFile = (name) => path.join(os.tmpdir(), `kravitz-bench-${process.pid}-${name}.db`);
const msSince = (t) => Number(process.hrtime.bigint() - t) / 1e6;

// ── The data ─────────────────────────────────────────────────────────────────────────────────────
function makeCustomers() {
  const names = Array.from({ length: 200 }, (_, i) => 'name' + i);
  const data = Array.from({ length: 5000 }, (_, i) => ({ id: i, name: pick(names), city: 'city' + Math.floor(rnd() * 30),
    state: 'ST' + Math.floor(rnd() * 10), status: pick(['active', 'paused', 'closed']), plan: pick(['free', 'basic', 'pro', 'team']) }));
  return data;
}

function makeLevels() {
  const tiles = ['grass', 'water', 'rock', 'sand', 'tree', 'path'];
  const kit = Array.from({ length: 24 }, () => Array.from({ length: 16 }, () => pick(tiles)));
  const data = Array.from({ length: 300 }, () => Array.from({ length: 16 }, () => pick(kit)));
  return data;
}

function makeSensors() {
  const data = Array.from({ length: 100 }, () => { let x = Math.floor(rnd() * 1000); return Array.from({ length: 1000 }, () => (x += Math.round((rnd() - 0.5) * 10))); });
  return data;
}

// ── The systems: each has load(data) -> file, readOne(i), readAll() ─────────────────────────────
function zstdFile(data) {
  const file = tempFile('zstd');
  fs.writeFileSync(file, zlib.zstdCompressSync(Buffer.from(JSON.stringify(data)), { params: { [zlib.constants.ZSTD_c_compressionLevel]: 19 } }));
  const readAll = () => JSON.parse(zlib.zstdDecompressSync(fs.readFileSync(file)).toString());
  const system = { file, readOne: (i) => readAll()[i], readAll };
  return system;
}

function openDb(name) {
  const file = tempFile(name);
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;');
  return { file, db };
}

function finish(db) { db.exec('VACUUM'); return db; }

// One row per atomic value: the item, the position inside it, the value (a record's fields become columns).
function sqliteRows(data, kind) {
  const { file, db } = openDb('rows-' + kind);
  let readOne;
  if (kind === 'customers') {
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, city TEXT, state TEXT, status TEXT, plan TEXT)');
    const insert = db.prepare('INSERT INTO t VALUES (?, ?, ?, ?, ?, ?)');
    db.exec('BEGIN'); for (const c of data) insert.run(c.id, c.name, c.city, c.state, c.status, c.plan); db.exec('COMMIT');
    const one = db.prepare('SELECT * FROM t WHERE id = ?');
    readOne = (i) => ({ ...one.get(i) });
  } else {
    db.exec('CREATE TABLE t (item INTEGER, pos INTEGER, value, PRIMARY KEY (item, pos)) WITHOUT ROWID');
    const insert = db.prepare('INSERT INTO t VALUES (?, ?, ?)');
    db.exec('BEGIN');
    data.forEach((item, i) => item.forEach((value, pos) => insert.run(i, pos, kind === 'levels' ? JSON.stringify(value) : value)));
    db.exec('COMMIT');
    const one = db.prepare('SELECT value FROM t WHERE item = ? ORDER BY pos');
    readOne = (i) => one.all(i).map(r => (kind === 'levels' ? JSON.parse(r.value) : r.value));
  }
  finish(db);
  const readAll = () => data.map((_, i) => readOne(i));
  return { file, readOne, readAll, db };
}

function sqliteDocs(data, kind) {
  const { file, db } = openDb('docs-' + kind);
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, doc TEXT)');
  const insert = db.prepare('INSERT INTO t VALUES (?, ?)');
  db.exec('BEGIN'); data.forEach((item, i) => insert.run(i, JSON.stringify(item))); db.exec('COMMIT');
  finish(db);
  const one = db.prepare('SELECT doc FROM t WHERE id = ?');
  const all = db.prepare('SELECT doc FROM t ORDER BY id');
  return { file, readOne: (i) => JSON.parse(one.get(i).doc), readAll: () => all.all().map(r => JSON.parse(r.doc)), db };
}

// Git-style object store: every item is a tree object; each nested list or record inside it is a blob object;
// every object is keyed by its content and compressed with zlib, as Git does, so equal parts are stored once.
// The list of item keys (the manifest) is read once and kept in memory, the way Git keeps its current tree.
function gitStyle(data, kind) {
  const { file, db } = openDb('git-' + kind);
  db.exec('CREATE TABLE objects (key TEXT PRIMARY KEY, blob BLOB) WITHOUT ROWID');
  const insert = db.prepare('INSERT OR IGNORE INTO objects VALUES (?, ?)');
  const put = (text) => { const key = require('crypto').createHash('sha1').update(text).digest('hex'); insert.run(key, zlib.deflateSync(Buffer.from(text))); return key; };
  const nested = (v) => v !== null && typeof v === 'object';
  db.exec('BEGIN');
  const manifest = data.map(item => {
    const tree = Array.isArray(item) ? item.map(v => (nested(v) ? { blob: put(JSON.stringify(v)) } : v))
      : Object.fromEntries(Object.entries(item).map(([k, v]) => [k, nested(v) ? { blob: put(JSON.stringify(v)) } : v]));
    return put(JSON.stringify(tree));
  });
  put(JSON.stringify(manifest));
  db.exec('COMMIT');
  finish(db);
  const get = db.prepare('SELECT blob FROM objects WHERE key = ?');
  const read = (key) => JSON.parse(zlib.inflateSync(get.get(key).blob).toString());
  const open = (v) => (v && typeof v === 'object' && 'blob' in v ? read(v.blob) : v);
  const readOne = (i) => { const tree = read(manifest[i]); return Array.isArray(tree) ? tree.map(open) : Object.fromEntries(Object.entries(tree).map(([k, v]) => [k, open(v)])); };
  return { file, readOne, readAll: () => data.map((_, i) => readOne(i)), db };
}

// The seed store, its points written to an SQLite table by key and read back from disk point by point.
function kravitzOnDisk(data, kind) {
  const memory = kravitz.createStore();
  const seed = kravitz.gather(memory, data);
  const { file, db } = openDb('kravitz-' + kind);
  db.exec('CREATE TABLE points (key TEXT PRIMARY KEY, point TEXT) WITHOUT ROWID');
  const insert = db.prepare('INSERT INTO points VALUES (?, ?)');
  db.exec('BEGIN'); for (const [key, point] of memory.points) insert.run(key, JSON.stringify(point)); db.exec('COMMIT');
  finish(db);
  const get = db.prepare('SELECT point FROM points WHERE key = ?');
  const disk = { points: { get: (key) => { const row = get.get(key); return row ? JSON.parse(row.point) : undefined; }, has: () => true } };
  return { file, readOne: (i) => kravitz.findItem(disk, seed, i), readAll: () => kravitz.bloom(disk, seed), db };
}

// ── Measuring ────────────────────────────────────────────────────────────────────────────────────
function measure(label, build, data) {
  const t0 = process.hrtime.bigint();
  const system = build();
  const loadMs = msSince(t0);
  const bytes = fs.statSync(system.file).size;
  const positions = Array.from({ length: 300 }, () => Math.floor(rnd() * data.length));
  let correct = true;
  const t1 = process.hrtime.bigint();
  for (const i of positions) if (JSON.stringify(system.readOne(i)) !== JSON.stringify(data[i])) correct = false;
  const oneUs = msSince(t1) * 1000 / positions.length;
  const t2 = process.hrtime.bigint();
  if (JSON.stringify(system.readAll()) !== JSON.stringify(data)) correct = false;
  const allMs = msSince(t2);
  if (system.db) system.db.close();
  fs.rmSync(system.file, { force: true });
  const row = { label, bytes, loadMs, oneUs, allMs, correct };
  return row;
}

const pad = (s, n) => String(s).padStart(n);
const datasets = [['customers', '5,000 customer records', makeCustomers()], ['levels', '300 game levels from 24 shared rows', makeLevels()], ['sensors', '100 sensors x 1,000 readings', makeSensors()]];
for (const [kind, title, data] of datasets) {
  console.log(`\n${title}  (plain JSON ${Buffer.byteLength(JSON.stringify(data)).toLocaleString()} bytes)`);
  console.log('system'.padEnd(16) + pad('disk bytes', 12) + pad('load ms', 10) + pad('read one µs', 13) + pad('read all ms', 13) + pad('exact', 7));
  const rows = [
    measure('zstd file', () => zstdFile(data), data),
    measure('SQLite rows', () => sqliteRows(data, kind), data),
    measure('SQLite docs', () => sqliteDocs(data, kind), data),
    measure('Git-style', () => gitStyle(data, kind), data),
    measure('kravitz', () => kravitzOnDisk(data, kind), data),
  ];
  for (const r of rows) console.log(r.label.padEnd(16) + pad(r.bytes.toLocaleString(), 12) + pad(r.loadMs.toFixed(0), 10) + pad(r.oneUs.toFixed(0), 13) + pad(r.allMs.toFixed(0), 13) + pad(r.correct ? 'yes' : 'NO', 7));
}
