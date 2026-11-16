# kravitz

A working prototype of Ken Bingham's geometric datastore: dimensions and relations on the same level, a one to one junction as the traversal, and one seed as the key to everything it gathered.

## The idea

Any value can be gathered into one point. A word, a number, a record, a list of records, a whole game level: each becomes a single point whose key is worked out from its content. That key is the seed. Bloom the seed and you get back everything it gathered, exactly.

Nothing is laid out ahead of time in rows and columns. A record is simply whatever gathered into its seed, so the data does not have to be structured to fit.

The corner is a full dimension seen as one point. Seen from the length, a whole width collapses to a single point, the way i stands at right angles to the number line yet casts its shadow on one point, 0. So a whole used once is carried inside the point that holds it, and opening that point gives its entire width in one read. A whole used more than once, and big enough to be worth a lookup, is stored once as its own point and referenced from every corner that uses it.

Each whole keeps its parts in order, so a part's neighbour is the next position (Mrs. Kravitz: every point knows the one beside it, from where it sits, so no pointer is stored). Along a long whole the parts are gathered into spans of 16 (adjustable), and each junction records how many items it covers, so finding one item reads one junction per level.

On disk (`openDiskStore`) every point is written in a compact byte form, values tagged in one byte, whole numbers packed small, keys as 8 raw bytes, and the 8-byte key is the SQLite row number, so a lookup is one tree search. When a whole needs several shared parts or junctions, they are fetched in one query.

## Run it

```
node test/seed-store.test.js     # 28 checks that try to break it
node bench/bench.js              # size of the points as text against JSON and brotli
node bench/systems.js            # against SQLite, a zstd file and a Git-style store, on disk
```

## What it does, measured (2026-11-15, version 4)

The test passes 28 of 28. Every kind of value and 300 random nested values come back exactly from one seed. The same record gathered twice gives the same seed and adds nothing. A row used three times in a level is stored once and referenced, while a tiny repeated row is carried in place. All 5,000 positions of a long list are found correctly, reading at most 4 points. Every point of 200 random stores survives the byte form unchanged, and a store written straight to an SQLite file blooms and finds exactly. Fifteen look-alike values (1 and "1", [1,2] and [2,1], and so on) get fifteen different seeds.

Size of the points written as text, against JSON compressed with brotli (above 1.00 means kravitz is smaller, both compressed). On disk the byte form is used instead, measured in the next section.

| Data | kravitz vs JSON + brotli | vs plain JSON |
|---|---|---|
| 5,000 customer records, repeating fields | 0.79x | 0.42x |
| 20,000 words from 500 | 0.39x | 0.41x |
| 20,000 random numbers | 0.70x | 0.43x |
| 300 game levels built from 24 rows | 1.21x | 4.20x |

## Against existing systems, on disk

`node bench/systems.js` puts the same data into the systems people already use: one JSON file compressed with zstd level 19; an SQLite table with a row per value or record; SQLite with one JSON document per item; a Git-style object store (every item and every nested part keyed by its content and compressed with zlib, equal parts stored once, the manifest kept in memory); and the kravitz disk store at junction sizes 16 (the default) and 64. Every system read every item back exactly. One run on one machine.

| Data | System | Disk bytes | Read one | Read all |
|---|---|---|---|---|
| 5,000 customer records | zstd file | 34,285 | 2.0 ms | 4 ms |
| | SQLite rows | 196,608 | 33 µs | 156 ms |
| | SQLite docs | 507,904 | 31 µs | 5 ms |
| | Git-style | 778,240 | 55 µs | 200 ms |
| | kravitz, span 16 | 540,672 | 34 µs | 10 ms |
| | kravitz, span 64 | 671,744 | 72 µs | 10 ms |
| 300 game levels from 24 shared rows | zstd file | 8,786 | 2.6 ms | 5 ms |
| | SQLite rows | 643,072 | 51 µs | 16 ms |
| | SQLite docs | 622,592 | 52 µs | 5 ms |
| | Git-style | 139,264 | 639 µs | 182 ms |
| | kravitz, span 16 | 98,304 | 94 µs | 5 ms |
| | kravitz, span 64 | 114,688 | 140 µs | 5 ms |
| 100 sensors x 1,000 readings | zstd file | 80,071 | 1.5 ms | 3 ms |
| | SQLite rows | 1,806,336 | 266 µs | 27 ms |
| | SQLite docs | 421,888 | 52 µs | 2 ms |
| | Git-style | 475,136 | 85 µs | 8 ms |
| | kravitz, span 16 | 638,976 | 230 µs | 22 ms |
| | kravitz, span 64 | 491,520 | 168 µs | 8 ms |

