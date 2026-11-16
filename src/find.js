// find.js
// One job: get the item at one position of a whole without blooming all of it. At each level the walk
// passes spans (each knows how many items it covers), skips the ones before the position, and drops into
// the one that holds it. That is the junction: a few steps per level instead of a walk down the line.

const { readPoint } = require('./store');
const { isSpan, isInline } = require('./bloom');
const { rebuildDerived } = require('./derivers');

// Returns the part ({ v } or a key) at position `index` (0 first) inside the whole `wholeKey`, or null.
// A derived whole is rebuilt from its rule, then indexed.
function findPart(store, wholeKey, index, counter = { steps: 0 }) {
  let container = readPoint(store, wholeKey, counter);
  let remaining = index;
  let found = null;
  const inRange = !!container && index >= 0 && index < container.count;
  if (inRange && container.kind === 'derived') found = { v: rebuildDerived(container)[index] };
  let searching = inRange && container.kind === 'whole';
  while (searching) {
    let descended = false;
    for (let i = 0; i < container.parts.length && !descended && searching; i++) {
      const part = container.parts[i];
      const span = isInline(part) ? null : readPoint(store, part, counter);
      const covers = isSpan(span) ? span.count : 1;
      if (remaining < covers && isSpan(span)) { container = span; descended = true; }
      else if (remaining < covers) { found = part; searching = false; }
      else remaining -= covers;
    }
    if (!descended) searching = false;
  }
  return found;
}

module.exports = { findPart };
