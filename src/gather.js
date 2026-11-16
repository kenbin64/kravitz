// gather.js
// One job: the seed. Take any value (a word, a number, a list, a record, anything nested) and gather it
// into a single point. The key of that point is the seed: it is all you need to get the whole thing back.
//
// Each whole keeps its parts in order, so a part's neighbour is simply the next position. Single values
// are written in place; lists, records and fields become wholes of their own, stored once and shared by
// every whole that holds them. A long whole is gathered again into spans of GROUP_SIZE, and spans into
// bigger spans, so finding one item jumps level by level (the junctions) instead of walking the line.

const { putPoint } = require('./store');
const { makeAtom, makeWhole } = require('./points');

const GROUP_SIZE = 16;

function isAtomValue(value) {
  const atomic = value === null || ['string', 'number', 'boolean'].includes(typeof value);
  return atomic;
}

// A part as it sits inside a whole: a single value in place, or the key of the whole it is.
function gatherPart(store, value) {
  const part = isAtomValue(value) ? { v: value } : gatherWhole(store, value);
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

function gatherWhole(store, value) {
  let key;
  if (Array.isArray(value)) key = gatherParts(store, 'list', value.map(item => gatherPart(store, item)));
  else key = gatherParts(store, 'record', Object.entries(value)
    .map(([name, item]) => gatherParts(store, 'field', [{ v: name }, gatherPart(store, item)])));
  return key;
}

// The seed of any value. A single value on its own is stored as an atom so it still has a key.
function gatherValue(store, value) {
  const key = isAtomValue(value) ? putPoint(store, makeAtom(value)) : gatherWhole(store, value);
  return key;
}

module.exports = { gatherValue, GROUP_SIZE };
