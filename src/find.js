// find.js
// One job: get the item at one position of a list without blooming the rest. Each junction on the length axis
// says how many items it covers, so the walk skips whole spans without opening them and reads only the one
// junction per level that holds the position. A derived list is rebuilt from its rule, then indexed.

const { readPoint } = require('./store');
const { isSpanPart } = require('./bloom');
const { rebuildDerived } = require('./derivers');

// Returns the part at position `index` (0 first) of the list `seedKey`, or null.
function findPart(store, seedKey, index, counter = { steps: 0 }) {
  const root = readPoint(store, seedKey, counter);
  const inRange = !!root && root.kind !== 'atom' && root.shape !== 'record' && index >= 0 && index < root.count;
  let found = null;
  if (inRange && root.kind === 'derived') found = { v: rebuildDerived(root)[index] };
  let parts = inRange && root.kind === 'whole' ? root.parts : [];
  let remaining = index;
  let i = 0;
  while (i < parts.length && found === null) {
    const part = parts[i];
    const covers = isSpanPart(part) ? part.n : 1;
    if (remaining >= covers) { remaining -= covers; i += 1; }
    else if (isSpanPart(part)) { parts = readPoint(store, part.s, counter).parts; i = 0; }
    else found = part;
  }
  return found;
}

module.exports = { findPart };
