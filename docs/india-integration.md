# India integration

*Status: first vertical slice implemented on 12 September 2026.*

## Scope boundary

LexDroid treats India as a federal, mixed legal system and starts with **Central/Union law**. India
Code publishes Central, State and Union Territory material in one repository; an economy-level
answer must not generalise a State rule to the whole country. The India Code query therefore asks
for `CENTRAL`, and the adapter independently rejects every result whose own jurisdiction metadata
does not say `CENTRAL`.

English and Hindi are both source languages. A bilingual instrument is not flattened into one
translation: every section retains the language of the cited text, and matching section numbers in
the two language versions remain separate records.

ESCAP's completed India sheet is still evaluation-only. It is opened after discovery and scoring
to measure the result; it never seeds the register, shortlist, queries or answers.

## Implemented foundation

- `IND` economy profile, instrument hierarchy, Union-wide scope note and official portal map.
- India Code register adapter over the portal's public DSpace HAL/JSON API. It enumerates Acts,
  Rules, Regulations, Notifications and Orders, and resolves first-class section records.
- Honest legal status: `repealed=true` is evidence of repeal; `repealed=false` is not treated as
  proof of commencement or current force.
- Structured India Code parser with provision labels, pages, language, ministry, official number
  and exact character offsets.
- Offline English/Hindi OCR for scan-only Gazette PDFs, using packaged Tesseract models and the
  existing PDF.js renderer. OCR confidence and affected pages remain visible in document metadata;
  weak output is marked unread.
- Indian decimal paragraph labels such as `12.5`, bilingual duplicate-label handling, document
  title recovery, and INR amount recognition.
- Baseline comparison keyed by the profile's exact economy name, removing the former implicit
  fallback of every non-Singapore/Malaysia economy to Australia.

## Acceptance evidence

The supplied `India-Public_Procurement_order_2017.pdf` is a seven-page scan. A cold local parse
recovers all 20 numbered provisions, identifies the English title, reports 93% mean OCR confidence
and makes no network request for OCR data.

The supplied `INDIA-~1.pdf` retains two parallel sets of provisions: Hindi and English labels
`1`, `2`, and `12.1` through `12.5`. It recovers the title *Foreign Exchange Management
(Non-debt Instruments) (Third Amendment) Rules, 2024* and preserves exact section offsets.

The official India Code API was also exercised against a real Central Act. The resolver returned
44 structured provisions; replaying the same resolution from LexDroid's cache required zero
network requests.

A complete isolated register run then accepted **12,900 of 12,900** Central records: 847 Acts,
3,104 Rules, 1,354 Regulations, 7,337 Notifications and 258 Orders. It used 123 network responses
and nine cached responses, with zero robot refusals, host refusals or request failures. The other
ten declared official portals were reported as having no adapter rather than counted as covered.

## Rollout plan

1. **Rebuild the validated Central register in the target environment.** Run
   `npm run -w backend zone1 -- --economy IND --register`, then record the category counts and any
   rejected/nonmatching rows. On 12 September 2026 the API exposed 12,900 Central records over
   roughly 130 pages. India Code's `robots.txt` endpoint returned an error, so LexDroid's
   conservative unknown-robots delay makes this a resumable cold-cache job rather than an
   interactive step.
2. **Measure discovery before reading broadly.** Run
   `npm run -w backend discovery -- --economy IND --pillars 1,2,10,11,4`. This uses ESCAP only as
   the post-hoc scorecard and separates missing-register failures from ranking failures.
3. **Read the high-yield first wave.** Run
   `npm run -w backend zone1 -- --economy IND --pillars 1,2,10,11,4 --top 25`, inspect unread and
   status-unknown counts, then embed the resulting corpus. Reparse from cache after parser changes.
4. **Add source adapters from measured gaps.** Prioritise eGazette and the Legislative Department
   for commencement/amendment coverage, then MeitY, RBI, DoT/CERT-In, DPIIT/DGFT, SEBI and BIS
   only where the discovery report shows India Code is insufficient. Do not count a regulator copy
   and India Code copy as two measures.
5. **Run the remaining waves.** Follow the existing order: pillar 8, then 3/5/9, and pillar 12
   last. Every cell must end answered, unresolved, or not-applicable; State-law dependence remains
   an explicit unresolved scope condition until a separate State/UT strategy exists.
6. **Harden citations and freshness before merge.** Confirm official source links, retain the
   India Code item and page for each provision, prove commencement/current force from authoritative
   text where a score depends on it, and perform the standard zero-fetch cache replay.

## Known limits

- Only India Code has an automated India adapter in this slice. Other official portals are
  declared leads, not silently claimed as covered.
- India Code item metadata is discovery evidence, not by itself proof that an instrument is in
  force. Unknown status must continue to block a current-law claim.
- India Code exposes item-level canonical URLs but not a stable browser fragment for every
  structured section. Citations retain the item URL, section label and page; a reliable deep-link
  must not be invented.
- OCR is intentionally swappable and confidence-gated. Complex tables, marginal numbering and
  degraded Hindi scans will still require review or a stronger local model.
