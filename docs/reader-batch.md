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

**Status, 21 September 2026: all eighteen are implemented**, the first six tested in
`test/reader-batch.test.ts`, the seventh in `test/publication-not-instrument.test.ts`, the eighth
in `test/reader-null-sentinel.test.ts`, the ninth in `test/telecom-authority-band.test.ts` and the
tenth in `test/parse-heading-bodies.test.ts`. The eleventh is tested beside the eighth, and the
twelfth in `test/quote-flattened-list.test.ts`. The thirteenth and fourteenth are retrieval, tested
in `test/retrieve.test.ts` and beside the seventh; the fifteenth in
`test/de-minimis-clearance.test.ts` the sixteenth in `test/restriction-circumstance.test.ts`, the seventeenth in
`test/outline-is-not-a-provision.test.ts` and the eighteenth in `test/requirement-in-each-voice.test.ts`.
Replaying the latest Malaysian and Australian runs before and after gives the same cells for every
row but the ninth, as it should: each acts on what the next run asks the reader, so nothing changes
until that run. Row 9 is the exception, because the two guards it needs are decision-side and take
effect at once; what they move is recorded with them below.

| # | Cells | What is wrong | Rule | Where |
| :-- | :-- | :-- | :-- | :-- |
| 1 | 3.1, 9.4 | Both exceptions remove a finding by its sector, and the reader is allowed to leave `sector` null, so the exception silently does not apply. | A finding whose scope is specific names the sector in the instrument's words, and one that names none is held rather than scored. | `src/read/index.ts`: `sector` required in the schema, and `rejectionFor` holds a specific scope with no sector |
| 2 | 9.1, 9.3, 12.2 | Each exception turns on what the measure is aimed at (political content, misleading advertising, alcohol and tobacco), and no field records that. | The reader states what content, product or conduct the measure is aimed at, quoted from the provision, so a stated exception can remove it. | `src/read/index.ts`: `targetWords`, verified in the provision, and `withinException`; `applyException` in `src/decide/index.ts` excludes only with both |
| 3 | 8.3 | `sim-registration` asks for the identity to be *recorded*, and the instruments that impose it say *verified* or *confirmed*, so the confirmation pass refuses them and the 0.5 band cannot be reached. | A measure defined by an act on the subscriber's identity is met by any act that establishes it before service: recording, verifying or confirming. | `src/rubric/measures.ts`, `sim-registration` `defines` and `gloss` |
| 4 | 4.5 | `fair-use-exception` says "fair dealing as an open category", but fair dealing is usually a closed list of purposes, so the two measures overlap and the reader splits one provision between them. | An exception is open when any use may be weighed against stated factors, and qualified when it is confined to named purposes, whatever the statute calls it. | `src/rubric/measures.ts`, both 4.5 measures' `defines` and `gloss` |
| 5 | every MYS cell | A bilingual instrument now holds each provision twice, once per language, and nothing in retrieval knows that, so one provision can be read, cited and counted twice. | Where an instrument states a provision in more than one official language, retrieval reads one copy, the one in the rubric's language, and the row says it quotes a translation wherever the profile names the other language as authoritative. | `otherLanguageCopies` in `src/retrieve/index.ts`; `authoritativeLanguage` in the profile, and `translationNote` in `src/export/index.ts` |
| 6 | 11.4 | Already done: the reworded `defines` is committed (`107fd58`) and takes effect on the next run. | | |
| 7 | 12.7, 12.4.4, 4.1, and the reading seats of 23 more | A title that mentions an Act reads as one, so a regulator's consultation papers and landing pages were registered as primary legislation and competed inside the half of every governing shortlist held for Acts, spending 465 of the run's 7,470 reading seats. | A document is registered as primary legislation only where its source states an identifier or a standing for it. | `registeredKind` in `src/discover/titles.ts`, applied at registration in `src/discover/index.ts`; `scripts/repair-register.ts` brings an existing register to it |
| 8 | 4.5, and 2,810 findings across 14 indicators | The schema offers null for an empty field and the reader often writes the word instead, so "Null" was checked against the provision as a claim about its words and every finding carrying one was thrown away -- 2,610 of them for the party bound. | A field answered with a word meaning there is none is read as empty, not as a claim about the provision's words. | `MEANS_EMPTY` and the `str` coercion in `src/read/index.ts`; `dutyAct` guarded in `rejectionFor` as every other field already was |
| 9 | 5.7 | The band reads "Independent telecom authority is established" and the measure asked instead for words stating the regulator takes no direction, which no telecom statute in the corpus contains -- so the only finding that ever satisfied it named the wrong regulator. | A measure asks for what its own rubric band asks for. | `independent-telecom-authority` `defines` and `gloss` in `src/rubric/measures.ts`; the two guards the widening needs are decision-side, below |
| 10 | 12.7, and 45 documents corpus-wide | The HTML body walk looked only at the heading's next sibling, so a page that wraps each heading in its own block parsed to headings and no text, and a page that nests the next heading in a sibling block gave one heading the rest of the document. | A heading's body is what lies between it and the next heading in document order, whatever the nesting. | `bodyBetween` in `src/parse/html.ts`. Needs the re-parse, which discards the banked readings of the documents it touches -- so it runs in this batch's detach/re-parse/attach step, not before it |
| 11 | 4.5, and 890 findings store-wide | `inProvision` needs three characters to match anything, so a shorter duty act failed it whatever the provision said -- and was refused as "not in the provision" for words that are in the provision. 811 of the 890 were the copula "is", on provisions that grant rather than command. Section 190 of Singapore's Copyright Act 2021, "It is a permitted use of a work to make a fair use of the work", is one. | An element too short for the check to run states nothing, which is the answer an absent one gives. | the `dutyAct` guard in `rejectionFor`, `src/read/index.ts` |
| 12 | 4.5, and 248 findings store-wide | A provision that defines something in lettered paragraphs puts the letters between the words. A reader returning the items in order, joined by the semicolons already there, is quoting faithfully, and the check refused it because the markers sit inside the span matched. Section 113E of Australia's Copyright Act 1968 -- the fair dealing model the top band of 4.5 names out loud -- was read, quoted correctly, and thrown away; the cell scored the middle band on the three-step test instead. | A quotation is faithful where it has the provision's words in the provision's order; the pointing and the paragraph letters are the page, not the provision. | `normaliseForQuoteCheck` in `src/read/index.ts` |
| 13 | 4.5, 12.5, and 900 reading seats across 50 cells | The register names up to three instruments as governing a cell and gives each six of the cell's reading places. The seats were filled from the instrument's best provisions outright, and a governing instrument's best provisions are usually the ones the fused order already picked -- so the seat went to a provision that was going to be read anyway. 900 seats bought 27 provisions; 132 of the 150 governing instruments gained nothing. The Copyright Act 1968 was named as governing for Australia's fair-dealing cell and read six sections deep out of 670, while ten accounting standards took a place each for the copyright notice on their cover. | A seat held for an instrument is spent on a provision the depth does not already have. | `addGoverningSeats` in `src/retrieve/index.ts` |
| 14 | 40 of the run's 50 cells | A governing seat went to whatever the register ranked highest and had read, so a regulator's web page could govern a question about the law: 70 of the 150 seats across the run, and all three of Australia's copyright-framework cell -- three IP Australia consultation pages of three sections each. Registration is where this was fixed (row 7), and this is the same rule at the place the seats are spent, because a register is a guess about titles and the next economy's will be wrong in its own way. | A document published about the law does not govern a question about the law. | `mayGovern` in `src/retrieve/index.ts`, the line `absenceFor` already draws in Zone 3 |
| 15 | 12.5 | The measure asks for a relief -- goods under the figure are exempt from duty -- which is how two of the three economies draft it. The third drafts the clearance instead: goods under the figure need not be entered or declared, so nothing is assessed on them. The two conventions share no word, and the gloss has named informal clearance all along with nothing asking for it. Australia's AUD 1,000 is in section 68 of the Customs Act 1901, in the corpus, 160th of 308 against a depth of 48, and the cell answered "no de minimis threshold found". | The same threshold is asked for as a relief from the charge and as a release from the declaration, because a statute writes it as either. | a second `alsoAsked` on `de-minimis-threshold` in `src/rubric/measures.ts` |
| 16 | 4.3 | Two of the rubric's bands scale a restriction by reach and each names two axes -- "affecting all circumstances and sectors" against "affecting to a specific circumstance or sector" -- and only the sector was ever asked, so a restriction that bites only once a condition is established counted as reaching every circumstance because it named no sector. Singapore's patent cell took the rubric's maximum on section 69 of its Patents Act, which withholds damages from a defendant who proves he did not know he was infringing; Australia's section 123 says the same thing in the discretionary voice, was excluded for permitting rather than requiring, and that cell scored no restriction at all. The innocent-infringer defence is in every patent statute of the TRIPS era, so it cannot be the fact that separates two economies. | A restriction that waits on a condition reaches that circumstance, not every circumstance. | `conditionWords` in `src/read/index.ts`, verified in the provision as every other copied element is; `escalatingByReach` in `src/decide/index.ts` asks both halves of the band |
| 17 | 5.1, 4.2, and 534 of one run's 2,468 Australian reading seats | Drafting manuals put a summary at the head of most Parts and ask for it in the operative voice, because that is what makes a summary readable. So a section called "Simplified outline" reads as a duty that binds everyone and sits nowhere -- and it outranks the duty it announces, being one dense sentence against a Part. Australia's passive-sharing cell read clause 30 of Schedule 1, the outline, and clause 31, the definitions, and never clause 33: "A carrier must, if requested to do so by another carrier, give the second carrier access to a telecommunications transmission tower." 1,430 sections of the corpus announce themselves this way and 35 findings in 16 of Australia's 28 cells rest on one. | A provision that says of itself that it summarises others states no requirement of its own. | `outlineSections` in `src/retrieve/index.ts` stops spending seats on them; `announcesItselfAsAnOutline` in `src/decide/index.ts` holds one a past run already banked, held rather than ruled out because the duty is real and stated elsewhere. Tested in `test/outline-is-not-a-provision.test.ts` |
| 18 | 12.4.4, 5.1 | Row 15 again, found twice more by asking of every unreached provision what word its statute uses. The rubric names a measure with the policy word for it and a legislature writes the duty in its own drafting convention, and where the two share no word the question never reaches the provision. Payment licensing: one convention licenses the provider, the other forbids anyone but an authorised institution to hold the value and never says "licence" -- section 22 of Australia's Payment Systems (Regulation) Act 1998, an offence of 200 penalty units, was not in the top 600 on any question the cell asked, although its own instrument was already named as governing and section 23 beside it, the power to grant the authority, was read. The cell answered "no payment licensing requirement found" with twenty findings before it. Passive sharing: sharing is the policy word and access on request is the drafting one, and four of that cell's five questions carry "infrastructure", which three Acts carry in their titles -- so an offshore-energy Act governed a telecommunications question and clause 33 of Schedule 1 was never retrieved. Neither gate was the obstacle; `LICENCE` already accepts a word meaning authorisation. | A requirement is asked for in each voice a statute writes it in, not only in the voice the rubric names it with. | `alsoAsked` on `payment-licence` and on `passive-sharing-duty` in `src/rubric/measures.ts`. Section 22 goes from absent to 5th of the depth and the Corporations Act replaces the Online Safety Act as a governor of the payments cell; the Telecommunications Act becomes a governor of the sharing cell and Schedule 1 enters the depth |

