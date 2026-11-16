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

// Reading a point counts one step, so every walk can report how much work it did.
function readPoint(store, key, counter) {
  if (counter) counter.steps += 1;
  const point = store.points.get(key);
  return point;
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

module.exports = { createStore, putPoint, readPoint, countPoints, measureBytes };
