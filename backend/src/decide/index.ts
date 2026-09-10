/**
 * Zone 3 -- the score, computed.
 *
 * ESCAP's scoring criteria are written as a small decision procedure over facts about a measure:
 * does it apply to all sectors or one, to personal data or non-personal, is there more than one of
 * them. This module is those procedures in TypeScript, one function per indicator, written from
 * the band text and quoting it. No model runs here, and nothing in this file has ever seen ESCAP's
 * completed answers.
 *
 * Two consequences, and both are criteria we are graded on. The same evidence produces the same
 * score every time, which is what framework alignment at scale means. And when a score is
 * challenged the answer is a rule and the facts it consumed, rather than a sentence a model wrote
 * about its own reasoning.
 *
 * The indicator's stated exception is applied here too, and applied visibly: a finding it excludes
 * is kept on the decision with the reason, because "we found a measure and did not score it" is
 * different from "we found nothing", and only one of them is what happened.
 */
import type { Indicator, ScoreBand } from '../rubric/types.js';
import type { Finding } from '../read/index.js';
import { MEASURES } from '../rubric/measures.js';
import { inUsd, moneyIn, type FxRates } from './currency.js';

/** One finding, with enough of its origin to cite it. */
export interface Evidence {
  finding: Finding;
  sectionId: number;
  instrumentId: number;
  instrumentTitle: string;
  headingPath: string;
  /** The deep link a reviewer follows: the instrument's own URL and the provision's anchor. */
  citation: string;
  /** Whether the provision only instructs an amendment to some other Act. */
  amendsAnotherAct: boolean;
}

/** What a framework-shaped indicator is decided from. One per candidate instrument. */
export interface FrameworkEvidence {
  instrumentId: number;
  instrumentTitle: string;
  citation: string;
  establishesFramework: boolean;
  horizontal: boolean;
  dedicated: boolean;
  /** Whether the instrument's own opening carries the words said to show it is dedicated. */
  dedicatedShown: boolean;
  /** And the words said to confine it to one named sector, where it was called sectoral. */
  sectoralShown: boolean;
  sector: string | null;
  quote: string;
}

/**
 * What was actually looked at.
 *
 * Carried into the decision because a zero and an unanswered cell are indistinguishable without
 * it. v1 certified 852 documents as clean negatives that nothing had been read out of; the
 * denominator is what makes that impossible to repeat.
 */
export interface Coverage {
  /** Sections retrieved and read for this cell. */
  sectionsRead: number;
  /** Sections in the economy's index at all. */
  sectionsIndexed: number;
  /** Instruments considered, for framework indicators. */
  instrumentsConsidered: number;
}

export type CellState = 'restricted' | 'no-restriction' | 'unresolved';

/**
 * The instrument a zero is reported against.
 *
 * More than half of every economy's rows in ESCAP's own database score zero, and none of their
 * zeros is a silence: Australia 2.2 scores 0 citing the Commonwealth Procurement Rules 2024 and
 * states that no source-code or encryption condition is found in them. A zero of that shape is a
 * finding. A zero that says only "nothing was found" is an assertion, and their reviewers rejected
 * assertions across the graded submissions.
 *
 * Two strengths, kept apart, because claiming the stronger one when only the weaker is true is
 * exactly the failure this is meant to prevent:
 *
 *   governing   an instrument that demonstrably regulates this pillar's subject -- the reader
 *               found requirements of this pillar in it -- and that does not impose this
 *               indicator's measure. "We read the Act that governs this area and it does not
 *               require it."
 *   surfaced    no instrument in the corpus was found to regulate the subject at all, so the most
 *               relevant thing the search returned is named as that and nothing more. A weaker
 *               claim, said in weaker words.
 */
export interface Absence {
  instrumentId: number;
  instrumentTitle: string;
  basis: 'governing' | 'surfaced';
  /** How many requirements of this pillar the reader found in it. Zero for a 'surfaced' basis. */
  pillarFindings: number;
  /**
   * The date the text read is current to.
   *
   * A zero read out of a stale consolidation is a different claim from a zero read out of the
   * current law. Malaysia publishes its Personal Data Protection Act as at 2023 and the officer
   * duty arrived in 2024, so the row has to say which text it is reporting on.
   */
  currentTo?: string | null;
}

export interface Decision {
  indicatorId: string;
  economy: string;
  state: CellState;
  /** Null only when unresolved. A cell that was answered always has a number. */
  score: number | null;
  band: ScoreBand | null;
  /** The findings the band was chosen from. */
  basis: Evidence[];
  /** Found, and deliberately not scored. The reason is the indicator's own exception text. */
  excluded: { evidence: Evidence; reason: string }[];
  /** Held rather than scored: a fact the band needs that the provision does not state. */
  held: { evidence: Evidence; reason: string }[];
  frameworkBasis: FrameworkEvidence[];
  /**
   * What a score of zero was read against. Null when the score is not zero, and null when nothing
   * was read at all -- a cell that looked at nothing has no instrument to report an absence in,
   * and says so as 'unresolved' instead.
   */
  absence: Absence | null;
  coverage: Coverage;
  /**
   * The one fact that put the answer in this band and not the one above it.
   *
   * Held apart from the rationale because it is the thing a reviewer disputes. "A framework
   * applying across sectors: Personal Data Protection Act 2012" can be argued with; a paragraph
   * that contains that clause somewhere cannot be argued with as precisely.
   */
  decidingFact: string;
  /** Assembled from the band's own words and the evidence. Not written by a model. */
  rationale: string;
}

/* ---------------------------------------------------------------------------------------------
 * Shared predicates. Each one is a phrase from the band text, evaluated over a finding.
 * ------------------------------------------------------------------------------------------- */

/**
 * "for all sectors or personal data" -- the top band of 6.1, 6.2 and 6.4, which is not one test.
 *
 * Read from the band text alone, "all sectors" looked like a sufficient condition on its own, and
 * the Companies Act's duty to keep accounting records in Singapore -- every company, so every
 * sector -- scored the top band. ESCAP's guide is explicit that it does not, and says why for each
 * of the three indicators separately:
 *
 *   6.1 and 6.2: "a horizontal requirement that applies across sectors will get a higher score
 *   than a requirement that applies only to a specific sector (such as financial services or
 *   telecommunication sector) *or specific data types (such as accounting data and health
 *   records)*". Horizontality is one test over both axes, so a rule confined to one kind of record
 *   is not horizontal however many sectors it binds.
 *
 *   6.4: "The score is also '1' if the conditional flow regime applies horizontally across all
 *   sectors *(even if it only applies to non-personal or specific data types)*". Here the sector
 *   axis alone is enough, and the guide adds the parenthetical to say so.
 *
 * So the same words in the methodology sheet mean two different things two indicators apart, and
 * the guide is where that is written down. A single shared predicate flattened the difference.
 */
const reachesBroadly = (f: Finding, eitherAxisIsEnough: boolean): boolean => {
  // Horizontal on both axes, or -- where the guide says one axis carries it -- on either.
  const everySector = f.sectorScope === 'all';
  const wideData = f.dataScope === 'personal' || f.dataScope === 'all';
  return eitherAxisIsEnough ? everySector || f.dataScope === 'personal' : everySector && wideData;
};

/** "applied to specific sector, specific data, non-personal data". */
const reachesNarrowly = (f: Finding, eitherAxisIsEnough: boolean): boolean =>
  !reachesBroadly(f, eitherAxisIsEnough);

/** A power that may be used is not a requirement that must be met. Read from the verb the finding
 *  quotes, not the mandatory flag beside it -- that flag called "may appoint" mandatory. */
const isRequirement = (f: Finding): boolean =>
  f.dutyForce === 'requires' || f.dutyForce === 'forbids';

const band = (indicator: Indicator, ordinal: number): ScoreBand => {
  const b = indicator.bands.find((x) => x.ordinal === ordinal);
  if (!b) throw new Error(`Indicator ${indicator.id} has no band ${ordinal}`);
  return b;
};

/**
 * The shape shared by 6.1, 6.2 and 6.4: broad measure scores the top band, narrow scores the
 * middle, nothing scores zero. 6.1 and 6.2 add "OR more than one measure in category (2)", which
 * 6.4 does not, so it is a parameter rather than an assumption.
 */
/**
 * How many measures this evidence is, which is not how many provisions it is.
 *
 * ESCAP's row is one measure carrying one official link, and their reviewers told teams both to
 * split a row holding several measures and to stop compiling several links into one. So a measure
 * is a requirement of an instrument: sections 191, 199 and 397 of the Companies Act each say where
 * a company keeps its own records, and they are one local storage measure written three times.
 * Different Acts are different measures -- Malaysia's customs, excise and income tax record duties
 * bind different populations under different schemes.
 */
function measureCount(evidence: Evidence[]): number {
  // One section is one requirement even when it was read under two measure labels, so a provision
  // contributes once. The lowest label keeps the count independent of the order evidence arrives.
  const perSection = new Map<number, string>();
  for (const e of evidence) {
    const key = `${e.instrumentId} :: ${e.finding.measure ?? ''}`;
    const seen = perSection.get(e.sectionId);
    if (seen === undefined || key < seen) perSection.set(e.sectionId, key);
  }
  return new Set(perSection.values()).size;
}

/**
 * Does this band rest on not having found something, rather than on evidence?
 *
 * Asked of the rule itself rather than carried as metadata: the band an empty evidence set reaches
 * is by definition the one absence earns, so the two can never drift apart.
 */
function scoresOnAbsence(indicator: Indicator, rule: Rule, ordinal: number): boolean {
  if (band(indicator, ordinal).score <= 0) return false;
  return rule(indicator, []).ordinal === ordinal;
}

