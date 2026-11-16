// bloom.js
// One job: the bloom. Start from a seed key and get back everything it gathered, exactly, by reading each
// whole's parts in order and opening each whole it names. Every stored point read counts as one step.

const { readPoint } = require('./store');

const isInline = (part) => typeof part === 'object' && part !== null;

function isSpan(point) {
  const span = !!point && point.kind === 'whole' && point.shape === 'span';
  return span;
}

// The items of one whole, in order, each still a part ({ v } or a key). Spans are junctions, opened in place.
function collectItems(store, whole, counter) {
  const items = [];
  for (const part of whole.parts) {
    const span = isInline(part) ? null : readPoint(store, part, counter);
    if (isSpan(span)) items.push(...collectItems(store, span, counter));
    else items.push(part);
  }
  return items;
}

function bloomPart(store, part, counter) {
  const value = isInline(part) ? part.v : bloomKey(store, part, counter);
  return value;
}

function bloomKey(store, key, counter = { steps: 0 }) {
  const point = readPoint(store, key, counter);
  let value;
  if (point.kind === 'atom') value = point.value;
  else if (point.shape === 'record') value = Object.fromEntries(collectItems(store, point, counter).map(field => bloomPart(store, field, counter)));
  else value = collectItems(store, point, counter).map(part => bloomPart(store, part, counter));   // list, or a field: [name, value]
  return value;
}

module.exports = { bloomKey, bloomPart, collectItems, isSpan, isInline };
