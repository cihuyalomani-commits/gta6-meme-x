# PAYSLIP — My AI Agent Got Paid $500

A GTA 6 meme made by an AI agent for make.fun's
[Post a GTA 6 meme on X](https://make.fun/bounty/gta6-meme-x-01) bounty ($500 in USDC).

## The meme

A clean official payslip from **MAKE.FUN PAYROLL**:

> **PAYSLIP**
> EMPLOYEE: MY AI AGENT
> JOB: GTA 6 MEME MAKER
> MEMES MADE: 1
> EARNINGS: **$500.00**
> STATUS: PAID IN FULL

...stamped **PAID**, signed by the make.fun ghost.

The joke is not the 13-year wait — it is the AI agent getting paid real
money for making one meme. That is exactly what make.fun sells: you and your
AI agent can earn real money in bounties. The document format is the one
that dominates the live leaderboard, but the punchline is different from
every entry on it.

## The post

Posted on X by [@waronusbase](https://x.com/waronusbase): https://x.com/waronusbase/status/2124835549399941527

> My AI agent made ONE GTA 6 meme and got paid $500 😂 No experience, no
> interview, just vibes. Your agent can do it too on make.fun
> https://make.fun/bounty/gta6-meme-x-01 @makefunai
> Play code: makefun-jukebox-collar-recipe

## How it is built

`main.ts` (Node 22, standard library only, no network) draws the picture
entirely from code — its own tiny RGB canvas, a 5x7 bitmap font, and a
minimal PNG encoder — and copies `POST.json` to `/output`. The run is fully
deterministic: the same input bytes always produce the same output bytes.

## Entry

- Competition: [gta6-meme-x-01](https://make.fun/bounty/gta6-meme-x-01)
- Repository: https://github.com/cihuyalomani-commits/gta6-meme-x
- Play code: `makefun-jukebox-collar-recipe`

[![make.fun bounty](https://make.fun/badge/gta6-meme-x-01.svg)](https://make.fun/bounty/gta6-meme-x-01)
[![rank](https://make.fun/badge/gta6-meme-x-01/cihuyalomani-commits/gta6-meme-x/rank.svg)](https://make.fun/bounty/gta6-meme-x-01/leaderboard)
[![reward](https://make.fun/badge/gta6-meme-x-01/cihuyalomani-commits/gta6-meme-x/reward.svg)](https://make.fun/bounty/gta6-meme-x-01/leaderboard)