function scopeScaled(
  indicator: Indicator,
  qualifying: Evidence[],
  opts: { twoNarrowMakeBroad: boolean; sectorScopeAloneIsEnough: boolean },
): Outcome {
  const broad = qualifying.filter((e) => reachesBroadly(e.finding, opts.sectorScopeAloneIsEnough));
  const narrow = qualifying.filter((e) => reachesNarrowly(e.finding, opts.sectorScopeAloneIsEnough));

  if (broad.length > 0) {
    return {
      ordinal: 1,
      reason: `${measureCount(broad)} measure(s) reaching all sectors or personal data`,
      counted: broad,
    };
  }
  if (opts.twoNarrowMakeBroad && measureCount(narrow) > 1) {
    return {
      ordinal: 1,
      reason: `${measureCount(narrow)} separate measures in the middle band`,
      counted: narrow,
    };
  }
  if (narrow.length > 0) {
    return {
      ordinal: 2,
      reason: `${measureCount(narrow)} measure(s) limited in sector or data type`,
      counted: narrow,
    };
  }
  return { ordinal: indicator.bands.length, reason: 'no qualifying measure found' };
}

/* ---------------------------------------------------------------------------------------------
 * One function per indicator.
 * ------------------------------------------------------------------------------------------- */

/** `counted` is the evidence the band was actually chosen from, strongest first. The row leads
 *  with it, so the sentence a reviewer reads first is the one the score turns on. */
type Outcome = { ordinal: number; reason: string; counted?: Evidence[] };

/** What a rule may need beyond the evidence. One rule needs it; the rest ignore it. */
export interface RuleContext {
  economy: string;
  /** The exchange rates this run fetched, or null when none could be had. */
  rates: FxRates | null;
}

type Rule = (indicator: Indicator, qualifying: Evidence[], ctx?: RuleContext) => Outcome;

/**
 * The rule for a band that asks only whether a restriction exists.
 *
 * Eleven of pillar 12's indicators are written that way -- "Any license" / "No license" -- so the
 * whole of their scoring is the measure vocabulary, and writing each one out by hand would only
 * make eleven places for the same sentence to drift.
 */
function present(what: string): Rule {
  return (_indicator, qualifying) =>
    qualifying.length > 0
      ? { ordinal: 1, reason: `${qualifying.length} ${what}(s) found`, counted: qualifying }
      : { ordinal: 2, reason: `no ${what} found` };
}

/**
 * The rule for a band written "for any measure of category (1), OR more than one of category (2)".
 *
 * ESCAP repeats that sentence across four pillars. The severe measure reaches the top band alone;
 * the lesser one reaches it only in company, and on its own takes the middle.
 */
function escalating(severe: { measure: string; what: string }, lesser: { measure: string; what: string }): Rule {
  return (_indicator, qualifying) => {
    const bad = qualifying.filter((e) => e.finding.measure === severe.measure);
    const some = qualifying.filter((e) => e.finding.measure === lesser.measure);
    if (bad.length > 0) return { ordinal: 1, reason: severe.what, counted: [...bad, ...some] };
    if (measureCount(some) > 1) {
      return { ordinal: 1, reason: `${measureCount(some)} ${lesser.what}s`, counted: some };
    }
    if (some.length > 0) return { ordinal: 2, reason: `one ${lesser.what}`, counted: some };
    return { ordinal: 3, reason: `no ${severe.what} and no ${lesser.what} found` };
  };
}

/**
 * The same escalating band, split by how far the measure reaches rather than by which measure.
 *
 * 4.3 and 4.9 rank "affecting all circumstances and sectors" above "a specific circumstance or
 * sector", and reach is already a fact every finding carries, so nothing new has to be read.
 */
function escalatingByReach(what: string): Rule {
  return (_indicator, qualifying) => {
    const wide = qualifying.filter((e) => e.finding.sectorScope === 'all');
    const narrow = qualifying.filter((e) => e.finding.sectorScope !== 'all');
    if (wide.length > 0) return { ordinal: 1, reason: `${what} reaching every sector`, counted: [...wide, ...narrow] };
    if (measureCount(narrow) > 1) {
      return { ordinal: 1, reason: `${measureCount(narrow)} sector-specific ${what}s`, counted: narrow };
    }
    if (narrow.length > 0) return { ordinal: 2, reason: `one sector-specific ${what}`, counted: narrow };
    return { ordinal: 3, reason: `no ${what} found` };
  };
}

/**
 * The rule for an indicator whose top band is the absence of a protection.
 *
 * Eight indicators are written that way -- "Lack of", "Absence of", "No independent authority" --
 * and they invert the usual risk: on a restriction, a retrieval miss costs a zero, but here it
 * scores the top band. The coverage guard above is what stands between the two: an indicator
 * nothing was read for is unresolved, never a 1.
 */
function absent(what: string): Rule {
  return (indicator, qualifying) =>
    qualifying.length > 0
      ? { ordinal: indicator.bands.length, reason: `${qualifying.length} ${what}(s) found`, counted: qualifying }
      : { ordinal: 1, reason: `nothing read establishes ${what}` };
}

/** "Absence of both" / "one of them" / "both" -- 4.2 and 4.6, over the same two components. */
function bothOrOne(what: string): Rule {
  return (_indicator, qualifying) => {
    const procedures = qualifying.filter((e) => e.finding.measure === 'enforcement-procedure');
    const provisional = qualifying.filter((e) => e.finding.measure === 'provisional-measure');
    if (procedures.length > 0 && provisional.length > 0) {
      return { ordinal: 3, reason: `${what} procedures and provisional measures both exist`, counted: [...procedures, ...provisional] };
    }
    if (procedures.length > 0) return { ordinal: 2, reason: `${what} procedures, but no provisional measures`, counted: procedures };
    if (provisional.length > 0) return { ordinal: 2, reason: `provisional measures, but no ${what} procedures`, counted: provisional };
    return { ordinal: 1, reason: `nothing read establishes ${what} procedures or provisional measures` };
  };
}

/** How many different sectors the evidence names. A finding naming none counts as one. */
function distinctSectors(evidence: Evidence[]): number {
  return new Set(evidence.map((e) => (e.finding.sector ?? '').toLowerCase().trim())).size;
}

interface EquityTokens {
  ban: string;
  minority: string;
  controlling: string;
  stateOwnedOnly?: string;
}

/**
 * The foreign-equity ladder, which 3.1, 5.2 and 12.01 all climb from different rungs.
 *
 * Their bands descend the same way -- no shares at all, a minority, a controlling but not a full
 * stake, no limit -- so the rung is the measure, named by the reader and anchored to the words of
 * the provision that state the proportion. Nothing here parses a number out of prose, because a
 * proportion is stated from either end: "not less than 70% held by citizens" and "not more than
 * 30% held by a foreign person" are the same rule, and a rule that read the figure alone would
 * put them on opposite rungs.
 *
 * Where the ladders differ is the top. 3.1 and 5.2 have a ban band above the minority one and
 * promote two minority limits into it; 12.01 starts at the minority, so a ban lands there too.
 */
function equityLadder(
  t: EquityTokens,
  opts: { hasBanBand: boolean; countBy: 'sector' | 'measure' },
): Rule {
  return (indicator, qualifying) => {
    const of = (token?: string): Evidence[] =>
      token ? qualifying.filter((e) => e.finding.measure === token) : [];
    const bans = of(t.ban);
    const minority = of(t.minority);
    const controlling = of(t.controlling);
    const stateOwned = of(t.stateOwnedOnly);

    if (bans.length > 0) {
      return {
        ordinal: 1,
        reason: 'no share of a company in this sector may be held by a foreign person',
        counted: [...bans, ...minority],
      };
    }
    if (minority.length > 0) {
      if (!opts.hasBanBand) {
        return { ordinal: 1, reason: 'a minority stake is the most a foreign person may hold', counted: minority };
      }
      const n = opts.countBy === 'sector' ? distinctSectors(minority) : measureCount(minority);
      if (n > 1) {
        return {
          ordinal: 1,
          reason: `a minority stake is the most a foreign person may hold, in ${n} ${opts.countBy === 'sector' ? 'sectors' : 'separate measures'}`,
          counted: minority,
        };
      }
      return { ordinal: 2, reason: 'a minority stake is the most a foreign person may hold', counted: minority };
    }
    if (controlling.length > 0 || stateOwned.length > 0) {
      return {
        ordinal: opts.hasBanBand ? 3 : 2,
        reason:
          controlling.length > 0
            ? 'a controlling but not a full stake may be held by a foreign person'
            : 'foreign shareholding is limited only where the State holds shares',
        counted: [...controlling, ...stateOwned],
      };
    }
    return { ordinal: indicator.bands.length, reason: 'no limit on foreign shareholding found' };
  };
}

