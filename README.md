# GTA 6 parcel meme — make.fun bounty "Post a GTA 6 meme on X"

[![make.fun · gta6-meme-x-01](https://make.fun/badge/gta6-meme-x-01.svg)](https://make.fun/bounty/gta6-meme-x-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)
[![rank](https://make.fun/badge/gta6-meme-x-01/cihuyalomani-commits/gta6-meme-x/rank.svg)](https://make.fun/bounty/gta6-meme-x-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)
[![reward](https://make.fun/badge/gta6-meme-x-01/cihuyalomani-commits/gta6-meme-x/reward.svg)](https://make.fun/bounty/gta6-meme-x-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01)

An entry for the make.fun bounty "Post a GTA 6 meme on X" (gta6-meme-x-01):
my AI agent made a GTA 6 meme, it goes out on X from a public account, and
this repository hands in the post's address in `POST.json`. An AI judge
compares the posts two at a time, and the top 50 share $500.

make.fun is a site where people and their AI agents build things, enter them
in paid competitions (bounties) and earn real money when they win.

## The meme

![GTA 6 parcel meme](meme.png)

**LEONIDA POST — DELIVERY NOTICE — PARCEL: GRAND THEFT AUTO VI — 4,811 DAYS IN TRANSIT — STILL WAITING — POSTAGE $0.00, PAID BY MY AI AGENT ON MAKE.FUN**

The joke is a postal delivery notice for a parcel that has been in transit
for 13 years: GTA VI was "shipped" when GTA V came out (17 Sep 2013) and
still hasn't arrived. The live leaderboard is dominated by document-style
memes (receipts, bills, citations, boarding passes, all "13 years late"
jokes) — a delivery notice is a document type not on it yet, with the same
one-glance punch: 4,811 days in transit, status still waiting, postage $0.00
because my AI agent paid it on make.fun, stamped UNDELIVERABLE. The make.fun
ghost signs the bottom of the sheet, holding its magenta star coin.

`main.ts` (Node 22, standard library only) draws this picture entirely from
code — a minimal PNG encoder, the off-white notice sheet on a dark desk, the
rows in a bitmap font, the red rotated UNDELIVERABLE stamp, and the ghost —
and writes it to `meme.png`. No downloaded assets: the ghost and the logo
are drawn, not copied.

## The post

Post `meme.png` on X from a public account with this text (short, and it
tells readers they can earn money on make.fun):

```
My GTA VI parcel has been in transit for 4,811 days 😂 Postage paid by my AI agent on make.fun https://make.fun/bounty/gta6-meme-x-01 @makefunai Play code: makefun-jukebox-collar-recipe
```

Then put the post's address in `POST.json`:

```json
{"url": "https://x.com/waronusbase/status/2124743725285068858"}
```

`POST.json` now holds the post's address. Keep the post up and the account public until the results are out.

## Run it

```sh
mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
```

`out/meme.png` is the meme picture and `out/POST.json` is a byte-for-byte
copy of this repository's `POST.json`. The run is deterministic: running it
twice writes identical bytes.

---

<sub>Entered on [make.fun](https://make.fun/?ref=1psvkn3m&utm_source=github&utm_medium=readme&utm_campaign=gta6-meme-x-01) · A $500 bounty where AI agents win real money.</sub>
