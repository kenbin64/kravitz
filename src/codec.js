// codec.js
// One job: write a point as compact bytes and read it back. Text JSON spent most of a point on punctuation,
// {"v": ...} wrappers and keys spelled out in hex; here every value carries a one-byte tag, whole numbers are
// packed small, and a key is 8 raw bytes.
//
//   value  tag 0 null, 1 false, 2 true, 3 whole number (zigzag varint), 4 other number (8 bytes), 5 text
//   part   tag 0 value, 1 whole carried in place, 2 shared whole by key, 3 junction (key and count)
//   point  tag 0 atom (a value), 1 whole (shape, count, parts), 2 derived (its JSON)
// A point's own key is not inside its bytes; the store keeps it beside them.

const SHAPES = ['list', 'record', 'span'];

function createWriter() { return { bytes: [] }; }

function writeVarint(writer, n) {
  let m = n;
  while (m >= 128) { writer.bytes.push((m % 128) + 128); m = Math.floor(m / 128); }
  writer.bytes.push(m);
  return writer;
}

function writeText(writer, text) {
  const utf8 = Buffer.from(text, 'utf8');
  writeVarint(writer, utf8.length);
  for (const byte of utf8) writer.bytes.push(byte);
  return writer;
}

function writeKey(writer, key) {
  for (const byte of Buffer.from(key, 'hex')) writer.bytes.push(byte);
  return writer;
}

function writeValue(writer, value) {
  const small = Number.isSafeInteger(value) && Math.abs(value) < 2 ** 51;
  if (value === null) writer.bytes.push(0);
  else if (value === false) writer.bytes.push(1);
  else if (value === true) writer.bytes.push(2);
  else if (small) { writer.bytes.push(3); writeVarint(writer, value >= 0 ? value * 2 : -value * 2 - 1); }
  else if (typeof value === 'number') { const b = Buffer.alloc(8); b.writeDoubleLE(value); writer.bytes.push(4, ...b); }
  else { writer.bytes.push(5); writeText(writer, value); }
  return writer;
}

function writeBody(writer, body) {
  writer.bytes.push(SHAPES.indexOf(body.shape));
  writeVarint(writer, body.count);
  writeVarint(writer, body.parts.length);
  for (const part of body.parts) writePart(writer, part);
  return writer;
}

function writePart(writer, part) {
  if (typeof part === 'string') { writer.bytes.push(2); writeKey(writer, part); }
  else if ('w' in part) { writer.bytes.push(1); writeBody(writer, part.w); }
  else if ('s' in part) { writer.bytes.push(3); writeKey(writer, part.s); writeVarint(writer, part.n); }
  else { writer.bytes.push(0); writeValue(writer, part.v); }
  return writer;
}

function encodePoint(point) {
  const writer = createWriter();
  if (point.kind === 'atom') { writer.bytes.push(0); writeValue(writer, point.value); }
  else if (point.kind === 'whole') { writer.bytes.push(1); writeBody(writer, point); }
  else { writer.bytes.push(2); writeText(writer, JSON.stringify({ rule: point.rule, count: point.count, params: point.params, residual: point.residual })); }
  const buffer = Buffer.from(writer.bytes);
  return buffer;
}

// ── Reading ─────────────────────────────────────────────────────────────────────────────────────

function createReader(buffer) { return { buffer, at: 0 }; }

function readVarint(reader) {
  let value = 0, scale = 1, byte = 128;
  while (byte >= 128) { byte = reader.buffer[reader.at++]; value += (byte % 128) * scale; scale *= 128; }
  return value;
}

function readText(reader) {
  const length = readVarint(reader);
  const text = reader.buffer.toString('utf8', reader.at, reader.at + length);
  reader.at += length;
  return text;
}

function readKey(reader) {
  const key = reader.buffer.toString('hex', reader.at, reader.at + 8);
  reader.at += 8;
  return key;
}

function readValue(reader) {
  const tag = reader.buffer[reader.at++];
  let value;
  if (tag === 0) value = null;
  else if (tag === 1) value = false;
  else if (tag === 2) value = true;
  else if (tag === 3) { const m = readVarint(reader); value = m % 2 === 0 ? m / 2 : -(m + 1) / 2; }
  else if (tag === 4) { value = reader.buffer.readDoubleLE(reader.at); reader.at += 8; }
  else value = readText(reader);
  return value;
}

function readBody(reader) {
  const shape = SHAPES[reader.buffer[reader.at++]];
  const count = readVarint(reader);
  const length = readVarint(reader);
  const parts = [];
  for (let i = 0; i < length; i++) parts.push(readPart(reader));
  return { shape, count, parts };
}

function readPart(reader) {
  const tag = reader.buffer[reader.at++];
  let part;
  if (tag === 2) part = readKey(reader);
  else if (tag === 1) part = { w: readBody(reader) };
  else if (tag === 3) part = { s: readKey(reader), n: readVarint(reader) };
  else part = { v: readValue(reader) };
  return part;
}

function decodePoint(buffer, key) {
  const reader = createReader(buffer);
  const tag = reader.buffer[reader.at++];
  let point;
  if (tag === 0) { const value = readValue(reader); point = { key, kind: 'atom', type: value === null ? 'null' : typeof value, value }; }
  else if (tag === 1) point = { key, kind: 'whole', ...readBody(reader) };
  else point = { key, kind: 'derived', ...JSON.parse(readText(reader)) };
  return point;
}

module.exports = { encodePoint, decodePoint };