const RULES: Record<string, Rule> = {
  /**
   * 6.1 "Ban and/or local processing requirement for all sectors or personal data, OR more than
   * one measure in category (2)" / "... applied to specific sector, specific data, non-personal
   * data, or transfer is prohibited to one country".
   *
   * A ban naming particular countries sits in the middle band by the band's own words, whatever
   * else it covers, so that test comes first.
   */
  '6.1': (indicator, qualifying) => {
    const byCountry = qualifying.filter((e) => e.finding.countriesNamed.length > 0);
    const rest = qualifying.filter((e) => e.finding.countriesNamed.length === 0);
    const base = scopeScaled(indicator, rest, {
      twoNarrowMakeBroad: true,
      sectorScopeAloneIsEnough: false,
    });
    if (base.ordinal === 1) return base;
    const narrows = [...byCountry, ...rest.filter((e) => reachesNarrowly(e.finding, false))];
    if (measureCount(narrows) > 1) {
      return {
        ordinal: 1,
        reason: `${measureCount(narrows)} separate measures in the middle band`,
        counted: narrows,
      };
    }
    // One measure, however many findings carry it: the count above already ruled out more.
    if (narrows.length > 0) {
      return {
        ordinal: 2,
        reason: byCountry.length > 0 ? 'transfer prohibited to a named country' : base.reason,
        counted: narrows,
      };
    }
    return { ordinal: 3, reason: 'no ban or local processing requirement found' };
  },

  /** 6.2, verbatim: local storage for all sectors or personal data, OR more than one narrow one. */
  '6.2': (indicator, qualifying) =>
    scopeScaled(indicator, qualifying, { twoNarrowMakeBroad: true, sectorScopeAloneIsEnough: false }),

  /** 6.3 is binary: "Infrastructure requirement" or "No requirement". Scope does not enter it. */
  '6.3': (indicator, qualifying) =>
    qualifying.length > 0
      ? { ordinal: 1, reason: `${qualifying.length} infrastructure requirement(s)`, counted: qualifying }
      : { ordinal: 2, reason: 'no infrastructure requirement found' },

  /**
   * 6.4 "Conditions for all sectors or personal data" / "Conditions for specific data or
   * non-personal data". Note what is absent: unlike 6.1 and 6.2 there is no clause promoting two
   * narrow measures to the top band, so two conditional regimes for named sectors stay at 0.5.
   */
  '6.4': (indicator, qualifying) =>
    scopeScaled(indicator, qualifying, { twoNarrowMakeBroad: false, sectorScopeAloneIsEnough: true }),

  /**
   * 7.3 "Minimum period of data retention requirement" / "No data retention requirement".
   *
   * The band asks for a minimum, so the distinction that matters is direction: a duty to keep for
   * at least some period scores, and a duty to stop keeping does not. Singapore has both -- the
   * PDPA requires an organisation to cease retaining personal data once its purpose has ended,
   * while the Companies Act requires accounting records kept for five years.
   *
   * Requiring the period to be stated in the same provision was too strict and was measured to be
   * wrong: the Employment Act requires records kept "for the period prescribed" and leaves the
   * number to regulations, which is still a floor. The period is recorded as evidence where the
   * provision names one, and is not what the band turns on.
   */
  '7.3': (indicator, qualifying) => {
    const floors = qualifying.filter((e) => e.finding.measure === 'minimum-retention');
    // The band names a minimum period, so a floor that states one shows more of the band than a
    // floor whose period is prescribed elsewhere, and leads.
    const counted = [...floors].sort(
      (a, b) => Number(b.finding.statedPeriod !== null) - Number(a.finding.statedPeriod !== null),
    );
    return floors.length > 0
      ? { ordinal: 1, reason: `${floors.length} duty(ies) to keep data for at least a period`, counted }
      : { ordinal: 2, reason: 'no minimum retention requirement found' };
  },

  /**
   * 7.4 "DPO and DPIA OR only DPO requirement, applied to all sectors" / "... applied to a
   * specific sector".
   *
   * The asymmetry is in the band and is preserved: an impact assessment duty on its own scores
   * nothing. Only the officer requirement, alone or together with an assessment, reaches a band.
   */
  '7.4': (indicator, qualifying) => {
    const officer = qualifying.filter((e) => e.finding.measure === 'data-protection-officer');
    if (officer.length === 0) {
      return { ordinal: 3, reason: 'no data protection officer requirement found' };
    }
    const horizontal = officer.filter((e) => e.finding.sectorScope === 'all');
    return horizontal.length > 0
      ? {
          ordinal: 1,
          reason: 'officer requirement applying to all sectors',
          counted: [...horizontal, ...officer.filter((e) => e.finding.sectorScope !== 'all')],
        }
      : { ordinal: 2, reason: 'officer requirement applying to a named sector', counted: officer };
  },

  /**
   * 7.5 "For any measure that allows government to access data without court orders" / "No
   * measure". Any is any: one such power is the whole band, and scope does not enter it.
   */
  '7.5': (indicator, qualifying) =>
    qualifying.length > 0
      ? {
          ordinal: 1,
          reason: `${qualifying.length} access power(s) not requiring a court order`,
          counted: qualifying,
        }
      : { ordinal: 2, reason: 'no government access power without a court order found' },

  /**
   * 8.3 "User identity requirement to connect to the Internet or access online services" /
   * "Used identity requirement for SIM registration" / "No restrictions".
   *
   * Identifying everyone who goes online is the wider measure and takes the top band; identifying
   * whoever a SIM is issued to is the narrower one, and counts only where the wider is absent.
   */
  '8.3': (indicator, qualifying) => {
    const online = qualifying.filter((e) => e.finding.measure === 'user-identity');
    if (online.length > 0) {
      return { ordinal: 1, reason: 'identity required to connect or use an online service', counted: online };
    }
    const sim = qualifying.filter((e) => e.finding.measure === 'sim-registration');
    if (sim.length > 0) return { ordinal: 2, reason: 'identity required to register a SIM', counted: sim };
    return { ordinal: 3, reason: 'no user identity requirement found' };
  },

  /**
   * 8.4 "Any monitoring requirement (monitor the users' activities or remove or block content)" /
   * "Any requirement to active monitoring of users' activities without any legal obligation to
   * remove or block the content" / "No measure".
   *
   * The middle band is what tells the two apart: watching with no duty to act on what is seen.
   * So a duty to take content down decides the top band, and monitoring alone falls to the middle.
   */
  '8.4': (indicator, qualifying) => {
    const removal = qualifying.filter((e) => e.finding.measure === 'content-removal');
    const watching = qualifying.filter((e) => e.finding.measure === 'user-monitoring');
    if (removal.length > 0) {
      return { ordinal: 1, reason: 'a duty to remove or block content', counted: [...removal, ...watching] };
    }
    if (watching.length > 0) {
      return { ordinal: 2, reason: 'a duty to monitor users, with no duty to remove or block', counted: watching };
    }
    return { ordinal: 3, reason: 'no monitoring or removal requirement found' };
  },

  /** 9.3 "Any restriction on online advertising" / "No restriction". */
  '9.3': present('restriction on online advertising'),

  /**
   * 9.4 "Any strict licence requirement / cases of more than one measure in category (2)" / "Any
   * licensing scheme" / "No restriction".
   *
   * Two ways to the top band, as the band itself writes them: one licence the regulator may refuse
   * at its discretion, or two ordinary licensing schemes.
   */
  '9.4': (indicator, qualifying) => {
    const strict = qualifying.filter((e) => e.finding.measure === 'strict-content-licence');
    if (strict.length > 0) {
      return { ordinal: 1, reason: 'a licence that may be refused or revoked at discretion', counted: strict };
    }
    const plain = qualifying.filter((e) => e.finding.measure === 'content-licence');
    if (plain.length > 1) {
      return { ordinal: 1, reason: `${plain.length} separate licensing schemes`, counted: plain };
    }
    if (plain.length === 1) return { ordinal: 2, reason: 'a licensing scheme', counted: plain };
    return { ordinal: 3, reason: 'no licence for online content providers found' };
  },

  /** 10.1 "Ban on more than one ICT goods or digital services" / "Ban on one specific product or
   *  services" / "No measure". The band counts bans, so the rule counts them. */
  '10.1': (indicator, qualifying) => {
    if (qualifying.length > 1) {
      return { ordinal: 1, reason: `${qualifying.length} ICT import bans`, counted: qualifying };
    }
    if (qualifying.length === 1) {
      return { ordinal: 2, reason: 'a ban on one product or service', counted: qualifying };
    }
    return { ordinal: 3, reason: 'no import ban on ICT goods or online services found' };
  },

  /**
   * 10.2 "Import restrictions that potentially block trade (e.g., quotas) OR at least two measures
   * of category (2)" / "Import restrictions that add regulatory compliance costs to trade" /
   * "No restriction".
   */
  '10.2': (indicator, qualifying) => {
    const blocking = qualifying.filter((e) => e.finding.measure === 'import-quota');
    if (blocking.length > 0) {
      return { ordinal: 1, reason: 'a quota or other limit that can block trade', counted: blocking };
    }
    const costly = qualifying.filter((e) => e.finding.measure === 'import-compliance');
    if (costly.length > 1) {
      return { ordinal: 1, reason: `${costly.length} separate compliance requirements`, counted: costly };
    }
    if (costly.length === 1) {
      return { ordinal: 2, reason: 'a compliance requirement on imports', counted: costly };
    }
    return { ordinal: 3, reason: 'no import restriction on ICT goods or online services found' };
  },

  /** 10.4 "Export restriction" / "No restriction". */
  '10.4': present('export restriction on ICT goods or online services'),

  /** 11.1 "Not allowed foreigners to participate in the standard-setting bodies, OR non
   *  transparent standard-setting" / "No restriction". Either alone is the whole band. */
  '11.1': present('barrier to transparent standard-setting'),

  /**
   * 11.3 "Measure in place and used for products in scope" / "Measure in place, but acceptance of
   * 3rd party testing results" / "No requirement".
   *
   * The middle band is the lighter burden, not the heavier one: a testing requirement a foreign
   * certificate can satisfy costs less than one that must be met here, so acceptance lowers it.
   */
  '11.3': (indicator, qualifying) => {
    const testing = qualifying.filter((e) => e.finding.measure === 'product-testing');
    if (testing.length === 0) return { ordinal: 3, reason: 'no product testing requirement found' };
    const accepted = qualifying.filter((e) => e.finding.measure === 'third-party-testing-accepted');
    return accepted.length > 0
      ? { ordinal: 2, reason: 'testing required, but third-party results are accepted', counted: [...accepted, ...testing] }
      : { ordinal: 1, reason: 'testing required, with no acceptance of third-party results', counted: testing };
  },

  /** 11.4 "For any measure or known case" / "No restriction". */
  '11.4': present('encryption standard departing from the international one'),

  /**
   * 12.2 "Any measure limits the number of products that can be purchases online AND restrictions
   * to delivery of products bought online" / "No measure".
   *
   * The conjunction is the band's own, and it is the whole rule: a limit on what may be bought
   * with nothing said about delivery does not reach it, and neither does the other half alone.
   */
  '12.2': (indicator, qualifying) => {
    const purchase = qualifying.filter((e) => e.finding.measure === 'online-purchase-limit');
    const delivery = qualifying.filter((e) => e.finding.measure === 'online-delivery-limit');
    if (purchase.length > 0 && delivery.length > 0) {
      return { ordinal: 1, reason: 'both a purchase limit and a delivery restriction', counted: [...purchase, ...delivery] };
    }
    if (purchase.length > 0 || delivery.length > 0) {
      return {
        ordinal: 2,
        reason: purchase.length > 0
          ? 'a purchase limit, but no restriction on delivery, and the band requires both'
          : 'a delivery restriction, but no limit on what may be purchased, and the band requires both',
      };
    }
    return { ordinal: 2, reason: 'no limit on online purchases or their delivery found' };
  },

  /** 12.3 "Any license for e-commerce providers" / "No license". Any is any. */
  '12.3': present('licence to sell online'),

  /* 12.4 splits one policy issue into seven, each binary, each asking only whether its own
     restriction exists. The measure vocabulary carries the distinction; the rule does not. */
  '12.4.1': present('requirement to use a local bank account'),
  '12.4.2': present('requirement on the currency of an international payment'),
  '12.4.3': present('national payment security standard departing from the international one'),
  '12.4.4': present('payment licensing requirement'),
  '12.4.5': present('ceiling on an electronic payment'),
  '12.4.6': present('requirement to use a specified payment intermediary'),
  '12.4.7': present('other restriction on paying online'),

  /**
   * 12.6 "Imposition of custom duties on electronic transmission" / "Legal mechanisms or
   * regulations applicable to impose custom duties on electronic transmission" / "No restriction".
   *
   * The middle band scores a power that has not been used, so a duty actually imposed is looked
   * for first and the power only matters where none was.
   */
  '12.6': (indicator, qualifying) => {
    const imposed = qualifying.filter((e) => e.finding.measure === 'transmission-duty');
    if (imposed.length > 0) {
      return { ordinal: 1, reason: `${imposed.length} duty(ies) imposed on electronic transmissions`, counted: imposed };
    }
    const power = qualifying.filter((e) => e.finding.measure === 'transmission-duty-power');
    if (power.length > 0) {
      return { ordinal: 2, reason: 'a power to impose such a duty, not exercised', counted: power };
    }
    return { ordinal: 3, reason: 'no customs duty on electronic transmissions found' };
  },

  /**
   * 12.7 "Physical presence required, requirements to the registrater a local domain name to
   * conduct electronic retail" / "Local representative required" / "No restriction".
   *
   * Being here and sending someone here are different burdens and the bands separate them, so a
   * representative counts only where no presence or domain requirement was found.
   */
  '12.7': (indicator, qualifying) => {
    const presence = qualifying.filter((e) => e.finding.measure === 'local-domain-or-presence');
    if (presence.length > 0) {
      return { ordinal: 1, reason: 'a physical presence or local domain requirement', counted: presence };
    }
    const rep = qualifying.filter((e) => e.finding.measure === 'local-representative');
    if (rep.length > 0) {
      return { ordinal: 2, reason: 'a local representative requirement', counted: rep };
    }
    return { ordinal: 3, reason: 'no domain name or local presence requirement found' };
  },

  /** 12.8 "Local presence requirement for at least one sector" / "No requirement". One is enough,
   *  so unlike pillar 6 the sector the requirement reaches does not enter the band. */
  '12.8': present('local presence requirement for an online service provider'),

  /** 2.1 "Excludes foreign firms under any circumstances" / "excludes a specific group of them". */
  '2.1': escalating(
    { measure: 'foreign-exclusion', what: 'foreign firms excluded from public procurement' },
    { measure: 'specific-foreign-exclusion', what: 'exclusion of a specific group of foreign firms' },
  ),

  /** 2.2 "Surrender patents, source codes or trade secrets" / "use specific encryption". Unlike
   *  the escalating shape, two encryption mandates are still one encryption mandate to the band. */
  '2.2': (indicator, qualifying) => {
    const surrender = qualifying.filter((e) => e.finding.measure === 'surrender-source-code');
    const encryption = qualifying.filter((e) => e.finding.measure === 'mandated-encryption');
    if (surrender.length > 0) {
      return { ordinal: 1, reason: 'source code, patents or trade secrets must be surrendered to bid', counted: [...surrender, ...encryption] };
    }
    if (encryption.length > 0) {
      return { ordinal: 2, reason: 'a specific encryption standard is required to win a tender', counted: encryption };
    }
    return { ordinal: 3, reason: 'no source-code, trade-secret or encryption condition found in procurement' };
  },

  /** 2.3 "Directly discriminate against foreign bidders" / "applies to all bidders". */
  '2.3': escalating(
    { measure: 'foreign-bidder-discrimination', what: 'a bidding condition that discriminates against foreign bidders' },
    { measure: 'bidding-condition', what: 'a bidding condition applying to every bidder' },
  ),

  /** 3.2 "For any measure" / "No measure". */
  '3.2': present('joint venture requirement'),

  /** 3.3 "For any measure" / "No measure". */
  '3.3': present('nationality or residency requirement for directors or managers'),

  /** 3.5 "For any measure" / "No measure". */
  '3.5': present('commercial presence requirement'),

  /** 4.01 "Differential treatment, local representative, discriminatory rejection" / "non-
   *  transparent process, substantive examination, local filing first". Fees are in the middle
   *  band too, but whether a fee is high is a judgement and not a fact a provision states. */
  '4.01': (indicator, qualifying) => {
    const severe = qualifying.filter(
      (e) => e.finding.measure === 'patent-applicant-discrimination' || e.finding.measure === 'patent-local-representative',
    );
    const procedural = qualifying.filter(
      (e) => e.finding.measure === 'patent-local-filing-first' || e.finding.measure === 'patent-substantive-examination',
    );
    if (severe.length > 0) {
      return { ordinal: 1, reason: 'foreign patent applicants are treated differently', counted: [...severe, ...procedural] };
    }
    if (procedural.length > 0) {
      return { ordinal: 2, reason: 'a procedural burden on patent applicants, applying to everyone', counted: procedural };
    }
    return { ordinal: 3, reason: 'no restriction on patent applications found' };
  },

  /** 4.3 "All circumstances and sectors, or more than one of category (2)" / "a specific one". */
  '4.3': escalatingByReach('restriction on enforcing a patent'),

  /** 4.9 "An entire sector or all sectors horizontally, or more than one of category (2)". */
  '4.9': escalatingByReach('requirement to disclose source code or trade secrets'),

  /** 5.5 "For any strict licensing scheme" / "No strict licensing scheme". */
  '5.5': present('strict telecom licensing condition'),

  /** 10.3 "At sectoral or horizontal level, or at least two of category (2)" / "at product
   *  level". The split is how coarsely the provision names the goods, not how far it reaches. */
  '10.3': escalating(
    { measure: 'local-content-category', what: 'a local content requirement over a whole class of goods' },
    { measure: 'local-content-product', what: 'a local content requirement on a named product' },
  ),

  /** 1.4 "0.25 for each measure, up to 1" -- the only indicator that scores by counting. */
  '1.4': (indicator, qualifying) => {
    const n = qualifying.length;
    // Bands run 1, 0.75, 0.5, 0.25, 0 in that order, so the ordinal is the distance from four.
    const ordinal = n >= 4 ? 1 : indicator.bands.length - n;
    return n > 0
      ? { ordinal, reason: `${n} trade defence measure(s) on ICT goods`, counted: qualifying }
      : { ordinal, reason: 'no trade defence measure on ICT goods found' };
  },

  /** 4.2 and 4.6 "Absence of both" / "one of them" / "both". The same two components twice, over
   *  patents and over online copyright. */
  '4.2': bothOrOne('patent enforcement'),
  '4.6': bothOrOne('online copyright enforcement'),

  /** 4.5 "Lack of framework OR of exceptions" / "unclear exceptions" / "clear exceptions
   *  following fair use or fair dealing". The band names the open model by name, so a closed list
   *  of permitted purposes is the middle band however clearly it is drafted. */
  '4.5': (indicator, qualifying) => {
    const open = qualifying.filter((e) => e.finding.measure === 'fair-use-exception');
    const closed = qualifying.filter((e) => e.finding.measure === 'qualified-exception');
    if (open.length > 0) return { ordinal: 3, reason: 'a fair use or fair dealing exception', counted: [...open, ...closed] };
    if (closed.length > 0) return { ordinal: 2, reason: 'copyright exceptions confined to listed purposes', counted: closed };
    return { ordinal: 1, reason: 'nothing read establishes a copyright exception' };
  },

  /** 4.1 "Lack of framework" / "limited scope, or clauses in a wider law" / "effective protection
   *  in any form". */
  '4.1': (indicator, qualifying) => {
    const whole = qualifying.filter((e) => e.finding.measure === 'trade-secret-protection');
    const clause = qualifying.filter((e) => e.finding.measure === 'trade-secret-clause');
    if (whole.length > 0) return { ordinal: 3, reason: 'a remedy for misuse of trade secrets', counted: [...whole, ...clause] };
    if (clause.length > 0) return { ordinal: 2, reason: 'confidentiality clauses inside a law about something else', counted: clause };
    return { ordinal: 1, reason: 'nothing read protects trade secrets' };
  },

  /** 5.1 "No obligation" / "not mandated but practised" / "mandated". The middle band turns on
   *  what the market does rather than what the law says, and no provision evidences it, so this
   *  rule can only reach the outer two. */
  '5.1': absent('a duty to share passive telecom infrastructure'),

  /** 5.4 "Neither" / "only accounting" / "only functional" / "both". Accounting alone scores
   *  worse than functional alone, which is the way round it is easy to get wrong. */
  '5.4': (indicator, qualifying) => {
    const accounting = qualifying.filter((e) => e.finding.measure === 'accounting-separation');
    const functional = qualifying.filter((e) => e.finding.measure === 'functional-separation');
    if (accounting.length > 0 && functional.length > 0) {
      return { ordinal: 4, reason: 'both accounting and functional separation are required', counted: [...accounting, ...functional] };
    }
    if (functional.length > 0) return { ordinal: 3, reason: 'only functional separation is required', counted: functional };
    if (accounting.length > 0) return { ordinal: 2, reason: 'only accounting separation is required', counted: accounting };
    return { ordinal: 1, reason: 'nothing read requires accounting or functional separation' };
  },

  /** 5.7 "No independent telecom authority" / "established". */
  '5.7': absent('an independent telecommunications regulator'),

  /** 11.2 "Neither allowed" / "SDoC not allowed but MRA certificates accepted" / "SDoC allowed
   *  for foreign business". */
  '11.2': (indicator, qualifying) => {
    const sdoc = qualifying.filter((e) => e.finding.measure === 'sdoc-allowed');
    const mra = qualifying.filter((e) => e.finding.measure === 'mra-certification-accepted');
    if (sdoc.length > 0) return { ordinal: 3, reason: "a supplier's own declaration of conformity is accepted", counted: [...sdoc, ...mra] };
    if (mra.length > 0) return { ordinal: 2, reason: 'foreign certificates are accepted under a mutual recognition arrangement', counted: mra };
    return { ordinal: 1, reason: 'nothing read accepts self-declaration or a foreign certificate' };
  },
  /* 3.1, 5.2 and 12.01: one question asked of three sectors, and the sector is the measure, so a
     telecom cap cannot be counted under 3.1 whatever the reader thought it was reading. */
  '3.1': equityLadder(
    {
      ban: 'foreign-equity-ban',
      minority: 'foreign-equity-minority',
      controlling: 'foreign-equity-controlling',
      stateOwnedOnly: 'foreign-equity-state-owned-only',
    },
    // "if only a minority stake in more than one sector" -- 3.1 counts sectors, and says so.
    { hasBanBand: true, countBy: 'sector' },
  ),

  '5.2': equityLadder(
    {
      ban: 'telecom-equity-ban',
      minority: 'telecom-equity-minority',
      controlling: 'telecom-equity-controlling',
      stateOwnedOnly: 'telecom-equity-state-owned-only',
    },
    // "OR if only a minority stake in more than one measures" -- one sector, so it counts measures.
    { hasBanBand: true, countBy: 'measure' },
  ),

  '12.01': equityLadder(
    {
      ban: 'ecommerce-equity-ban',
      minority: 'ecommerce-equity-minority',
      controlling: 'ecommerce-equity-controlling',
    },
    { hasBanBand: false, countBy: 'measure' },
  ),

  /**
   * 12.5 "No De Minimis" / "below 200 USD" / "at or above 200 USD".
   *
   * The only band in the rubric that compares a figure, and no statute states its threshold in
   * dollars, so the conversion is pinned and dated in ./currency.ts and printed into the row. The
   * lowest threshold leads where an economy states several: a relief from duty and a relief from
   * sales tax are two thresholds, and the lower one is the one goods actually clear under.
   */
  '12.5': (indicator, qualifying, ctx) => {
    const thresholds = qualifying.flatMap((e) => {
      const money = moneyIn(e.finding.definingWords, ctx?.economy ?? '');
      const usd = money ? inUsd(money, ctx?.rates ?? null) : null;
      return money && usd !== null ? [{ evidence: e, money, usd }] : [];
    });
    if (thresholds.length === 0) return { ordinal: 1, reason: 'no de minimis threshold found' };

    const lowest = thresholds.reduce((a, b) => (b.usd < a.usd ? b : a));
    const assumed = lowest.money.assumedCurrency ? ', the provision using a bare symbol' : '';
    const on = ctx?.rates ? ` on the ${ctx.rates.asOf} reference rate` : '';
    const reason =
      `a de minimis of ${lowest.money.currency} ${lowest.money.amount}${assumed}, about ` +
      `${Math.round(lowest.usd)} USD${on}`;
    return { ordinal: lowest.usd < 200 ? 2 : 3, reason, counted: [lowest.evidence] };
  },

  /**
   * 3.4 "A case that the screening mechanism has been used to block an investment" / "Two or more
   * screening mechanisms" / "A screening mechanism" / "No screening mechanism".
   *
   * The top band is a decided case rather than a rule, and no provision records one; it is
   * declared in UNREACHABLE_BANDS rather than approximated. The three bands below it are all
   * statutory, which is what this counts.
   */
  '3.4': (indicator, qualifying) => {
    const mechanisms = qualifying.filter(
      (e) => e.finding.measure === 'investment-screening' || e.finding.measure === 'discriminatory-merger-review',
    );
    const n = measureCount(mechanisms);
    if (n > 1) return { ordinal: 2, reason: `${n} separate investment screening mechanisms`, counted: mechanisms };
    if (n === 1) return { ordinal: 3, reason: 'one investment screening mechanism', counted: mechanisms };
    return { ordinal: 4, reason: 'no investment screening mechanism found' };
  },

  /**
   * 9.1 "Any blocking measure" / "Any filtering measure" / "No cases of blocking nor filtering".
   *
   * Blocking makes a site unreachable and filtering only narrows what passes, so blocking leads.
   * What the indicator excludes -- political, criminal, age-restricted and defamatory content --
   * is carried by the measure vocabulary, where the reader can act on it, rather than by a filter
   * here that would throw away findings after the fact.
   */
  '9.1': (indicator, qualifying) => {
    const blocking = qualifying.filter((e) => e.finding.measure === 'content-blocking');
    const filtering = qualifying.filter((e) => e.finding.measure === 'content-filtering');
    if (blocking.length > 0) {
      return { ordinal: 1, reason: 'a power or duty to block commercial online content', counted: [...blocking, ...filtering] };
    }
    if (filtering.length > 0) {
      return { ordinal: 2, reason: 'a power or duty to filter commercial online content', counted: filtering };
    }
    return { ordinal: 3, reason: 'no blocking or filtering of commercial online content found' };
  },
};

