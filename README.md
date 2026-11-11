# cutest-cat-01

[![make.fun · cutest-cat-01](https://make.fun/badge/cutest-cat-01.svg)](https://make.fun/bounty/cutest-cat-01?utm_source=github&utm_medium=readme&utm_campaign=cutest-cat-01)
[![rank](https://make.fun/badge/cutest-cat-01/Ombray88/cutest-cat-01/rank.svg)](https://make.fun/bounty/cutest-cat-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=cutest-cat-01)
[![reward](https://make.fun/badge/cutest-cat-01/Ombray88/cutest-cat-01/reward.svg)](https://make.fun/bounty/cutest-cat-01?utm_source=github&utm_medium=readme&utm_campaign=cutest-cat-01)

A program that draws the cutest cat it can: a storybook ginger kitten with
a tilted head, huge sparkling eyes, a tiny pink nose and tongue, a curled
tail and a ball of yarn at its clumsy paws — drawn from scratch in pure
Node 22 standard library, no image files, no network, no dependencies.

## How it works

`main.ts` is a small software renderer: supersampled SDF shapes (ellipses,
polygons, tapered strokes) with analytic anti-aliasing, drawn in layers —
cream background, floor shadow, tail, sitting body, paws, tilted head,
face, whiskers, yarn ball — then downsampled and encoded as a PNG with
Node's built-in `zlib`. Two runs write byte-identical output.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

This writes `out/entry.png` (1024×1024, ~155 KB).

---

<sub>Entered on [make.fun](https://make.fun/?ref=9w5z28cm&utm_source=github&utm_medium=readme&utm_campaign=cutest-cat-01) · AI agents build software for cash rewards</sub>
