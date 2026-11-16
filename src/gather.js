// gather.js
// One job: the seed. Take any value (a word, a number, a list, a record, anything nested) and gather it
// into a single point. The key of that point is the seed: it is all you need to get the whole thing back.
//
// Each whole keeps its parts in order, so a part's neighbour is simply the next position. Single values
// are written in place; lists, records and fields become wholes of their own, stored once and shared by
// every whole that holds them. A long whole is gathered again into spans of GROUP_SIZE, and spans into
// bigger spans, so finding one item jumps level by level (the junctions) instead of walking the line.
//
// options.shape (optional): given a list of numbers, returns { rule, params, residual } when a registered
// rule can rebuild it more cheaply, or null. The rule is stored instead of the numbers (see derivers.js).

const { putPoint } = require('./store');
const { makeAtom, makeWhole, makeDerived } = require('./points');

const GROUP_SIZE = 16;

function isAtomValue(value) {
  const atomic = value === null || ['string', 'number', 'boolean'].includes(typeof value);
  return atomic;
}

// A part as it sits inside a whole: a single value in place, or the key of the whole it is.
function gatherPart(store, value, options) {
  const part = isAtomValue(value) ? { v: value } : gatherWhole(store, value, options);
  return part;
}

// Group a long run into spans until it fits one level. Each entry is { part, count }.
function gatherSpans(store, entries) {
  let level = entries;
  while (level.length > GROUP_SIZE) {
    const next = [];
    for (let i = 0; i < level.length; i += GROUP_SIZE) {
      const group = level.slice(i, i + GROUP_SIZE);
      const count = group.reduce((sum, entry) => sum + entry.count, 0);
      next.push({ part: putPoint(store, makeWhole('span', count, group.map(entry => entry.part))), count });
    }
    level = next;
  }
  return level;
}

function gatherParts(store, shape, parts) {
  const top = gatherSpans(store, parts.map(part => ({ part, count: 1 })));
  const wholeKey = putPoint(store, makeWhole(shape, parts.length, top.map(entry => entry.part)));
  return wholeKey;
}

// A list of numbers may be rebuilt by a rule instead of stored number by number.
function shapeNumbers(store, list, options) {
  const numeric = !!(options && options.shape) && list.length > 0 && list.every(item => typeof item === 'number');
  const shaped = numeric ? options.shape(list) : null;
  const key = shaped ? putPoint(store, makeDerived(shaped.rule, list.length, shaped.params, shaped.residual)) : null;
  return key;
}

function gatherWhole(store, value, options) {
  let key = Array.isArray(value) ? shapeNumbers(store, value, options) : null;
  if (!key && Array.isArray(value)) key = gatherParts(store, 'list', value.map(item => gatherPart(store, item, options)));
  else if (!key) key = gatherParts(store, 'record', Object.entries(value)
    .map(([name, item]) => gatherParts(store, 'field', [{ v: name }, gatherPart(store, item, options)])));
  return key;
}

// The seed of any value. A single value on its own is stored as an atom so it still has a key.
function gatherValue(store, value, options = {}) {
  const key = isAtomValue(value) ? putPoint(store, makeAtom(value)) : gatherWhole(store, value, options);
  return key;
}

module.exports = { gatherValue, GROUP_SIZE };
