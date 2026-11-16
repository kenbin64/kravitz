#!/usr/bin/env node
// bench.js: the seed store against what is already out there, on four kinds of data from very repetitive
// to not repetitive at all. Sizes in bytes. "brotli" is the best general compressor in Node (quality 11).
// Every row is checked: bloom(seed) must equal the data exactly.
// Run: node bench/bench.js

const zlib = require('zlib');
const seedStore = require('../src');

let state = 1234;
const rnd = () => { state = (state * 1103515245 + 12345) & 0x7fffffff; return state / 0x7fffffff; };
const pick = (list) => list[Math.floor(rnd() * list.length)];
const zipfPick = (list) => list[Math.min(list.length - 1, Math.floor(list.length * Math.pow(rnd(), 3)))];

const NAMES = Array.from({ length: 200 }, (_, i) => 'name' + i);
const CITIES = Array.from({ length: 30 }, (_, i) => 'city' + i);
const VOCAB = Array.from({ length: 500 }, (_, i) => 'word' + i);
const TILES = ['grass', 'water', 'rock', 'sand', 'tree', 'path'];

function makeCustomers() {
  const customers = Array.from({ length: 5000 }, (_, i) => ({
    id: i, name: pick(NAMES), city: pick(CITIES), state: 'ST' + Math.floor(rnd() * 10),
    status: pick(['active', 'paused', 'closed']), plan: pick(['free', 'basic', 'pro', 'team']),
  }));
  return customers;
}

function makeWords() {
  const words = Array.from({ length: 20000 }, () => zipfPick(VOCAB));
  return words;
}

function makeNumbers() {
  const numbers = Array.from({ length: 20000 }, () => Math.floor(rnd() * 1e9));
  return numbers;
}

// Game levels built from a small kit of rows, the way real levels reuse pieces.
function makeLevels() {
  const kit = Array.from({ length: 24 }, () => Array.from({ length: 16 }, () => pick(TILES)));
  const levels = Array.from({ length: 300 }, (_, n) => ({ level: n, rows: Array.from({ length: 16 }, () => pick(kit)) }));
  return levels;
}

function brotliBytes(text) {
  const bytes = zlib.brotliCompressSync(Buffer.from(text), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
  return bytes;
}

function storeText(store) {
  const text = [...store.points.values()].map(point => JSON.stringify(point)).join('\n');
  return text;
}

function measure(name, data) {
  const json = JSON.stringify(data);
  const store = seedStore.createStore();
  const seed = seedStore.gather(store, data);
  const exact = JSON.stringify(seedStore.bloom(store, seed)) === json;
  const text = storeText(store);
  const row = {
    data: name, json: Buffer.byteLength(json), jsonBrotli: brotliBytes(json),
    points: seedStore.countPoints(store), seedStore: Buffer.byteLength(text), seedStoreBrotli: brotliBytes(text), exact,
  };
  return row;
}

const rows = [
  measure('customer records (5,000, repeating fields)', makeCustomers()),
  measure('words (20,000 from 500)', makeWords()),
  measure('random numbers (20,000, no repeats)', makeNumbers()),
  measure('game levels (300 built from 24 rows)', makeLevels()),
];

const pad = (s, n) => String(s).padStart(n);
console.log('\n' + 'data'.padEnd(44) + pad('JSON', 10) + pad('JSON+brotli', 13) + pad('points', 9) + pad('seed store', 12) + pad('store+brotli', 14) + pad('exact', 7));
for (const r of rows) {
  console.log(r.data.padEnd(44) + pad(r.json, 10) + pad(r.jsonBrotli, 13) + pad(r.points, 9) + pad(r.seedStore, 12) + pad(r.seedStoreBrotli, 14) + pad(r.exact ? 'yes' : 'NO', 7));
}
console.log('\nseed store vs JSON+brotli (above 1.00 means the seed store is smaller):');
for (const r of rows) console.log('  ' + r.data.padEnd(44) + (r.jsonBrotli / r.seedStoreBrotli).toFixed(2) + 'x (both compressed),  ' + (r.json / r.seedStore).toFixed(2) + 'x vs plain JSON');

// Reading ONE record. Compressed JSON has to be unpacked and parsed whole first; the seed store goes
// straight to the record through its junctions. Average over 300 random positions.
{
  const customers = makeCustomers();
  const packed = zlib.brotliCompressSync(Buffer.from(JSON.stringify(customers)), { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } });
  const store = seedStore.createStore();
  const seed = seedStore.gather(store, customers);
  const positions = Array.from({ length: 300 }, () => Math.floor(rnd() * customers.length));
  let mismatch = 0;
  const t0 = process.hrtime.bigint();
  for (const i of positions) if (JSON.parse(zlib.brotliDecompressSync(packed).toString())[i].id !== i) mismatch++;
  const t1 = process.hrtime.bigint();
  let reads = 0;
  for (const i of positions) { const counter = { steps: 0 }; if (seedStore.findItem(store, seed, i, counter).id !== i) mismatch++; reads += counter.steps; }
  const t2 = process.hrtime.bigint();
  const ms = (a, b) => Number(b - a) / 1e6 / positions.length;
  console.log(`\nread one customer record (average of ${positions.length}, all correct: ${mismatch === 0 ? 'yes' : 'NO'}):`);
  console.log(`  JSON+brotli: unpack and parse everything   ${ms(t0, t1).toFixed(3)} ms`);
  console.log(`  seed store: find through the junctions     ${ms(t1, t2).toFixed(3)} ms  (${(reads / positions.length).toFixed(1)} points read)`);
  console.log(`  -> ${(ms(t0, t1) / ms(t1, t2)).toFixed(0)}x faster to read one record`);
}
