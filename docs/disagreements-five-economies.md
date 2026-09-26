# Where we differ from ESCAP across five economies, and who is right

Written 27 September 2026 over the latest full run of each economy:

| Economy | Run | Built on |
| :-- | :-- | :-- |
| Australia, Malaysia, Singapore | `a74d0fca` | 25 Sep |
| India | `283f457e` | 26 Sep |
| Thailand | `f8848a01` | 26 Sep, branch `feat/thailand-run` |

Agreement with ESCAP was 215 of 305 cells as run, rose to 231 with today's fixes, and is 223 after the rules
that stopped eight agreements resting on the wrong law (below). 217 of those are earned. The fixes after that
(IND 12.01, IND 12.9, THA 4.3, THA 9.3) bring it to **227 agreements, 221 earned, and 233 of 305 right with the
finds (76%)**. This document
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
| Agree | 47 | 46 | 45 | 41 | 44 | **223** |
| We are wrong | 7 | 13 | 8 | 10 | 13 | **51** |
| We are right, ESCAP is not | 3 | 0 | 5 | 3 | 1 | **12** |
| Contestable | 2 | 1 | 2 | 5 | 2 | **12** |
| Not answerable from legislation | 2 | 1 | 1 | 2 | 1 | **7** |

Six of the 223 agreements still rest on the wrong law (below), so **217 are earned, and 229 of 305 (75%) are
right** (earned agreement plus our finds). 51 cells are ours to fix, and six more are agreements to be re-earned.

Where the ten extra agreements came from, against the 215 the runs recorded:
- **Five from rule fixes already on master since the Australia, Malaysia and Singapore run:**
  AUS 10.3, AUS 12.4.4, MYS 12.8, SGP 3.5, SGP 10.1. SGP 10.1 agrees for a partly wrong reason: its
  citations include the hazardous-waste and meat import bans next to the real telecom equipment one.
- **Seven for India from today** (below).
- **Minus two** where today's payment fix made us disagree, and we are the ones who are right.

## Agreements we did not earn

A matching score is not a matching answer. The final round reports citations, so an agreement that
rests on the wrong law is a wrong answer that happens to land on ESCAP's number. Every one of the 231
agreements was checked: our counted instruments against ESCAP's cited ones, then by hand wherever
they differed.

| | Cells | What it means |
| :-- | --: | :-- |
| Same instrument as ESCAP | 53 | Matched by title. |
| Both find nothing | 114 | Neither side cites a restriction, or both name the same kind of framework. We cannot prove a shared miss wrong. |
| Different instrument, but a real answer | 50 | A newer or more specific law, the regulations under ESCAP's Act, or the same law under a Thai or renamed title. For example: the 2025 Payment Aggregator Master Direction, which replaced the 2020 guidelines ESCAP cites; Malaysia's Online Safety Act 2025; Singapore's SGNIC registration rules. |
| **Wrong law** | **11** | The score matches, but the cited provision does not answer the question. |
| **Score carried by a wrong citation** | **3** | One real measure plus one unrelated one lifts the score into ESCAP's band. |

**Wrong law (11):**
- AUS 7.1: the Identity Verification Services Rules named as the data protection framework, not the Privacy Act 1988.
- MYS 11.2: the Digital Signature Act's recognition of foreign certification authorities as EMC product certification.
- IND 6.4: currency export control and customs confidentiality as data transfer conditions. ESCAP cites the IT (Reasonable Security Practices) Rules.
- IND 12.4.6: a broadcaster's duty to offer subscribers an online payment gateway as a mandated payment intermediary.
- IND 12.9: the Commercial Courts Act as the online consumer protection framework, not the Consumer Protection Act 2019.
- THA 3.1: a Bank of Thailand capital rule for foreign bank branches ("do not exceed 10%") as a foreign equity cap.
- THA 3.5: Thai banks opening branches *abroad* as a commercial presence requirement on foreign suppliers.
- THA 5.4: accounting separation for Shariah banking windows as telecom accounting separation.
- THA 8.2: the Copyright Act as the safe harbour for *non*-copyright liability.
- THA 10.2: the Export and Import of Goods Act's transit ban on unnamed goods as an ICT import restriction.
- THA 11.2: medical-device declarations of conformity as SDoC for radio and EMC equipment.