Where kravitz wins: data built from shared parts. On the game levels it is the smallest database on disk, about 6.5 times smaller than SQLite and 1.4 times smaller than the Git-style store, while reading a level in under 0.1 ms and all 300 in 5 ms. On customer records it now reads one record as fast as SQLite.

Where it loses: on records with nothing shared it is about 2.7 times larger than an SQLite table (about the size of SQLite documents), and a long list of numbers reads about 3 times slower than an SQLite document, mostly the cost of decoding 1,000 numbers in JavaScript where SQLite hands back one block of text that the built-in JSON reader turns into numbers very fast. The compressed file is still far smaller than every database, but it has to be unpacked whole to read anything.

A fair note on the Git-style column: it stores loose objects. Real Git also packs objects with delta compression, which would be smaller; a test against a real Git pack is still to do.

## Is it a product?

For data built from reused parts, the test set now passes: reading one item within about 2 times of SQLite (1.0 times on records, 1.8 times on levels), at least 3 times smaller than SQLite on shared-part data (6.5 times), and at least as small as a Git-style store (1.4 times smaller). It does not pass for long lists of numbers (3 times slower to read). So a niche product is credible: a store for content built from reused parts, such as game worlds, templates and versioned documents, where one key names a whole. Before claiming it publicly: test against a real Git pack and a backup tool, on real data rather than generated data, and on more than one machine.

## What changed on the way

Version 1 stored a link point for every item, each knowing its neighbour by key: exact, but 10 to 20 times larger than compressed JSON. Version 2 let position be the neighbour ("coordinates are memory") and wrote single values in place: 3 to 7 times smaller than version 1, but finding one record still walked about 40 points, each its own disk lookup (1.2 to 2.5 ms, 2 seconds to read 5,000 records). Version 3 carries each width inside its corner, shares only what repeats and is worth a lookup, and lets every junction carry its count: 3 points per find, reading all 5,000 records in 15 ms, and the game levels went from losing to compressed JSON to beating it. Version 4 writes points in a compact byte form on disk with the key as the SQLite row number, fetches shared parts and junctions in one query, and uses junctions of 16: reading one record went from 303 µs to 34 µs (SQLite: 33 µs) and the game levels from 135 KB to 98 KB. On the way, a layout keyed by blob doubled the file at some junction sizes, because rows above a quarter page spill to overflow pages; keying by row number fixed it.

## Where it stands

What holds: one seed rebuilds any value exactly, shared parts are stored once, and one item is reached in a few reads without blooming the rest.

Prior art, credited plainly: content addressing and Merkle trees (Git, IPFS) already use one key derived from content to identify a whole structure, and document stores already keep a record together in one read. This prototype arranges those as dimensions: wholes as points one level up, the width carried in the corner, the neighbour taken from position.

The geometric part, where data that follows a shape is rebuilt from that shape instead of being stored item by item, plugs in through the `derived` hook (`registerDeriver`, `options.shape`). It is measured separately: it wins clearly on clean shaped data and ties the existing methods on noisy measurements.

Limits stated: keys are 16 hex characters (64 bits) to keep the prototype readable; a real store would use the full hash. Record field order is part of the content, so {a:1, b:2} and {b:2, a:1} are different seeds. Values must be JSON-safe. `findItem` reads positions in lists. The disk store uses node:sqlite (Node 22.5 or later), which Node still marks experimental.
