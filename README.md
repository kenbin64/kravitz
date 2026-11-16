# seed-store

A working prototype of Ken's geometric datastore: dimensions and relations on the same level, a one to one junction as the traversal, and one seed as the key to everything it gathered.

## The idea

Any value can be gathered into one point. A word, a number, a record, a list of records, a whole game level: each becomes a single point whose key is worked out from its content. That key is the seed. Bloom the seed and you get back everything it gathered, exactly. One point on the length holds the entire width, so you only ever need to hold that one point.

Nothing is laid out ahead of time in rows and columns. A record is simply whatever gathered into its seed, so the data does not have to be structured to fit.

Each whole keeps its parts in order, so a part's neighbour is the next position (Mrs. Kravitz: every point knows the one beside it, and knows it from where it sits, so no pointer is stored). Identical content gets the identical key, so a part shared by many wholes is stored once. A long whole is gathered again into spans of 16, and spans into bigger spans, so finding one item jumps level by level through the junctions instead of walking the whole line.

## Run it

```
node test/seed-store.test.js     # 22 checks that try to break it
node bench/bench.js              # size against JSON and brotli
node bench/systems.js            # against SQLite and a zstd file, on disk
```

## What it does, measured (2026-11-15)

The test passes 22 of 22. Every kind of value and 300 random nested values come back exactly from one seed. The same record gathered twice gives the same seed and adds nothing. All 5,000 positions of a long list are found correctly, reading at most 34 points where a full bloom reads 336. Fifteen look-alike values (1 and "1", [1,2] and [2,1], and so on) get fifteen different seeds.

Size, in bytes, against plain JSON and against JSON compressed with brotli (the best general compressor in Node):

| Data | JSON | JSON + brotli | seed store | seed store + brotli |
|---|---|---|---|---|
| 5,000 customer records, repeating fields | 449,428 | 33,470 | 1,617,726 | 165,160 |
| 20,000 words from 500 | 182,572 | 14,619 | 432,137 | 36,518 |
| 20,000 random numbers | 197,718 | 45,881 | 447,283 | 65,134 |
| 300 game levels built from 24 rows | 581,123 | 10,117 | 228,005 | 22,906 |

On size, what is already out there wins. Compressed JSON is 1.4 to 5 times smaller than the compressed seed store in every case. The seed store only beats plain, uncompressed JSON on data built from shared parts (the game levels, 2.55 times smaller). Brotli is very good at repetition, and random keys do not compress.

Reading one customer record out of 5,000: compressed JSON has to be unpacked and parsed whole, about 2.0 ms; the seed store goes straight to it in about 0.02 ms, reading 40 points. That is about 91 times faster, but against the wrong opponent: an indexed database such as SQLite also reads one record directly, and an array already in memory is faster than both. SQLite is the fair comparison still to run.

## Against existing systems, on disk (2026-11-15)

`node bench/systems.js` puts the same data into four systems: one JSON file compressed with zstd level 19, an SQLite table with a row per value or record, SQLite with one JSON document per item, and kravitz with its points kept in an SQLite table by key. Every system read every item back exactly. Times are from one run on one machine.

| Data | System | Disk bytes | Read one | Read all |
|---|---|---|---|---|
| 5,000 customer records | zstd file | 34,285 | 2.0 ms | 4 ms |
| | SQLite rows | 196,608 | 33 µs | 158 ms |
| | SQLite docs | 507,904 | 32 µs | 5 ms |
| | kravitz | 1,925,120 | 1.2 ms | 2,152 ms |
| 300 game levels from 24 shared rows | zstd file | 8,786 | 2.6 ms | 5 ms |
| | SQLite rows | 643,072 | 49 µs | 15 ms |
| | SQLite docs | 622,592 | 52 µs | 5 ms |
| | kravitz | 151,552 | 1.7 ms | 332 ms |
| 100 sensors x 1,000 readings | zstd file | 80,071 | 1.6 ms | 3 ms |
| | SQLite rows | 1,806,336 | 260 µs | 25 ms |
| | SQLite docs | 421,888 | 47 µs | 3 ms |
| | kravitz | 1,888,256 | 2.5 ms | 216 ms |

Where kravitz wins: data built from shared parts. On the game levels it is about 4 times smaller on disk than either SQLite layout, because each shared row is stored once and SQLite stores it every time it appears.

Where it loses: everywhere else. It is about 10 times larger than an SQLite table for records with no shared parts, the compressed file is far smaller than every database on all three datasets, and reading one item is 5 to 50 times slower than SQLite. The cause is plain: finding one record walks about 40 points, and on disk each point is its own lookup and parse, where SQLite does one tree lookup and returns the row.

So the honest position today: kravitz is a structure that stores shared parts once and can name any whole with one key. It is not yet a faster or smaller database. Making it competitive would mean fewer, larger points per read (wider spans, a whole stored together with its small parts) and binary keys instead of text, and then measuring again against the same table.

## What changed on the way

The first version stored a link point for every item, each knowing its neighbour by key. It rebuilt everything exactly but came out 10 to 20 times larger than compressed JSON, about 100 bytes of link per item where JSON spends about 8. Version 2 lets position be the neighbour ("coordinates are memory"), writes single values in place, and is 3 to 7 times smaller than version 1. Both results are kept here because the first is why the second exists.

## Where it stands

What holds: one seed rebuilds any value exactly, shared parts are stored once, and one item is reached through the junctions without blooming the rest.

What does not hold yet: it is not smaller than the best existing compressor, and against SQLite it is slower to read and larger on disk except where parts are shared.

Prior art, credited plainly: content addressing and Merkle trees (Git, IPFS) already use one key derived from content to identify a whole structure. This prototype is that idea arranged as dimensions, wholes as points one level up, with the neighbour taken from position.

The geometric part, where data that follows a shape is rebuilt from that shape instead of being stored item by item, plugs in through the `derived` hook (`registerDeriver`, `options.shape`). It is measured separately: it wins clearly on clean shaped data and ties the existing methods on noisy measurements.

Limits stated: keys are 16 hex characters (64 bits) to keep the prototype readable; a real store would use the full hash. Record field order is part of the content, so {a:1, b:2} and {b:2, a:1} are different seeds. Values must be JSON-safe.
