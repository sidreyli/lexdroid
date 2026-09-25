# Malaysia: is the corpus ready for the batch run?

Malaysia has no run on the current corpus, so its 61 cells cannot be audited the way Australia's
and Singapore's were. What *can* be asked without spending a run is the question `reach.ts` asks of
a finished one: for every instrument the published index cites, did it ever get into the corpus?
Measured 21 September 2026, against `baseline_row` where `source = 'round-1'`.

## The parser fix does not apply here

The re-parse before the batch run recovered a great deal of Australian and Singaporean text -- the
Employment Act 1968 went from 0 sections to 159 -- by replacing a sibling walk with a document-order
walk in `src/parse/html.ts`. Malaysia was not re-parsed, and does not need to be:

| extraction | documents |
| :-- | --: |
| pdf-text | 1532 |
| ocr | 84 |
| none | 19 |
| html | 3 |

The fix is an HTML fix and Malaysia is a PDF corpus. Three documents could be affected.

Malaysia does have 35 heading-only documents against Australia's 1 and Singapore's 0, but all 35 are
`pdf-text` over `application/pdf`. They are a different defect: a scanned PDF that the text layer
could not read and OCR never got. The worst is the DPO Competency Guideline, 13 sections and 1,414
characters out of a 124 MB source.

## 67 cited instruments, 41 of them reachable

| | |
| :-- | --: |
| matched outright | 34 |
| matched once the amendment is resolved | 7 |
| not legislation (reports, portals, company accounts) | 12 |
| genuinely absent legislation | 14 |

The seven in the second row matter more than the number suggests, because they are the reason a
naive reach check reports Malaysia as much worse than it is. Malaysia consolidates amendments into
the principal Act, so a citation to an amending Act is a citation to text that lives somewhere else:

| ESCAP cites | the text is in |
| :-- | :-- |
| Copyright Right (Amendment) Act (Act A1645) 2022 | COPYRIGHT ACT 1987 (165,376 chars) |
| Copyright Right Act (Act 332) 1987 | COPYRIGHT ACT 1987 |
| Patents (Amendment) Act (Act A1649) 2022 | PATENTS ACT 1983 (151,665 chars) |
| Sales Tax (Amendment) Act (Act A1671) 2022 | SALES TAX ACT 2018 (155,810 chars) |
| Sedition (Amendment) Act (Act A 1485) 2015 | SEDITION ACT 1948 (13,862 chars) |
| Customs (Prohibition of Imports) (Amendment) Order 2024 | CUSTOMS (PROHIBITION OF IMPORTS) ORDER |
| Personal Data Protection (Amendment) Bill (Act A1727) 2024 | Amendment Of Personal Data Protection Act 2010 |

"Copyright **Right** Act" is ESCAP's own typo, twice. This is worth carrying back into `reach.ts`:
its `unregistered` verdict is measured with `sameInstrument` against the raw citation string, so in
any jurisdiction that consolidates, an amendment citation reports as unregistered against a
principal Act that is sitting in the corpus at full length. Australia and Singapore cite principal
Acts far more often, which is why this has not shown up before.

## The 14 that are really absent, and where they come from

Bank Negara Malaysia policy document on electronic money (cells 12.4.4, 12.4.5, 12.9); MCMC access
pricing determination (5.1), technical standards regulations (10.2, 11.2), accounting separation
guidelines (5.4), prepaid end-user registration guidelines (8.3), licensing guidebook (3.1, 3.5,
5.2, 5.5, 9.4); the Personal Data Protection Standard 2015 (7.3); the distributive trade guidelines
(12.01, 12.2, 12.3); Electricity Regulations 1994 (11.2); Countervailing and Anti-Dumping Duties
Regulations 1994 (1.4); Strategic Trade (Strategic Items) List 2023 (10.2); a cryptographic module
validation list (11.4); Treasury Directive 1966 (2.1, 2.3).

Almost all of it is regulator-issued subsidiary material rather than legislation, and the portals
are configured -- so the question is yield, not coverage:

| Malaysia | found | the comparable portal elsewhere | found |
| :-- | --: | :-- | --: |
| Laws of Malaysia + P.U.(A) + P.U.(B) | 16,650 | Federal Register of Legislation | 28,363 |
| Malaysian Communications and Multimedia Commission | 120 | Infocomm Media Development Authority | 42 |
| Personal Data Protection Department | 78 | Personal Data Protection Commission | 34 |
| **Bank Negara Malaysia** | **1** | **Monetary Authority of Singapore** | **376** |
| Intellectual Property Corporation of Malaysia | 0 | IP Australia / IPOS | 23 / 5 |
| Royal Malaysian Customs Department | 0 | Singapore Customs | 5 |

MCMC and the data-protection department are yielding normally for a regulator portal in this
pipeline; the specific documents cited are simply not among what they returned. Bank Negara is the
clear outlier: one instrument against the Monetary Authority of Singapore's 376, for the regulator
that issues the policy document three payment cells are cited against. MyIPO and Customs at zero
are next.

> **Since measured and fixed.** Bank Negara now registers 97 and Customs 21, and the Policy
> Document on Electronic Money is in the corpus as the policy rather than the press release
> announcing it. MyIPO is still zero and is not fixable from here. The table above is the diagnosis
> that prompted the work, kept as it was written; `zone1-gaps-closed.md` records what each portal's
> silence turned out to be and what closing it cost.

## What this does and does not justify

It does not justify registering the fourteen documents by name. Fetching exactly what the published
index cites is fitting to the answer key, and the cells would then agree for a reason that would not
survive the next economy.

It does justify looking at why three regulator portals return one document or none, because that is
a Zone 1 defect that holds out whatever those regulators publish, cited or not. That is a crawl, not
a run: no GPU, no reader. Whether it is worth spending before the batch is a scheduling call, and
the batch is currently blocked on RunPod credentials anyway.
