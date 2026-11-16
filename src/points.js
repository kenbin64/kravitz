// points.js
// One job: make the two kinds of stored point. Each key comes from the point's own content.
//
//   atom   one single thing on its own (only stored when a seed IS a single value)
//   whole  many parts gathered into one: its shape, how many items it covers, and its parts in order
//
// A part's neighbour is the next position, so no pointer is stored for it (version 2, 2026-11-15:
// "coordinates are memory"; the first version stored a link point per item and was 10 to 20 times too big).
// A part is either a single value written in place, { v: value }, or the key of another whole.

const { deriveKey } = require('./key');

function makeAtom(value) {
  const type = value === null ? 'null' : typeof value;
  const content = { kind: 'atom', type, value };
  const atom = { key: deriveKey(content), ...content };
  return atom;
}

// shape: 'list' (an array), 'record' (an object), 'field' (a name and its value), 'span' (a junction:
// a run of items grouped so a long whole can be jumped instead of walked).
function makeWhole(shape, count, parts) {
  const content = { kind: 'whole', shape, count, parts };
  const whole = { key: deriveKey(content), ...content };
  return whole;
}

module.exports = { makeAtom, makeWhole };
