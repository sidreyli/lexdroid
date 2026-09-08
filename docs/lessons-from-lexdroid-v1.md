# What ESCAP asks for, and where LexDroid v1 went wrong

*Written 6 September 2026, after reading the ported documentation closely. Not an ESCAP document —
this is our own record. The primary sources in `framework/`, `finals/` and `feedback/` win wherever
they disagree with anything here.*

---

## Part 1 — The method, in ESCAP's own words

Their researchers follow a fixed process. The 5 June workshop states it as a five-step loop, run
once per indicator per economy:

> define the indicator → identify likely source families → locate the official source →
> extract the operative clause → map it to the database fields

**The unit of work is a cell: one economy × one indicator.** 61 regulatory indicators. Fourteen
further indicators are non-regulatory and ESCAP states plainly that no extraction tool is required
for them — they come from WITS, V-Dem and treaty participation lists.

### The five rules that decide whether a row is right

**1. Every indicator gets at least one row.** From the format requirements: *"In the main dataset,
each indicator covers at least one row."* And when nothing restrictive exists: *"provide informative
statement."* The quality checklist puts it as a question: *"If there is no captured restriction, did
I still cite the general governing law as the reference basis?"*

This is visible throughout their own data. Australia indicator 2.2 scores 0 citing the Commonwealth
Procurement Rules 2024, June 2024, linked, with: *"No requirements to surrender source codes or use
certain encryption standards are found as a condition to win tenders."* Roughly half of every
economy's rows are that shape.

**A zero is a claim about a named instrument. It is never a blank, and it is never a silence.**

**2. The scale is about a hundred rows per economy.**

| Economy | Rows, all 61 indicators | Score 0 |
|---|---|---|
| Australia | 70 | 39 |
| Singapore | 80 | 45 |
| Malaysia | 97 | 43 |
| Russian Federation | 97 | 37 |
| China | 111 | 33 |
| Thailand | 118 | 69 |
| India | 146 | 53 |
| Indonesia | 172 | 60 |

**3. Read the operative clause, not the keyword.** From the workshop: *"Extract the operative
clause, not just the title or summary. Always ask: who is regulated, what is required or prohibited,
to what data, service or sector, under what conditions, and with what exceptions."* And:
*"Sometimes negation, exceptions, and conditions matter more than keywords — unless, except that,
provided that, subject to, notwithstanding, only if, to the extent, may, shall, must."*

Their Bhutan worked example is the warning: three sections full of "network", "access control" and
"restrict interconnections" are **not** a local infrastructure requirement, because they govern who
and what can connect, not where anything is stored. The lesson they draw: *"Do not rely solely on a
literal piecemeal analysis of statutory keywords; instead, consider both the semantic context and
the underlying legal functions."*

**4. Hierarchy is not coverage.** *"Horizontal does not mean higher rank. Sectoral does not mean
lower rank."* An Act and an Act rank the same whether one is a Cybercrime Act and the other a
Broadcasting Act. Coverage affects the score; rank affects whether the instrument binds at all.
Guidelines bind if a law mandates them. National strategies generally do not.

**5. Primary sources only, with three named exceptions.** Secondary material is a lead to the
primary source and belongs in Notes. The exceptions are indicators 3.4, 5.3 and 9.1, which turn on
observed practice rather than text, and there official reports and actual cases are admissible.

### The scoring is mechanical

Every one of the 61 score bands, read from the guide, is a function of a handful of attributes.
Indicator 6.2 in full:

> 1 when a local storage requirement covers personal data or applies horizontally across sectors,
> or when there are two or more requirements applied to non-personal or specific data;
> 0.5 when it applies to non-personal data, a specific set of data, or one economy;
> 0 when there is no requirement.

The inputs are: does it require local storage; personal or non-personal data; horizontal or
sectoral; how many measures; government data or commercial. Nothing else. **The score is arithmetic
over facts read out of the text — it is not a judgement to be generated.**

### What ESCAP's reviewers actually mark

From the fifteen graded submissions in `feedback/`, the same eight corrections recur:

1. Dead or wrong links — *"none of the reference links lead to the right document."*
2. Quote first, then interpret. Said six separate times.
3. One official link per document; secondary links to Notes.
4. Timeframe per document: *"Since Month Year, last amended in Month year."*
5. Over-inclusion gets deleted — *"not quite related, better to remove this entry."*
6. One measure per row — *"if the single entry includes multi measures, suggest to separate."*
7. Claims the cited section does not support — *"section 125 did not mention the minimum 7 years."*
8. Unevidenced amendment dates — *"please double check."*

Six of the eight are checkable facts about the source, not legal judgement.

### And two further things they said

*"Do not collapse evidence into scores too early. Keep source fragments, interpretations, and
scoring decisions separate."* — 12 June workshop.

*"A single regulatory measure may address multiple RDTII 2.1 indicators… researchers should record
it under all applicable indicators."* — Chapter 2 of the guide. Recording the same instrument under
several indicators is correct, not duplication.

---

## Part 2 — Where v1 went wrong

Ten root causes. Symptoms are grouped under the cause that produced them.

### 1. It asked the inverse question, 33,000 times

v1 asked, per document: *"does this say anything about any of our 61 indicators?"* — 536 documents
× 61 indicators for Singapore alone. ESCAP asks the opposite: *"which instruments govern local
storage here?"*