/**
 * Indicators whose bands turn on facts no provision states, declared rather than approximated.
 *
 * A cell here is unresolved and carries the reason, which is a different thing from an indicator
 * nobody got round to: the reason is the answer, and it is the answer every run will give.
 */
export const NOT_IN_LAW: Readonly<Record<string, string>> = {
  '5.3':
    "This indicator scores the shares a government holds in telecommunications companies. That is a " +
    "fact about a share register and an annual report, not about any provision: an Act that " +
    "establishes or privatises an operator does not state what proportion the State holds today, and " +
    "an Act that says nothing is not evidence that it holds none. ESCAP's own rows for it cite " +
    "ownership disclosures rather than legislation, so a reader of law cannot answer it and this " +
    "says so instead of guessing.",
};

/**
 * Bands ESCAP draws that no reading of law can reach, declared so a sweep of the ladders reports
 * a stated ceiling rather than a defect.
 */
export const UNREACHABLE_BANDS: Readonly<Record<string, Readonly<Record<number, string>>>> = {
  '5.1': {
    2: 'passive sharing is not mandated but is practised in the market -- a fact about the market, which no provision states',
  },
  '3.4': {
    1: 'the screening mechanism has been used to block an investment -- a decided case, which no provision records',
  },
};

/**
 * Which findings the indicator's exception removes.
 *
 * Four of these nine carry "Not score data localization measure applied to government data", and
 * 7.3 carries the same for retention. The excluded finding stays on the decision so a reviewer
 * sees the measure and the reason it did not count.
 */
