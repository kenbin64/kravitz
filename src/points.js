// points.js
// One job: make the three kinds of stored point.
//
//   atom     one single thing on its own (only stored when a seed IS a single value)
//   whole    many parts gathered into one: its shape, how many items it covers, and its parts in order
//   derived  a whole rebuilt by a registered rule from a few numbers and a residual (see derivers.js)
//
// A part inside a whole is one of:
//   { v: value }          a single value, in place
//   { w: body }           a whole used only once, carried inside this point (the width crammed into the corner)
//   "key"                 a whole used more than once, stored once as its own point and referenced
//   { s: key, n: count }  a junction on the length axis: a span of items, and how many it covers
//
// The key of a stored whole is its content key (see gather.js), so the same content always has the same key,
// whether a copy of it is carried inside some other point or not.

const { deriveKey } = require('./key');

function makeAtom(value) {
  const type = value === null ? 'null' : typeof value;
  const content = { kind: 'atom', type, value };
  const atom = { key: deriveKey(content), ...content };
  return atom;
}

// shape: 'list' (an array), 'record' (an object), 'field' (a name and its value), 'span' (a junction).
function makeWhole(key, shape, count, parts) {
  const whole = { key, kind: 'whole', shape, count, parts };
  return whole;
}

// A whole that a registered rule rebuilds from a few numbers plus what the rule got wrong (the residual).
function makeDerived(rule, count, params, residual) {
  const content = { kind: 'derived', rule, count, params, residual };
  const derived = { key: deriveKey(content), ...content };
  return derived;
}

module.exports = { makeAtom, makeWhole, makeDerived };
