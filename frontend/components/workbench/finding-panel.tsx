"use client";

import { Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { extractionName, languageName } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ExportRow, Indicator, ReadingAttribute } from "@/lib/data/types";
import type { FindingEdit } from "@/lib/review";

const attributeLabels: Record<string, string> = {
  measure: "Measure",
  dutyBearer: "Who it binds",
  dutyAct: "What it does",
  dutyForce: "Force of the words",
  requirement: "Requirement",
  placeWords: "Place words",
  locatedData: "Data kept in place",
  informationWords: "Information words",
  exceptionWords: "Exception",
  sectorScope: "Sector scope",
  sector: "Sector",
  dataScope: "Data scope",
  dataDescription: "Data described",
  appliesOnlyToGovernmentData: "Government data only",
  mandatory: "Mandatory",
  countriesNamed: "Countries named",
  statedPeriod: "Stated period",
  authorisation: "Authorisation",
  authorisingWords: "Authorising words",
};

const gateLabels: Record<string, string> = {
  "quote-in-source": "The quoted words are in the stored source",
  "offsets-resolve": "The offsets land on those words",
  "in-force": "The instrument is in force",
  "official-host": "The link points at an official host",
  "pinpoint-citation": "The citation names a provision",
  "one-measure": "One measure, not several",
  "quote-leads": "The quote leads the reasoning",
  "timeframe-evidenced": "The dates are evidenced",
  "score-recorded": "A score was recorded",
  "score-recomputes": "The score recomputes from the facts",
};

/** The same ten checks said the other way, for when one of them fails. */
const gateFailures: Record<string, string> = {
  "quote-in-source": "The quoted words are not in the stored source",
  "offsets-resolve": "The offsets do not land on those words",
  "in-force": "The instrument is not shown to be in force",
  "official-host": "The link does not point at an official host",
  "pinpoint-citation": "The citation does not name a provision",
  "one-measure": "More than one measure is carried by the quote",
  "quote-leads": "The reasoning runs ahead of the quote",
  "timeframe-evidenced": "The dates are not evidenced",
  "score-recorded": "No score was recorded",
  "score-recomputes": "The score does not recompute from the facts",
};

const stateLabels: Record<string, string> = {
  restricted: "Measure found",
  "no-restriction": "No restriction",
  unresolved: "Unresolved",
};

