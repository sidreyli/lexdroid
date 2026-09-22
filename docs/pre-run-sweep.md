# The sweep before the run: Zone 0, Zone 1, and everything the reader is handed

Asked on 22 September 2026, before booking GPU: are the defects we recorded actually closed, and
are the cells that differ from ESCAP ones we can defend? Everything below is measured against the
live store, not read off the earlier documents. Where a document turned out to be wrong, the
correction is here and the document has been changed.

The short answer is that **Australia and Singapore are ready and Malaysia is not**, and that the
difference is not in the reader.

> **Superseded on 22 September 2026.** The second pass found that the conclusion above is a
> statement about the 19 September run rather than about the corpus, and is no longer true of it.
> `reach` grades the run it is pointed at, and that run's Malaysian reader was starved: a mean of
> 10.3 provisions per cell against Australia's and Singapore's 43, and two cells that saw none at
> all. Re-run today against the same questions and the same code, the mean is 60.2. The verdicts
> `unfetched` and `unread` below should be read as "the shortlist did not select it then", not as
> "the corpus does not hold it". The measurements of the pipeline defects in this document stand;
> the readiness conclusion does not. See `malaysia-and-the-second-pass.md`.

## The test that separates the two

`reach` asks, of each cell that differs from ESCAP, how far ESCAP's own cited instrument got:
registered, fetched, parsed, put in front of the reader, or read and still missed. Only the last
is a reading defect.

| | cells differing | read | unread | unfetched | unregistered |
| :-- | --: | --: | --: | --: | --: |
| Australia and Singapore | 14 | **12** | 0 | 1 | 1 |
| Malaysia | 21 | **1** | 15 | 0 | 5 |

Australia and Singapore are arguing about the reading: in twelve of fourteen the reader saw the
law ESCAP relies on and reached a different answer, which is a judgement to defend or revise. In
Malaysia, twenty of twenty-one never put the law in front of the reader at all. A GPU cannot
recover from a provision that never arrives, so a run started now would re-measure Malaysia's
retrieval, not its reading.

Agreement across all three, from the banked runs: **76 of 111 cells**.

## What the Malaysian misses actually are

They are not scattered. Sorted by cause:

- **Five cells want one document we do not hold.** The MCMC Licensing Guidebook 2023 is cited for
  3.1, 3.5, 5.2, 5.5 and 9.4, and four of those five are disagreements. The Commission's portal
  registers 120 instruments and this is not among them.
- **Seven cells want an amendment whose text is not in the act.** See below; this is the largest
  finding in the sweep.
- **Four cells are counted against us by a typo.** ESCAP cites the "Copyright **Right** Act (Act
  332) 1987" for 4.5, 4.6, 8.1 and 8.2. We hold the Copyright Act 1987, Act 332, 122 sections, in
  force. Our recall is better than the measurement says.
- **Four rows are not law.** Indicator 5.3 is answered from the 2023 financial statements of
  Telekom Malaysia, CelcomDigi, Maxis and Digital Nasional Berhad. Australia's 5.3 does the same
  thing with an annual report. Two economies now show it, which makes it a defect in the indicator
  rather than a coincidence, and it is the clearest thing we have to report back.
- **The rest are single regulator documents**: MYNIC's registration policies (12.7), the Treasury
  Directive 1966 (2.1, 2.3), the prepaid end-user registration guidelines (8.3), the accounting
  separation guidelines (5.4), the access pricing determination (5.1).

## The largest finding: an amendment is not in the act it amends

Malaysia's Personal Data Protection Act 2010 is in the corpus as the consolidation **current to
1 July 2023**, 158 sections. It contains the words "breach" and "data protection officer" exactly
**nought** times. The duties ESCAP scores for 6.1, 6.2, 6.4, 7.1, 7.3, 7.4 and 7.5 arrived in the
2024 amendment.

That amendment *is* registered -- fifteen sections, whose section 6 reads "The principal Act is
amended in Part II by inserting after section 12 the following division". So the provisions exist
in the corpus as instructions to amend, and nowhere as provisions of the Act. Nothing connects the
two: `amends_instrument_id` is null on it, as it is on **all 3,209** amending instruments in all
three economies. The column is written by nothing and read by nothing.

