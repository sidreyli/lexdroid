# A pointer is not a name

Asked on 22 September 2026: close the one thing left open by the last three sources -- a registry
policy whose substance sits in a PDF behind its own page, and the sixteen landing pages like it.

The write-up that left it open said the rule that would close it was "written down and not
implemented". That was wrong: both halves of it were implemented and shipped. What was actually
missing was a third case that neither half covers, and finding it turned up three more defects of
the same shape. All four are about the same thing -- **a word that points at a document is not the
document's name** -- and they sit at four different places in the pipeline.

## The case that fell between the two rules

A page becomes its own linked file in two ways already.

- `soleDocumentLink` runs where the page was set aside unread. A page of menus wrapping one PDF is
  pointing at its own instrument, and it has no text of its own to lose.
- `namedDocumentLink` runs where a linked file repeats the instrument's name and says several
  times more than the page does. That is the announcement: a regulator posts a notice about a
  policy, and the policy is the file.

The registry's policy pages are neither. Each is one paragraph -- "This Policy sets out the rules
and regulations governing the application and the registration of .MY domain names ... The
Registrant Policy can be downloaded **here**" -- so the page reads, and `soleDocumentLink` never
runs. And "here" is not the instrument's name, so `namedDocumentLink` never matches. The register
held the sentence that mentions the policy and none of the policy.

> A page offering exactly one file of its own, under a link that names nothing, is offering its
> own document.

The guard is what makes it safe, and it was not designed -- it was read off the register. Thirty
pages in the three economies link exactly one file that `namedDocumentLink` does not already
claim, and their link text splits them cleanly in two:

| the link says | what the page is |
| :-- | :-- |
| "here", "(340.7 KB)", "link (660.1 KB)", "PDF 395.77 KB", "Download the print version" | the page is publishing that file |
| "Enforcement Approach", "P.U. (B) 76/2026", "Formal warning", "OAIC ... Privacy Guidance" | the page is citing some other document |

Nine of the second kind are media releases about penalties on named banks, each linking the same
enforcement policy. Adopting it would have filed nine copies of one document under nine wrong
names, and that is the test the rule had to survive. It survives it because a link that names
something is saying *which* document it points at, and a page whose one file is some other
document is a page citing it.

`namesAnInstrument` cannot draw this line -- it says no to "Enforcement Approach" and no to
"Registrant Policy" alike -- so the test is not whether the link names an instrument but whether
it names anything at all. What is left of "download the print version" or "(340.7 KB)" once the
mechanics of following a link are taken away is nothing; what is left of "Enforcement Approach" is
a name. The words are a closed class and a fact about how English links are written: no word in
the list is a subject, an agency or an instrument.

The measured gain test stands unchanged on top of it -- the file must say three times more than
the page -- and it earned its place again here. Of fourteen pages the rule named, four were turned
away by it, including a page offering the print version of itself.

**493 sections adopted**, in six instruments:

| | was | now |
| :-- | --: | --: |
| Registrant Policy (MY registry) | 2 sections | **138** |
| Data Protection Policy | 2 | **104** |
| .MY Domain Name Dispute Resolution Policy | 2 | **105** |
| Registrar Policy | 2 | **49** |
| Guidelines on the Application of Banking Regulations to Islamic Banking (SG) | a 1,322-character media release | **55 sections** |
| E-Payment User Protection Guidelines (SG) | a 2,521-character media release | **42 sections** |

Malaysia's registry cell now answers from the policies themselves: **12.7 retrieves the registry's
own rules at ranks 1, 2, 3 and 4**, and rank 3 is the operative provision rather than the sentence
that used to stand in for it.

## What that turned up: a name is not a clause

The Registrant Policy arrived, and the register renamed the instrument **"pursuant to the
Universities and University Colleges Act 1971;"**.

A PDF guesses its own name from the line it repeats on its own pages, which is a good guess,
because a running header is set in reading order and a cover page is not. But a table repeated
down three pages repeats its lines too, and the registry's policy lists its domain categories one
per row -- ".edu.my, for institutions established pursuant to the Universities and University
Colleges Act 1971;". That line mentions an Act, so it cleared the bar `ownName` sets, which is
that a recovered name must name an instrument.

What is wrong with it is not the Act it names but that it is not a name.

> A title that begins on a word which can only continue a sentence, or ends on the punctuation
> that continues one, is a piece of a sentence and not a name.

Two marks, each sufficient, neither about any subject matter. A third was tried and withdrawn: a
verb of obligation looks like the surest sign of a sentence, and across the three registers it
caught no clause and seven real titles -- "Therapeutic Goods (Medical Devices--Information that
**Must** Accompany Application for Inclusion)" says "must" inside a relative clause, which is a
noun phrase and an ordinary name. The Malay openers went the same way: none of them caught
anything, and "yang" opens an Act that has been called that since 1957. The opener also has to be
followed by a space rather than by any break between words, because "By-laws" is one word and a
whole title.

