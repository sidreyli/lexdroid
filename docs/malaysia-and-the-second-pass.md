# Malaysia, and what a second pass over Zones 0 to 2 found

Asked on 22 September 2026, after `pre-run-sweep.md`: do the Malaysian work, then look again at Zone
0, Zone 1 and Zone 2 from a standing start. Everything below is measured against the live store.

The second pass overturned the first one's central conclusion, so that correction comes first.

## The correction: `reach` measured a run, not the corpus

`pre-run-sweep.md` concluded that **Australia and Singapore were ready and Malaysia was not**, on the
ground that twenty of Malaysia's twenty-one differing cells never put ESCAP's cited law in front of
the reader. That was a true statement about the banked run of 19 September. It is not a statement
about the corpus, and it is no longer true of it.

What the banked run actually shows is that its Malaysian reader was starved:

| | cells | sections the reader saw, mean | characters, mean |
| :-- | --: | --: | --: |
| Malaysia, run f305012d | 61 | **10.3** | **26,289** |
| Australia and Singapore, run d82f0348 | 50 | **43.0** | **243,419** |

Malaysia's reader was given a tenth of the text the other two were given. Thirteen cells saw between
one and four provisions. **Two -- 8.2 and 10.4 -- saw none at all**, and were answered on nothing.
Australia's and Singapore's worst-served cell saw thirty-one.

Nothing was holding it back at the reading gate: every section shortlisted was sent. Retrieval
itself returned four times less. So the question is what retrieval was working from, and the answer
is that it was working from a corpus and an index that were both incomplete on the day -- the
missing instrument-title vectors, the 663 instruments filed under templates, and 153 documents and
12,980 sections that arrived on 21 September, two days after the run.

Run again now, against the same questions and the same code:

| cell | then | now | | cell | then | now |
| :-- | --: | --: | :-- | :-- | --: | --: |
| 2.1 | 11 | 66 | | 8.1 | 2 | 61 |
| 3.1 | 9 | 66 | | 9.4 | 16 | 66 |
| 3.5 | 6 | 56 | | 10.3 | 6 | 55 |
| 4.1 | 3 | 65 | | 11.2 | 8 | 59 |
| 5.1 | 18 | 66 | | 12.8 | 17 | 58 |
| 5.5 | 9 | 61 | | 6.1 | 10 | 54 |
| 7.1 | 4 | 50 | | **mean** | **9.2** | **60.2** |

Uniform across every pillar sampled, and now above what Australia and Singapore were given. The two
cells that saw nothing return 61 and 56 provisions. Malaysia's 5.2 now surfaces the Communications
and Multimedia Act 1998, which the run never showed it.

So the finding to carry forward is not that Malaysia's law is missing. It is that **`reach` grades
the run it is pointed at, and a run is only as good as the corpus of that morning.** Pointed at a
five-day-old run it reported five economies' worth of collection failures that were really one
retrieval failure, already closed. The verdicts `unfetched` and `unread` in that document should be
read as "the shortlist did not select it then", not as "the corpus does not hold it".

## What fetching actually does, which the first sweep had wrong

Worth stating plainly, because it makes several earlier numbers read differently. Across all three
economies only about one instrument in twenty holds any text:

| | registered | with a document | with sections |
| :-- | --: | --: | --: |
| Australia | 28,580 | 1,312 | 1,274 |
| Malaysia | 16,980 | 1,715 | 1,682 |
| Singapore | 6,857 | 1,047 | 965 |

15,240 Malaysian instruments have no discard row of any kind, because nothing was ever attempted on
them. That is the design and not a defect: `run/prepare.ts` says it in one line -- *"materialise:
fetch and parse the instruments the shortlist named, and only those"*. The register enumerates the
statute book; the corpus is what the questions asked for. An instrument without text has not failed
to be collected, it has not been requested.

## The four fixes

### An Act of Parliament was registered as advisory guidance

Malaysia's data-protection regulator publishes the 2024 amending Act as a file in its media library.
A media library states nothing about anything it serves, so the adapter that reads it had one
answer for everything -- it can return `guideline` or, for a code of practice, `rule`, and nothing
else. Act A1727 was therefore filed as advisory guidance, and `decide` rules an advisory instrument
out of every cell on the ground that it says how a binding instrument is read rather than imposing a
duty. The right rule, applied to the wrong fact.

`registeredKind` settles what a *listing* will support: primary legislation only where the listing
states an identifier or a standing, because a regulator's news page states neither and 73 of its
articles were once registered as Acts. That test is right about listings and silent about documents,
and a regulator publishing the statute itself falls in the gap.