Six of those seven cells currently agree with ESCAP. That is the exact shape the disagreements
document warned about -- agreement reached on a text that does not contain the provision the other
side scored is not evidence that the reader is right.

Two related gaps sit beside it. `current_to` is recorded for **836 of 836** Malaysian Acts and for
**none** of Australia's 1,264 or Singapore's 524, although both registers state it -- a federal
compilation prints its date on the first page and Singapore Statutes Online prints "current version
as at". And `decide` already writes the honest sentence when it has the date, "The text read is the
published consolidation, current to ...", so today that sentence can only ever appear for Malaysia.

## Defects found in the pipeline itself

### The run summary overstated the corpus gap by three orders of magnitude

The stage summary reports how many documents were set aside and never read. It counted the economy
in the `LEFT JOIN` and not in the `WHERE`, so every other economy's discards failed to match this
register, came back with a null document, and were reported as this economy's missing ones. It also
counted ledger rows rather than documents, so a document re-parsed three times counted three times.

| | reported | actually still missing |
| :-- | --: | --: |
| Australia | 6,024 | **3** |
| Singapore | 5,880 | **6** |
| Malaysia | 300 | **25** |

Australia's headline figure, 5,561 "partial-document", was Malaysia's OCR ledger: 629 documents
across the three economies, each missing a page or two to OCR, and only eight of them holding no
text at all. **Fixed** in `scripts/zone1.ts`, and the numbers above are the corrected output.

### A document filed under a meaningless title kept it

Discovery has always had the rule that a document whose filed title names no instrument takes the
name it gives itself in its opening provision. It was firing on almost nothing. The sentence it
looked for was written in two voices -- "may be cited as the ..." and "This Act is the ..." -- and
delegated legislation writes it in several others. Measured across the three registers: **nought of
663 eligible instruments recovered a name.**

Australia files legislative instruments under the drafting template they were written from and
under upload slugs, while section 1 of each says exactly what it is:

| filed as | section 1 says |
| :-- | :-- |
| `Principal Instrument Template` | Radiocommunications (Allocation of Transmitter Licences ...) Determination 2025 |
| `Compilations--Agency prepared template` | Customs (Information Technology Requirements) Determination 2021 |
| `Schedule 1` | A New Tax System (Goods and Services Tax) Adjustment Note Information Requirements Determination |
| `[Document title]` | Competition and Consumer (Industry Codes--Cash Acceptance) ... |
| `250312-LI-TSY_47_0757-Mergers-general th` | Competition and Consumer (Notification of Acquisitions) Determination 2025 |

A title is not cosmetic here: it is embedded, and the shortlist ranks the whole register by it
before any document is read, so an instrument named after a template cannot be found by the subject
it governs and cannot be cited by a name a reviewer could check. Several of the 48 sit in pillars we
score -- foreign acquisitions, broadcasting standards, telecommunications carrier charges, online
safety.

The rule, in the form the reader batch uses: **a document filed under a title that names no
instrument is registered under the name it gives itself in its opening provision.** A pattern loose
enough to read "This is the ..." is loose enough to read the first capitalised words of any
sentence, so the guard is that the recovered name must name an instrument itself -- the whole point
is exchanging a title that says nothing for one that says what the document is, and a candidate that
says nothing either is no improvement. **Fixed**: `STATES_NAME_LOOSE` and `nameIn` in
`src/parse/identity.ts`, `scripts/repair-titles.ts` brought the register to it, 48 instruments
renamed and re-embedded, tested in `test/instrument-names-itself.test.ts`.

### The instrument index is not built by the stage that says it indexes

`zone1 --embed` builds the section index only. The instrument-title index is built by
`buildInstrumentIndex`, which Zone 1 calls only in its `--shortlist` diagnostic. So every instrument
registered since that was last run had no title vector: **117 of them, being all 96 of Bank Negara's
and all 21 of Customs'** -- the entire yield of the two portals the last round of work repaired, and
every one holding text. `titleDense` selects from the embedding table, so they were absent from that
channel rather than ranked low in it.

