# Expanding from two pillars to twelve

*Rewritten 9 September 2026, replacing an earlier draft whose scoreboard and diagnosis were both
wrong. Every claim here is measured; the command that measures it is named.*

---

## Where we actually are

27 cells answered — pillars 6 and 7, across Australia, Malaysia and Singapore. Against ESCAP's own
answers, read by each indicator's own scoring ladder: **23 of 27 exact, 27 of 27 within one band.**
Malaysia and Singapore are 9 of 9. Australia is 5 of 9, and all four differences are one band.

156 cells remain: 61 regulatory indicators × 3 economies, less the 27 done. Measured cost is about
four minutes and seven cents a cell, so the whole remainder is roughly eleven hours on one machine
and twelve dollars.

## What the audit of the ruler found

**Thirteen indicators score their maximum for the absence of something.** A retrieval miss on one
of them did not cost a zero — it produced a confident 1. Only two had ever been exercised. The
absence now has to be said about an instrument the reader found this pillar's requirements in;
without one the cell is unresolved. `npm run -w backend audit-rules` prints the thirteen.

**Every scoring ladder is reachable except one.** Across all 54 written rules, exactly one band can
never be returned: 5.1's middle band, "passive sharing is not mandated, but it is practiced in the
market", which is a fact about the market and not about any provision. 3.4's top band has the same
shape. Both are ceilings on what a reader of law can score, and they are stated rather than worked
around. `npm run -w backend audit-bands` prints the ladders.

**We were reading ESCAP's answers wrongly.** Their database is one row per measure, each scored as
that measure alone would score, and we resolved several rows by taking the highest. That is wrong
in both directions. On an indicator whose top band is an absence, the highest row is the one that
found nothing — Malaysia 8.2 has rows 0 and 1, and their own 0 row cites the framework. On an
indicator that escalates on count, two middle rows are the top band by their own sentence — Malaysia
6.2's two sectoral storage duties are a 1, not a 0.5. Fixing this moved two cells and dissolved a
defect we had been carrying: on 7.1, ESCAP's own row says Malaysia's framework is comprehensive,
which is what we said.

## What the audit of the reader found

For Australia 6.1, 130 provisions were read and 43 came back as applying. Of those 43, **four both
impose a duty and quote words stating a place** — and three of the four are the right ones. The
score is not polluted: the scorer holds the other 39, because pillar 6's measures declare that they
are defined by *where* something must be, and a provision naming no place has not made one out.

That is the house remedy, and it is declared for **11 of the 74 measures**. The other 63 — forty
indicators' worth — have no defining element at all, so a provision can be labelled with them on
resemblance alone. Pillars 6 and 7 are well defended precisely because they are the ones we ran.

## The order of work

1. ~~Make the ruler trustworthy.~~ Done: the absence guard, the band sweep, the aggregation fix.
2. **Give every measure a defining element.** Written, not yet confirmed. All 74 measures now
   declare, in the words a statute would use, the one thing a provision has to say to be that
   measure; the reader is shown it beside the measure and answers it as `definingWords`; the
   answer is checked against the provision like every other quote; and a measure whose words are
   absent is held rather than scored. The engine cache keys on the prompt, so it invalidated
   itself. What remains is the confirming run of the 27 known cells.
3. ~~Close the seven indicators with no scoring rule.~~ Done, and the last band in the rubric is
   now reachable. 3.1, 5.2 and 12.01 climb one foreign-equity ladder from three different rungs,
   and the rung is the measure the reader names -- not a percentage parsed out of prose, because
   "not less than 70% held by citizens" and "not more than 30% held by a foreigner" are the same
   rule stated from opposite ends. 12.5 compares a customs threshold with 200 USD on a rate fetched
   from the European Central Bank at the start of the run, recorded on the run and replayed by
   verification, so a score re-derived next month reproduces rather than re-prices. 3.4 and 9.1 are
   scored as far as law shows them, with 3.4's top band -- a case where screening actually blocked
   an investment -- declared out of reach beside 5.1's. 5.3 is declared not answerable from law at
   all: it scores the shares a government holds in telecom companies, which is a fact about a share
   register. `npm run -w backend audit-bands` reports 0 problems.

   One defect fell out of writing it. A band that scores the absence of something was reporting
   that absence even when a provision of exactly that kind had been read and held -- a customs
   threshold stated in money the run had no rate for was becoming "no de minimis". The absence
   guard now needs both a governing instrument and nothing held under the indicator's own
   measures.
4. **Pilot one pillar end to end.** Pillar 10 or 11: four indicators, every vocabulary present, a
   full baseline, twelve cells, about a dollar.
5. **Widen in waves**, ordered by how much is already defended: 1, 2, 10, 11, 4 first, then 8, then
   3, 5, 9, and pillar 12 last because it is fifteen indicators.
6. **Weights and the composite**, once every cell has an answer.

## Two things the earlier draft got wrong, recorded so they are not repeated

**"Australia is a retrieval failure."** It is not. For 6.1, the Act ESCAP cites was retrieved, read,
and produced the exact right quote. Nothing was missed.

**"Deepen the corpus and raise the retrieval depth."** This would make the system worse. The reader
is already over-producing by an order of magnitude; handing it more instruments multiplies the
wrong answers before it adds a right one.
