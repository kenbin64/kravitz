// bloom.js
// One job: the bloom. Start from a seed key and get back everything it gathered, exactly. A whole carried in
// place opens with no further read; a shared whole is one read by its key; a junction on the length axis is
// opened in place. Every stored point read counts as one step.

const { readPoint } = require('./store');
const { rebuildDerived } = require('./derivers');

const isSpanPart = (part) => typeof part === 'object' && part !== null && 's' in part;

// The items of a body, in order, with every junction opened.
function collectItems(store, parts, counter) {
  const items = [];
  for (const part of parts) {
    if (isSpanPart(part)) items.push(...collectItems(store, readPoint(store, part.s, counter).parts, counter));
    else items.push(part);
  }
  return items;
}

function valueOfBody(store, body, counter) {
  const items = collectItems(store, body.parts, counter);
  let value;
  if (body.shape === 'record') {
    value = {};
    for (let i = 0; i < items.length; i += 2) value[items[i].v] = valueOfPart(store, items[i + 1], counter);
  } else value = items.map(item => valueOfPart(store, item, counter));
  return value;
}

// One part: a value in place, a whole carried in place, or a shared whole by key.
function valueOfPart(store, part, counter) {
  let value;
  if (typeof part === 'string') value = bloomKey(store, part, counter);
  else if ('w' in part) value = valueOfBody(store, part.w, counter);
  else value = part.v;
  return value;
}

function bloomKey(store, key, counter = { steps: 0 }) {
  const point = readPoint(store, key, counter);
  let value;
  if (point.kind === 'atom') value = point.value;
  else if (point.kind === 'derived') value = rebuildDerived(point);
  else value = valueOfBody(store, point, counter);
  return value;
}

module.exports = { bloomKey, valueOfPart, isSpanPart };
