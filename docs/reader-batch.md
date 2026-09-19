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

**Status, 19 September 2026: all six are implemented** and tested (`test/reader-batch.test.ts`).
Replaying the latest Malaysian and Australian runs before and after gives the same cells, as it
should: each acts on what the next run asks the reader, so nothing changes until that run.

| # | Cells | What is wrong | Rule | Where |
| :-- | :-- | :-- | :-- | :-- |
| 1 | 3.1, 9.4 | Both exceptions remove a finding by its sector, and the reader is allowed to leave `sector` null, so the exception silently does not apply. | A finding whose scope is specific names the sector in the instrument's words, and one that names none is held rather than scored. | `src/read/index.ts`: `sector` required in the schema, and `rejectionFor` holds a specific scope with no sector |
| 2 | 9.1, 9.3, 12.2 | Each exception turns on what the measure is aimed at (political content, misleading advertising, alcohol and tobacco), and no field records that. | The reader states what content, product or conduct the measure is aimed at, quoted from the provision, so a stated exception can remove it. | `src/read/index.ts`: `targetWords`, verified in the provision, and `withinException`; `applyException` in `src/decide/index.ts` excludes only with both |
| 3 | 8.3 | `sim-registration` asks for the identity to be *recorded*, and the instruments that impose it say *verified* or *confirmed*, so the confirmation pass refuses them and the 0.5 band cannot be reached. | A measure defined by an act on the subscriber's identity is met by any act that establishes it before service: recording, verifying or confirming. | `src/rubric/measures.ts`, `sim-registration` `defines` and `gloss` |
| 4 | 4.5 | `fair-use-exception` says "fair dealing as an open category", but fair dealing is usually a closed list of purposes, so the two measures overlap and the reader splits one provision between them. | An exception is open when any use may be weighed against stated factors, and qualified when it is confined to named purposes, whatever the statute calls it. | `src/rubric/measures.ts`, both 4.5 measures' `defines` and `gloss` |
| 5 | every MYS cell | A bilingual instrument now holds each provision twice, once per language, and nothing in retrieval knows that, so one provision can be read, cited and counted twice. | Where an instrument states a provision in more than one official language, retrieval reads one copy, the one in the rubric's language, and the row says it quotes a translation wherever the profile names the other language as authoritative. | `otherLanguageCopies` in `src/retrieve/index.ts`; `authoritativeLanguage` in the profile, and `translationNote` in `src/export/index.ts` |
| 6 | 11.4 | Already done: the reworded `defines` is committed (`107fd58`) and takes effect on the next run. | | |

## Also fixed, decision-side

- The measures' names and the domain gates are English words tested against words copied from the
  provision, so a Malay provision failed them whatever it said, and the failure was recorded as
  evidence for a zero. Rule: where a word list in the rubric's language fails on a provision in
  another language, the finding is held, not ruled out. `otherLanguage` in `src/decide/index.ts`.
