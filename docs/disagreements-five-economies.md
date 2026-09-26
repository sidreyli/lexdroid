# Where we differ from ESCAP across five economies, and who is right

Written 27 September 2026 over the latest full run of each economy:

| Economy | Run | Built on |
| :-- | :-- | :-- |
| Australia, Malaysia, Singapore | `a74d0fca` | 25 Sep |
| India | `283f457e` | 26 Sep |
| Thailand | `f8848a01` | 26 Sep, branch `feat/thailand-run` |

Agreement with ESCAP was 215 of 305 cells as run, and is 225 with today's fixes. This document
sorts the disagreements by **who is right**, because agreement measures the reader, not the law (see `aus-sgp-disagreements.md` for the
same exercise on an earlier Australia and Singapore run).

Each disagreement was judged from both sides' evidence: our cited provision and quote, ESCAP's
cited instruments and score, and the indicator's own band text. It is a desk judgement, not a
re-reading of every statute. Where it turns on a fact the evidence does not settle, the cell is
**contestable**, not forced into a side.

## The split

Scored with the rules as they stand after today's fixes (below), which rescore the stored readings,
plus India's pillar 8 re-read (run `78642831`, which carried the rest of `283f457e`):

| | AUS | MYS | SGP | IND | THA | Total |
| :-- | --: | --: | --: | --: | --: | --: |
| Agree | 45 | 49 | 45 | 41 | 45 | **225** |
| We are wrong | 9 | 10 | 8 | 10 | 12 | **49** |
| We are right, ESCAP is not | 3 | 0 | 5 | 3 | 1 | **12** |
| Contestable | 2 | 1 | 2 | 5 | 2 | **12** |
| Not answerable from legislation | 2 | 1 | 1 | 2 | 1 | **7** |

So **237 of 305 (78%) are defensible**. 49 cells (16%) are ours to fix.

Where the ten extra agreements came from, against the 215 the runs recorded:
- **Five from rule fixes already on master since the Australia, Malaysia and Singapore run:**
  AUS 10.3, AUS 12.4.4, MYS 12.8, SGP 3.5, SGP 10.1. SGP 10.1 agrees for a partly wrong reason: its
  citations include the hazardous-waste and meat import bans next to the real telecom equipment one.
- **Seven for India from today** (below).
- **Minus two** where today's payment fix made us disagree, and we are the ones who are right.

## Our finds: we are right and ESCAP is not

These go in the report as LexDroid findings, with both scores and both citations. They are not
defects and no rule should be written to remove them.

| Cell | Ours | ESCAP | Why ours stands |
| :-- | --: | --: | :-- |
| AUS 5.1 | 0 | 0.5 | Telecommunications Act 1997 Sch 1 Part 5: a carrier *must* give another carrier access to its towers and sites. Passive sharing is mandated, not merely practised. |
| AUS 6.2 | 1 | 0.5 | Three sector storage duties with civil penalties (Banking Act s.60, Insurance Act s.49Q, SIS Act s.35A). The band reads "OR more than one measure in category (2)". |
| AUS 9.1 | 1 | 0 | Interactive Gambling Act blocking of offshore gambling sites is commercial content. ESCAP cites the Copyright Act, whose s.115A site-blocking injunctions are also blocking, and still scores 0. |
| SGP 8.3 | 1 | 0.5 | Online Safety (Relief and Accountability) Act 2025 s.52: end-user identity collection for online services. The Act postdates ESCAP's round. |
| SGP 11.2 | 0 | 0.5 | Telecommunications (Dealers) Regulations reg 20A accepts a supplier's declaration of conformity. ESCAP cites the MRAs, not the regulations. |
| SGP 12.8 | 1 | 0 | Financial Services and Markets Act 2022 s.143: a digital token service licensee must keep a person present at a permanent place of business. In force from June 2025, after ESCAP's round. |
| SGP 9.3 | 1 | 0 | POFMA s.37 forbids paid content on a declared online location. That is a statutory restriction on online advertising, not the voluntary advertising code ESCAP cites. |
| IND 6.1 | 0.5 | 1 | ESCAP reaches 1 by counting three measures, two of which are government-data measures (NDSAP, the cloud contract guidelines) that its own guide says not to score. On the one that counts (DPDP), 0.5 is the band. |
| IND 6.3 | 1 | 0 | Companies (Accounts) Rules r.3(5): electronic books "shall be kept in servers physically located in India". ESCAP cites only the DPDP Act. |
| IND 7.2 | 0.5 | 0 | India has no dedicated cybersecurity law. The IT Act is non-dedicated, which is the 0.5 band. ESCAP's 0 rests on the National Cyber Security Policy 2013, which is not legislation. |

Two more became finds after today's payment fix (below), because ESCAP scores the same rule
differently in different economies:

| Cell | Ours | ESCAP | Why ours stands |
| :-- | --: | --: | :-- |
| THA 12.4.1 | 1 | 0 | The Bank of Thailand's e-money rules require customer float to be deposited in a separate account at a Thai commercial bank. ESCAP scores India's identical escrow rule 1. |
| SGP 12.4.7 | 1 | 0 | The Payment Services Act forbids an account issuer to let users withdraw e-money and exchange it for cash, which is a restriction on paying by e-money. |

## Not answerable from legislation

**5.3 in all five economies** (government shareholding in telecom operators) is left unresolved on
purpose. ESCAP answers it from annual reports and share registers. That is five guaranteed misses,
and it is a product decision rather than a defect: filling them means stating a fact no statute in
the corpus states.