function applyException(indicator: Indicator, evidence: Evidence[]): {
  kept: Evidence[];
  excluded: { evidence: Evidence; reason: string }[];
} {
  const governmentData = /government data/i.test(indicator.exception ?? '');
  // 3.1 carves out the two sectors 5.2 and 12.01 ask about, so a cap on either is not its cap.
  const sectorsAskedElsewhere = indicator.id === '3.1';
  if (!indicator.exception || (!governmentData && !sectorsAskedElsewhere)) {
    return { kept: evidence, excluded: [] };
  }
  const kept: Evidence[] = [];
  const excluded: { evidence: Evidence; reason: string }[] = [];
  for (const e of evidence) {
    const out =
      (governmentData && e.finding.appliesOnlyToGovernmentData) ||
      (sectorsAskedElsewhere && /telecom|e-?commerce|online market/i.test(e.finding.sector ?? ''));
    if (out) excluded.push({ evidence: e, reason: indicator.exception });
    else kept.push(e);
  }
  return { kept, excluded };
}

/**
 * Findings the band cannot be evaluated against, because a fact it needs is not in the provision.
 *
 * Held, not discarded and not scored either way. 7.5 turns on whether a power may be exercised
 * without a court order; where the provision does not say, neither answer is supported by the
 * document, and guessing is what a reviewer would catch.
 */