**Score carried by a wrong citation (3):**
- MYS 9.4 (1): the applications service provider licence is right, but the second "scheme" is the cyber-security service provider licence. Alone, the licence gives 0.5.
- MYS 10.2 (1): SIRIM approval of radio equipment is right, but the second measure is a CITES permit. Alone, it gives 0.5.
- MYS 11.3 (0.5): the testing duty is right (certification of communications modules), but the acceptance of third-party results comes from reference materials under the National Measurement System Act.

Weak but kept: SGP 8.1 (the Electronic Transactions Act's safe harbour covers liability "under any rule of law",
and a horizontal safe harbour is the band 8.1 clears on, though the Copyright Act's own is the better citation), MYS 3.4 (land and bank-transfer approvals as screening), SGP 4.01 (the agent rule is in the UK-patent
registration regulations), AUS 12.7 (the quote does not itself show the presence rule), THA 9.4 (a notification
scheme counted as licensing), THA 11.3 (general industrial product standards, though they include IT equipment),
and MYS 12.8 (a PDPA representative as local presence). Since the fixes below, THA 9.3 too: "no restriction on
online advertising" is witnessed by the 1950 loudspeaker advertising Act, where ESCAP reads the Consumer
Protection Act.

**So 217 agreements are earned.** With the 12 finds, **229 of 305 (75%) are right**, down from 243.

| | AUS | MYS | SGP | IND | THA | Total |
| :-- | --: | --: | --: | --: | --: | --: |
| Earned agreements | 47 | 44 | 45 | 39 | 42 | 217 |
| Right (earned + finds) | 50 | 44 | 50 | 42 | 43 | 229 |

**Eight of the fourteen are now ruled out by decision-side rules** (in the fixed table below), and each of those
cells now disagrees with ESCAP, because the law that answers it was never read: AUS 7.1, IND 12.9, MYS 9.4, MYS
11.2, THA 3.5, THA 5.4, THA 8.2, THA 11.2. No earned agreement moved. THA 8.2 now rests on a Bank of Thailand
payment-network rule, which is no safe harbour either; it is a disagreement, so it is counted wrong already.

**Six still agree on the wrong law**, because no rule separates them without being fitted to the case:
- MYS 10.2 and THA 10.2: an ICT domain on import compliance also removes AUS 10.2, whose general customs
  compliance duty ESCAP scores the same way we do. A power to ban "the goods" says nothing about ICT; a duty on every
  importer is a cost ICT imports bear. So the wildlife permit and the transit ban stay counted.
- MYS 11.3: the acceptance of foreign reference-material certificates. A product domain on 11.3 lost more than it
  won when tried.
- IND 6.4: dropping the currency control leaves the customs confidentiality finding, which still scores 1.
- IND 12.4.6 and THA 3.1: a duty to *offer* subscribers a payment gateway, and a bank's prudential limit on its own
  equity investments. Both are reading errors, for a re-read.

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

The 43 first sorted, by cause. The other eight are the former agreements listed under "Agreements we did not
earn", each now missing the law that answers it.

**The answer rests on the wrong statute, and the right one was never reached (16).** A zero is
witnessed by an instrument unrelated to the question. Examples: India's other payment restrictions
"witnessed" by the Online Gaming Act, Thailand's de minimis by an exchange control regulation,
Malaysia's accounting separation by the Development Financial Institutions Act. The answering
provision is usually in the corpus.
- AUS 2.3, 5.2
- MYS 2.3, 3.1, 5.2, 5.4, 5.5, 8.3, 12.7
- IND 1.4, 12.01, 12.4.7
- THA 5.2, 6.1, 8.3, 12.5

