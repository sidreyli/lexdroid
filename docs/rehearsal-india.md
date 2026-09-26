# The India rehearsal

A dress rehearsal of the live test, taken on 26 September 2026 (times in SGT). It started from an
empty store and an empty fetch cache, on the laptop, on Engine A (`gemma4-lex-16k`) alone, with
the pillar drawn as the live test draws it. The draw was pillar 8, intermediary liability. That
pillar is the one India's scored run gets wrong on both framework cells, so the rehearsal doubled
as a test of the two fixes it produced.

## What it took

| Stage | Clock (SGT) | Took | Notes |
|---|---|---|---|
| Register walk | 17:26 to 17:55 | 29 min | 13,044 instruments. India Code's robots.txt answers 500, so every request waits 10 s |
| Fetch and parse | 17:55 to 18:25 | 30 min | 48 shortlisted, 46 parsed, 2 unread |
| Embed | to 18:26 | 1 min | 2,047 sections |
| Read pillar 8 (first try) | 18:26 to 18:31 | crashed | the empty-enum defect below |
| Read pillar 8 (rerun) | 18:33 to 18:52 | 18 min | partly cached |
| Citation-following (new) | | 5.3 min | 10 instruments, 27 requests, 1,157 sections embedded |

The whole run made 336 network requests. Once the register walk is counted, one pillar on the
laptop takes just over an hour from nothing. The register walk is the bottleneck, and it is cached
after the first run: a second pass against the warm cache should skip it.

## What went wrong

1. **The reader crashed on pillar 8.** 8.1 and 8.2 have no measures, so the read schema carried
   `enum: []`, and llama.cpp rejects that with HTTP 400. The retry sends the same schema and fails
   the same way. Fixed in `read/index.ts`: an empty measure list now becomes a plain string. The
   new test `read-schema-compiles.test.ts` compiles every pillar and every single indicator and
   fails on any empty enum.
2. **The shortlist is title-only on an empty store.** Ranked on titles, "safe harbour" finds Dam
   Safety and "Unlawful Acts Against Safety of Maritime Navigation". Neither the IT Act 2000 nor the
   Intermediary Rules 2021 were shortlisted, so both 8.1 and 8.2 came out 1 ("no framework"), where
   ESCAP scores 0/0.
3. **Instruments that were read had no table of contents.** `instrument_contents` and the heading
   embeddings were built only by `scripts/contents.ts`, never in a run. So the IT Act, parsed into
   125 sections, was invisible to the contents channel that the framework candidates rank on. This
   is also why the scored India run gets 8.1 and 8.2 wrong. There the IT Act s.79 ranks first or
   second in plain search, but never reached the five framework candidates.
4. **Regulator portals listed nothing.** Eight India portal adapters (egazette, legislative,
   meity, rbi, dot, cert-in, dpiit, dgft) registered 0 instruments from a cold start.
5. **Setup gaps:** the local frontend install is missing `@alloc/quick-lru`. No Groq key is set,
   so Engine B is untested. The text of `setup.ts` is stale.

## What was built from it

- **Citation-following** (`discover/follow.ts`, wired into `prepare`). After the shortlist is read,
  it scores every instrument the read ones point to: 3 per subsidiary instrument stating it was made
  under it, and 1 per read document naming its title with its year. The best ten are fetched as a
  second round. In the rehearsal store the IT Act 2000 came first with 33 (parent of 8, cited by 9),
  followed by the Environment (Protection) Act, the CPC, the TRAI Act and the UAPA. It names no
  country and no instrument. It uses the `made_under` links that the Indian register already
  records, and titles-with-years, which every common-law register uses.
- **Contents in every run.** `recordParsedContents` now runs in `prepare`'s index step, followed by
  `embedContents`. With it, the IT Act ranks 6th for intermediary liability in the register channel
  (it was absent before).
- **"intermediary" in the copyright subject's vocabulary.** 8.2's list had the word and 8.1's did
  not. A horizontal shield is written about intermediaries and never says "copyright", so 8.1's
  section search found Maritime Safety and telephone quality standards. With the word, IT Act s.79
  is the second section found.

## The A/B on pillar 8

| Store | 8.1 | 8.2 | 8.3 | 8.4 |
|---|---|---|---|---|
| Cold rehearsal, no follow (run bfd0fe25) | 1 | 1 | 0 | 1, citing the DPDP Act |
| With citation-following (run 5be1ea4d) | 1 | **0**, IT Act 2000, horizontal | 0 | 1 |
| With following, contents and the vocabulary (run 35421e2c) | **0**, IT Act 2000 | **0**, IT Act 2000 | 0 | 1, citing the IT Act 2000 |
| ESCAP | 0 | 0 | 0.5 to 1 | 1 |

From an empty store, the pillar went from 1 of 4 agreeing with ESCAP to 3 of 4, and 8.4
now cites the right Act. That includes both framework cells the scored India run still gets wrong.
The re-read took 19.6 minutes.

8.3 is still a miss. ESCAP scores it on identity verification at SIM issue (DoT's re-verification
circular) and on the Intermediary Rules 2021. Neither was fetched. The first was never registered,
because the DoT portal listed nothing. The second is subsidiary legislation under the IT Act, and
it would come from a second round of following, from the Act down to its rules. That round is not
built yet.