function hold(indicatorId: string, evidence: Evidence[], ctx: RuleContext): {
  kept: Evidence[];
  held: { evidence: Evidence; reason: string }[];
} {
  const kept: Evidence[] = [];
  const held: { evidence: Evidence; reason: string }[] = [];

  for (const e of evidence) {
    // Before any measure-specific test: a sentence that declares rather than obliges has not
    // imposed a requirement on anyone, whatever the requirement would have been.
    //
    // Regulation 12 of the Personal Data Protection Regulations says a recipient abroad "is taken
    // to be bound by legally enforceable obligations to provide a standard of protection", and it
    // scored an outright ban on sending personal data out of Singapore. It bans nothing; it is the
    // deeming rule that lets a transfer proceed. Section 16P of the Electronic Transactions Act,
    // "is not to be denied legal effect ... solely on the ground that it was issued outside
    // Singapore", was read as a cross-border measure for the same reason. Both say what the law
    // treats as true. Neither tells anybody to do anything.
    //
    // This is not a rule about pillar 6. Every measure in the rubric names an actor and an act, so
    // a provision with no act binds nobody under any of them.
    if (e.finding.dutyForce === 'declares') {
      held.push({
        evidence: e,
        reason: `the provision declares what is the case -- "${e.finding.dutyAct}" -- rather than requiring anyone to do anything`,
      });
      continue;
    }
    // Every measure in the rubric is borne by somebody, so a provision the reader could find no
    // party in is evidence of none of them. Held, because the party may be there and unread.
    if (!e.finding.dutyBearer) {
      held.push({
        evidence: e,
        reason: 'the provision names no party it binds, and every measure in the rubric is a duty on someone',
      });
      continue;
    }
    // Every measure states the one thing a provision has to say to be it, and a provision that
    // never says it is evidence of something else. This is the general form of the two holds
    // below, which ask pillar 6 and 7.4 for more than one field because those pillars were read
    // wrongly in more than one way. Held, not dropped: the provision is real and may be evidence
    // for another indicator.
    if (!e.finding.definingWords && definedBy(indicatorId, e.finding.measure)) {
      held.push({
        evidence: e,
        reason: `the provision does not state ${definedBy(indicatorId, e.finding.measure)}, which is what makes it this measure`,
      });
      continue;
    }
    // A power to require is not a requirement -- unless the measure the rubric names is itself a
    // power, where nothing is imposed and this hold would swallow every genuine finding.
    if (!e.finding.imposingWords && !permits(indicatorId, e.finding.measure)) {
      held.push({
        evidence: e,
        reason: `the provision does not impose the requirement itself; it empowers another instrument to impose one`,
      });
      continue;
    }
    // And the same words cannot both impose the duty and confer the power to impose it. Australia
    // answered both questions with the DATA Act stem listing conditions that may be prescribed.
    if (restates(e.finding.imposingWords, e.finding.prescribingWords)) {
      held.push({
        evidence: e,
        reason: `the words said to impose the requirement are the words empowering another instrument to impose one`,
      });
      continue;
    }
    // A measure defined by where something has to be is not made out by a provision that names no
    // place. Pillar 6's bands all read "out of the economy" or "within the economy", and a licence
    // clause reading "subject to such conditions as the Authority may impose" satisfies none of
    // them -- it authorises a condition rather than imposing one, and says nothing about location.
    // Held rather than dropped: the provision is real, it is simply not evidence of this measure.
    if (locational(indicatorId, e.finding.measure) && !e.finding.placeWords) {
      held.push({
        evidence: e,
        reason: 'the provision names no place, and this measure is a requirement about where data must be',
      });
      continue;
    }
    // And a place with no data in it. Section 13N of the Income Tax Act requires a trust to be
    // "administered by a trustee company in Singapore" -- a place, a duty, and nothing to do with
    // data. These measures are all about where data has to be, so a provision that never names
    // the data has not made one out however locational its language is.
    if (locational(indicatorId, e.finding.measure) && !e.finding.locatedData) {
      held.push({
        evidence: e,
        reason: 'the provision names a place but no data that has to be there',
      });
      continue;
    }
    // And a place holding something that is not information. Section 10 of the Biological Agents
    // and Toxins Act makes a permit holder store an imported agent "at a place which is safe and
    // secure": a duty, a place, and a thing that must be there, all genuinely in the provision.
    // The thing is a virus. Every measure marked locational is about where *data* has to be, so
    // a provision whose own words never call the located thing information has not made one out.
    if (locational(indicatorId, e.finding.measure) && !e.finding.informationWords) {
      held.push({
        evidence: e,
        reason: 'the provision says where something must be, but never calls that thing information',
      });
      continue;
    }
    // And a place that describes the party rather than binds the data. Section 47A of the Banking
    // Act makes a branch "protect all customer information of the bank in Singapore".
    if (locational(indicatorId, e.finding.measure) && !e.finding.keepingWords) {
      held.push({
        evidence: e,
        reason: 'the provision names a place and names data, but never says the data has to be there',
      });
      continue;
    }
    // And a duty whose bearer is the thing itself, which binds nobody. Section 13N of the Income
    // Tax Act exempts "any income ... accrued in or derived from Singapore", and it came back with
    // "any income" as the party bound and "any income" as the data located: a description of where
    // money comes from, read as a duty to process data locally. A real locational duty has a party
    // and a thing, and they are different -- an organisation keeps personal data, a company keeps
    // its records. Structural, so it needs no view about what the words mean: across every reading
    // in the store the two matched three times, and all three were provisions that bind no one.
    if (
      locational(indicatorId, e.finding.measure) &&
      e.finding.locatedData &&
      e.finding.dutyBearer &&
      sameWords(e.finding.dutyBearer, e.finding.locatedData)
    ) {
      held.push({
        evidence: e,
        reason: 'the party said to be bound and the data said to be located are the same words, so the provision binds no one',
      });
      continue;
    }
    // A measure defined by someone being put in a role is not made out by a provision that puts
    // nobody in one. "The data recipient shall ensure that the consent of the data provider is
    // obtained" and "a data subject shall be given access to his personal data" both scored 7.4,
    // and neither appoints anyone: they are duties about data, not about who is answerable for it.
    if (appointing(indicatorId, e.finding.measure) && !e.finding.roleWords) {
      held.push({
        evidence: e,
        reason: 'the provision appoints no one, and this measure is a duty to put someone in that position',
      });
      continue;
    }
    // And a role created by the State is not a duty on the regulated. Section 47 of Malaysia's
    // Personal Data Protection Act has the Minister appoint the Personal Data Protection
    // Commissioner: a real appointment to a real position, and the position is the regulator's.
    // Each measure says which side it binds, and this checks the side the reader read out.
    if (
      actorKindOf(indicatorId, e.finding.measure) === 'private' &&
      e.finding.dutyBearerKind === 'government'
    ) {
      held.push({
        evidence: e,
        reason: `the duty falls on ${e.finding.dutyBearer}, which is the State, and this measure binds the party the law regulates`,
      });
      continue;
    }
    // The words inserted by an amendment are law, but they are the principal Act's law. Cited
    // here they would name the vehicle instead of the statute that carries the duty.
    if (e.amendsAnotherAct) {
      held.push({
        evidence: e,
        reason: 'the provision amends another Act rather than imposing the duty itself, so the duty belongs to the principal Act',
      });
      continue;
    }
    // A power is not a duty, and two measures in the rubric are written as powers: government
    // access, and a power to impose customs duties on an electronic transmission.
    if (!isRequirement(e.finding) && !permits(indicatorId, e.finding.measure)) {
      held.push({ evidence: e, reason: 'the provision permits rather than requires' });
      continue;
    }
    // A duty to stop retaining is the opposite of a minimum period, and the band scores the
    // minimum. The PDPA's obligation to cease retaining personal data once its purpose has ended
    // is a real requirement and belongs on the record; it is not this one.
    if (indicatorId === '7.3' && e.finding.measure === 'maximum-retention') {
      held.push({ evidence: e, reason: 'a duty to stop retaining, which is a ceiling and not a minimum' });
      continue;
    }
    // "any measure that allows government to access data without court orders". A power a police
    // officer may exercise on their own, or on an official's authorisation, is such a measure; one
    // that needs a court is not; and one where the provision does not say is not evidence either
    // way and is held rather than guessed.
    if (indicatorId === '7.5') {
      const needs = authorisationOf(e.finding);
      if (needs !== 'none' && needs !== 'internal') {
        held.push({
          evidence: e,
          reason:
            needs === 'unstated'
              ? 'the provision does not say what authorisation the power needs'
              : `access requires a ${needs.replace('-', ' ')}`,
        });
        continue;
      }
    }
    // A de minimis is a figure in a currency, and one that states none -- or states one in money
    // the pinned rate table does not carry -- cannot be compared with the 200 USD line.
    if (indicatorId === '12.5') {
      const money = moneyIn(e.finding.definingWords, ctx.economy);
      if (!money || inUsd(money, ctx.rates) === null) {
        held.push({
          evidence: e,
          reason: money
            ? `no exchange rate for ${money.currency} was available to this run, so the threshold cannot be put in US dollars`
            : 'the provision states no figure, so there is no threshold to compare with 200 USD',
        });
        continue;
      }
    }
    kept.push(e);
  }
  return { kept, held };
}

