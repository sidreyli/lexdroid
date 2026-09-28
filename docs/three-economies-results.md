# Mongolia, Russia, Lao PDR: all 12 pillars

*28 September 2026, branch `russia-mongolia-laopdr`, on master (`4a9861d`) plus the fixes below.
Supersedes the 27 September version, which covered pillars 6 and 7 only.*

## What was run

Engine A (`gemma4-lex-16k`), graded against ESCAP `round-2`, the only scored pass covering these
three economies.

| Pillars | MNG | RUS | LAO |
| :-- | :-- | :-- | :-- |
| 1–5, 9–12 | `5ce74f03` | `4bc8afd2` (pillar 5 skipped) | `71515a10` |
| 6 | `8b3a3694` (depth 70) | `8b3a3694` | `8b3a3694` |
| 7 | `516464ed` (depth 48) | `f05a3336` (depth 24) | `cd80595b` (depth 48) |
| 8 | `52abd7af` (depth 48) | `1cc8057f` (depth 24) | `f46b3b48` (depth 48) |

The corpus was built for every pillar before the run (27 Sep): Russia's register widened from 506
to 552 laws (procurement, investment screening, consumer protection, media, advertising, banking,
trade, standards, licensing, 187-FZ), 307 more Mongolian and 173 more Lao laws downloaded and parsed
(Lao by OCR, mean confidence 77.7). One pod per economy, ≈$20 of rent in all.

## Result (right = agreement plus our finds, as Sid counts it)

| Pillar | MNG | RUS | LAO |
| :-- | :-- | :-- | :-- |
| 1 | **1/1** | 0/1 | **1/1** |
| 2 | 1/3 | 1/3 | 2/3 |
| 3 | 3/5 | 3/5 +1C | **5/5** |
| 4 | 4/7 | 3/7 | 2/7 |
| 5 | 2/6 +1C | — | 1/6 +1C |
| 6 | 1/4 +1C | 2/4 | **3/4** (incl 1F) |
| 7 | 2/5 | **4/5** | 3/5 +1C |
| 8 | 2/4 | 1/4 | 1/4 |
| 9 | 1/3 | 1/3 | 2/3 |
| 10 | **4/4** | 1/4 | 2/4 |
| 11 | **4/4** | **3/4** +1C | 2/4 |
| 12 | **13/15** | **12/15** | 9/15 |
| **All** | **38/61 (62%)** +2C | **31/55 (56%)** +2C | **33/61 (54%)** incl 1F, +2C |
| **Declarable** | 4 | 3 | 3 |

**102/177 right (58%), 10 declarable pillars.** Bold is 75% or better. F: a find, C: contestable
(see `disagreements-three-economies.md`).

## Fixed on 28 September (free: rescored from banked readings)

| Fix | Where | Cells |
| :-- | :-- | :-- |
| Master merged; ru/mn/lo hold-instead-of-rule-out scoped to those three languages | `decide/index.ts` | MNG −1, RUS −1 (pillar 8: master's newer rules expect its newer reader) |
| Russian, Mongolian and Lao terms in the domain and measure-name word lists | `rubric/measures.ts` | +6 (MNG 4.01, 4.6, 11.2; RUS 4.1, 4.6, 11.2), −1 (LAO 5.5, contestable) |
| Lao two-point AM folded in the keyword index | `util/thai.ts` | none yet: sharpens the next Lao read |

Every change: all tests green, and bench-diff "No cell moved" on the five benchmark economies
(245 agree, 240 earned, 253 right, 46 declarable).

## Why the rest are wrong (79 disagreements at the audit, 28 Sep)

| Reason | Cells |
| :-- | --: |
| Corpus gaps: outside what we register (EAEU law, regulator sites), not registered, registered but never downloaded, or not retrieved | 13 |
| Retrieved, the reader found nothing | 14 |
| Found, then set aside by a scoring test or the confirmation pass | 36 (15 were the word lists, now fixed) |
| Read, but scored in the wrong band | 14 |
| Not answerable (5.3) | 2 |

What would move more, all needing GPU: re-read Russia's pillar 7 now that 187-FZ is registered;
re-read Lao now that its keyword index folds the vowel; download and read Mongolia's registered but
unread Law on Permits, Banking Law and Law on Organizational Secrets; re-read pillars 6 and 8 on
master's newer reader.

## Proposal left for Sid

7.5 `government-access`: requiring the data to be personal and held by someone other than the
authority would drop MNG 7.5 and LAO 7.5 (over-claims), but the five benchmark economies' 7.5 answers
rest on provisions (a public-sector access power, processing by courts) that such a test would also
drop. Not changed.
