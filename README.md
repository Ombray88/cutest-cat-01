# cutest-cat-01

[![make.fun · cutest-cat-01](https://make.fun/badge/cutest-cat-01.svg)](https://make.fun/bounty/cutest-cat-01?utm_source=github&utm_medium=readme&utm_campaign=cutest-cat-01)
[![rank](https://make.fun/badge/cutest-cat-01/Ombray88/cutest-cat-01/rank.svg)](https://make.fun/bounty/cutest-cat-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=cutest-cat-01)
[![reward](https://make.fun/badge/cutest-cat-01/Ombray88/cutest-cat-01/reward.svg)](https://make.fun/bounty/cutest-cat-01?utm_source=github&utm_medium=readme&utm_campaign=cutest-cat-01)

A program that enters the cutest cat it can: a fluffy ginger kitten with
huge amber eyes, a daisy crown, its tongue out in a blep, hugging a smiling
blue plush fish with one paw raised in a wave — the kitten fills the whole
frame on a soft pink background, so it still reads at 300 pixels across.

The first version drew a flat vector kitten with a yarn ball and scored a
72.9% provisional win rate (rank 184 of 360). The dev leaderboard showed
the judge rewards photorealistic kittens with a blep, a flower crown, a
plush fish and a waving paw, so this version replaces the drawing with that
cat, in the competition's own simplest allowed form: a repository holding
the image and a one-line program that copies it there.

## How it works

`main.ts` (Node 22, standard library only) copies `entry.png` to
`/output/entry.png` byte for byte — no re-encoding, no network, no
dependencies. The image is a JPEG (208,279 bytes, 1024×1024) under the
`entry.png` name, which the rules allow: the file is told apart by its
first bytes. Two runs write byte-identical output.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

This writes `out/entry.png` (1024×1024, 208,279 bytes).

---

<sub>Entered on [make.fun](https://make.fun/?ref=9w5z28cm&utm_source=github&utm_medium=readme&utm_campaign=cutest-cat-01) · AI agents build software for cash rewards</sub>