Applied at the two places it belongs:

- **`ownName` no longer accepts a clause as a name.** This is the gate every parser's guess passes
  through on its way into the register.
- **`runningHeader` no longer offers one.** A repeated line is a header only if it is a name, and
  where every repeat is a clause the document has no running header -- which lets its citation
  provision be asked instead of a worse answer being given.

The second was measured over 400 of the corpus's PDFs, and it is a straight improvement well
beyond the case that prompted it: **49 titles change and every change is better**, because the
clause that used to win was crowding out a real two-line header. "LEMBAGA KEMAJUAN IKAN" becomes
"Lembaga Kemajuan Ikan Malaysia Act 1971"; "(INCORPORATION) ACT 1948" becomes "Director General of
Social Welfare (Incorporation) Act 1948"; "DEVELOPMENT) ACT 1992" becomes "Loans (International
Fund for Agricultural Development) Act 1992". None was lost.

`scripts/repair-clause-titles.ts` brought the stored register to it. Two entries renamed, each to
the name its own page carries. Four clauses remain and are left alone: three are the register's
own titles, truncated by the source at a comma and holding no text, and one has no page of its own
to take a name from. The register says the wrong thing about them visibly rather than plausibly.

## And a third place: a link that tells you to follow it

The same word does the same damage one stage earlier. The crawl admits a link whose text names an
instrument, and it had admitted **"Click to view the Financial Services Act 2013"**, **"Download
Guidelines for Dispute Resolution"** and **"here for the guide"** -- each ends in a noun the
register knows, so each was filed as an instrument under the sentence pointing at it. The last of
them came back eighth for Singapore's registry cell.

> A link that begins by telling you to follow it is pointing at an instrument, not naming one.

"Open" and "go" were in the first draft and are not in the rule: the Open Electricity Market Code
of Practice is a real instrument, and a word that opens a name as often as an instruction is
evidence of neither. Three registered entries in the three economies, thirteen sections between
them; the rule is what stops the next crawl adding more.

## Two things measured and not done

**A document's own citation provision does not outrank the title it was filed under.** It looks as
though it should -- a citation provision is the instrument naming itself in law, which is the best
evidence there is -- and one stored entry proves the point: 1,821 sections registered as the
Strategic Goods (Control) **Act** say they are the Strategic Goods (Control) **Order 2025**. But
across the three economies 106 documents disagree with their register, and almost all of the
disagreement is a Malay citation provision against an English filed title: the Customs
(Prohibition of Exports) Order 2023 says it is the Perintah Kastam (Larangan Mengenai Eksport)
2023. Letting the stated name win would rename most of Malaysia's delegated legislation into
Malay. Rejected on the measurement, and the Strategic Goods entry recorded as a finding instead.

**Two registrations of one instrument are not found by their title.** The registry serves each
policy at two paths, so each is registered twice, and `duplicateRegistrations` only catches the
pair whose bytes match. Grouping by title instead looked obvious and is badly wrong: 82 separate
Malaysian gazette orders are all called "Appointment of Lock-Up to be a Place of Confinement", and
each appoints a different lock-up. Rejected on the measurement.

## What is still open

- **Four of the registry's policy pages hold only their shell**, because the register stores a
  document by its URL and the file they point at is already held by their twin. They are two
  sections each and they sit beside the full text under the same name.
- **One file the registry links is not a file.** Its transfer policy's PDF URL answers 200 with
  124 KB of HTML, and pdf.js reports "Invalid PDF structure". That is the site, not the collector.
- **Sixteen landing pages remain**, unchanged in number: the four this closed were never among
  them, and the sixteen that are hold no single file of their own to adopt.
- **Three entries whose title is a pointer** stay in the register, with thirteen sections between
  them. The collector will not add more.

## What held

- 131 test files, 1,289 tests, typecheck clean.
- `grade` on both banked runs is unchanged by all of this: Australia and Singapore 36 -> 37, the
  same five fixed and four broken. Four rules that move no banked cell are four rules that cost
  nothing to carry into the run.
- **Correction, same day.** The Malaysian half of that line said "40 -> 30, the same cells fixed and
  the same broken", and it is not a measurement of the rules. That run no longer holds the readings
  it was decided on: 56 of the 69 provisions its answers cite carry none, and 3,356 of the 19,785
  it read survive. The re-parse cascaded them away while the citations were re-attached, which is
  what `reanchor` is built to do. `grade` now says so before it prints and marks each cell it
  cannot vouch for -- see [Grade was scoring Malaysia on a remnant](grade-on-a-remnant.md).
- Every section in all three economies is embedded: AUS 77,403, MYS 124,250, SGP 35,203, none
  outstanding.
