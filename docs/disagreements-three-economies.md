# Where we differ from ESCAP on Mongolia, Russia and Lao PDR, and who is right

*27 September 2026.*

**The run.** Run `f05a3336` covers pillars 6 and 7, 27 cells, on Engine A. It has been re-scored
under master plus this branch's language fixes (`4be5fce`) from its banked readings. The baseline
is ESCAP `round-2`, the only scored pass that covers these three economies.

The same exercise as `disagreements-five-economies.md`: each disagreement judged from both sides'
evidence (our cited provision, ESCAP's cited instruments and note, the band text). It is a desk
judgement, not a re-reading of every statute.

## The split

| | MNG | RUS | LAO | Total |
| :-- | --: | --: | --: | --: |
| Agree | 4 | 6 | 5 | **15** |
| We are wrong | 3 | 3 | 3 | **9** |
| We are right, ESCAP is not | 0 | 0 | 1 | **1** |
| Contestable | 2 | 0 | 0 | **2** |

- **Agreement:** 15 / 27 (56%).
- **Right**, meaning agreement plus our finds, as Sid counts it: **16 / 27 (59%)**.
- **Right or contestable:** 18 / 27 (67%).

On the first run this was 10 / 27. The rise came from language fixes (below), re-scored from the
same readings.

## Agreements to re-check

Two agreements rest on a different instrument from the one ESCAP cites, so they may not be earned:
- **RUS 7.3** rests on a government resolution of 01.04.2024; ESCAP cites 149-ФЗ and the
  communications law.
- **LAO 7.3** rests on the Law on Payment Systems; ESCAP's scoring row cites an external summary.

The other 13 rest on the law ESCAP cites, or on the same law family, e.g. 152-ФЗ and its
amending laws for RUS 6.4, 7.1, 7.4 and 7.5.

## Our finds: we are right and ESCAP is not

**LAO 6.2** (ours 0.5, ESCAP 0).
- The Agreement on the General Payment System, Art. 20, requires a cross-border payment system
  operator to "ເກັບຮັກສາຂໍ້ມູນທຸລະກໍາໄວ້ຢູ່ ສປປ ລາວ" (keep transaction data in the Lao PDR).
- That is a sector-specific local storage requirement, which is the 0.5 band.
- ESCAP cites only the e-data and e-transactions laws.

## Contestable

- **MNG 7.3** (ours 0, ESCAP 1). ESCAP's own note says "no specific minimum retention period is
  set", and scores 1 on Art. 15's deletion conditions. A second ESCAP row scores 0. The band asks
  for a minimum retention period.
- **MNG 7.4** (ours 0.5, ESCAP 0).
  - We rest on the Personal Data Protection Law's Art. 23 (Үнэлгээ хийх, conduct an assessment) and
    the implementing procedure requiring an impact analysis on rights and freedoms.
  - ESCAP judged Art. 20.1 a general security risk assessment, not a data protection impact
    assessment, and did not address Art. 23.

## We are wrong

**Retrieval: the right article ranks just below the read cut.** A deeper pillar 6 re-read is
planned (Step 3).

| Cell | Ours | ESCAP | What ESCAP cites | Why we missed |
| :-- | --: | --: | :-- | :-- |
| RUS 6.2 | 0.5 | 1 | 152-ФЗ, 242-ФЗ | Art. 18(5), databases in Russia, not read |
| RUS 6.3 | 0 | 1 | 152-ФЗ, 242-ФЗ | same article |
| MNG 6.3 | 0 | 1 | a law we hold as lawId 16760452348261 | not surfaced |
| MNG 6.4 | 0 | 1 | Personal Information law, Art. 14 (transfer abroad) | not surfaced |
| LAO 6.4 | 0.5 | 1 | E-data protection and e-transactions laws | only a free-zone decree was read |

**Reading.**
- **MNG 7.5** (1 vs 0). It rests on state bodies processing their own records (Personal Data
  Protection Law, Art. 10), a supervision clause, and the right to information. None of these is
  government access to data held by someone else.
- **LAO 7.5** (1 vs 0). It rests on an anti-dumping investigator's power to request information
  from importers, and on a payment regulator's information powers. The first is not personal data.
- **RUS 7.2** (0 vs 0.5). Cleared on government resolutions, including a proposal to sign a UN
  convention. That is not a cybersecurity framework. Russia's security law is sectoral (critical
  information infrastructure), which is ESCAP's 0.5.

**OCR.** **LAO 7.1** (1 vs 0.5). The Electronic Data Protection Law's rule sentence has page debris
inside it in the OCR text, and the reader condensed it (66% character match). It is correctly left
unverified.

## Proposals for Sid's rules (no code changed; they affect every economy)

1. **7.5 `government-access`.** The measure's gloss says "personal data held by someone else", but
   nothing tests either part. The proposal: require the data to be personal and held by a party
   other than the authority. That removes MNG 7.5 and LAO 7.5 here, and should be replayed on the
   five economies first.
2. **7.2 framework candidates.** Give 7.2 a `FRAMEWORK_TITLE_DOMAIN` entry (cyber / information
   security, in each language) so that a proposal to sign a convention cannot clear it.

## Fixed today, language-side (scoped to Cyrillic and Lao; no English economy moves)

| Fix | Where | Cells |
| :-- | :-- | :-- |
| ru/mn/lo stems for information, place, nationality, duration | `decide/index.ts` | RUS 6.1, 6.2 (smoke test) |
| Framework title named in ru/mn/lo | `rubric/measures.ts` `FRAMEWORK_TITLE_DOMAIN` | RUS 7.1, MNG 7.1 |
| Near-verbatim Cyrillic / Lao rule and purpose words, kept as the source's span | `util/locate.ts`, `read/index.ts` `sourceWords` | MNG 7.1, MNG 7.2, LAO 7.2 |
| Keyword search asks the translations, not English, of a Cyrillic / Lao corpus | `retrieve/index.ts` | pillar 6 retrieval generally |