export function FindingPanel({
  row,
  indicator,
  economyName,
  draft,
  patch,
  editing,
}: {
  row: ExportRow;
  indicator: Indicator | undefined;
  economyName: string;
  draft: FindingEdit;
  patch: (next: Partial<FindingEdit>) => void;
  editing: boolean;
}) {
  const failed = row.gates.filter((g) => !g.passed);
  const attributes = row.attributes[0] ?? {};

  return (
    <div className="@container flex flex-col gap-6 px-6 py-6 sm:px-8">
      <header>
        <div className="flex items-baseline gap-2.5">
          <span className="tnum text-[15px] font-semibold text-navy">{row.indicatorId}</span>
          <span className="text-[13px] text-muted-foreground">{economyName}</span>
          <span
            className={cn(
              "ml-auto rounded-full px-2.5 py-0.5 text-[11.5px] font-medium",
              row.state === "restricted"
                ? "bg-navy/10 text-navy"
                : row.state === "unresolved"
                  ? "bg-ochre-soft text-ochre"
                  : "bg-inset text-muted-foreground",
            )}
          >
            {stateLabels[row.state]}
          </span>
        </div>
        <h2 className="mt-2 text-[17px] leading-snug font-semibold tracking-tight text-navy-deep">
          {indicator?.category ?? row.indicatorId}
        </h2>
        {indicator?.exception ? (
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
            Exception: {indicator.exception}
          </p>
        ) : null}
      </header>

      {failed.length > 0 ? (
        <div className="rounded-2xl bg-brick-soft px-4 py-3">
          <p className="text-[12.5px] font-semibold text-brick">
            {failed.length === 1 ? "A check failed" : `${failed.length} checks failed`}
          </p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {failed.map((g) => (
              <li key={g.gate} className="text-[12.5px] leading-snug text-brick/90">
                {gateFailures[g.gate] ?? g.gate}
                {g.detail ? `: ${g.detail}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Score row={row} indicator={indicator} draft={draft} patch={patch} editing={editing} />

      <Citation row={row} draft={draft} patch={patch} editing={editing} />

      {Object.keys(attributes).length > 0 ? (
        <Section title="What the reader took from the words">
          <Attributes attributes={attributes} />
        </Section>
      ) : null}

      {row.reasoning || draft.mappingRationale ? (
        <Section title="Why it maps to this indicator">
          {editing ? (
            <Textarea
              value={draft.mappingRationale ?? ""}
              onChange={(e) => patch({ mappingRationale: e.target.value })}
              rows={4}
              className="rounded-xl bg-inset text-[13px] leading-relaxed"
            />
          ) : (
            <p className="text-[13px] leading-relaxed text-ink">{draft.mappingRationale}</p>
          )}
          {row.reasoning && !(draft.mappingRationale ?? "").includes(row.reasoning) ? (
            <p className="mt-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
              The reader wrote: {row.reasoning}
            </p>
          ) : null}
        </Section>
      ) : null}

      <Section title="Notes">
        {editing ? (
          <Textarea
            value={draft.notes ?? ""}
            onChange={(e) => patch({ notes: e.target.value })}
            rows={3}
            placeholder="Anything the next reader should know"
            className="rounded-xl bg-inset text-[13px] leading-relaxed"
          />
        ) : (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {draft.notes || "None."}
          </p>
        )}
      </Section>

      <Section
        title={
          failed.length > 0
            ? `Checks, ${failed.length} of ${row.gates.length} failed`
            : `Checks, all ${row.gates.length} passed`
        }
      >
        <ul className="grid gap-1.5 @lg:grid-cols-2">
          {row.gates.map((g) => (
            <li key={g.gate} className="flex items-start gap-2">
              {g.passed ? (
                <Check className="mt-[3px] size-3.5 shrink-0 text-slate-soft" strokeWidth={2.5} />
              ) : (
                <span className="mt-[2px] grid size-4 shrink-0 place-items-center rounded-full bg-brick text-paper">
                  <X className="size-2.5" strokeWidth={3} />
                </span>
              )}
              <span
                className={cn(
                  "text-[12.5px] leading-snug",
                  g.passed ? "text-muted-foreground" : "font-medium text-brick",
                )}
              >
                {(g.passed ? gateLabels : gateFailures)[g.gate] ?? g.gate}
                {g.detail ? (
                  <span className="block text-[12px] font-normal text-muted-foreground">
                    {g.detail}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Provenance">
        <dl className="grid gap-x-6 gap-y-1.5 text-[12.5px] @xl:grid-cols-2">
          <Fact label="Read by" value={row.model ? `${row.engine}, ${row.model}` : "Not read"} />
          <Fact label="Run" value={row.runId.slice(0, 8)} />
          <Fact label="Extracted from" value={row.extraction ? extractionName(row.extraction) : "No document"} />
          <Fact label="Language" value={row.languageOfSource ? languageName(row.languageOfSource) : "Unknown"} />
        </dl>
      </Section>
    </div>
  );
}

function Score({
  row,
  indicator,
  draft,
  patch,
  editing,
}: {
  row: ExportRow;
  indicator: Indicator | undefined;
  draft: FindingEdit;
  patch: (next: Partial<FindingEdit>) => void;
  editing: boolean;
}) {
  const bands = indicator?.bands ?? [];
  const moved = draft.bandOrdinal !== row.bandOrdinal;

  return (
    <section className="rounded-2xl bg-inset p-5">
      <div className="flex items-start gap-4">
        <span
          className={cn(
            "tnum text-[34px] leading-none font-semibold tracking-tight",
            moved ? "text-ochre" : "text-navy-deep",
          )}
        >
          {draft.score !== null ? draft.score.toFixed(2) : "-"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] leading-snug font-medium text-navy-deep">
            {draft.bandCriterion}
          </p>
          {row.decidingFact ? (
            <p className="mt-1 text-[12.5px] leading-snug text-muted-foreground">
              {row.decidingFact}
            </p>
          ) : null}
        </div>
      </div>

      {editing && bands.length > 0 ? (
        <div className="mt-4 flex flex-col gap-1">
          <Label className="mb-1 text-[12px] font-medium text-muted-foreground">
            Which band do these words meet
          </Label>
          {bands.map((b) => {
            const on = b.ordinal === draft.bandOrdinal;
            return (
              <button
                key={b.ordinal}
                type="button"
                onClick={() =>
                  patch({ score: b.score, bandOrdinal: b.ordinal, bandCriterion: b.criterion })
                }
                className={cn(
                  "flex items-start gap-3 rounded-xl px-3 py-2 text-left transition-colors",
                  on ? "bg-card lift-sm" : "hover:bg-card/60",
                )}
              >
                <span
                  className={cn(
                    "tnum mt-px w-9 shrink-0 text-[13px] font-semibold",
                    on ? "text-navy" : "text-muted-foreground",
                  )}
                >
                  {b.score.toFixed(2)}
                </span>
                <span
                  className={cn(
                    "text-[12.5px] leading-snug",
                    on ? "text-navy-deep" : "text-muted-foreground",
                  )}
                >
                  {b.criterion}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

function Citation({
  row,
  draft,
  patch,
  editing,
}: {
  row: ExportRow;
  draft: FindingEdit;
  patch: (next: Partial<FindingEdit>) => void;
  editing: boolean;
}) {
  const moved =
    draft.quoteCharStart !== row.quoteCharStart || draft.quoteCharEnd !== row.quoteCharEnd;

  return (
    <Section title="The citation">
      {draft.verbatimSnippet ? (
        <blockquote
          className={cn(
            "rounded-xl border-l-[3px] py-1.5 pl-3.5 text-[13px] leading-relaxed",
            moved ? "border-ochre bg-ochre-soft/50 text-ink" : "border-edge text-ink",
          )}
        >
          {draft.verbatimSnippet}
        </blockquote>
      ) : (
        <p className="text-[13px] text-muted-foreground">No words are quoted.</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12.5px] text-muted-foreground">
        {draft.quoteCharStart !== null ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="tnum cursor-help underline decoration-edge decoration-dotted underline-offset-4">
                Characters {draft.quoteCharStart} to {draft.quoteCharEnd}
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[24rem] text-[12px] leading-relaxed">
              Offsets into the stored document text. Select words on the left to move them.
            </TooltipContent>
          </Tooltip>
        ) : null}
        {moved ? <span className="font-medium text-ochre">Moved from the reading</span> : null}
      </div>

      {editing ? (
        <div className="mt-4 grid gap-3 @lg:grid-cols-[7rem_1fr]">
          <div className="flex flex-col gap-1.5">
            <Label className="text-[12px] font-medium text-muted-foreground">Provision</Label>
            <Input
              value={draft.article ?? ""}
              onChange={(e) => patch({ article: e.target.value || null })}
              className="h-9 rounded-xl bg-inset text-[13px]"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[12px] font-medium text-muted-foreground">
              Where it sits
            </Label>
            <Input
              value={draft.locationReference ?? ""}
              onChange={(e) => patch({ locationReference: e.target.value || null })}
              className="h-9 rounded-xl bg-inset text-[13px]"
            />
          </div>
        </div>
      ) : (
        <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-[12.5px] @xl:grid-cols-2">
          <Fact label="Provision" value={draft.article ? `Section ${draft.article}` : "None"} />
          {/* A number now, as the template validates it. What earned it is the first sentence of
              Notes, which is where a reviewer reads it. */}
          <Fact label="Confidence" value={row.confidence?.trim() || "not stated"} />
        </dl>
      )}
    </Section>
  );
}

function Attributes({ attributes }: { attributes: ReadingAttribute }) {
  const entries = Object.entries(attributes).filter(([key, value]) => {
    if (key === "indicatorId" || key === "quote") return false;
    if (!(key in attributeLabels)) return false;
    if (value === null || value === undefined || value === "") return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  });
  if (entries.length === 0) return null;

  return (
    <dl className="grid gap-x-6 gap-y-1.5 text-[12.5px] @xl:grid-cols-2">
      {entries.map(([key, value]) => (
        <Fact
          key={key}
          label={attributeLabels[key]}
          value={
            typeof value === "boolean"
              ? value
                ? "Yes"
                : "No"
              : Array.isArray(value)
                ? value.join(", ")
                : String(value)
          }
        />
      ))}
    </dl>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 border-b border-edge/60 py-1">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="ml-auto min-w-0 truncate text-right font-medium text-navy-deep">{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2.5 text-[12.5px] font-semibold tracking-tight text-navy-deep">
        {title}
      </h3>
      {children}
    </section>
  );
}
