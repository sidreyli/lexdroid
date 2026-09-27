# The five-economy benchmark pack

Use this to check that a change made for one economy doesn't break the others. It holds the graded
runs for Australia, Malaysia, Singapore, India and Thailand (305 cells), so it can re-read and
rescore them without the 4 GB working databases.

## What's in the zip

Unzip into the repository root. You get `bench-pack/` (gitignored):

| File | Holds |
| :-- | :-- |
| `lexdroid.bench-aus-mys-sgp.db` | run `a74d0fca` (AUS, MYS, SGP) |
| `lexdroid.bench-ind.db` | India: run `283f457e` (all pillars but 8), `78642831` (pillar 8), `b358e814` (a pillar 12 re-read that changed no score) |
| `lexdroid.bench-tha.db` | Thailand: run `f8848a01` |
| `reference.json` | every cell as it stands now: our score, ESCAP's score, the audit label, and what the score rests on |
| `baseline.db` | ESCAP's answers the reference was graded against |

`reference.json` and `baseline.db` carry ESCAP's answer key. That is why they travel in the zip
and are never committed.

Each pack holds its runs' cells, readings, confirmations and scores. It also holds the text of
every provision those cells retrieved, those provisions' documents, and the whole register for its
economies. It has no embeddings, so it can't search.

`bench/manifest.json` (committed) says which run answers which pillars. It also records the hand
audit from `docs/disagreements-five-economies.md`: the agreements resting on the wrong law, our
finds, the contestable cells and the ones law can't answer.

## Check it works

```
npm run -w backend bench-diff
```

It should print "No cell moved", then 227 agree, 221 earned and 233 right of 305. The declarable
pillars should be AUS 8, MYS 7, SGP 8, IND 6 and THA 9.

- **agree:** our score matches ESCAP's.
- **earned:** an agreement that rests on the right law.
- **right:** earned, or one of our finds (we're right and ESCAP isn't).
- **declarable:** a pillar with at least 75% of its cells right.

## A rule change (decide/, rubric/)

Nothing needs re-reading. Run `bench-diff` again: every run is rescored under the current code
inside a transaction that is rolled back. It lists each cell whose score or leading citation
moved, with the before and after, and the change in declarable pillars.

## A reader change (read/, prompts)

Re-read the pillars your change touches, from the pack, replaying the recorded retrieval:

```
cd backend
LEXDROID_DB=../bench-pack/lexdroid.bench-tha.db npm run gate -- --economy THA --pillars 6 --retrieval-from f8848a01
LEXDROID_DB=../bench-pack/lexdroid.bench-tha.db npm run confirm -- --run <new run id>
npm run bench-diff -- --use THA:6=<new run id>
```

- **Leave out `--carry`.** It reuses earlier readings whenever the model name matches, and a prompt
  change doesn't change the model name, so carrying would hide your change. Use `--carry` only
  when your change adds provisions and leaves the reading of the old ones alone.
- **Run `confirm` before grading.** `gate` doesn't run the confirmation pass that scoring
  consults, and without it a new finding goes unconfirmed. `fleet` runs it for you.
- **`--use` accepts all pillars or some.** `--use MYS=<run>` takes all of Malaysia from a new
  run. `--use IND:8,12=<run>` takes only those pillars. Repeat `--use` for more economies.
- **Budget the time.** A laptop read is 10-15 s per provision, and a pillar is 300-500
  provisions, so allow 1-2 hours per economy-pillar.
- **Framework indicators always re-read their candidate instruments.** These are 7.1, 7.2, 8.1,
  8.2 and 12.9, with about 5 instruments each.

What replay approximates: the pack keeps the provisions each cell retrieved and the order of the
instruments it surfaced. It doesn't keep the exact fused order within an instrument, or the extra
subject provisions a framework reading was shown. Both only affect ordering and context.
`bench-diff` on an unchanged reader reproduces every score.

## What a pack can't test

A retrieval change (queries, depth, embeddings, the shortlist) or a corpus change (registration,
parsing). Those need the working database the run was made on.

## Rebuilding the packs

```
LEXDROID_DB=data/lexdroid.db npm run -w backend bench-pack -- --run a74d0fca --out ../bench-pack/lexdroid.bench-aus-mys-sgp.db
npm run -w backend bench-diff -- --write-reference
```

Only re-bank the reference after an agreed change, and update the audit in `manifest.json` to
match.
