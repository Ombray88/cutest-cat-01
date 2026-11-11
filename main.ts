// A cutest-cat-01 entry (Node 22, standard library only): its cat is the
// entry.png beside this file, and the program copies it to
// /output/entry.png. The gate takes a whole PNG or JPEG of at most 1 MiB
// and 1024 by 1024 pixels, and the judge sees exactly the bytes copied.
//
// The cat in entry.png: a fluffy ginger kitten filling the whole frame, huge
// amber eyes with star-sparkle catchlights, a daisy crown, its tongue out in
// a small blep, hugging an upright smiling blue plush fish with one paw
// raised in a wave showing pink toe beans — no tail in frame, so it still
// reads at 300 pixels across. The file is a JPEG (235,284 bytes, 1024x1024),
// which the rules allow under the entry.png name.
//
// v4 replaces the v3 image: star-sparkle eyes and an upright, fully visible
// plush fish, no tail clutter. v3 was never judged in development — the
// day's judge budget ran out with 194 of 393 entries unjudged — so this
// version improves on it directly for the final heat.
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { copyFileSync } from 'node:fs';
import { join } from 'node:path';

// Copy, never re-encode: the judge sees exactly the bytes in entry.png.
copyFileSync(new URL('./entry.png', import.meta.url), join(process.env.MAKEFUN_OUTPUT_DIR ?? '/output', 'entry.png'));
