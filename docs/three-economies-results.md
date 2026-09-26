# Mongolia, Russia, Lao PDR: first scored run

*27 September 2026, branch `russia-mongolia-laopdr`, after merging master (`cdbde5b`).*

## What was run

- **Run:** `f05a3336`, Engine A (`gemma4-lex-16k`) on one rented RTX PRO 4500.
- **Scope:** pillars **6 and 7**, all three economies. 6 units, 27 cells, 397 findings.
- **Rent:** $1.89.
- **Retrieval:** bge-m3 dense, plus keyword search in each economy's language (two phrasings per
  question). English questions are asked of the vectors only.

Pillar 5 was attempted and failed, because the SSH tunnel died with the session. It was not
retried, since Telecom is the weakest pillar on the other five economies too.

Graded against ESCAP's Round 2 database (`scorecard --run f05a3336…`, which now reads Round 2).

## Result: 13 / 27 agree (48%)

| Pillar | MNG | RUS | LAO |
|---|---|---|---|
| 6 Cross-border data | 2/4 | 2/4 | 2/4 |
| 7 Data protection | 1/5 | **4/5** | 2/5 |
| **Total** | 3/9 | **6/9** | 4/9 |

**Agree:**
- RUS 6.1, 6.4, 7.1, 7.3, 7.4, 7.5
- MNG 6.1, 6.2, 7.1
- LAO 6.1, 6.3, 7.3, 7.4

The same readings scored 10/27 before today's fixes. All fixes were re-scored from banked readings
(`replay` / `rescore`), with no engine.

## Fixed today (language, scoped to Cyrillic and Lao text)

- **English word lists.** "Information", "place", "nationality" and "duration" now have
  ru/mn/lo stems (`decide/index.ts`). 152-ФЗ Art. 12 had been held for "персональных данных".
- **Framework rules copied nearly verbatim.** A Cyrillic or Lao rule copied at ≥92% of its
  characters in order is matched, and the source's own words are kept (`util/locate.ts`
  `locateNearQuote`, `read/index.ts` `sourceWords`). MNG's Personal Data Protection Law had failed
  on two Latin letters inside a Cyrillic word.
- **Framework titles.** `FRAMEWORK_TITLE_DOMAIN` now names the subject in ru/mn/lo. Without it,
  "О персональных данных" was taken as off-subject and 7.1 abstained.
- **Guard.** English economies are untouched: every change is gated on Cyrillic or Lao script, or on
  an economy having a translation table (`test/new-economies-leave-english-alone.test.ts`).

## Still wrong, and why (for Sid)

**Retrieval or reading misses:**
- **RUS 6.3.** 152-ФЗ Art. 18(5), the database-localisation rule, ranks just below the read cut.
- **MNG 6.4.** ESCAP cites Art. 14 of the Personal Information law (transfer abroad).
- **MNG 6.3.** Same law, Art. 20.

**Reading judgements (over-claims), not language:**
- MNG 7.5 rests on the Constitution's right to seek information.
- LAO 7.5 rests partly on the English text of the Payment Systems law.
- MNG 7.4 and LAO 6.2 are also over-claims.

**Contestable on ESCAP's side:** MNG 7.3 is scored 1 while ESCAP's own note says "no specific
minimum retention period is set". Worth a ★ in the disagreements log.

**Lao OCR:**
- LAO 7.1: the Electronic Data Protection Law's rule sits in OCR text with page debris inside the
  sentence. The reader condensed it (66% character match), so it stays unverified. That is correct
  behaviour.
- LAO 7.2 and RUS 7.2 are framework reach calls (0.5 vs 0).

## What to declare

Declare the strong cells and leave out the weak ones:

| Economy | Declare | Notes |
|---|---|---|
| **RUS** | pillar 7, and 6.1 and 6.4 | 7.2 is contestable |
| **MNG** | 6.1, 6.2, 7.1 | |
| **LAO** | 6.1, 6.3, 7.3, 7.4 | |

The weak cells to leave out, or hand to Sid's rules, are MNG and LAO 7.5 and the 6.3 / 6.4 misses.

## Engine B

Master declares **Qwen 3.8 27B on a rented RunPod GPU** (open weights). This branch had moved it to
Gemini Flash, because Groq's free tier could not read. The merge took master's Qwen. Confirm before
the 30 September freeze.

## Cost

Runpod total is about $9.65:
- ≈$1 of setup and the smoke test;
- $1.89 for this run;
- ≈$1.86 for the failed pillar 5 attempt;
- the remainder was idle time on a pod left running. That is a lesson recorded, not a cost of the
  method.
