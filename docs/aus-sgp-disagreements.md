# Where we differ from ESCAP on Australia and Singapore, and why

Run `d82f0348-78f0-4caa-9b0d-5ff0db180c13`, code `0ae7ac3`, stopped by hand on 21 September 2026
after five of twenty-four units. Fifty cells: AUS pillars 4, 5 and 12, SGP pillars 4 and 12.
Baseline is ESCAP `round-1`, the only scored pass that covers these two economies.

Agreement is 36 of 47 comparable cells. That number is the reason for this document rather than its
conclusion: on nearly half the run's cells the reader spent part of its reading window on documents
that are not law, so on those cells it answered from a smaller view of the statute than it should
have had — including on cells that agree with ESCAP. Agreement reached that way is not evidence that
the reader is right, so the target cannot be a percentage.

## The headline: nothing here is a corpus gap

Every authority ESCAP cites for a cell we scored lower is already indexed:

| ESCAP cites | we hold | sections |
| :-- | :-- | --: |
| Telecommunications Act 1997 | yes | 1,130 |
| Banking Act 1959 | yes | 249 |
| Corporations Act 2001 | yes | 4,369 |
| Competition and Consumer Act 2010 | yes | 2,020 |
| Patents Act 1990 | yes | 280 |
| Freedom of Information Act 1982 | yes | 206 |
| Trade Marks Act 1998 (SGP) | yes | 134 |
| .au Domain Administration Rules: Licensing | yes | 84 |

So the reading was not starved of law. It was pointed at the wrong law.

The two portals that genuinely hold nothing — Australian Border Force and the Singapore Government
e-Gazette — caused none of these eleven disagreements. They remain worth fixing on their own merits;
they are not the explanation for anything below.

## The defect behind most of it

Regulator portals publish consultation papers, guidance notes and news items alongside legislation.
These are registered as `kind = 'act'`, parse to one to three sections, carry `status = 'unknown'`,
and then compete for the governing slots against the statutes themselves — and win.

| instrument | sections | status | governed |
| :-- | --: | :-- | --: |
| Privacy Guidance on Part 4A (Social Media Minimum Age) | 3 | unknown | 11 of 50 cells |
| Compulsory Licensing: Clarify The Scope Of "Reasonable…" | 3 | unknown | 10 of 50 |
| Labelling Requirements Under The Plant Breeder's Rights… | 3 | unknown | 4 of 50 |
| **Telecommunications Act 1997** | **1,130** | in-force | **3 of 50** |

**23 of 50 cells** have such a document at the top of the register's governing shortlist. What that
costs is **reading seats**, not the scores directly: a governing instrument is given a fixed number
of places in the reading window, so a three-section consultation paper displaces provisions of the
statute that answers the question. Across the run **465 of 7,470 seats (6.2%)** went to documents of
this kind, and it concentrates badly — AUS 12.7 lost 63 of 204 seats and SGP 12.9 lost 67 of 143.

**Correcting an earlier draft of this document:** those cells were described here as scoring zero on
the silence of a document that could not speak. That is not what the record shows. Of the 36 zeros
taken on `absence_basis = 'governing'`, **35 were witnessed by a numbered, in-force statute** —
the Online Safety Act 2021, Banking Act 1959, Patents Act 1990, Copyright Act 1968, Telecommunications
Act 1997. Exactly **one**, AUS 4.9, was witnessed by a three-section paper. `absenceFor` already
requires the witness to hold findings in the pillar, and a document with nothing in it fails that
test. The defect is real, but it is a retrieval defect, and the decision side is already guarding the
part it can see. This matters for what to do next: the free fix is worth one cell, and the fix worth
having costs a re-run.

A second, separate fault sits inside the same list. Singapore's Banking Act 1970 is registered
twice: `[27]` from Singapore Statutes Online with 308 sections in force, and `[51771]` from the MAS
portal with one section and unknown status. The one-section copy took a place on SGP 12.4.1's
governing shortlist — consuming seats there, though the cell's zero was witnessed by another Act.

Three rules, in the form the reader batch uses — one sentence, no country and no instrument:

1. A document a regulator publishes *about* the law is evidence about it, not an instrument of it,
   and is registered as neither.
2. An instrument may witness an absence only where it states provisions of the kind said to be
   missing.
3. Where one instrument is registered from two sources, the copy carrying the authoritative text is
   the one that governs.