/**
 * Which indicator a finding actually belongs to, where the rubric draws a line the reader does not.
 *
 * 6.1 and 6.4 are the same sentence read two ways. "An organisation must not transfer any personal
 * data to a country or territory outside Singapore except in accordance with requirements
 * prescribed under this Act" is a prohibition in its first half and a permission in its second,
 * and the reader files it under the half it read first -- which was 6.1, the ban, because the
 * prohibition is the loud part. ESCAP scores that provision 0 for 6.1 and 1 for 6.4, and they are
 * right: nothing is forbidden outright.
 *
 * So the reader is asked whether the provision carries a way through, and the rubric's own
 * distinction is applied here rather than hoped for there. This is not a correction of a bad
 * answer -- both facts the reader reported are true and both stay on the record. It is the
 * definition of the two indicators, in the one place that is allowed to know it.
 *
 * A way through has two shapes, and only the first was caught at first. Section 26 carries its
 * own: a prohibition with an "except" hanging off it. The regulations made under section 26 carry
 * the other, and they read as unconditional duties because they are the way through, stated on
 * their own -- regulation 10 says a transferring organisation "must, before transferring an
 * individual's personal data to a country or territory outside Singapore, take appropriate steps".
 * Nothing is forbidden there either. It is a step to be taken so that the transfer may go ahead,
 * which is 6.4's measure word for word: a condition that must be met before data may be
 * transferred out, the transfer being permitted once it is met.
 *
 * So the second test is on the verb rather than on an exception. A prohibition forbids. A
 * provision whose verb obliges someone to act, filed against a measure that is defined as a
 * prohibition, has been read as the wrong one of the two -- and the right one is the indicator
 * next door, not nothing at all.
 */
export function refile(f: Finding): Finding {
  if (f.indicatorId === '6.1' && f.measure === 'transfer-ban' && (f.exceptionWords || f.dutyForce === 'requires')) {
    return {
      ...f,
      indicatorId: '6.4',
      measure: 'transfer-condition',
      refiledFrom: { indicatorId: f.indicatorId, measure: f.measure },
    };
  }
  return f;
}

/**
 * What a power actually requires before it may be used.
 *
 * The reader's own label is taken only where it pointed at words in the provision to support it.
 * Where it named no such words, the power is conditioned on nothing that the provision states, and
 * that is "none" -- a finding of absence, not a shrug. The difference is not academic: the same
 * provision came back "none" in one run and "unstated" in the next, and because "unstated" is held
 * rather than guessed at, a cell that scored 1 scored 0 the second time on nothing else.
 */
function authorisationOf(f: Finding): Finding['authorisation'] {
  return f.authorisingWords ? f.authorisation : 'none';
}

/** Is this measure one of the ones defined by where something has to be? */
/** Two phrases that say the same thing, allowing for articles, case and punctuation. */
function sameWords(a: string, b: string): boolean {
  const norm = (s: string): string =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^(the|a|an|any|every|all) /, '');
  return norm(a) === norm(b) && norm(a).length > 0;
}

function locational(indicatorId: string, measure: string | null): boolean {
  if (!measure) return false;
  return (MEASURES[indicatorId] ?? []).some((m) => m.token === measure && m.locates === true);
}

/** What this measure says a provision must state to be it. Every measure declares one. */
function definedBy(indicatorId: string, measure: string | null): string | null {
  if (!measure) return null;
  return (MEASURES[indicatorId] ?? []).find((m) => m.token === measure)?.defines ?? null;
}

/** Is this measure one of the ones defined by someone being put in a role? */
function appointing(indicatorId: string, measure: string | null): boolean {
  if (!measure) return false;
  return (MEASURES[indicatorId] ?? []).some((m) => m.token === measure && m.appoints === true);
}

/** Which side this measure binds, where it says. */
function actorKindOf(indicatorId: string, measure: string | null): 'private' | 'state' | null {
  if (!measure) return null;
  return (MEASURES[indicatorId] ?? []).find((m) => m.token === measure)?.actorKind ?? null;
}

/** Two answers that are the same words, one inside the other, whatever the spacing and case. */
function restates(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const n = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim();
  const [x, y] = [n(a), n(b)];
  return x.length > 0 && y.length > 0 && (x.includes(y) || y.includes(x));
}

/** Is this measure one the rubric describes as a permission or a limit rather than a command? */
function permits(indicatorId: string, measure: string | null): boolean {
  if (!measure) return false;
  return (MEASURES[indicatorId] ?? []).some((m) => m.token === measure && m.permits === true);
}

/** An instrument this indicator's own retrieval surfaced, best rank first. */
export interface SurfacedInstrument {
  instrumentId: number;
  instrumentTitle: string;
  rank: number;
  /** The date the published text is current to, where the portal states one. */
  currentTo?: string | null;
}

export interface DecideInput {
  indicator: Indicator;
  economy: string;
  evidence: Evidence[];
  frameworkEvidence?: FrameworkEvidence[];
  /** What the search returned for this indicator. Only ever used to evidence a zero. */
  surfaced?: SurfacedInstrument[];
  coverage: Coverage;
  /** The rates this run fetched. Recorded on the run, so re-deriving a score reproduces it. */
  rates?: FxRates | null;
}

/**
 * Which instrument a zero is reported against.
 *
 * Preference is for an instrument the reader found this *pillar's* requirements in: an Act with
 * four data-protection duties in it plainly regulates data protection, whatever its title, and
 * "this Act governs the area and does not require X" is a claim about a document. Only the
 * pillar's own evidence counts, so an instrument that scored under a different pillar cannot be
 * dressed up as governing this one.
 *
 * Failing that, the highest-ranked instrument the search returned, labelled as no more than that.
 * The Maintenance of Parents Act at rank 1 of a data-localisation search must not be reported as
 * the instrument governing data localisation, and the difference between the two labels is the
 * whole point of keeping them apart.
 */
function absenceFor(input: DecideInput): Absence | null {
  const surfaced = input.surfaced ?? [];
  if (surfaced.length === 0) return null;

  const perInstrument = new Map<number, number>();
  for (const e of input.evidence) {
    perInstrument.set(e.instrumentId, (perInstrument.get(e.instrumentId) ?? 0) + 1);
  }

  const governing = surfaced
    .filter((s) => (perInstrument.get(s.instrumentId) ?? 0) > 0)
    .sort((a, b) => {
      const byFindings = (perInstrument.get(b.instrumentId) ?? 0) - (perInstrument.get(a.instrumentId) ?? 0);
      return byFindings !== 0 ? byFindings : a.rank - b.rank;
    })[0];

  if (governing) {
    return {
      instrumentId: governing.instrumentId,
      instrumentTitle: governing.instrumentTitle,
      basis: 'governing',
      pillarFindings: perInstrument.get(governing.instrumentId) ?? 0,
      currentTo: governing.currentTo ?? null,
    };
  }

  const top = surfaced[0]!;
  return {
    instrumentId: top.instrumentId,
    instrumentTitle: top.instrumentTitle,
    basis: 'surfaced',
    pillarFindings: 0,
    currentTo: top.currentTo ?? null,
  };
}

/**
 * The same evidence, ordered so the row leads with the sentence the score turns on.
 *
 * A rule counts a subset -- 7.3 counts duties to keep, not the powers filed beside them -- and the
 * rest still belongs on the record, so nothing is dropped here. Only the order changes.
 */
function leadWithWhatWasCounted(qualifying: Evidence[], counted?: Evidence[]): Evidence[] {
  if (!counted || counted.length === 0) return qualifying;
  return [...counted, ...qualifying.filter((e) => !counted.includes(e))];
}

export function decide(input: DecideInput): Decision {
  const { indicator, economy, coverage } = input;

  if (indicator.shape === 'framework') {
    return decideFramework(input);
  }

  // Refiling happens once, here, and everything after it sees the finding under the indicator and
  // the measure it was actually filed as. It used to rewrite only the indicator, and the tests
  // below then asked whether the *reader's* measure was locational -- which, under the indicator
  // next door, it is not, because that indicator's rubric has never heard of it. So a refiled
  // finding walked past every test that asks where the data has to be. Section 16P of the
  // Electronic Transactions Act reached 6.4 that way, and after the ban and the precondition were
  // told apart, five more followed it, none of them naming a place at all.
  //
  // The reader's own answer is not overwritten: it stays in the reading, which is the record of
  // what the model said. This is the decision's view of it.
  const mine = input.evidence.flatMap((e) => {
    const finding = refile(e.finding);
    return finding.indicatorId === indicator.id ? [{ ...e, finding }] : [];
  });
  const { kept: afterException, excluded } = applyException(indicator, mine);
  const ctx: RuleContext = { economy, rates: input.rates ?? null };
  const { kept: qualifying, held } = hold(indicator.id, afterException, ctx);

  // Nothing was read, so nothing can be concluded. This is the difference between a finding of
  // absence and a failure to look, and ESCAP's reviewers can tell them apart.
  if (coverage.sectionsRead === 0) {
    return {
      indicatorId: indicator.id,
      economy,
      state: 'unresolved',
      score: null,
      band: null,
      basis: [],
      excluded,
      held,
      frameworkBasis: [],
      absence: null,
      coverage,
      decidingFact: 'no provision was read',
      rationale: `No provision was read for this indicator, so neither a requirement nor its absence is evidenced. The economy's index holds ${coverage.sectionsIndexed} provision(s).`,
    };
  }

  const declared = NOT_IN_LAW[indicator.id];
  if (declared) {
    return {
      indicatorId: indicator.id,
      economy,
      state: 'unresolved',
      score: null,
      band: null,
      basis: [],
      excluded,
      held,
      frameworkBasis: [],
      absence: null,
      coverage,
      decidingFact: 'this indicator is not answerable from legislation',
      rationale: declared,
    };
  }

  const rule = RULES[indicator.id];
  if (!rule) {
    return {
      indicatorId: indicator.id,
      economy,
      state: 'unresolved',
      score: null,
      band: null,
      basis: qualifying,
      excluded,
      held,
      frameworkBasis: [],
      absence: null,
      coverage,
      decidingFact: 'no scoring rule is written for this indicator',
      rationale: `No scoring rule is written for indicator ${indicator.id}.`,
    };
  }

  const chosen = rule(indicator, qualifying, ctx);
  const chosenBand = band(indicator, chosen.ordinal);
  const witness = absenceFor(input);

  // Fourteen indicators score their maximum for the absence of something, so a retrieval miss and
  // a real finding of absence produce the same 1. Two things have to hold before that claim stands.
  //
  // The first is an instrument that governs the subject: without one, an economy without the
  // measure and an economy nobody looked at produce the same silence.
  //
  // The second is that nothing was held under one of this indicator's own measures. A provision we
  // saw and could not evaluate is not a provision that is absent -- a customs threshold stated in
  // money this run had no rate for is still a threshold, and reporting "no de minimis" off it
  // would be the strongest claim in the rubric made on the weakest evidence.
  const unevaluated = held.filter((h) =>
    (MEASURES[indicator.id] ?? []).some((m) => m.token === h.evidence.finding.measure),
  );
  if (scoresOnAbsence(indicator, rule, chosen.ordinal) && (witness?.basis !== 'governing' || unevaluated.length > 0)) {
    const ungoverned = witness?.basis !== 'governing';
    return {
      indicatorId: indicator.id,
      economy,
      state: 'unresolved',
      score: null,
      band: null,
      basis: [],
      excluded,
      held,
      frameworkBasis: [],
      absence: null,
      coverage,
      decidingFact: ungoverned
        ? 'nothing read governs the subject whose absence this band asserts'
        : 'a provision of this kind was read and could not be evaluated, so its absence is not established',
      rationale: ungoverned
        ? `This indicator scores ${band(indicator, chosen.ordinal).score} for the absence of something, and ` +
          `nothing among the ${coverage.sectionsRead} provision(s) read establishes an instrument that governs ` +
          `the subject. An economy without the measure and an economy nobody looked at produce the same silence, ` +
          `and only one of them is a finding.`
        : `This indicator scores ${band(indicator, chosen.ordinal).score} for the absence of something, and ` +
          `${unevaluated.length} provision(s) of exactly that kind were read and held: ` +
          `${unevaluated[0]?.reason}. Something we could not evaluate is not something that is not there.`,
    };
  }

  const basis = chosenBand.score > 0 ? leadWithWhatWasCounted(qualifying, chosen.counted) : [];
  const absence = chosenBand.score > 0 ? null : witness;

  return {
    indicatorId: indicator.id,
    economy,
    state: chosenBand.score > 0 ? 'restricted' : 'no-restriction',
    score: chosenBand.score,
    band: chosenBand,
    basis,
    excluded,
    held,
    frameworkBasis: [],
    absence,
    coverage,
    decidingFact: chosen.reason,
    rationale: rationaleFor(indicator, chosenBand, chosen.reason, basis, excluded, coverage, absence),
  };
}

