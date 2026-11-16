// key.js
// One job: turn content into its key. The key is worked out from the content itself, so the same content
// always gets the same key and is stored once, wherever it appears.

const crypto = require('crypto');

// 16 hex characters is 64 bits. Plenty for a prototype; a real store would use the full hash (see README).
const KEY_LENGTH = 16;

function deriveKey(content) {
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  const key = crypto.createHash('sha256').update(text).digest('hex').slice(0, KEY_LENGTH);
  return key;
}

module.exports = { deriveKey, KEY_LENGTH };