**3.4 in Australia and India.** The top band needs "a case that the screening mechanism has been
used to block an investment". That is an event, not a provision. Our 0.5 ("two or more mechanisms")
is the highest band legislation can reach.

## Contestable

| Cell | Ours | ESCAP | The question |
| :-- | --: | --: | :-- |
| AUS 1.4 | 0 | 0.5 | ESCAP names no anti-dumping measure on an ICT good, only the Customs Act. |
| AUS 2.1 | 0 | 0.5 | ESCAP's exclusions (TikTok on government devices, the 5G vendor guidance) are directions and guidance, not "legislative measures" as the band requires. |
| MYS 2.1 | 0 | 1 | ESCAP scores the Treasury Instructions. The Government Procurement Act 2026 postdates them, and we read it and found no exclusion. |
| SGP 3.1 | 0.8 | 0 | Our cap is on foreign lawyers in law corporations. It is real, but legal services are a doubtful "sector relevant to digital trade". |
| SGP 6.2 | 1 | 0.5 | Two Companies Act record-keeping duties (s.199, s.379) as "more than one measure". Defensible either way. |
| IND 12.4.4 | 1 | 0 | PSS Act s.4 requires authorisation. The band asks for *restrictive conditions*, and the quote shows none. |
| IND 2.2 | 0 | 1 | ESCAP scores the OSS adoption policy (a policy, not law) as a source-code surrender condition. Our witness (Official Secrets Act) is wrong regardless. |
| IND 3.2 | 1 | 0 | Make in India Order cl. 13A requires foreign firms to form a JV with an Indian company to bid. It is real, but arguably pillar 2 (procurement), not 3 (investment). |
| IND 4.1 | — | 0 | India has no trade-secrets statute; protection is contract and equity. ESCAP calls that effective (0); 0.5 is at least as arguable. |
| IND 4.9 | 0 | 1 | IT Act s.69 is a national-security decryption power, which the band text puts at 0.5, not 1. |
| THA 12.3 | 0 | 1 | ESCAP's only 1 row is the digital-ID licensing decree, which is not a licence to sell online. Its other four rows score 0. |
| THA 8.4 | 1 | 0 | The Copyright Act's notice-and-takedown condition arguably is a removal duty, but our lead citation (PDPA erasure) is wrong. |

## We are wrong

The 49, by cause.

**The answer rests on the wrong statute, and the right one was never reached (16).** A zero is
witnessed by an instrument unrelated to the question. Examples: India's other payment restrictions
"witnessed" by the Online Gaming Act, Thailand's de minimis by an exchange control regulation,
Malaysia's accounting separation by the Development Financial Institutions Act. The answering
provision is usually in the corpus.
- AUS 2.3, 5.2
- MYS 2.3, 3.1, 5.2, 5.4, 5.5, 8.3, 12.7
- IND 1.4, 12.01, 12.4.7
- THA 5.2, 6.1, 8.3, 12.5

IND 12.01 is the sharpest case: the FDI Circular's "not permitted in inventory based model of
e-commerce" was read and answered "does not apply".

**We counted a provision about something else (20).** For example: genetically engineered
organisms as an ICT import ban (IND 10.1); a `.au` domain licence, a digital-token licence and a
telecom licence as online-content licences (AUS, SGP, THA 9.4); endangered species and food as ICT
export controls (SGP 10.4); a maritime radio operator's personal certificate as accepted product
testing (IND 11.3).
- AUS 3.1, 9.4, 10.1, 10.2, 11.3
- SGP 4.1, 9.4, 10.2, 10.4
- IND 9.4, 10.1, 10.2, 11.3
- THA 3.4, 4.3, 9.3, 9.4, 10.1, 10.2, 12.4.3

**Left unanswered where an answer existed (7).** Each rests on a provision held as "could not be
evaluated": no figure stated, a definition, or a code of practice issued under an Act and filed as
"published about the law".
- MYS 4.1, 5.1, 12.5
- SGP 5.4, 5.7, 12.5
- IND 12.5

**Other (6):**
- IND 4.01 and THA 4.01 missed the local-agent and reciprocity requirements.
- IND 4.2 and SGP 4.2: interim injunctions live in civil procedure, which the patent domain rightly
  excludes, so "no provisional measures" was concluded from the Patents Act alone.
- AUS 12.5 read "$250 or such other amount as is prescribed" as the threshold, and the prescribed
  amount is A$1,000.
- AUS 6.1 counted a storage duty as a processing requirement.

## Fixed today, decision-side

| Change | Cells | Graded across all five |
| :-- | :-- | :-- |
| A payment regulation's title carries the online-payment domain, and "payment aggregator" is a payment noun | IND 12.4.1 | +1 IND; SGP 12.4.7 and THA 12.4.1 move to 1, both finds (above) |
| A permission or eligibility confined by "only" is a requirement, not a declaration | IND 2.1, 2.3, 12.4.2 | +3, nothing lost |
| Two RBI Master Directions and the FEMA Receipt and Payment Regulations 2023 had been registered as `guideline` (advisory), `register-url`'s default. Corrected in the India database to `notice` and `regulation` | IND 12.4.5 | +1 |
| India pillar 8 re-read on current code, which puts the parent Act in front of a framework question (22ad63d, after this run) | IND 8.1, 8.2 | +2. The IT Act s.79 safe harbour is now examined. |

Tried and reverted, because each lost more than it won:
- Scoring a licence-lifted import prohibition as a licence, not a ban: −2. ESCAP counts approval-gated bans on named telecom equipment.
- A product domain on 11.3: +1 −2.
- Requiring 3.4 screening to name a foreign party: −1.
