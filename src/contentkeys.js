// contentkeys.js
// One job: the first pass. Work out the content key of every whole inside a value, and count how many times
// each one is used. The second pass (gather.js) shares a whole that is used more than once and is big enough
// to be worth a lookup; everything else is carried inside the point that holds it.
//
// The key comes from the whole's shape and its parts, with every part that is itself a whole named by its own
// key, so equal content always gets the equal key, however deeply it sits.

const { deriveKey } = require('./key');

function isAtomValue(value) {
  const atomic = value === null || ['string', 'number', 'boolean'].includes(typeof value);
  return atomic;
}

// A whole as [shape, items]. A list's items are its entries; a record's items are name, value, name, value ...
function partsOf(value) {
  const shaped = Array.isArray(value) ? ['list', value] : ['record', Object.entries(value).flat()];
  return shaped;
}

function createKeyBook() {
  const book = { keys: new WeakMap(), uses: new Map() };
  return book;
}

function tokenOf(book, item) {
  const token = isAtomValue(item) ? { v: item } : keyOf(book, item);
  return token;
}

// The content key of one whole, counting one use of it (and, the first time it is met, of every whole inside it).
function keyOf(book, value) {
  let key = book.keys.get(value);
  if (!key) {
    const [shape, items] = partsOf(value);
    key = deriveKey({ shape, parts: items.map(item => tokenOf(book, item)) });
    book.keys.set(value, key);
  }
  book.uses.set(key, (book.uses.get(key) || 0) + 1);
  return key;
}

module.exports = { createKeyBook, keyOf, partsOf, isAtomValue };