Rule 1 is the one that matters, and it is a registration rule: it changes what the search may seat,
so it is graded only by reading again. Rules 2 and 3 are decision-side and free, and measurement
says rule 2 moves one cell — `absenceFor` already turns away a witness with no findings in the
pillar, so the gap rule 2 closes is narrow. It is still worth stating, because "already guarded by
accident" and "guarded on purpose" are not the same guarantee.

The test rule 1 turns on, validated against all three economies' registers: **an instrument whose
source states neither an identifier nor a status is a publication about the law, not an instrument
of it.** Every genuine short Act carries a number and a status — `Act No. 73, 1999`, `Act 192`,
in-force — and every agency page lacks both. Singapore is the case that proves the test has to be a
conjunction: 87 of its real statutes carry no number, and every one of them carries a status.
Applied to AUS, SGP and MYS it demotes 73 of the documents currently registered as Acts with text in
them, and no statute. In every instance checked, the
real Act is already registered separately from the statute book — Cybersecurity Act 2018 at 146
sections beside a 4-section CSA page, Payment Services Act 2019 at 139 beside a 1-section MAS page —
so nothing is lost by demoting the stub. This also disposes of rule 3 as a special case: the
duplicate is not a second copy of the law, it is an agency page about it.

## The eleven disagreements, classified

### Retrieval failures — we hold the authority and did not surface it

These four are the ones to act on. Each scored 0 while the instrument ESCAP relies on sat indexed
and unsurfaced, with part of the reading window spent on documents that are not law. The fourth
column is the top of the register's governing shortlist — what took the seats — not the instrument
the zero was reported against; for three of the four those are different, and the shortlist is the
one that explains the miss.

| cell | ours | ESCAP | top of the register's governing shortlist | authority ESCAP cites, which we hold |
| :-- | --: | --: | :-- | :-- |
| AUS 12.4.4 | 0 | 1 | Compulsory Licensing… (3s) | Banking Act 1959 — purchased payment facility licensing |
| AUS 12.7 | 0 | 1 | Labelling Requirements… (3s) | .au Domain Administration Rules — Australian presence to hold a .au licence |
| SGP 12.7 | 0 | 0.5 | Securities and Futures (Amendment) Act 2017 saving provision (1s) | Trade Marks Act 1998, SGNIC .sg rules |
| AUS 4.1 | 0 | 0.5 | Compulsory Licensing… (3s) | Corporations Act 2001, FOI Act 1982, CCA 2010 |

AUS 4.1 is the clearest of the four: the cell's own deciding fact is "a remedy for misuse of trade
secrets" — something was found — and the controlling instrument recorded is the **Trade Marks Act
1995**, which does not govern trade secrets at all.

Both 12.7 cells fail the same way in both economies, which makes them one problem and not two: the
restriction lives in domain-registry policy, and registry policy is the kind of document the defect
above pushes out of the governing slots.

### Probable over-reads — the quote does not meet the band it was scored under

Each of these can be checked without a re-run, by reading the quote against the band.

| cell | ours | ESCAP | the quote we scored | why it is doubtful |
| :-- | --: | --: | :-- | :-- |
| AUS 5.5 | 1 | 0 | Radiocommunications Act: a licence condition to pay charges and apparatus licence tax | the band asks for discrimination against foreign providers, minimum capital or performance requirements; a duty to pay a fee is none of those |
| AUS 12.4.2 | 1 | 0 | GST Digital Currency Conversion Determination: "You must convert the amount of consideration expressed in digital currency" | a domestic tax valuation rule read as a requirement on the currency of an *international payment* |
| AUS 4.01 | 0.5 | 0 | Therapeutic Goods Act: patent certificates for medicine registration | the deciding fact claims it applies "to everyone", but the provision is confined to therapeutic goods |

### Arguable — a human call, not a bug

| cell | ours | ESCAP | the difference |
| :-- | --: | --: | :-- |
| AUS 5.2 | 1 | 0.8 | Same instrument, same fact: the Telstra Corporation Act's 5% cap on foreign holdings. **0.8 is not a score any band in the rubric produces.** Ours follows the band for a minority stake in more than one measure. We should hold this one. |
| AUS 5.1 | 0 | 0.5 | We found three duties to share passive infrastructure, so "passive sharing is mandated" and the score is 0. Defensible, but the controlling instrument recorded is the Offshore Electricity Infrastructure Act 2021, which wants checking before we rely on it. |
| SGP 4.3 | 1 | 0 | The innocent-infringer defence limiting damages, read as a restriction on enforcement reaching every sector. Genuinely arguable both ways. |
| SGP 4.2 | 0.5 | 0 | Scored down for finding no provisional measures, while holding the Patents Act 1994. Likely under-retrieval within an instrument we do hold, rather than a judgement difference. |

