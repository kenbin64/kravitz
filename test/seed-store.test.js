#!/usr/bin/env node
// seed-store.test.js: tries to break the seed store.
//   1. gather then bloom gives back exactly what went in, for every kind of value and random nested data
//   2. the same content is stored once: gathering it again adds no points and gives the same seed
//   3. find gets the right item at every position of a long list, in far fewer steps than a bloom
//   4. a different value never gets the same seed
// Run: node test/seed-store.test.js

const store = require('../src');

let pass = 0, fail = 0;
function check(condition, name, detail = '') {
  if (condition) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ' - ' + detail : ''}`); }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('\n-- 1. what goes in comes back exactly --');
const samples = {
  word: 'kravitz', number: 42, negative: -3.25, yes: true, no: false, nothing: null, empty: '',
  emptyList: [], emptyRecord: {}, list: [1, 'two', 3, null, false],
  record: { id: 7, name: 'Ann', tags: ['a', 'b'], address: { city: 'Provo', zip: '84601' } },
  long: Array.from({ length: 1000 }, (_, i) => i * 3),
  deep: { a: { b: { c: { d: { e: [1, [2, [3, [4, [5]]]]] } } } } },
  repeats: ['x', 'x', 'x', 'y', 'x'],
};
for (const [name, value] of Object.entries(samples)) {
  const s = store.createStore();
  const seed = store.gather(s, value);
  check(same(store.bloom(s, seed), value), `${name} comes back exactly from one seed`);
}

let fuzzState = 77;
const rnd = () => { fuzzState = (fuzzState * 1103515245 + 12345) & 0x7fffffff; return fuzzState / 0x7fffffff; };
function randomValue(depth) {
  const r = rnd();
  let value;
  if (depth > 3 || r < 0.35) value = [() => Math.floor(rnd() * 100), () => 'w' + Math.floor(rnd() * 20), () => rnd() < 0.5, () => null][Math.floor(rnd() * 4)]();
  else if (r < 0.7) value = Array.from({ length: Math.floor(rnd() * 40) }, () => randomValue(depth + 1));
  else value = Object.fromEntries(Array.from({ length: Math.floor(rnd() * 6) }, (_, i) => ['k' + i + Math.floor(rnd() * 3), randomValue(depth + 1)]));
  return value;
}
let fuzzBad = '';
for (let t = 0; t < 300 && !fuzzBad; t++) {
  const value = randomValue(0);
  const s = store.createStore();
  if (!same(store.bloom(s, store.gather(s, value)), value)) fuzzBad = `case ${t}: ${JSON.stringify(value).slice(0, 120)}`;
}
check(!fuzzBad, '300 random nested values all come back exactly', fuzzBad);

console.log('\n-- 2. the same content is stored once --');
{
  const s = store.createStore();
  const record = { name: 'Ann', city: 'Provo', status: 'active' };
  const first = store.gather(s, record);
  const pointsAfterOne = store.countPoints(s);
  const second = store.gather(s, { ...record });
  check(first === second, 'gathering the same record again gives the same seed');
  check(store.countPoints(s) === pointsAfterOne, 'and adds no points', `${pointsAfterOne} -> ${store.countPoints(s)}`);
}
{
  // Version 3: a whole used more than once, and big enough to be worth a lookup, is stored once and shared;
  // a whole used once, or a tiny repeat, is carried inside the point that holds it (the corner holds its width).
  const s = store.createStore();
  const bigRow = Array.from({ length: 16 }, (_, i) => 'tile-' + (i % 5));
  const level = { name: 'level-1', rows: [bigRow, [...bigRow], bigRow, ['small'], ['small']] };
  const seed = store.gather(s, level);
  check(same(store.bloom(s, seed), level), 'a level with a repeated row blooms exactly');
  check(store.countPoints(s) === 2, `the big row used three times is stored once: ${store.countPoints(s)} points (the level and the row)`);
  const root = s.points.get(seed);
  const rows = root.parts.find(p => p && p.w && p.w.shape === 'list').w.parts;
  check(rows.filter(p => typeof p === 'string').length === 3 && rows.filter(p => p.w).length === 2,
    'the level points to the shared row three times and carries the tiny repeated row in place');
}

console.log('\n-- 3. find gets one item without blooming the rest --');
{
  const s = store.createStore();
  const list = Array.from({ length: 5000 }, (_, i) => 'item-' + i);
  const seed = store.gather(s, list);
  let wrong = '';
  let worstSteps = 0;
  for (let i = 0; i < list.length && !wrong; i++) {
    const counter = { steps: 0 };
    const item = store.findItem(s, seed, i, counter);
    if (item !== list[i]) wrong = `position ${i}: got ${item}`;
    worstSteps = Math.max(worstSteps, counter.steps);
  }
  check(!wrong, 'every one of 5,000 positions returns the right item', wrong);
  const bloomCounter = { steps: 0 };
  store.bloom(s, seed, bloomCounter);
  // Steps are stored points read. Single values sit in place, so a bloom of 5,000 words reads only the
  // spans; find still reads a handful per level.
  check(worstSteps * 5 < bloomCounter.steps, `find reads at most ${worstSteps} points; a full bloom reads ${bloomCounter.steps}`);
  check(store.findItem(s, seed, 5000) === undefined && store.findItem(s, seed, -1) === undefined, 'positions outside the list give nothing');
}

console.log('\n-- 4. different values never share a seed --');
{
  const s = store.createStore();
  const values = [1, '1', true, 'true', null, 'null', [1], { 0: 1 }, [1, 2], [2, 1], { a: 1, b: 2 }, { b: 2, a: 1 }, [[1]], ['a', 'b'], { name: 'a' }];
  const seeds = values.map(v => store.gather(s, v));
  check(new Set(seeds).size === values.length, `${values.length} look-alike values get ${new Set(seeds).size} different seeds`);
}

console.log('\n-- 5. the compact byte form and the store on disk --');
{
  let codecBad = '';
  for (let t = 0; t < 200 && !codecBad; t++) {
    const s = store.createStore();
    store.gather(s, randomValue(0), { spanSize: 4 + (t % 13) });
    for (const point of s.points.values()) {
      const back = store.decodePoint(store.encodePoint(point), point.key);
      if (JSON.stringify(back) !== JSON.stringify(point)) { codecBad = `case ${t}: ${JSON.stringify(point).slice(0, 100)}`; break; }
    }
  }
  check(!codecBad, 'every point of 200 random stores comes back from its bytes unchanged', codecBad);
  const edge = [0, -0.5, 1e21, -(2 ** 60), 2 ** 51 - 1, -(2 ** 51) + 1, 'ünïcødé ✓', '', true, false, null];
  const s = store.createStore();
  check(same(store.bloom(s, store.gather(s, edge)), edge), 'edge values (large, negative, fractional, unicode) round-trip');

  const os = require('os'), path = require('path'), fs = require('fs');
  const file = path.join(os.tmpdir(), `kravitz-test-${process.pid}.db`);
  const disk = store.openDiskStore(file);
  const data = { name: 'game', levels: Array.from({ length: 300 }, (_, i) => ({ level: i, rows: [['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'], ['k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't'], [i]] })) };
  const seed = disk.inOneGo(() => store.gather(disk, data));
  check(same(store.bloom(disk, seed), data), 'a store written to an SQLite file blooms back exactly');
  const list = Array.from({ length: 3000 }, (_, i) => ({ id: i, tag: 't' + (i % 7) }));
  const listSeed = disk.inOneGo(() => store.gather(disk, list, { spanSize: 16 }));
  let diskWrong = '';
  for (let i = 0; i < list.length && !diskWrong; i += 37) if (!same(store.findItem(disk, listSeed, i), list[i])) diskWrong = `position ${i}`;
  check(!diskWrong, 'find on disk returns the right record', diskWrong);
  disk.close();
  for (const f of [file, file + '-wal', file + '-shm']) fs.rmSync(f, { force: true });
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