/**
 * 7.1 and 7.2, decided over instruments rather than provisions.
 *
 * ESCAP is explicit that a per-provision citation here is not a discovery. The question is whether
 * the economy has the framework at all, so the evidence is what its instruments are, and the score
 * runs the other way: a comprehensive framework scores zero and its absence scores one.
 */
function decideFramework(input: DecideInput): Decision {
  const { indicator, economy, coverage } = input;
  const candidates = (input.frameworkEvidence ?? []).filter((f) => f.establishesFramework);

  if (coverage.instrumentsConsidered === 0) {
    return {
      indicatorId: indicator.id,
      economy,
      state: 'unresolved',
      score: null,
      band: null,
      basis: [],
      excluded: [],
      held: [],
      frameworkBasis: [],
      absence: null,
      coverage,
      decidingFact: 'no instrument was examined',
      rationale:
        'No instrument was examined for this framework, so its absence cannot be reported. An economy with no framework and an economy nobody looked at produce the same silence, and only one of them is a finding.',
    };
  }

  // 7.1's clearing band is "Comprehensive data protection framework" -- horizontal reach, whatever
  // the instrument is otherwise for. 7.2's is "Dedicated cybersecurity legal framework
  // (horizontal)", which asks for both, and puts a non-dedicated one in the middle band by name.
  // 7.2 asks for a framework dedicated to the subject, and the reader had named Malaysia's data
  // protection Act as its dedicated cybersecurity one. `dedicated` now arrives true only where the
  // instrument's own opening says what it is for, so an Act that touches the subject cannot claim
  // to be built for it.
  // A framework is dedicated to the subject only where the instrument's own opening says so.
  // Malaysia's Personal Data Protection Act was named as its dedicated cybersecurity framework,
  // with the Cyber Security Act examined beside it: an Act that touches a subject cannot claim to
  // be built for it, and the difference is words it either has or has not got.
  // Reach is shown, not asserted. Malaysia's Cyber Security Act was called sectoral and
  // Singapore's near-identical one country-wide, so a sectoral claim with no words confining the
  // instrument is held at the claim and the instrument read as applying generally.
  const needsDedicated = indicator.id === '7.2';
  const clearing = candidates.filter(
    (f) => reaches(f) && (!needsDedicated || (f.dedicated && f.dedicatedShown)),
  );
  const partial = candidates.filter((f) => !clearing.includes(f));

  // Absence is always the top band; a clearing framework is always the bottom one. Which ordinal
  // that is depends on the indicator: 12.9 has two bands and no middle, so a sectoral consumer
  // protection law is still a consumer protection law and clears.
  const lowest = indicator.bands.length;
  let ordinal: number;
  let reason: string;
  if (clearing.length > 0) {
    ordinal = lowest;
    reason = needsDedicated
      ? `a dedicated framework applying across sectors: ${clearing.map((c) => c.instrumentTitle).join(', ')}`
      : `a framework applying across sectors: ${clearing.map((c) => c.instrumentTitle).join(', ')}`;
  } else if (partial.length > 0) {
    ordinal = lowest > 2 ? lowest - 1 : lowest;
    reason =
      ordinal === lowest
        ? `a framework, which this indicator scores without regard to its reach: ${partial.map((c) => c.instrumentTitle).join(', ')}`
        : `a framework limited in reach or subject: ${partial.map((c) => c.instrumentTitle).join(', ')}`;
  } else {
    ordinal = 1;
    reason = `none of the ${coverage.instrumentsConsidered} instrument(s) examined establishes such a framework`;
  }

  const chosenBand = band(indicator, ordinal);
  const used = ordinal === 1 ? [] : clearing.length > 0 ? clearing : partial;

  return {
    indicatorId: indicator.id,
    economy,
    state: chosenBand.score > 0 ? 'restricted' : 'no-restriction',
    score: chosenBand.score,
    band: chosenBand,
    basis: [],
    excluded: [],
    held: [],
    frameworkBasis: used.length > 0 ? used : candidates,
    absence: null,
    coverage,
    decidingFact: reason,
    rationale:
      `Scored ${chosenBand.score} -- "${chosenBand.criterion}". ${capitalise(reason)}. ` +
      `${coverage.instrumentsConsidered} instrument(s) were examined for this framework.`,
  };
}

/** Whether a framework applies across sectors, taking a sectoral claim only where it is shown. */
export function reaches(f: FrameworkEvidence): boolean {
  return f.horizontal || !f.sectoralShown;
}

function capitalise(s: string): string {
  return s.length > 0 ? s[0]!.toUpperCase() + s.slice(1) : s;
}

/**
 * The rationale, assembled rather than written.
 *
 * ESCAP's reviewers asked six separate teams to quote before interpreting, so the quote comes
 * first and the reading of it second. A zero says what was searched and what the most relevant
 * instrument does not require -- the shape of ESCAP's own zero rows, which cite an instrument and
 * state what it does not do.
 */
function rationaleFor(
  indicator: Indicator,
  chosen: ScoreBand,
  reason: string,
  basis: Evidence[],
  excluded: { evidence: Evidence; reason: string }[],
  coverage: Coverage,
  absence: Absence | null,
): string {
  const parts: string[] = [];

  if (basis.length > 0) {
    const lead = basis[0]!;
    parts.push(`"${lead.finding.quote}" (${lead.instrumentTitle}, ${lead.headingPath}).`);
    parts.push(`Scored ${chosen.score} -- "${chosen.criterion}": ${reason}.`);
  } else {
    // A zero names the instrument it was read against and says what that instrument does not do,
    // in the indicator's own words. The two strengths of claim are said differently on purpose.
    if (absence?.basis === 'governing') {
      parts.push(
        `${absence.instrumentTitle} regulates this area -- ${absence.pillarFindings} requirement(s) ` +
          `of this pillar were read in it -- and imposes no ${indicator.category.toLowerCase()}.`,
      );
      if (absence.currentTo) {
        parts.push(`The text read is the published consolidation, current to ${absence.currentTo}.`);
      }
    } else if (absence) {
      parts.push(
        `No instrument in the corpus was found to regulate this area. The most relevant one the ` +
          `search returned, ${absence.instrumentTitle}, imposes no ${indicator.category.toLowerCase()}.`,
      );
    }
    parts.push(
      `Scored ${chosen.score} -- "${chosen.criterion}". ${capitalise(reason)} across ${coverage.sectionsRead} provision(s) read for this indicator, out of ${coverage.sectionsIndexed} in the corpus.`,
    );
  }

  if (excluded.length > 0 && indicator.exception) {
    parts.push(
      `${excluded.length} measure(s) were found and not scored: ${indicator.exception.replace(/\.$/, '')}.`,
    );
  }
  return parts.join(' ');
}

export { RULES as __rules };

/**
 * Does this indicator's top band score the absence of something?
 *
 * The same empirical question `scoresOnAbsence` asks, put to the indicator rather than to one
 * decision, so anything reading a score -- ours or ESCAP's -- can tell which direction it runs in.
 */
export function topBandScoresAbsence(indicator: Indicator): boolean {
  const top = indicator.bands[0];
  if (!top || top.score <= 0) return false;
  if (indicator.shape === 'framework') return true;
  const rule = RULES[indicator.id];
  return rule ? rule(indicator, []).ordinal === top.ordinal : false;
}
