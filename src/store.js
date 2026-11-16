// store.js
// One job: hold points by key. A point is written once; writing the same key again changes nothing,
// which is how identical content ends up stored only one time.

function createStore() {
  const points = new Map();
  return { points };
}

function putPoint(store, point) {
  const isNew = !store.points.has(point.key);
  if (isNew) store.points.set(point.key, point);
  return point.key;
}

// Reading a point counts one step, so every walk can report how much work it did. A point already fetched in
// a batch (counter.cache, filled by readMany) costs no further read.
function readPoint(store, key, counter) {
  const cached = counter && counter.cache ? counter.cache.get(key) : undefined;
  if (counter && !cached) counter.steps += 1;
  const point = cached || store.points.get(key);
  return point;
}

// Fetch several points at once when the store can (a disk store does it in one query), into counter.cache.
function prefetch(store, keys, counter) {
  const wanted = keys.filter(key => !(counter.cache && counter.cache.has(key)));
  if (typeof store.readMany === 'function' && wanted.length > 1) {
    if (!counter.cache) counter.cache = new Map();
    for (const [key, point] of store.readMany(wanted)) counter.cache.set(key, point);
    counter.steps += 1;
  }
  return counter;
}

function countPoints(store) {
  const count = store.points.size;
  return count;
}

// The size of the store if every point were written out as one JSON line.
function measureBytes(store) {
  let bytes = 0;
  for (const point of store.points.values()) bytes += Buffer.byteLength(JSON.stringify(point)) + 1;
  return bytes;
}

module.exports = { createStore, putPoint, readPoint, prefetch, countPoints, measureBytes };