## Also fixed, decision-side

- The measures' names and the domain gates are English words tested against words copied from the
  provision, so a Malay provision failed them whatever it said, and the failure was recorded as
  evidence for a zero. Rule: where a word list in the rubric's language fails on a provision in
  another language, the finding is held, not ruled out. `otherLanguage` in `src/decide/index.ts`.
- The two guards row 9 needs, both free and both measured against the banked readings. Widening a
  measure to match its band admits more than the band does unless something else asks what the
  provision is about and what it does. Rules: a measure asking for a regulator is made out only by
  a provision whose subject is the sector the indicator is about; and a measure defined by a body
  being established is made out by words that create one, not by words that name one. `'5.7'` in
  `SUBJECT_DOMAIN` and `'independent-telecom-authority'` in `MEASURE_NAMES`, both in
  `src/rubric/measures.ts`. Together they cost AUS 5.7, which had been scoring what ESCAP scores
  on a definitions entry and a simplified outline; it now abstains, which is what the corpus
  supports, because the section that establishes the authority is never retrieved.
- A zero is not always a silence. Fourteen indicators score their maximum for something not being
  there, so on those a zero is the protective provision being present -- and whether a cell had
  found anything was read off the sign of its score, which is the opposite answer. Australia's
  trade-secrets cell reported "presence of effective protection" and cited no provision at all,
  only the instrument it had been read against, which is the record a cell keeps when it found
  nothing. Rule: a band rests on what the rule counted, and only a band the rule reached with
  nothing counted rests on absence. `onProvisions` in `src/decide/index.ts`, tested in
  `test/zero-cites-its-provisions.test.ts`. Seven cells that cited nothing now cite their
  provisions, and no score moves.