The corroboration it asks for is there, in the document rather than beside it. **Where a source
states neither an identifier nor a standing, the kind is the one the document's own opening
provision states.** Both readings are anchored, because unanchored they are the same trap from the
other side: Singapore Customs' page for the Chemical Weapons (Prohibition) Act is one sentence long
and says the Act "is an Act to provide for", which no pattern tells from a long title except by
where it sits; and the central bank's legislation page prints four Acts' citation provisions in
turn, so a head naming more than one instrument is a page about instruments. A name read out of the
head must also be a name the register knows the document by -- a portal user manual saying "the
primary purpose of this Act is to protect the personal data of individuals" otherwise reads as a
citation provision naming an instrument called "to protect the personal data of individuals".

`statedKind` in `src/parse/identity.ts`, gated in `src/discover/index.ts` beside the title rule,
`scripts/repair-kinds.ts` to bring the register to it, six tests. Of 1,047 instruments whose source
stated nothing, 418 name no kind and are left alone, and **four move**: Act A1727 and the Money
Services Business (Amendment) Act 2024 to `act`, a P.U. (A) Order and Singapore's Strategic Goods
(Control) Order to `order`.

### An amendment that sets out the words it inserts is a source of law

`amendsAnotherAct` ruled out any provision that instructs a change to another Act, because the
vehicle imposes nothing itself. That is right about the instruction and wrong about what the
instruction carries. An amending section has two parts -- the direction, "The principal Act is
amended in Part II by inserting after section 12 the following division", and then the division
itself, set out in full between quotation marks: "12A. (1) A data controller shall appoint one or
more data protection officers". The first imposes nothing. The second is the duty, in the words the
legislature enacted, and until the next consolidation is printed it exists nowhere else.

Ruling both out reads an economy's newest law as absent. Malaysia's consolidation of the Personal
Data Protection Act is current to 1 July 2023 and contains the words "breach" and "data protection
officer" no times at all; the duties ESCAP scores for 6.1, 6.2, 6.4, 7.1, 7.3, 7.4 and 7.5 arrived
in the 2024 amendment.

**ESCAP's own method allows both places.** Its extraction slide says of an amendment: *"insert in
main law, or a single file."* Its guide scores a safe-harbour provision straight out of New
Zealand's Copyright (New Technologies) Amendment Act. So the line is not between the principal Act
and the amending one. It is between an instruction and the text the instruction enacts, and only the
second is a provision.

The rule: **an amending provision is not a source of law unless it sets out the words it inserts,
and where it does, those words are cited as the principal Act's.** `insertsTheQuotedWords` asks
whether the words a finding rests on fall inside a passage the provision sets out -- the inserted
duty passes, the instruction does not, a provision that only deletes does not. Decision-side, so it
costs no re-reading.

The citation is the other half, and is why `amends_instrument_id` exists. It has been in the schema
from the start and written by nothing. `amendsWhat` reads the clause an amending document uses to
name what it amends, which carries the principal's own gazette identifier -- so resolution is an
equality test rather than a fuzzy match against thousands of titles, and it either hits or finds
nothing. The clause has to be an amending clause: an Act's opening sections cite other Acts
constantly, for definitions and appeal tribunals and tax exemptions, and the first bracketed number
in a head is as often one of those as it is the principal.

`scripts/repair-amendments.ts` links **16** of the 24 that name one; the other 8 name an instrument
the register does not hold, and say so. Recall is low only because just 179 amending instruments
have text at all, which is the demand-driven design above. The two that matter most are there: Act
A1727 to the Personal Data Protection Act 2010, and the Money Services Business (Amendment) Act
2024 to Act 731. A finding on inserted words is now cited as *"Personal Data Protection Act 2010, as
amended by ..."*, which is what a reviewer can check.

Together these three changes remove all three blocks on the amendment at once. It is now `act` and
so binding rather than advisory; it is linked to its principal; and its inserted duties are
admissible. It ranks **second on all seven PDPA cells**, behind the principal Act at first.

### The same document registered twice is one instrument, not two measures

Twenty-eight Malaysian documents sit under two and three instrument ids each, byte-identical, same
content hash. They arise where the statute book and a regulator both publish the same gazette PDF --
the Online Safety (Fees) Regulations 2025 are there three times, once as P.U. (A) 466/2025 and twice
with no number at all -- and where one portal serves the same file from two paths.
`otherLanguageCopies` cannot see them, because it keys on instrument and label, so two copies under
two ids are two different keys and never pair.

