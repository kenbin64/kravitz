# kravitz

A working prototype of Ken Bingham's geometric datastore: dimensions and relations on the same level, a one to one junction as the traversal, and one seed as the key to everything it gathered.

## The idea

Any value can be gathered into one point. A word, a number, a record, a list of records, a whole game level: each becomes a single point whose key is worked out from its content. That key is the seed. Bloom the seed and you get back everything it gathered, exactly.

Nothing is laid out ahead of time in rows and columns. A record is simply whatever gathered into its seed, so the data does not have to be structured to fit.

The corner is a full dimension seen as one point. Seen from the length, a whole width collapses to a single point, the way i stands at right angles to the number line yet casts its shadow on one point, 0. So a whole used once is carried inside the point that holds it, and opening that point gives its entire width in one read. A whole used more than once, and big enough to be worth a lookup, is stored once as its own point and referenced from every corner that uses it.

Each whole keeps its parts in order, so a part's neighbour is the next position (Mrs. Kravitz: every point knows the one beside it, from where it sits, so no pointer is stored). Along a long whole the parts are gathered into spans of 64, and each junction records how many items it covers, so finding one item reads one junction per level.

## Run it

```
node test/seed-store.test.js     # 24 checks that try to break it
node bench/bench.js              # size against JSON and brotli
node bench/systems.js            # against SQLite, a zstd file and a Git-style store, on disk
```

## What it does, measured (2026-11-15, version 3)

The test passes 24 of 24. Every kind of value and 300 random nested values come back exactly from one seed. The same record gathered twice gives the same seed and adds nothing. A row used three times in a level is stored once and referenced, while a tiny repeated row is carried in place. All 5,000 positions of a long list are found correctly, reading at most 3 points. Fifteen look-alike values (1 and "1", [1,2] and [2,1], and so on) get fifteen different seeds.

Size against JSON compressed with brotli, the best general compressor in Node (above 1.00 means kravitz is smaller, both compressed):

| Data | kravitz vs JSON + brotli | vs plain JSON |
|---|---|---|
| 5,000 customer records, repeating fields | 0.88x | 0.43x |
| 20,000 words from 500 | 0.69x | 0.54x |
| 20,000 random numbers | 0.91x | 0.56x |
| 300 game levels built from 24 rows | 1.25x | 4.26x |

## Against existing systems, on disk

`node bench/systems.js` puts the same data into five systems: one JSON file compressed with zstd level 19; an SQLite table with a row per value or record; SQLite with one JSON document per item; a Git-style object store (every item and every nested part keyed by its content and compressed with zlib, equal parts stored once, the manifest kept in memory); and kravitz, its points kept in an SQLite table by key. Every system read every item back exactly. One run on one machine.

| Data | System | Disk bytes | Read one | Read all |
|---|---|---|---|---|
| 5,000 customer records | zstd file | 34,285 | 2.1 ms | 4 ms |
| | SQLite rows | 196,608 | 32 µs | 172 ms |
| | SQLite docs | 507,904 | 38 µs | 5 ms |
| | Git-style | 778,240 | 56 µs | 195 ms |
| | kravitz | 1,265,664 | 303 µs | 15 ms |
| 300 game levels from 24 shared rows | zstd file | 8,786 | 2.4 ms | 6 ms |
| | SQLite rows | 643,072 | 52 µs | 15 ms |
| | SQLite docs | 622,592 | 46 µs | 5 ms |
| | Git-style | 139,264 | 644 µs | 181 ms |
| | kravitz | 135,168 | 913 µs | 228 ms |
| 100 sensors x 1,000 readings | zstd file | 80,071 | 1.6 ms | 3 ms |
| | SQLite rows | 1,806,336 | 257 µs | 25 ms |
| | SQLite docs | 421,888 | 48 µs | 2 ms |
| | Git-style | 475,136 | 81 µs | 8 ms |
| | kravitz | 1,372,160 | 728 µs | 58 ms |

Where kravitz wins: data built from shared parts. On the game levels it is the smallest database on disk, about 4.7 times smaller than SQLite and a little smaller than the Git-style store, because each shared row is stored once.

Where it loses: reading one item is 6 to 20 times slower than SQLite, and on records with nothing shared it is 3 to 6 times larger. Two causes, both fixable. Each junction holds 64 whole records as text, so reading one record parses all 64; and a game level fetches its shared rows one lookup at a time. The text format itself is heavy: every value is wrapped as {"v": ...} and every key is written out as text.

A fair note on the Git-style column: it stores loose objects. Real Git also packs objects with delta compression, which would be smaller.

## Is it a product?

Not yet. The test set for that, before any claim: reading one item within about 2 times of SQLite (fails today, 6 to 20 times), at least 3 times smaller than SQLite on shared-part data (passes, 4.7 times), and at least as small as a Git-style store (passes, narrowly). Next: a compact binary point format, smaller junctions so a read parses less, and fetching a level's shared rows together; then the same benchmark again.

## What changed on the way

Version 1 stored a link point for every item, each knowing its neighbour by key: exact, but 10 to 20 times larger than compressed JSON. Version 2 let position be the neighbour ("coordinates are memory") and wrote single values in place: 3 to 7 times smaller than version 1, but finding one record still walked about 40 points, each its own disk lookup (1.2 to 2.5 ms, 2 seconds to read 5,000 records). Version 3 carries each width inside its corner, shares only what repeats and is worth a lookup, and lets every junction carry its count: 3 points per find, reading all 5,000 records in 15 ms, and the game levels went from losing to compressed JSON to beating it.

## Where it stands

What holds: one seed rebuilds any value exactly, shared parts are stored once, and one item is reached in a few reads without blooming the rest.

Prior art, credited plainly: content addressing and Merkle trees (Git, IPFS) already use one key derived from content to identify a whole structure, and document stores already keep a record together in one read. This prototype arranges those as dimensions: wholes as points one level up, the width carried in the corner, the neighbour taken from position.

The geometric part, where data that follows a shape is rebuilt from that shape instead of being stored item by item, plugs in through the `derived` hook (`registerDeriver`, `options.shape`). It is measured separately: it wins clearly on clean shaped data and ties the existing methods on noisy measurements.

Limits stated: keys are 16 hex characters (64 bits) to keep the prototype readable; a real store would use the full hash. Record field order is part of the content, so {a:1, b:2} and {b:2, a:1} are different seeds. Values must be JSON-safe. `findItem` reads positions in lists.
