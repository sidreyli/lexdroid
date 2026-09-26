/**
 * The instruments the ones we read point at.
 *
 * The shortlist ranks a register by title, and on an empty store a title is all it has. The Act
 * that decides a cell is often the one whose title shares no word with the question: an
 * intermediary safe harbour sits in an information technology Act, not in anything called
 * "intermediary liability". What the shortlist does reach is the subsidiary law made under that
 * Act and the provisions that cite it, and both name it. One hop from what was read is how a
 * lawyer finds the parent, and it needs nothing typed in by hand.
 *
 * Two kinds of pointer, weighted apart:
 *
 *   parent   the register records the read instrument as made under this one. Structural, and
 *            the strongest signal there is that the two govern the same thing.
 *   cited    the read text names this instrument's title. Weaker: an interpretation Act is cited
 *            by everything and governs nothing in particular.
 *
 * Citations are matched against the register, not parsed out of the text. Every year in the text
 * ends a candidate, and the words before it are looked up as titles of every length. That needs
 * no drafting convention and no word for "Act" in any language; it does need a script that puts
 * spaces between words, so it finds nothing in Thai, where only the parent links apply.
 */
import type { Db } from '../db/index.js';

export interface FollowCandidate {
  instrumentId: number;
  title: string;
  /** Read instruments recorded as made under this one. */
  children: number;
  /** Read documents whose text names this one's title. */
  citedBy: number;
  score: number;
}

export interface FollowOptions {
  economy: string;
  /** The instruments just read. Their pointers are followed; they are never returned. */
  from: number[];
  /** Also never returned: already read, or already on their way. */
  exclude?: Iterable<number>;
  limit?: number;
  /** A candidate below this is one mention in one document, which is not a lead. */
  minScore?: number;
}

const PARENT_WEIGHT = 3;
const LONGEST_TITLE_WORDS = 30;

/** Lower case, letters and digits only, and no leading article. The same for titles and text. */
export function normaliseTitle(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/^the /, '');
}

const YEAR = /^(1[6-9]|20)\d\d$/;

/** Titles of the register that appear in a text, each once. */
export function titlesCitedIn(text: string, titles: Map<string, number>): Set<number> {
  const words = normaliseTitle(text).split(' ');
  const found = new Set<number>();
  for (let end = 0; end < words.length; end += 1) {
    if (!YEAR.test(words[end] ?? '')) continue;
    const from = Math.max(0, end - LONGEST_TITLE_WORDS);
    for (let start = end - 1; start >= from; start -= 1) {
      const id = titles.get(words.slice(start, end + 1).join(' '));
      // Every length is kept. A register title that is the tail of a longer one is rare, and
      // when it happens both are named in the sentence as far as a reader can tell.
      if (id !== undefined) found.add(id);
    }
  }
  return found;
}

export function followCitations(db: Db, opts: FollowOptions): FollowCandidate[] {
  const limit = opts.limit ?? 10;
  const minScore = opts.minScore ?? 2;
  const from = new Set(opts.from);
  const exclude = new Set([...from, ...(opts.exclude ?? [])]);
  if (from.size === 0) return [];

  // A title two instruments share names neither; an Act wins it over a notification about the Act.
  const titles = new Map<string, number>();
  const shared = new Set<string>();
  const rows = db.prepare(
    `SELECT id, title, kind FROM instrument WHERE economy_code = ? ORDER BY (kind = 'act') DESC, id`,
  ).all(opts.economy) as { id: number; title: string; kind: string | null }[];
  const kindOf = new Map<number, string | null>();
  for (const r of rows) {
    kindOf.set(r.id, r.kind);
    const key = normaliseTitle(r.title);
    if (key.split(' ').length < 2 || !YEAR.test(key.split(' ').at(-1) ?? '')) continue;
    if (!titles.has(key)) titles.set(key, r.id);
    else if (kindOf.get(titles.get(key)!) !== 'act' || r.kind === 'act') shared.add(key);
  }
  for (const key of shared) titles.delete(key);
  const titleOf = new Map(rows.map((r) => [r.id, r.title]));

  const tally = new Map<number, { children: number; citedBy: number }>();
  const bump = (id: number, field: 'children' | 'citedBy') => {
    if (exclude.has(id)) return;
    const t = tally.get(id) ?? { children: 0, citedBy: 0 };
    t[field] += 1;
    tally.set(id, t);
  };

  const ids = [...from];
  const marks = ids.map(() => '?').join(',');
  for (const r of db.prepare(
    `SELECT made_under_instrument_id parent FROM instrument
      WHERE id IN (${marks}) AND made_under_instrument_id IS NOT NULL`,
  ).all(...ids) as { parent: number }[]) {
    bump(r.parent, 'children');
  }

  for (const r of db.prepare(
    `SELECT d.instrument_id, t.text FROM document d JOIN document_text t ON t.document_id = d.id
      WHERE d.instrument_id IN (${marks})`,
  ).all(...ids) as { instrument_id: number; text: string }[]) {
    for (const id of titlesCitedIn(r.text, titles)) {
      if (id !== r.instrument_id) bump(id, 'citedBy');
    }
  }

  return [...tally.entries()]
    .map(([instrumentId, t]) => ({
      instrumentId,
      title: titleOf.get(instrumentId) ?? '',
      ...t,
      score: PARENT_WEIGHT * t.children + t.citedBy,
    }))
    .filter((c) => c.score >= minScore)
    .sort((a, b) => b.score - a.score || b.children - a.children || a.instrumentId - b.instrumentId)
    .slice(0, limit);
}