What it costs is not wasted reading but wrong counting: several bands turn on how many measures an
economy has, and a cell handed one provision twice under two names can make two of it.

**Where two registrations hold the same bytes, the one whose source states an identifier or a
standing is the instrument, and the rest are copies** -- the same test the register already uses for
what a source will support. Where neither states anything the first registered is kept, which is
arbitrary between equals and is the only part of this that is. `duplicateRegistrations` joins
`otherLanguageCopies` and `outlineSections` as a third source for retrieval's skip set, retiring
**2,464** Malaysian sections, 2.0% of that register, and none at all in Australia or Singapore.

### The Commission's site renders in the browser

MCMC's crawl had no seeds, and a walk from its root reaches the footer and little else: its
`/en/legal`, `/en/resources/guidelines` and `/en/sectors/celco` pages answer with the same five PDF
links, because those five are the footer. It publishes no sitemap and its robots.txt is one line.
Its legal section is server-rendered and is where the instruments are, so the walk is seeded there.
Measured against the live site, that moves the yield from 105 instruments to 113, the Online Safety
Act 2025 among them. The portal's declared pillars were also wrong -- 7, 8, 10 and 11 for the
regulator that makes the Access Pricing Determination and the Content Code -- which is documentation
rather than behaviour, since nothing reads the field, but it has been corrected.

## Two findings that run the other way

### ESCAP scores 3.1 from sources its own methodology excludes

Their internal guide is explicit: *"Pillar 3.1 (Maximum foreign equity share) captures all sectors
except for telecommunications and e-commerce sectors because these sectors are listed under Pillar
5.1 and Pillar 12.1, respectively."*

Their Malaysian 3.1 has three source rows. Two are telecom -- the Communications and Multimedia Act
1998 and the MCMC Licensing Guidebook. The third, the one in scope, is the **Trust Companies Act
(Act 100) 1949, and it scores 0.8**. Our answer for 3.1 is **0.8**.

So the difference on 3.1 is not that we missed their instrument. We excluded it, on the rule their
own guide states, and landed on the same number their own in-scope row did. Our retrieval query for
3.1 says so in as many words: *"not telecommunications and not e-commerce, which are asked about
elsewhere."* This is worth reporting to them.

### A cited source URL is a soft 404

ESCAP's reference for the Information Paper on Regulatory Framework for Internet Messaging and
Social Media Providers 2024, cited for 12.8 and 9.4, answers **HTTP 200 with 188 bytes of HTML** --
an error page served with a success code, which no link checker reading status codes would catch.
The Licensing Guidebook URL beside it is live, at 7.1 MB. This is the same class as the dead URL in
their own answer key.

## Still open

- **The MCMC Licensing Guidebook 2023 is not collected.** It is live and it is cited for 3.1, 3.5,
  5.2, 5.5 and 9.4. It is not linked from any server-rendered page on the Commission's site, so the
  crawler cannot reach it, and the only URL we have for it came out of ESCAP's reference column.
  Adding that URL to the profile would be fitting the collector to the answer key, which is the one
  thing the baseline is quarantined to prevent. **This is a judgement call and is being left to be
  made deliberately rather than quietly.**
- **Act A1727 keeps a mangled title.** The register has it as "Amendment Of Personal Data Protection
  Act 2024"; it calls itself the "Personal Data Protection (Amendment) Act 2024". The title rule
  fires only where the filed title names no instrument at all, and this one does name one, just
  inaccurately. Widening that rule is a larger change with regression risk.
- **A provision that only deletes is not read as amending at all.** `amendsAnotherAct` looks for "is
  amended", so "Paragraph 48(e) of the principal Act is deleted" is caught by neither the old rule
  nor the new one. Nothing turns on it today -- such a provision carries no duty to build a finding
  on -- and it is recorded as the one shape this rule does not reach.
- Carried from the first sweep and untouched: the 77 orphan `section_fts` rows, Singapore's missing
  domain registry for 12.7, the stale `instrument.status` schema comment, `current_to` for Australia
  and Singapore, and the framework-gate table that wants re-measuring.

## What this means for the run

Malaysia's case has changed. Its retrieval today feeds the reader better than Australia's and
Singapore's did in the run whose answers we are holding, its principal telecom statute reaches the
cells that turn on it, its newest law is admissible for the first time, and its duplicate
registrations no longer count twice. The argument for holding it back was that a run would
re-measure a retrieval failure we could already name. That failure has been named and closed, and
what is left to learn about those cells can only be learned by reading them.

The three economies are now in the same position, which is that the next thing worth spending is a
run.