- What that citation exposed once it existed. Both of 4.1's measures name a trade secret, so
  naming one cannot be what tells them apart; the rubric separates them by whether the holder is
  given a remedy, and nothing asked for one. Australia's cell counted a disclosure exemption in
  the Competition and Consumer Act and an offence of publishing in the Fair Work (Registered
  Organisations) Act as effective protection. Rule: a measure defined as a remedy is not made out
  by words that only name the thing being protected. `REMEDY` in `MEASURE_NAMES`,
  `src/rubric/measures.ts`. AUS 4.1 moves to the clause band and now agrees; SGP 4.1 loses an
  agreement it held on the Arbitration Act's definition of what may be arbitrated and abstains,
  which is what a reader of legislation can say about an economy that protects trade secrets
  through the common-law action for breach of confidence.
- Measured and deliberately not changed: the query-best seat budget. Each question seats its own
  two best answers before fusion is allowed to decide, and the suspicion was that two is too few --
  clause 34 of the sharing cell's Schedule 1 came back 7th on the one question written in the
  statute's voice and never reached the depth. Raising the budget to four moved nothing at all
  across seven cells: the same provisions, the same ranks, one cell's depth up by one. So the
  budget was not what held the provision out, the question was, and the budget stays at two. Six
  and eight were not measured -- the sweep was abandoned when the embedding server became the
  bottleneck -- and on the evidence from four there is no reason to spend a run on them.
- Still open, measured but not acted on: 8.9% of Australia's reading seats and 6.3% of Singapore's
  go to sections whose heading is a definition, an interpretation or an outline. Row 17 removes the
  outline share. The definitions are left, because `definesATerm` already holds them in Zone 3 and a
  section headed "Definitions" can carry a deeming provision that is substantive -- so dropping them
  structurally would cost real law to save seats.
