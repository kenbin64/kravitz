// gather.js
// One job: the seed. Take any value and gather it into a single point whose key is the seed: all you need to
// get the whole thing back.
//
// Version 3 (Ken, 2026-11-15): the corner is a full dimension seen as one point. A whole used once is carried
// inside the point that holds it, so opening that point gives its entire width in one read. A whole used more
// than once, and big enough to be worth a lookup, is stored once as its own point and referenced from every
// corner that uses it. Along a long whole (the length axis) the parts are gathered into spans, and each
// junction records how many items it covers, so finding one item reads one junction per level.
//
// options.shape (optional): given a list of numbers, returns { rule, params, residual } when a registered
// rule can rebuild it more cheaply, or null (see derivers.js).

const { putPoint } = require('./store');
const { makeAtom, makeWhole, makeDerived } = require('./points');
const { createKeyBook, keyOf, partsOf, isAtomValue } = require('./contentkeys');
const { deriveKey } = require('./key');

const SPAN_SIZE = 64;          // parts per junction on the length axis
const MIN_SHARE_BYTES = 96;    // a smaller repeat is cheaper carried in place than looked up

// Gather a long run of parts into spans until it fits one level; each span part is { s: key, n: count }.
function gatherSpans(store, parts, counts) {
  let level = parts.map((part, i) => ({ part, count: counts[i] }));
  while (level.length > SPAN_SIZE) {
    const next = [];
    for (let i = 0; i < level.length; i += SPAN_SIZE) {
      const group = level.slice(i, i + SPAN_SIZE);
      const count = group.reduce((sum, entry) => sum + entry.count, 0);
      const spanParts = group.map(entry => entry.part);
      const span = makeWhole(deriveKey({ span: spanParts }), 'span', count, spanParts);
      next.push({ part: { s: putPoint(store, span), n: count }, count });
    }
    level = next;
  }
  const top = level.map(entry => entry.part);
  return top;
}

// The body of a whole: its shape, how many items it covers, and its parts (spans when it is long).
function bodyOf(store, book, value, options) {
  const [shape, items] = partsOf(value);
  const parts = items.map(item => partFor(store, book, item, options));
  const body = { shape, count: items.length, parts: gatherSpans(store, parts, parts.map(() => 1)) };
  return body;
}

// A list of numbers may be rebuilt by a rule instead of stored number by number.
function shapedKey(store, value, options) {
  const numeric = !!(options && options.shape) && Array.isArray(value) && value.length > 0 && value.every(item => typeof item === 'number');
  const shaped = numeric ? options.shape(value) : null;
  const key = shaped ? putPoint(store, makeDerived(shaped.rule, value.length, shaped.params, shaped.residual)) : null;
  return key;
}

// Store a whole as its own point (once) and return its key.
function storedKey(store, book, value, options) {
  const key = book.keys.get(value) || keyOf(book, value);
  if (!store.points.has(key)) {
    const body = bodyOf(store, book, value, options);
    putPoint(store, makeWhole(key, body.shape, body.count, body.parts));
  }
  return key;
}

function isShared(book, value) {
  const key = book.keys.get(value);
  const shared = (book.uses.get(key) || 0) > 1 && Buffer.byteLength(JSON.stringify(value)) >= MIN_SHARE_BYTES;
  return shared;
}

// A part as it sits inside a whole: a value in place, a shared whole by key, or a whole carried in place.
function partFor(store, book, item, options) {
  let part;
  if (isAtomValue(item)) part = { v: item };
  else part = shapedKey(store, item, options)
    || (isShared(book, item) ? storedKey(store, book, item, options) : { w: bodyOf(store, book, item, options) });
  return part;
}

// The seed of any value. A single value on its own is stored as an atom so it still has a key.
function gatherValue(store, value, options = {}) {
  let key;
  if (isAtomValue(value)) key = putPoint(store, makeAtom(value));
  else {
    const book = createKeyBook();
    keyOf(book, value);                                   // first pass: every content key, every use counted
    key = shapedKey(store, value, options) || storedKey(store, book, value, options);
  }
  return key;
}

module.exports = { gatherValue, SPAN_SIZE, MIN_SHARE_BYTES };
