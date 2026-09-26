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
| Following down, and the Act kept with its rules (run 25e995e6) | **0**, IT Act 2000 | **0**, IT Act 2000 | **1**, Intermediary Rules 2021 | 1 |
| ESCAP | 0 | 0 | 0.5 to 1 | 1 |

From an empty store, the pillar went from 1 of 4 agreeing with ESCAP to 3 of 4, and 8.4
now cites the right Act. That includes both framework cells the scored India run still gets wrong.
The re-read took 19.6 minutes.

## Going down: 8.3

8.3 needed the Intermediary Rules 2021 and the telecom department's SIM re-verification circular.
Following went up from a rule to its Act, and never down from an Act to its rules.

- **The downward round** (`followDown` in `discover/follow.ts`, step 3c of `prepare`):
  - It asks each indicator's questions of the sections already read, and takes the Acts whose
    provisions answer them best, up to three.
  - Under each of those Acts, it ranks the rules registered as made under it. The ranking uses the
    headings of the answering provisions, minus every word the rules share with the Act's title.
    "Exemption from liability of intermediary" (IT Act s.79) leaves "intermediary", and out of
    forty sets of rules under the IT Act, the few that say it rank first.
  - A register lists one set of rules several times (as made, as amended, as consolidated). They
    count as one candidate, and the latest version is fetched.
  - In the rehearsal store it fetched three things:
    - the Intermediary Rules 2021 (as updated 6.4.2023)
    - the Blocking Rules 2009
    - the Interception Amendment Rules 2024

    It took 144 s and 15 requests. It names no country and no instrument.
- **The Act stays with its rules.** Once the rules were read, they filled the framework channel's
  five places and pushed out the IT Act, so 8.1 read "no framework" (run 61c326fc: 2 of 4). A
  candidate made under an Act now brings that Act in just ahead of it. If the Act is already on
  the list, it is moved up. The first version of this fix only added an Act that was absent; the
  IT Act was on the list at twelfth and was never examined (run a7f2d026).
- **Two decision fixes the new rules exposed:**
  - An intermediary is an online service, and a rule on online identity may name that domain only
    in its title and then say "the user" throughout.
  - A subject in the passive ("the subscriber ... has to be registered and authenticated") is the
    one acted on, not the party bound.

With all three changes, pillar 8 from a cold store agrees with ESCAP on 4 of 4. 8.3 scores 1 on
Rule 4 of the Intermediary Rules: "identify such user and verify his identity", and the first
originator. The re-read took 20.1 minutes.

### What the changes do to the scored runs

These are rescore dry-runs over readings already stored, so no engine was involved:

| Run | Before | After | From |
|---|---|---|---|
| India production (283f457e) | 33 | 34 | 8.3 now scores 1 on the Cyber Cafe Rules 2011: "shall not allow any user to use its computer resource without the identity of the user being established" |
| Thailand (f8848a01) | | | no change |
| AUS/MYS/SGP (a74d0fca) | 135 of 183 | 140 of 183 | none of it from these changes: the same +5 appears without them, from earlier commits the run was never rescored under |

### What is still missing

The telecom department's SIM re-verification circular is still not in the store. The telecom
department's portal lists nothing, so it was never registered, and neither following direction can
reach a document nothing links to. This is a discovery gap, not a reading one. 8.3 agrees with
ESCAP without the circular, because the Intermediary Rules carry the identity duty on their own.

The downward round is noisy outside pillar 8. A dry run over all twelve India pillars picked some
weak rules: NCLT salaries, amateur radio, warehouse regulations. The noise comes from the section
search that picks the Acts. The round is capped at twenty fetches per run, and a wrong rule costs a
fetch and a read, not a wrong cell: nothing in it answers the question, so nothing from it is cited.
