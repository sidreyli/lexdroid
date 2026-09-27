# Grade was scoring Malaysia on a remnant

Asked on 22 September 2026, before booking the GPU: is LexDroid ready to run. Everything else
checked out -- 131 test files and 1,289 tests passing, typecheck clean, all twenty reader-batch
rules implemented, both engines declared, every section in all three economies embedded, and 417
documents re-parsed from the cache through the real dispatch with zero drift, which says the corpus
already stands where the batch's re-parse leaves it.

One number did not check out, and it is one this project has been quoting as a clean bill.

## What was being said

Two write-ups record the same line: *"`grade` on both banked runs is unchanged: Australia and
Singapore 36 -> 37, Malaysia 40 -> 30, the same cells fixed and the same broken."* It was offered
as proof that the new rules cost nothing -- a rule that moves no banked cell is free to carry into
the next run.

The Malaysian half of it is not a measurement of the rules, and never was.

## What the eleven broken cells actually are

They break the same way. 10.1 loses `ict-import-ban` and `other-import-ban`, 6.2 loses
`local-storage`, 7.3 `minimum-retention`, 9.4 `content-licence` -- each cell loses *every* measure
it had, which is not what a band shifting looks like.

Four explanations were ruled out with evidence before the real one was found. The Malay-language
hold: every lost finding's section is `lang=en`. Missing schema fields: the banked readings carry
`sector`, `targetWords` and `conditionWords`. A reworded confirmation: `loadConfirmations` drops a
stale verdict rather than refusing the cell. `--carry`: every reading in both runs is its own,
3,356 of 3,356 and 19,990 of 19,990. And the citations are not corrupt -- all 69 checkable
Malaysian basis quotes still sit in the sections they cite, with no dangling section ids and no
orphan rows.

What is missing is the readings.

| | recorded as read | readings still stored |
| :-- | --: | --: |
| Malaysia | 19,785 | **3,356** (17%) |
| Australia + Singapore | 20,906 | 19,990 (96%) |

`src/run/reanchor.ts` says why, and says it was meant to: a re-parse rebuilds the sections of every
document it touches, `reading` and `shortlist_entry` cascade away with them because a reading is a
statement about words that no longer exist, and `answer_basis` deliberately does **not** cascade,
because what a past run cited is a record and not a derived value -- so it is detached and
re-attached to the provision carrying the same Part, heading and label.

The result is a run that keeps its citations and loses the readings underneath them.
`recordedDecider` rebuilds strictly from `c.run_id = ?`, so it sees a cell with nothing in it. The
id ranges confirm the mechanism: Malaysia's basis rows point at sections 953,667-1,093,153 while its
surviving readings span only 920,505-997,454.

**56 of the 69 provisions Malaysia's answers cite no longer carry a reading of their own.** In
Australia and Singapore, whose documents that re-parse did not touch, none of the nineteen.

## The rule

> A run that no longer holds a reading of a provision its own answer cites has lost its evidence,
> and what a rescore measures over it is the loss rather than the rules.

The citation is the signal, and it has to be the citation rather than the counts. A basis row exists
only because a reading of that provision was made by this run and counted towards its band, so its
absence can mean nothing else. The counts cannot say it on their own: a reading is written only for
what the reader could use, so a run that has lost nothing is still short by its own discards --
Australia and Singapore stored 19,990 readings against 20,906 provisions read, and that 4% is the
ordinary discard, not a loss. Any threshold over the ratio would have been a number picked to make
Malaysia fail and the others pass.

### The unit is the pillar, because the cell that suffers most leaves no trace

Marking only the cells with an orphaned citation caught nine of the eleven. The two it missed,
Malaysia 4.6 and 5.7, are the cells that most needed marking: both answer *no-restriction*, so each
cites an instrument and no provision, and each has no citation to orphan. Removing a cell's readings
is exactly what makes it say the law imposes nothing.

Reading is pillar-scoped -- one call reads one provision against a whole pillar and its answer is
sorted to that pillar's cells -- so every cell of a pillar was handed the same union of provisions
and a cascaded section takes a reading from all of them at once. The store bears it out with no
exceptions: across both banked runs, every cell of every (economy, pillar) records the same
`sections_read` and holds the same number of surviving readings.

| Malaysia | read | kept | | Australia | read | kept |
| :-- | --: | --: | :-- | :-- | --: | --: |
| pillar 4 | 307 | 35 | | pillar 4 | 288 | 268 |
| pillar 5 | 312 | 47 | | pillar 5 | 311 | 309 |
| pillar 10 | 193 | 18 | | pillar 12 | 656 | 609 |

So one orphaned citation convicts its pillar, and 4.6 is marked with the rest of pillar 4. Pillar 5
cites no provision anywhere in the run, so nothing in the run proves it and it is left unmarked --
the economy's own line already says the economy has lost evidence, and 47 of 312 against Australia's
309 of 311 says the rest plainly enough without claiming to have proved it. Fourteen of the fifteen
moved cells now carry the mark.

## What changed

`src/run/evidence.ts` measures what a finished run has left, per economy and per pillar.

- **`grade` says so before it prints anything.** A run that has lost evidence gets a line naming
  what it lost, and every cell it moves in an afflicted pillar is marked `[evidence gone, not a
  rule]`. It still grades, because the unafflicted pillars are still measurable.
- **`rescore` refuses.** Writing is the difference: `grade` replays over a remnant inside a
  transaction it rolls back, while `rescore` would overwrite the banked answer with one decided on
  what is left -- and the old answer, the record of what the run actually found, would be gone.
  `--anyway` says that is wanted; `--dry-run` never needed it.

Tested in `test/run-evidence.test.ts`, including the two things the rule had to survive: the
ordinary discard must not read as a loss, and a framework citation, which names an instrument and no
provision, must be held against nobody.

## What it means for the runs

Australia and Singapore's `36 -> 37, +5 -4` stands. It is measured on 96% of that run's evidence and
on pillars that lost nothing, so it means what it says.

Malaysia has no gradeable baseline left, and only a re-run restores one. That is an argument for
running, not against it -- but it had to be said before the GPU hours were spent, because `grade` is
the instrument that would judge what comes back.

## What held

- 132 test files, 1,296 tests, typecheck clean.
- Every section in all three economies embedded: AUS 77,403, MYS 124,250, SGP 35,203, none
  outstanding.
- 417 documents re-parsed from cache through `parseDocument`: SGP 106/106, AUS 123/123, MYS 188/188
  identical. The corpus is current with today's parsers.
