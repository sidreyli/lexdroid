# The baseline, and why it is quarantined

ESCAP handed finalists a sample kit: their completed Round 1 and Round 2 databases, a 385-row
legal inventory across the three mandatory economies, and a 94-row table of government portals for
pillars 6 and 7.

It is used for **exactly two things**:

1. **The Discovery Tag.** ESCAP's output template defines `NEW` as "not in the sample kit" and
   `KNOWN` as "provided as an example". The tag is a fact about the sample kit, so answering it
   requires reading the sample kit.
2. **Evaluation.** Measuring our answers against theirs, so a change to the pipeline can be shown
   to have helped rather than asserted to have helped.

It is **never** readable by discovery, fetching, parsing, indexing, shortlisting, reading, or
scoring. That boundary is not a convention:

- the baseline lives in its own SQLite file, `data/baseline.db`, which the working store never
  opens and which nothing under `src/` outside this directory has a path to;
- `test/baseline-isolation.test.ts` fails if any pipeline module imports `src/baseline`.

## Why it matters

If discovery were seeded from the legal inventory, every instrument we found would be `KNOWN` by
construction, and the discovery criterion the tool is marked on would be unearned. Worse, the
system would look accurate on the three economies ESCAP has already answered and collapse on the
sealed live-test economy, which is the one that decides the result.

The standing rule on this project, in the user's words:

> we shouldn't be like trying to hardcode to fit what UNESCAP's database has. if we genuinely found
> new evidence that overrides their findings, then that's good, and we should display it
> accordingly.

So a disagreement with the baseline is a result, not a bug. The evaluator reports both directions:
what they found and we missed, and what we found and they did not have.
