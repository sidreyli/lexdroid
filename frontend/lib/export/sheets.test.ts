/**
 * The comparison ESCAP marks on the morning of 15 October.
 *
 * "Cover every provision either engine produced" is the instruction, and it is the part that is
 * easy to get subtly wrong: an inner join loses exactly the rows that are interesting, because a
 * provision only one engine found is the clearest thing either engine did.
 *
 * The other thing asserted here is what "the same provision" means. Two engines reading one section
 * and disagreeing about which indicator it answers have still read one provision, and the sheet has
 * to say they disagreed rather than list it twice as two separate finds.
 */
import { describe, expect, it } from "vitest";
import { compareProvisions } from "./sheets";
import type { ExportRow } from "@/lib/data/types";

function row(over: Partial<ExportRow>): ExportRow {
  return {
    id: 1,
    cellId: 1,
    runId: "run-a",
    economy: "SGP",
    indicatorId: "12.3",
    state: "restricted",
    lawName: "Payment Services Act 2019",
    lawNumberRef: null,
    lastAmended: null,
    article: "s. 5",
    discoveryTag: "KNOWN",
    locationReference: null,
    verbatimSnippet: "must hold a licence",
    quoteCharStart: null,
    quoteCharEnd: null,
    mappingRationale: null,
    sourceUrl: "https://sso.agc.gov.sg/Act/PSA2019#pr5-",
    confidence: "high",
    notes: null,
    languageOfSource: "en",
    sectionId: 100,
    readingId: null,
    createdAt: "2026-09-16T00:00:00.000Z",
    score: 0,
    bandOrdinal: 1,
    ...over,
  } as ExportRow;
}

describe("comparing what two engines produced", () => {
  it("reports a provision both engines read as found by both", () => {
    const out = compareProvisions([row({})], [row({ runId: "run-b" })]);
    expect(out).toHaveLength(1);
    expect(out[0]?.foundBy).toBe("Both");
    expect(out[0]?.howTheyDiffer).toBe("identical");
  });

  it("keeps a provision only one engine found, rather than dropping it", () => {
    // The row an inner join would lose, and the one the short note is most likely to be about.
    const onlyA = compareProvisions([row({ sectionId: 100 })], []);
    expect(onlyA[0]?.foundBy).toBe("Engine A");
    expect(onlyA[0]?.howTheyDiffer).toContain("Engine B did not produce");

    const onlyB = compareProvisions([], [row({ sectionId: 200 })]);
    expect(onlyB[0]?.foundBy).toBe("Engine B");
    expect(onlyB[0]?.howTheyDiffer).toContain("Engine A did not produce");
  });

  it("names each of the three ways two readings of one provision can differ", () => {
    const a = row({ sectionId: 100, indicatorId: "12.3", verbatimSnippet: "must hold a licence" });
    const b = row({
      sectionId: 100,
      runId: "run-b",
      indicatorId: "12.4",
      verbatimSnippet: "shall not carry on business",
      sourceUrl: "https://sso.agc.gov.sg/Act/PSA2019",
    });

    const [only] = compareProvisions([a], [b]);
    expect(only?.foundBy).toBe("Both");
    expect(only?.indicatorDiffers).toBe(true);
    expect(only?.citationDiffers).toBe(true);
    expect(only?.quoteDiffers).toBe(true);
    expect(only?.howTheyDiffer).toContain("12.3");
    expect(only?.howTheyDiffer).toContain("12.4");
  });

  it("treats one section read twice as one provision, not two finds", () => {
    // Two engines mapping the same section to different indicators have read one provision. Listing
    // it as two separate finds would report agreement as discovery.
    const out = compareProvisions(
      [row({ sectionId: 100, indicatorId: "12.3" })],
      [row({ sectionId: 100, runId: "run-b", indicatorId: "6.1" })],
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.foundBy).toBe("Both");
  });

  it("does not match provisions across economies", () => {
    const out = compareProvisions(
      [row({ economy: "SGP", sectionId: null, lawName: "Act", article: "s. 5" })],
      [row({ economy: "MYS", sectionId: null, lawName: "Act", article: "s. 5" })],
    );
    expect(out).toHaveLength(2);
    expect(out.map((c) => c.foundBy).sort()).toEqual(["Engine A", "Engine B"]);
  });

  it("ignores whitespace and case when asking whether the words differ", () => {
    const out = compareProvisions(
      [row({ verbatimSnippet: "must hold a licence" })],
      [row({ runId: "run-b", verbatimSnippet: "  Must   hold a Licence " })],
    );
    expect(out[0]?.quoteDiffers).toBe(false);
  });

  it("compares nothing against nothing without inventing a row", () => {
    expect(compareProvisions([], [])).toEqual([]);
  });
});
