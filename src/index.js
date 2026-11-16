// index.js
// The seed store in three verbs: gather a value into a seed, bloom a seed back into the value, find one
// item of a seed without blooming the rest.

const { createStore, countPoints, measureBytes } = require('./store');
const { gatherValue } = require('./gather');
const { bloomKey, bloomPart } = require('./bloom');
const { findPart } = require('./find');

function findItem(store, seedKey, index, counter = { steps: 0 }) {
  const part = findPart(store, seedKey, index, counter);
  const item = part === null ? undefined : bloomPart(store, part, counter);
  return item;
}

module.exports = { createStore, gather: gatherValue, bloom: bloomKey, findItem, countPoints, measureBytes };