The inversion was forced by one fact: there was no corpus-wide semantic index. The dense retriever
was built per document, so a corpus-level question could only be answered by visiting every
document. The one corpus-wide index was lexical only and sat behind a regex admission gate.

### 2. Absence was treated as something to prove — and then, elsewhere, not at all

v1 would not say 0 unless it could prove it had read everything. That is a universal negative over
an unbounded corpus, so it abstained on **all 61 indicators for Malaysia and Australia**. Ten of
sixteen answer-key misses were that abstention.

Then in the same system, the opposite failure: **39 of the 41 indicators with zero findings were
released as 0.0** — reporting "no restriction" for things it had never searched for. 70% of
Australia's released scores and 80% of Malaysia's rested on a fallback branch.

Both errors have one cause: there was no concept of a zero as a cited claim about a named
instrument. ESCAP never proves exhaustion. They find the governing law and read it.

### 3. Accuracy was hand-carved, so it could not scale

1,489 lines of English regular expressions existed to delete the model's bad answers. They covered
exactly 13 indicators — precisely the 13 the answer key grades. Nothing existed for the other 48,
and nothing could, at that cost per indicator.

Then the patterns began vetoing correct answers. One predicate matched 31 of 1,490 sections the
model had accepted, so **1,279 findings lost their citation** and blocked as "not an exact
pinpoint". Another dropped a controlling provision because the regex matched "required to" and the
statute said "requiring".

This is the standing axiom violated in code: *we should never be writing patterns to delete the bad
answers.* Every correction rule was a bug report about a question asked badly, and we kept writing
correction rules instead of fixing the question.

### 4. The model produced the score, so the score had to be argued with

The indicator answer was computed as the maximum severity over whatever tags survived a gate. The
answer had no independent existence, so a single bad tag overrode everything and could not be
reasoned with — which is exactly *why* the deletion layer had to exist.

ESCAP's bands are mechanical. The model should have been reading facts out of the text and nothing
else.

### 5. It over-produced by twenty times and called it recall

1,489 findings for Singapore against ESCAP's 80. 74% of findings needed human review; only 25.8%
were approvable. The reviewer's burden was the product, not a side effect. More output was read as
better recall when it was mostly noise.

### 6. Non-English failed silently

The lexical tokenizer was `[a-z0-9]+`. Thai, Chinese and Cyrillic text produced an empty token list,
so search switched itself off for the whole document without saying so. The semantics layer was 99
English regexes, so every non-English finding came back unverified. A tool built for an
Asia-Pacific index could only read English, and did not admit it.

### 7. Legal hierarchy was confused with coverage

Malaysia scored 4 of 13 because Acts were classified as secondary sources while a regulator's
guidance was treated as binding. ESCAP's slide says it in one line: *hierarchy is not the same as
coverage*.

### 8. Provenance was missing on the things reviewers check first

Timeframe was unknown on 1,489 findings, because nothing read the effective date the document
states about itself. 852 Australian documents were silently certified as clean negatives when the
parser had produced nothing from them. 65% of Australia's "searched" cells were negatives over
documents with no citable provision. The parse cache was 99% stale. robots.txt was never fetched.

Every one of these is a fact about the source — the exact class ESCAP's reviewers mark hardest.

### 9. The shell outgrew the substance

31,835 lines of backend source, 21,490 lines of tests, 378 tracked files, no release tag — against
a criterion that a stranger must deploy it on a clean machine in under thirty minutes.

### 10. The measurement loop rewarded the wrong thing

Effort went into finding wrong answers and building machinery to suppress them. Sustained work
produced flat results because the thing being optimised — fewer visibly bad rows — is not the thing
being marked.

---

## Part 3 — What was right and should survive as ideas

Not as code. As requirements on whatever replaces them.

- **The verbatim-at-anchor check.** The snippet must appear character-for-character at the cited
  location, verified against the stored document. This is the credibility of the entire project.
- **The discard ledger.** Anything dropped anywhere is named, never merely absent.
- **Polite fetching with a content-addressed cache** — and the cache is what lets a second engine
  pass read the same documents while fetching nothing, which the live test checks directly.
- **Engine selection inside the interface**, and an offline source mode reachable from the same form.
- **Export that fills ESCAP's own template** rather than rebuilding it, so their formulas and
  reference sheets survive intact.
- **Separating billable from cache-served tokens**, and recording which model answered.

---

## Part 4 — The shape this implies

Stated as constraints on the rebuild, not as a design.

1. The unit of work is the cell. Every cell ends with an answer and at least one cited row,
   including when the answer is zero.
2. The corpus is indexed once, across all documents, in a way that works for Thai, Chinese and
   Cyrillic as well as English.
3. Exactly one stage talks to a model, and it reads facts: who is regulated, what is required, over
   what scope, under what conditions, with what exceptions — quoted verbatim, with the sub-clause
   named.
4. The score is a pure function of those facts, written once per indicator from ESCAP's own bands.
   The model never emits a number.
5. Verification is deterministic and checks the source, not the model: snippet at anchor, URL
   resolves on an official host, amendment date evidenced in the document, instrument in force.
6. Nothing anywhere deletes a bad answer by pattern. If we want to write such a rule, that is a bug
   report about the question we asked.
7. Output volume in the same order as ESCAP's own. A thousand rows for Singapore is a defect.