## The three unresolved cells

None of these is a failure, and one is a finding in its own right.

- **AUS 12.5, SGP 12.5** — the de minimis indicator scores 1 for an *absence*, and the provisions
  read state no figure to compare against. A question nobody could evaluate has not been answered in
  the negative.

  **Run to ground, 21 September 2026, and it is ours, not ESCAP's.** Australia's threshold is real
  and in the corpus: section 68 of the Customs Act 1901 excuses from entry for home consumption a
  consignment "of a value not exceeding $1,000" — AUD 1,000, about 712 USD on the pinned rate, which
  is the band ESCAP scores. It was never put in front of the reader. Not one Australian finding for
  the indicator was ever rejected, because none was ever made: the cell's whole evidence for 12.5
  was a single finding, on a draft foreign-exchange instrument, with "low value goods" for its
  defining words and no figure — correctly ruled out by the confirmation pass.

  Three things kept section 68 out, and all three are now fixed (rows 13, 14 and 15 of
  `reader-batch.md`). The measure asked only for the relief and Australia drafts the clearance, so
  the provision ranked 160th of 308 on the questions the cell asked. Two of the cell's three
  governing instruments were regulator web pages — an IP Australia consultation page and an OAIC
  guidance page, two and three sections each — holding twelve of the eighteen seats the Customs Act
  should have had. And the seats the third, the GST Act, did hold were spent on six provisions the
  depth already contained. With the clearance question asked, section 68 is 7th of a depth of 48.

  What that is worth cannot be stated until the run: the reader has never seen the provision, so
  whether it returns the figure as the threshold is a question for the engine, not for the record.
- **AUS 5.3** — the indicator scores the shares a government holds in telecommunications companies.
  That is a fact about a share register and an annual report, not about any provision, and ESCAP's
  own rows for it cite ownership disclosures rather than legislation. A reader of law cannot answer
  it. **This is worth reporting to ESCAP as a defect in the indicator**, not something to fix in the
  reader.

## What we should be aiming at

Not 100% agreement, and not the current 77% either, because neither number distinguishes a cell that
is right from a cell that is right by accident. In order:

1. **Fix registration, and carry it into the re-run that is already booked.** 23 cells read from a
   window part of which was spent on documents that are not law, including cells that agree with
   ESCAP today. This is a reader-side fix: it joins the batch in `reader-batch.md` and costs nothing
   extra, because that run has to happen before the 30 September freeze anyway.
   **Done, 21 September 2026** — see "What has been done" below.
2. **Ask the second reading about the 405 claims it was never asked about.** This is what the three
   probable over-reads turn on, and it is not free as this document first said: a re-score re-derives
   against *banked* verdicts, and every finding those three cells rest on was never put to the
   second reading, because the run was stopped before its own confirmation pass. Priced from the
   4,806 asks already banked at a mean of 969 ms, the outstanding pass is about **seven minutes on
   one engine** — not a re-run, and the cheapest correction available.
3. **Expect four cells to move toward ESCAP** once the real instruments hold the seats:
   AUS 12.4.4, AUS 12.7, SGP 12.7, AUS 4.1.
4. **Expect a residue that should not move, and report it.** AUS 5.2 on banding, AUS 5.3 as an
   indicator no reader of law can answer. Where we are right and ESCAP is not, the find is the
   deliverable.

A cell we can defend from the provision it quotes is worth more than a cell that matches. The number
to drive to zero is cells decided on a document that could not decide them; agreement is what it is
once that is done.

## What has been done, 21 September 2026

Everything here was gradeable without an engine, and every figure below is from the store after
the change.

- **`registeredKind` decides what a listing will support calling an instrument**, applied at
  registration in `src/discover/index.ts` and tested in `test/publication-not-instrument.test.ts`.
  A new kind, `publication`, carries the documents it demotes; all five profiles give it the
  `advisory` bindingness the decision already knows how to discount.
- **`scripts/repair-register.ts` brought the existing register to the same rule.** 132 documents
  re-registered across AUS, SGP and MYS — 73 of them parsed — and no statute among them. The script
  refuses to write if anything outside the tested claim would be demoted, which is the check that
  caught the rule being drafted wider than it was measured.
- **A publication can no longer witness an absence** (`absenceFor` in `src/decide/index.ts`). On a
  corpus registered before the kind was carried the guard is inert, so older stores score as they did.
