// derivers.js
// One job: keep the rules that can rebuild a whole from a few numbers. A point of kind 'derived' names its
// rule; the bloom asks that rule to rebuild the items. The rules themselves are registered from outside this
// repository, so the store knows only that a whole can be rebuilt, never how.

const derivers = new Map();

// rebuild(params, residual, count) must return the items exactly, as an array.
function registerDeriver(name, rebuild) {
  derivers.set(name, rebuild);
  return name;
}

function rebuildDerived(point) {
  const rebuild = derivers.get(point.rule);
  if (!rebuild) throw new Error(`no rule registered for "${point.rule}"; the whole cannot be rebuilt`);
  const items = rebuild(point.params, point.residual, point.count);
  return items;
}

module.exports = { registerDeriver, rebuildDerived };