IND 12.4.7 is now reached and still missed. On 27 Sep ESCAP's two RBI circulars were registered and
pillar 12 re-read (run `b358e814`). The CNP notification's rule ("acquisition ... has to be through a
bank in India", "settle only in Indian currency") was filed under 12.4.1 and 12.4.2, which is
defensible. For 12.4.7 the reader quoted the paragraph describing the evasion, which states no
restriction. The OPGSP circular (the page is the 2015 consolidation) parsed as one 6.5k block, and
the reader found nothing in it. Its USD 2,000 and USD 10,000 per-transaction caps say "not
exceeding", and the rule does not treat that as restricting, because penalty clauses use the same
words.

IND 12.01 is the sharpest case: the FDI Circular's "not permitted in inventory based model of
e-commerce" was read and answered "does not apply".

**We counted a provision about something else (15).** For example: genetically engineered
organisms as an ICT import ban (IND 10.1); a `.au` domain licence, a digital-token licence and a
telecom licence as online-content licences (AUS, SGP, THA 9.4); endangered species and food as ICT
export controls (SGP 10.4); a maritime radio operator's personal certificate as accepted product
testing (IND 11.3).
- AUS 3.1, 11.3
- SGP 4.1, 9.4, 10.2, 10.4
- IND 10.1, 10.2, 11.3
- THA 3.4, 12.4.3 (THA 4.3 and 9.3 are fixed below)
- MYS 10.1: the ICT import-ban rule below took away an agreement that rested on trademark-infringing goods and
  the strategic items list. ESCAP's evidence is the Customs (Prohibition of Imports) Order 2023, which the reader
  reached for 10.2 but not 10.1.

SGP 9.4, IND 10.1, IND 10.2 and SGP 10.2 lost their wrong witness to the rules below and are still wrong: ESCAP's
evidence is the Broadcasting Act class licence and the DGFT and IMDA import schedules, which were never registered or
never read.

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

| A licence answers 9.4 only if it licenses online content, applications or platforms, in its words or its instrument's title | AUS, IND, THA 9.4 | +3, nothing lost |
| An import ban or import quota counts in pillar 10 only on goods it names as ICT | AUS, THA 10.1; AUS, THA 10.2 | +4, −1 (MYS 10.1, above) |
| A framework for 7.1 or 12.9 is named for its subject in its title, and one named for copyright is not 8.2's. If the only framework read is about something else, the cell is unresolved, not "no framework" | AUS 7.1, IND 12.9, THA 8.2 | −3 unearned agreements |
| Pillar 5 is the telecommunications sector, which a provision or its instrument's title names | THA 5.4 | −1 unearned |
| 11.2 is radio and electrical equipment or products generally, not medical devices or signature authorities | MYS 11.2, THA 11.2 | −2 unearned; IND 11.2's general conformity regulations still count |
| A cyber security service licence is not an online content licence | MYS 9.4 | −1 unearned |
| A commercial presence opened abroad is not one required here | THA 3.5 | −1 unearned |
| Where the defining words are a bare prohibition, "foreign investment is not permitted" in the quote is a proportion of nought | IND 12.01 | +1, earned: the inventory-model ban ESCAP scores, from the FEMA regulations that carry it |
| A framework rule quoted without the purpose that opens its sentence names its subject by that sentence. Applied to banked readings with `repair-framework-shown` | IND 12.9 | +1, earned: the Consumer Protection Act 2019, whose s.94 had been refused for quoting only "the Central Government may take such measures" |
| A limit on the terms a patentee may put in a licence is not a restriction on enforcing the patent | THA 4.3 | +1, earned: the Patent Act, as ESCAP |
| 9.3 advertising is advertising carried by a medium (online, broadcast, telecom) that the provision or its instrument's title names, not a ban on advertising one product in every medium | THA 9.3 | +1, weak (above); AUS, MYS, IND 9.3 still stand on broadcast and online rules |

Tried and reverted, because each lost more than it won:
- Scoring a licence-lifted import prohibition as a licence, not a ban: −2. ESCAP counts approval-gated bans on named telecom equipment.
- A product domain on 11.3: +1 −2.
- Requiring 3.4 screening to name a foreign party: −1.