- **The run was re-scored.** One cell moved: AUS 4.9's zero came off a three-section IP Australia
  consultation paper and now rests on the Public Interest Disclosure Act 2013, 96 sections and in
  force. No score changed, agreement stays 36/50, and **no cell is now decided on a publication.**
- 1,139 tests pass.

Two things this did *not* do, both worth saying plainly. The seats are only freed for the next run —
nothing already read was re-read, so the four retrieval failures stand until the batch runs. And
AUS 4.9's new witness is a real statute but not an obviously apt one for an intellectual-property
indicator; the guard asks whether a document is an instrument, not whether it is the right one.

## Confidence and limits

- 81% of the measures behind these scores carry a confirmation verdict (658 of 812). The run was
  stopped before its own confirmation pass, so findings it newly produced went unasked. AUS 4.2 and
  SGP 4.2 are the most exposed, at 19/34 and 12/22, and SGP 4.2 is in the table above.
- The band mismatches above are read from the recorded quote and band criterion. They have not been
  re-read against the full provision.
- ESCAP round-1 is an older pass. Round-2 exists but does not cover these two economies.
- Reproduce any figure here from run `d82f0348-78f0-4caa-9b0d-5ff0db180c13` in
  `backend/data/lexdroid.db`, against `source = 'round-1'` in `backend/data/baseline.db`.

## The recall audit, 21 September 2026

Before spending a run, the cheap half of every remaining disagreement was asked directly: *does
retrieval, as it stands now, reach the provision this cell needs?* A reader can only be wrong about
a provision it was shown, and a day of GPU cannot recover from a provision that never arrives. Each
target below was verified at source first, against the statute, not against ESCAP's score.

| cell | the provision it needs | before this batch | now |
| :-- | :-- | :-- | :-- |
| AUS 4.5 | Copyright Act 1968 s113E, fair dealing factors | unreached | 11th of 66 |
| AUS 12.5 | Customs Act 1901 s68, entry for home consumption | 160th of 308 | 7th of 60 |
| SGP 4.2 | Patents Act 1994 ss67, 69, remedies | unreached | 2nd and 3rd of 49 |
| SGP 4.5 | Copyright Act 2021 Div 2, fair use | unreached | ss191, 192 at 3rd and 5th |
| AUS 12.4.4 | Payment Systems (Regulation) Act 1998 s22 | not in the top 600 | 5th of 60 |
| AUS 5.1 | Telecommunications Act 1997 Sch 1 cll 33-35 | unreached, and the Act did not govern | the Act governs; Sch 1 in the depth |

Two of those were still missing when the audit began and are what row 18 of `reader-batch.md`
fixes. Three things are worth stating about them beyond the fix.

**AUS 12.4.4 was never a corpus gap and never a judgement difference.** ESCAP cites the Banking Act
1959, which holds no provision about purchased payment facilities at all; the regime is in the
Payment Systems (Regulation) Act 1998, which the register already named as governing the cell.
Section 22 of that Act -- "Holder of stored value must be an ADI or be authorised or exempted under
this Part", an offence of 200 penalty units -- answers the question outright. Section 23 beside it,
the *power to grant* the authority, was read. The *duty to hold* one was not. The cell reported "no
payment licensing requirement found" with twenty findings before it, every one of which the second
reading had passed. So our citation is better than the one ESCAP gives; our answer was wrong for
the narrowest possible reason.

**SGP 4.5 moved the wrong way and it is honest that it did.** The cell scored 0 and now scores 1 on
the banked readings, because the findings that produced the 0 were a cross-reference in the
Copyright Regulations and an IPOS explainer page, and both are now correctly refused. Of 182
sections read for the cell, four produced a finding and none was section 190 of the Copyright Act
2021 -- "It is a permitted use of a work to make a fair use of the work", 212 characters, in the
corpus the whole time. The 0 was right by accident and the 1 is wrong on the evidence available;
sections 191 and 192 now reach the depth and the run decides it.

**AUS 5.1 is a citation, not a score.** We already answer 0 against ESCAP's 0.5 and we are right:
clause 33 of Schedule 1 mandates tower access on request. What was wrong is that the cell reached
that answer without ever seeing clause 33, and named an offshore-energy Act as its controlling
instrument. The score does not move; the row we can export does.

One measurement that changed nothing is recorded because it rules a suspect out: raising the
query-best seat budget from two to four moved no provision in any of seven cells. The budget was
never what held these provisions out of the depth. The question was.
