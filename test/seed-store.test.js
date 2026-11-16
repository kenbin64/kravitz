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
  store.gather(s, { name: 'Bob', city: 'Provo', status: 'active' });
  const added = store.countPoints(s) - pointsAfterOne;
  check(added > 0 && added < pointsAfterOne, `a record sharing two fields adds only what is new (${added} of ${pointsAfterOne} points)`);
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

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
