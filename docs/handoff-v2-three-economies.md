# Mongolia, Russia, Lao PDR: handover v2 (27 September 2026)

This supersedes `docs/handoff-three-economies.md`, which is kept as history of the parsing work.

**Goal:** as many **declarable pillars** as possible for MNG, RUS and LAO. A pillar is declarable,
by Sid's measure, when at least 75% of its cells are right. **Nothing** we do may move any of Sid's
five economies.

## 1. Read this first

- **Branch** `russia-mongolia-laopdr` in `Desktop/BANGKOK/LexDroid`, head `b118c25` or later.
  Sid's master is `352bacf`.
- **Worktree** `Desktop/BANGKOK/LexDroid-bench` is branch `bench-check`: ours plus master `352bacf`,
  with Sid's `bench-pack/` unzipped. Use it for `bench-diff`.

**Golden rules:**
1. **No answer-key fitting.** Never feed ESCAP's scores or ESCAP-cited URLs into retrieval,
   registration or rules to hit a number. Every fix must be a general cause fix, with no
   per-instrument or per-cell special cases.
2. **Sid's economies never move.** After any change, merge it into the worktree and run
   `npm run -w backend bench-diff`. It must print **"No cell moved"** unless Sid agreed to a
   rule change. Also keep `backend/test/new-economies-leave-english-alone.test.ts` green.
3. **Language changes are scoped** to Cyrillic / Lao script, or to economies with a translation
   table. This is how everything so far has passed rule 2.
4. **Scoring rules (`decide/`, `rubric/`) are Sid's.** Propose a change, test it with `bench-diff`,
   and change it only with his OK.
5. **GPU:**
   - The user creates pods, and Claude cannot. Claude may terminate a pod only with the user's
     explicit OK for that pod id.
   - Never leave a pod idle: about $9 has been lost to idle pods.
   - Run with a watchdog cap, the laptop awake, and this window open. The tunnel and watchdog die
     if the session closes.
6. **ESCAP's answer key is private.** `bench-pack/`, `lexdroid-bench/`, `baseline.db`,
   `reference.json` and the zip are never committed. They are excluded locally in
   `.git/info/exclude`.

**Honest target:** nobody gets every cell. Sid's best economy is 76% right, and some of ESCAP's own
answers contradict its notes. Aim for declarable pillars, at Sid's level: 6–9 per economy.

## 2. Where things are

