# Live test — short note (draft skeleton)

Finale morning, 15 October 2026

*Drafted 30 September 2026 from `docs/finals/Live_Test_Short_Note_TEMPLATE.md`. This cannot be
filled from the repository — it records what happens during the sealed hour on 15 October. Fill in
on the day, from the actual run record. Everything below is `[TO FILL]` except the two rows the
declaration already fixes.*

Write plainly and submit with the evidence, comparison and run-record files. An honest account of
what broke earns credit from the committee. The paragraph on which output would be submitted
belongs in the comparison file, not here.

## 1 · The run

| | |
|---|---|
| Team name | [TO FILL] |
| The task as read out | [TO FILL: economy, pillar and two indicators, announced at the start of the hour] |
| Engine A, first pass — provider and model | Ollama, `gemma4-lex-16k` (`gemma4:12b-it-q4_K_M`) — fixed by declaration, will not change |
| Engine B, second pass — provider and model | Ollama on a rented RunPod GPU, `qwen3.8-lex-16k` (`qwen3.8:27b-q4_K_M`) — fixed by declaration, will not change |
| Machine used, and time submitted | [TO FILL] |

## 2 · What came out

| | Engine A | Engine B |
|---|---|---|
| Provisions exported | [TO FILL] | [TO FILL] |
| Of those, you believe absent from the 2025 baseline | [TO FILL] | [TO FILL] |
| Documents fetched during this pass | [TO FILL] | must be 0 — structurally guaranteed by *Read only what is already on disk*; confirm against `fetch_log` for the run before writing this in |
| Elapsed (minutes) | [TO FILL] | [TO FILL] |
| Cost of this pass (US$) | [TO FILL] | [TO FILL] |

## 3 · What worked

*Name the part of your system you would fully trust.*

[TO FILL — candidates the repository supports as strengths, to confirm on the day: the politeness
layer (on by default, robots.txt honoured); the cache-only re-run guarantee (demonstrated on run
`545aed1e`); the verbatim-snippet-relocated-in-source check; quote-before-number extraction
(`backend/scripts/engine-check.ts`)]

## 4 · What broke

*Name the part that you would not fully trust.*

[TO FILL — candidates to watch for on an unseen economy, per `docs/architecture.md` §11:
discovery recall on a portal never profiled before; OCR confidence on scanned gazettes; retrieval
in a language with no translated query table yet prepared]

## 5 · What a reviewer should be cautious about

*If a ministry used your tool, where should they look first? Name the rows or the indicator, not a
general caution.*

[TO FILL — pick the specific indicator(s) actually drawn on the day; framework-level indicators
(7.1, 7.2) and practice-level indicators (3.4, 5.3, 9.1) are the shapes most likely to need a
human's judgment regardless of engine, per `docs/architecture.md` §1]

## 6 · Anything done by hand

*Stewards record it either way.*

☐ Nothing was typed in by hand. ☐ Something was — described below:

[TO FILL]

## 7 · Declaration

*Everything submitted is my team's own work, produced by the system frozen at our declared release
tag, using only the engines declared on 30 September.*

| Signed on behalf of the team | Name and role | Steward initials |
|---|---|---|
| [TO FILL] | [TO FILL] | [TO FILL, by the steward on the day] |
