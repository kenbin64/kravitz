# seed-store

A working prototype of Ken's geometric datastore: dimensions and relations on the same level, a one to one junction as the traversal, and one seed as the key to everything it gathered.

## The idea

Any value can be gathered into one point. A word, a number, a record, a list of records, a whole game level: each becomes a single point whose key is worked out from its content. That key is the seed. Bloom the seed and you get back everything it gathered, exactly. One point on the length holds the entire width, so you only ever need to hold that one point.

Nothing is laid out ahead of time in rows and columns. A record is simply whatever gathered into its seed, so the data does not have to be structured to fit.

Each whole keeps its parts in order, so a part's neighbour is the next position (Mrs. Kravitz: every point knows the one beside it, and knows it from where it sits, so no pointer is stored). Identical content gets the identical key, so a part shared by many wholes is stored once. A long whole is gathered again into spans of 16, and spans into bigger spans, so finding one item jumps level by level through the junctions instead of walking the whole line.

## Run it

```
node test/seed-store.test.js     # 22 checks that try to break it
node bench/bench.js              # against what is already out there
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

## What changed on the way

The first version stored a link point for every item, each knowing its neighbour by key. It rebuilt everything exactly but came out 10 to 20 times larger than compressed JSON, about 100 bytes of link per item where JSON spends about 8. Version 2 lets position be the neighbour ("coordinates are memory"), writes single values in place, and is 3 to 7 times smaller than version 1. Both results are kept here because the first is why the second exists.

## Where it stands

What holds: one seed rebuilds any value exactly, shared parts are stored once, and one item is reached through the junctions without blooming the rest.

What does not hold yet: it is not smaller than the best existing compressor, and its read speed has only been compared against unpacking a compressed file, not against an indexed database.

Prior art, credited plainly: content addressing and Merkle trees (Git, IPFS) already use one key derived from content to identify a whole structure. This prototype is that idea arranged as dimensions, wholes as points one level up, with the neighbour taken from position.

Not done yet: the geometric part, where data that follows a shape is rebuilt from that shape instead of being stored item by item. That is the step that could change the size result, and it is the next thing to build and measure.

Limits stated: keys are 16 hex characters (64 bits) to keep the prototype readable; a real store would use the full hash. Record field order is part of the content, so {a:1, b:2} and {b:2, a:1} are different seeds. Values must be JSON-safe.
