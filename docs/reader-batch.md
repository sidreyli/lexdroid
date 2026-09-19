# Reader-side fixes, batched for one run

A decision-side fix is graded against banked readings in seconds. A reader-side fix changes what
the engine is asked, so nothing can be graded until the economy is read again: about 10 hours for
Malaysia and 27 for all three on the laptop GPU. So every reader-side change waits here, and they
all go into one run.

That run is due anyway. The Malaysian re-parse of 19 September 2026 changed the sections the
readings stand on: 3,681 sections recovered from bilingual instruments, Schedules separated from
the sections they used to overwrite, and 6,211 empty arrangement stubs removed. To finish before the
30 September freeze with room to grade, it has to start by 27 September.

Each rule is one sentence and names no country and no instrument.

| # | Cells | What is wrong | Rule | Where |
| :-- | :-- | :-- | :-- | :-- |
| 1 | 3.1, 9.4 | Both exceptions remove a finding by its sector, and the reader is allowed to leave `sector` null, so the exception silently does not apply. | A finding whose scope is specific names the sector in the instrument's words, and one that names none is held rather than scored. | `src/read/index.ts`, schema `required` and the normaliser |
| 2 | 9.1, 9.3, 12.2 | Each exception turns on what the measure is aimed at (political content, misleading advertising, alcohol and tobacco), and no field records that. | The reader states what content, product or conduct the measure is aimed at, quoted from the provision, so a stated exception can remove it. | `src/read/index.ts` new `targetWords` field, then `applyException` in `src/decide/index.ts` (decision-side, free once the field exists) |
| 3 | 8.3 | `sim-registration` asks for the identity to be *recorded*, and the instruments that impose it say *verified* or *confirmed*, so the confirmation pass refuses them and the 0.5 band cannot be reached. | A measure defined by an act on the subscriber's identity is met by any act that establishes it before service: recording, verifying or confirming. | `src/rubric/measures.ts`, `sim-registration` `defines` and `gloss` |
| 4 | 4.5 | `fair-use-exception` says "fair dealing as an open category", but fair dealing is usually a closed list of purposes, so the two measures overlap and the reader splits one provision between them. | An exception is open when any use may be weighed against stated factors, and qualified when it is confined to named purposes, whatever the statute calls it. | `src/rubric/measures.ts`, both 4.5 measures' `defines` and `gloss` |
| 5 | every MYS cell | A bilingual instrument now holds each provision twice, once per language, and nothing in retrieval knows that, so one provision can be read, cited and counted twice. | Where an instrument states a provision in more than one official language, retrieval reads the copy in the rubric's language and takes the other only when it is the only copy. | `src/retrieve/index.ts`, using `section.language` |
| 6 | 11.4 | Already done: the reworded `defines` is committed (`107fd58`) and takes effect on the next run. | | |

## Known, and not in this batch

- The domain gates in `src/rubric/measures.ts` are English words. A provision held only in Malay
  can be read but cannot pass them. Item 5 keeps this from mattering for bilingual instruments; a
  Malay-only instrument is still gated out. Decision-side, and it can be fixed after the run.
