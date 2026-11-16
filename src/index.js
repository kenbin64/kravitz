// index.js
// The seed store in three verbs: gather a value into a seed, bloom a seed back into the value, find one
// item of a list seed without blooming the rest.

const { createStore, countPoints, measureBytes } = require('./store');
const { gatherValue } = require('./gather');
const { bloomKey, valueOfPart } = require('./bloom');
const { findPart } = require('./find');
const { registerDeriver } = require('./derivers');
const { openDiskStore } = require('./diskstore');
const { encodePoint, decodePoint } = require('./codec');

function findItem(store, seedKey, index, counter = { steps: 0 }) {
  const part = findPart(store, seedKey, index, counter);
  const item = part === null ? undefined : valueOfPart(store, part, counter);
  return item;
}

module.exports = { createStore, openDiskStore, gather: gatherValue, bloom: bloomKey, findItem, countPoints, measureBytes,
  registerDeriver, encodePoint, decodePoint };
