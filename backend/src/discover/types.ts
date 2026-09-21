import type { Fetcher, FetchResult } from '../fetch/index.js';
import type { Portal } from '../profile/types.js';

export interface DiscoveredInstrument {
  title: string;
  url: string;
  kind: 'act' | 'regulation' | 'notice' | 'guideline' | 'order' | 'rule' | 'publication';
  officialNumber?: string | null;
  /**
   * What the portal says about the instrument's standing, and the sentence that says it.
   * A portal that publishes its current legislation separately from its repealed legislation has
   * already answered this; which listing an instrument came off is the answer, and throwing it
   * away leaves every row citing an instrument of unknown standing.
   */
  status?: 'in-force' | 'repealed' | 'draft' | 'amending';
  statusBasis?: string;
  /**
   * The day the instrument began, where the register states it rather than leaving it to the
   * document. It is what the export's timeframe column is built from, and a register that
   * publishes the date is a better source for it than a parse of the document's front matter.
   */
  commencedOn?: string | null;
  /**
   * The day an amendment last changed this instrument's text, where the register states which
   * amendment it was. A register that keeps a version history answers this; one that only
   * republishes a consolidation does not, and that one sets `currentTo` instead.
   */
  lastAmendedOn?: string | null;
  /**
   * The date the published consolidation is current to, and the sentence that says so.
   *
   * Not the same as the date of the last amendment, and it must not be reported as one: Malaysia
   * serves the Personal Data Protection Act as at 2023 while the duty ESCAP scores arrived in a
   * 2024 amendment. Recording what the portal actually publishes is what makes that visible --
   * which is why this has its own column, and why it stopped being written to `lastAmendedOn`.
   */
  currentTo?: string | null;
  /** The sentence behind whichever of the two dates above the register stated. */
  currentToBasis?: string;
  /**
   * The Act the register says this instrument is made under, named the way the register names it.
   *
   * Kept as the stated name rather than resolved here, because an adapter lists one portal and
   * the Act may not be registered yet when the rule made under it is. Resolving the name to a row
   * is a pass over the whole economy, run once the walk is done.
   */
  madeUnder?: string | null;
  /**
   * True when `title` is only a filename, and the document's own stated title should replace it.
   * A code filed under its upload slug never matches the name a citation calls it by.
   */
  titleProvisional?: boolean;
  /**
   * Other files the same page publishes -- a Malay and an English edition of one code of practice.
   * Read as documents of this instrument, so one measure produces one row and not two.
   */
  alsoAt?: string[];
}

export interface DiscoverContext {
  portal: Portal;
  fetcher: Fetcher;
  log: (line: string) => void;
  /**
   * An entry the listing published and the adapter could not register, named.
   *
   * An adapter is the only thing that knows how many rows a catalogue offered, and it had nowhere
   * to put that but a log line -- which defaults to discarding it, so the three Laws of Malaysia
   * listings recomputed "335 listed instruments carry no document link" on every walk and threw
   * it away every time. A count in a log cannot be compared against the next walk, and a listing
   * that quietly stops linking its documents looks exactly like a listing that got smaller.
   */
  setAside: (entry: { subject: string; reason: string; detail?: string }) => void;
}

/**
 * A portal adapter. Two responsibilities, kept apart because they fail differently: listing what
 * a portal publishes, and turning one listing entry into the bytes of the document.
 */
export interface Adapter {
  name: string;
  discover(ctx: DiscoverContext): Promise<DiscoveredInstrument[]>;
  /**
   * How to get the full text for one instrument. Defaults to fetching its URL; a site that pages
   * or lazy-loads its documents overrides this, which is the difference between indexing a whole
   * Act and indexing its first ten sections.
   */
  resolveDocument?(url: string, fetcher: Fetcher): Promise<FetchResult>;
}