| What | Where |
|---|---|
| Corpus and runs for MNG / RUS / LAO | `LexDroid/backend/data/lexdroid.db` |
| ESCAP answers, quarantined (the scorecard reads them) | `LexDroid/backend/data/baseline.db`, and `bench-pack/baseline.db` |
| Sid's five-economy pack | `Downloads/Telegram Desktop/lexdroid-bench.zip`, unzipped in `LexDroid-bench/bench-pack/` and `LexDroid/lexdroid-bench/bench-pack/` |
| Results and disagreements (Sid's format) | `docs/three-economies-results.md`, `docs/disagreements-three-economies.md` |
| Sid's model disagreements log | `docs/disagreements-five-economies.md` |
| How the pack and `bench-diff` work | `backend/bench/README.md` |

**Worktree deps:** `npm ci -w backend --include-workspace-root --engine-strict=false`. The
frontend wants Node 22 and this laptop has Node 24; the backend doesn't care.

**Runs** (Engine A, `gemma4-lex-16k`, on a rented RTX PRO 4500):

| Run | What | Use it? |
|---|---|---|
| `f05a3336-9782-49d5-87ec-fd86074076d4` | pillars 6 and 7, all three, re-scored after today's fixes | **yes, for pillar 7** |
| `8b3a3694-cc32-48ef-8360-49cad78e12db` | pillar 6, deeper (`--depth 70`, carried from `f05a3336`) | **yes, for pillar 6** |
| `1cc8057f-6f43-4087-9a83-02b05f2d8852` | pillar 8, all three | **yes, for pillar 8** |
| `895a814a…` | RUS pillar 6 smoke test | no |
| `185256d3…` | pillar 5, failed (the tunnel died) | no |

**Engines:**
- Engine A: Gemma 4 12B (`gemma4:12b-it-q4_K_M`).
- Engine B, as master declares it: Qwen 3.8 27B on rented RunPod. Our Gemini declaration was
  dropped in the merge.
- The declaration freezes on 30 September.

**Money:** about $12.5 spent on Runpod. The GPU works out at about $0.73/hr and about $0.55 per
pillar for all three economies.

## 3. Scoreboard (ESCAP round 2; `npm run -w backend scorecard -- --run <id>`)

| Economy | Pillar 6 | Pillar 7 | Pillar 8 | Declarable now |
|---|---|---|---|---|
| RUS | **3/4 ✅** | **4/5 ✅** | 2/4 | 6, 7 |
| MNG | 1/4 | 2/5 | **3/4 ✅** | 8 |
| LAO | 2/4 | 3/5 | 2/4 | none |

**The biggest gap:** only pillars 6, 7 and 8 have ever been read for these economies. Pillars 1–5
and 9–12 are unread. Sid's economies get 6–9 declarable pillars out of 12.

## 4. Root causes of every wrong cell

**Pending apply (free):**
- **RUS 7.2.** It was cleared by a presidential Doctrine, the Foundations of State Policy and a
  proposal to sign a UN treaty.
- `kindFor` in `backend/src/discover/ips.ts` now registers such titles as `guideline`
  (advisory). That is committed and tested.
- The **5 existing rows** still need updating: instrument ids 12365, 12382, 12409, 12456 and
  12459, set `kind='guideline'` plus a kind basis. That database write was blocked while a GPU run
  was writing, and it needs the user's OK. Then `rescore` and `verify` `f05a3336`. Expect RUS
  pillar 7 at 5/5.

**Reading judgement:**
- **MNG 6.2** (ours 0.5, ESCAP 0). The Public Information Transparency Law Art. 27 localises
  *government* databases ("Суурь болон төрөлжсөн мэдээллийн санг Монгол Улсын нутаг дэвсгэрт
  байршуулна"), and the reader did not set `appliesOnlyToGovernmentData`.
- **MNG 7.4, MNG 7.5, LAO 7.5.** Over-claims. 7.5 rests on state bodies processing their own
  records and an anti-dumping investigator's information powers.
- **LAO 6.2** (ours 0.5, ESCAP 0). Possibly *our* find: a payment regulation, Art. 20, "keep
  transaction data in the Lao PDR".

**Retrieval / which indicator a rule belongs to:**
- **RUS 6.3.** 152-ФЗ Art. 18(5), databases in Russia, is filed as storage (6.2); ESCAP also
  counts it as infrastructure.
- **MNG 6.4.** The Personal Information law Art. 14 (transfer abroad) is not reached.
- **LAO 6.4.**
- **MNG 6.3.** The law ESCAP cites is not in our corpus. **Do not** register it *because* ESCAP
  cites it; only if a general registration fix brings it in.

**8.3 user identity / SIM** (RUS and LAO score 0, ESCAP 1 / 0.5). Russia does require subscriber
identification for SIM cards and messengers, so find why retrieval or reading missed it.

**OCR.** **LAO 7.1.** The Electronic Data Protection Law's rule sentence has OCR page debris
inside it, and the reader condensed it to a 66% match, so it stays unverified. Re-OCR that one law
at higher quality.

**ESCAP-contestable (don't chase).** **MNG 7.3**: ESCAP scores 1 while its note says "no specific
minimum retention period is set". **MNG 7.4.**

**Sid's rules:**
- **7.5 `government-access`** tests neither "personal data" nor "held by someone else".
- Sid says change it if it helps us, but it must pass `bench-diff`.
- The reader's `dataScope` attribute is null in our readings, so a personal-data test needs
  another signal.

## 5. Already fixed (don't redo)

- Query translations, two phrasings each (plain, and as a provision says it), in
  `data/query-translations/*.json`. They plug into master's per-language search via
  `translatedQueriesIn`.
- Keyword search skips the English questions for Cyrillic / Lao corpora (dense still asks them).
- ru/mn/lo stems for information, place, nationality and duration in `decide/index.ts`.
- `FRAMEWORK_TITLE_DOMAIN` ru/mn/lo terms (7.1, 8.2, 12.9) in `rubric/measures.ts`.
- ru/mn/lo subject names added to Sid's `SUBJECT_NAMES_IN_OTHER_LANGUAGES` (`read/index.ts`).
- `locateNearQuote` / `sourceWords`: a Cyrillic / Lao framework rule or purpose quote at ≥92%
  character match is matched, and the source's own span is kept. `repair-framework-shown` applies
  this to banked readings.
- The Russian policy-decree kind (`kindFor`), pending the DB apply above.
- **Verified:** `bench-diff` in the worktree gives "No cell moved": 227 agree, 221 earned, 233
  right of 305.

## 6. The plan, in order

### Phase A: free, no GPU (re-score banked readings)
For each step: change, then run the tests, then run `bench-diff` in the worktree ("No cell
moved"), then `rescore` / `verify` / `scorecard` on our run.
1. **Apply the RUS 7.2 rows** (ask the user's OK first). Then `rescore` and `verify` `f05a3336`.
2. **MNG 6.2, government-only data.** A general fix so findings about public or state information
   infrastructure are marked government-only: a reader or confirm question in the local language,
   or a rule on the finding. It must not be an instrument-id list.
3. **8.3 RUS / LAO.** Trace retrieval for the SIM and messenger identification rules. Suspect the
   measure gloss or the translation phrasing. Fix, then re-score.
4. **7.5**, only with Sid's agreement. Draft on a scratch branch in the worktree, run `bench-diff`
   on his economies, replay ours, and keep it only if none of his cells get worse.
5. **LAO 7.1.** Re-OCR the Electronic Data Protection Law at higher quality, then run
   `repair-framework-shown --run f05a3336… --apply` and `rescore`.

### Phase B: new pillars on the GPU (the biggest win)
**Order** (Sid's agreement per pillar in brackets):
1. **11** Standards (90%)
2. **12** Online sales (85%; 15 indicators, so it costs about 3× a small pillar)
3. **9** Content access (67%)
4. **4** IP (74%)
5. **2** Procurement (67%)
6. **3** FDI (72%)
7. **10** Non-technical measures (60%)
8. **5** Telecom (57%)
9. **1** Tariffs

**Session recipe:**
1. The user deploys **RTX PRO 4500**: On-Demand, the Runpod PyTorch 2.8.0 template, 40 GB container
   disk, no volume. They paste the "SSH over exposed TCP" line and give OK to terminate that pod id.
2. Bootstrap:
   `scp -i ~/.ssh/id_ed25519_runpod -P <port> infra/runpod/bootstrap.sh root@<ip>:/root/` then
   `ssh -i ~/.ssh/id_ed25519_runpod -p <port> root@<ip> 'bash /root/bootstrap.sh'`
   (about 3 min; the embeddings are already in the local DB).
3. Tunnel (in the background):
   `ssh -i ~/.ssh/id_ed25519_runpod -N -L 11501:127.0.0.1:11434 -p <port> root@<ip>`
   Then check it with `npm run -w backend engines -- --hosts http://127.0.0.1:11501`.
4. Run:
   `npm run -w backend fleet -- --economies MNG,RUS,LAO --pillars <p> --skip-prepare --hosts http://127.0.0.1:11501 --usd-per-hour 0.73 --no-compare`
   - Use a background watchdog that kills the fleet at a cap time.
   - Stopping only the watchdog's `bash.exe` on Windows leaves the fleet running.
5. Terminate the pod as soon as the fleet reports "recorded as complete". Confirm with
   `list-pods` (it must be empty).
6. `scorecard -- --run <new>`. Root-cause each miss by the categories in section 4, apply free
   fixes, then `rescore`.

### Phase C: declare
- Declare the pillars at ≥75% right per economy.
- Update `docs/three-economies-results.md` and `docs/disagreements-three-economies.md` (Sid's
  split: agree / earned / our finds / contestable).
- Commit; the user pushes. Tell Sid.

## 7. Command cheat-sheet (from `LexDroid/`)

| Command | What it does |
|---|---|
| `npm run -w backend scorecard -- --run <id> [--cells under-claim]` | grade a run against ESCAP round 2 |
| `npm run -w backend replay -- --run <id>` | re-score from banked readings, read-only |
| `npm run -w backend rescore -- --run <id>` | write re-scored answers |
| `npm run -w backend verify -- --run <id>` | rebuild the export rows |
| `npx tsx backend/scripts/repair-framework-shown.ts --run <id> [--apply]` | re-check framework quotes |
| `npm run -w backend bench-diff` | Sid's 305 cells; **run it in `LexDroid-bench`** |
| `npx vitest run --root backend` | the full suite (1,692 passing at `b118c25`) |