A run self-heals, because `run/prepare.ts` builds the index before shortlisting. What it does not
heal is measurement: every pre-run ranking recorded in the earlier documents -- including the
framework-gate table, whose finding is that "nothing Bank Negara registered was being kept out of an
answer it could have given" -- was taken with Bank Negara invisible to one of the four channels.
**Fixed** by building the index; the gate table should be re-measured before it is relied on again.

### Malaysia holds 3,896 sections twice

Twenty-eight documents are registered under two or three instrument ids each -- byte-identical,
same `content_hash` -- for 34 redundant registrations and **3,896 sections, 3.2% of the Malaysian
corpus**. Australia and Singapore have none. `otherLanguageCopies` cannot see this: it keys on
`instrument|label`, so two copies under two instrument ids are two different keys and never pair.
A cell can seat the same provision twice under two names and count it twice toward a band.
**Not fixed** -- it needs a rule about what a second registration of the same bytes is, and that is
a registration decision, not a retrieval filter.

### Smaller, recorded and not fixed

- **77 orphan rows in `section_fts`** -- rowids with no section behind them, 0.03% of the index.
- **Singapore has no domain-registry source.** Australia has auDA and Malaysia has MYNIC; the
  Singapore profile has no equivalent, and SGP 12.7 is one of the open disagreements, needing the
  SGNIC rules. Australia's 12.7 was closed by re-parsing the auDA rules; Singapore has no
  counterpart to re-parse.
- **The schema comment beside `instrument.status`** still says "'in-force' is the only status a row
  may cite". `currentLaw` deliberately keeps `unknown`, and `zone1-gaps-closed.md` already corrected
  the same sentence where it appeared next to the framework gate. This is the other copy of it.

## What held

Worth stating, because the ones that held are what make the ones that failed worth believing:

- **The registration rule has not leaked.** Not one instrument in any economy is registered as an
  Act while stating neither an identifier nor a status -- the test `repair-register` was built on,
  still true across 155 `publication` rows and every instrument registered since.
- **Every one of the eighteen batched reader rules is present** in the file and symbol it claims.
- **No document has zero sections without being recorded as unread**, and no section is blank.
- **Every section in all three economies is embedded**, and the FTS and section counts agree to
  within the 77 orphans.
- **The auDA re-parse landed**: 99,755 characters, and rule 2.4.1 -- "A Person applying for a
  Licence must: have an Australian Presence" -- is in the corpus as text, checked directly.

## A correction to `aus-sgp-disagreements.md`

That document held AUS 5.2 on the ground that "0.8 is not a score any band in the rubric produces."
It is. The rubric's band for 5.2 reads **0.8 -- "A minority stake (1-50%) allowed"**, 3.1 carries the
same band, and 0.8 appears eleven times in ESCAP's database. Our own Malaysian 3.1 scores it.

The disagreement is still arguable and the score need not move: band 1 is "Ban (0%) OR if only a
minority stake in more than one measures", and the cell made out two measures, a 5% individual cap
and a 49% aggregate one. But it is a judgement about how to count measures, not a case of ESCAP
producing an impossible number, and the row has been rewritten to say so. One thing found on the way
is worth a second look before the run: one of the two findings was booked to `telecom-equity-ban`,
whose `defines` asks for "the words stating that a foreign person may hold no shares at all", on a
quote reading "a 49% limit on foreign ownership". A 49% limit is not a ban.

## What this means for the run

Nothing here changes the case for running Australia and Singapore: their disagreements are reading
disagreements, the corpus behind them is measured and whole, and only a run can move them.

Malaysia is a different question. Twenty of its twenty-one differences are upstream of the reader,
and five of them are one uncollected document. Running Malaysia today spends GPU to re-measure a
retrieval failure we can already name. The cheap work first -- the MCMC guidebook, the amendment
link, the duplicate registrations -- then read it once.

**That cheap work was done, and it changed the answer.** The amendment link and the duplicate
registrations are closed, the Commission's crawl is seeded, and an Act of Parliament that had been
registered as advisory guidance is now admissible. What the retrieval figures above were really
measuring was an index that was incomplete on the day. Malaysia is now in the same position as the
other two. Only the guidebook is still uncollected, and the reason is recorded in
`malaysia-and-the-second-pass.md`.
