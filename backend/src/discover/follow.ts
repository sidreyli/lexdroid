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
import { fuse, searchLexical } from '../index/index.js';

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

export interface DownOptions {
  economy: string;
  /** Each indicator's questions. Every indicator gets its own pick, so one pillar cannot take all. */
  asked: string[][];
  /** Never returned: already read, or already on their way. */
  exclude?: Iterable<number>;
  limit?: number;
}

export interface DownCandidate {
  instrumentId: number;
  title: string;
  parentId: number;
  /** The provisions of the parent that led here. */
  because: string[];
  /** Other registered versions of the same instrument, best first, to try if this one will not read. */
  alternates: number[];
}

/** Acts looked under per indicator, and provisions of each whose headings do the ranking. */
const PARENTS_PER_QUESTION = 3;
const HEADINGS_PER_PARENT = 3;
const SECTION_DEPTH = 12;

/**
 * The rules made under an Act already read, reached through the provision that answers the question.
 *
 * The other direction to `followCitations`. An Act states the power and the rules made under it
 * state the duty: whether a platform must know who its users are is in the rules, and the Act says
 * only that an intermediary is exempt if it observes what the rules require. Nothing in those rules'
 * title matches the question -- they are "guidelines" and an "ethics code" -- and ranking them on
 * the question's words put them below rules on waste and partnerships.
 *
 * So the question picks the provisions, and the provisions pick the rules. The sections read so far
 * that answer an indicator best name their Acts; the headings of those sections are what the rules
 * under each Act are ranked on, less every word the rules share with the Act's own title, which
 * all of them do. "Exemption from liability of intermediary" leaves "intermediary", and among the
 * forty sets of rules under that Act, the few that say it are the ones that matter.
 *
 * A register lists the same rules several times -- as made, as amended, as consolidated on a date.
 * They are one candidate, and the version dated latest is the one fetched. Words are split on
 * spaces, so this finds nothing in a script written without them; there it returns no leads.
 */
export async function followDown(db: Db, opts: DownOptions): Promise<DownCandidate[]> {
  const limit = opts.limit ?? 20;
  const exclude = new Set(opts.exclude ?? []);
  if (limit <= 0) return [];

  const owner = db.prepare(
    `SELECT i.id, i.title, i.kind, s.heading_path FROM section s
       JOIN document d ON d.id = s.document_id
       JOIN instrument i ON i.id = d.instrument_id
      WHERE s.id = ?`,
  );
  // Delegated law only. A notice or an order made under an Act appoints someone, declares a place
  // or brings a section into force; the duties are in the rules and regulations.
  const childrenOf = db.prepare(
    `SELECT id, title, kind FROM instrument
      WHERE economy_code = ? AND made_under_instrument_id = ? AND COALESCE(kind, '') NOT IN ('notice', 'order')`,
  );

  const taken = new Set<string>();
  const out: DownCandidate[] = [];
  for (const queries of opts.asked) {
    if (out.length >= limit) break;

    const parents = new Map<number, { title: string; headings: string[] }>();
    const hits = fuse(queries.map((q) => searchLexical(db, q, { economy: opts.economy, limit: SECTION_DEPTH })));
    for (const hit of hits) {
      const row = owner.get(hit.sectionId) as
        | { id: number; title: string; kind: string | null; heading_path: string }
        | undefined;
      if (!row || row.kind !== 'act') continue;
      const parent = parents.get(row.id);
      if (!parent && parents.size >= PARENTS_PER_QUESTION) continue;
      const p = parent ?? { title: row.title, headings: [] };
      // The provision's own words, without the number it is filed under.
      const heading = (row.heading_path.split(' > ').at(-1) ?? '').replace(/^[^\p{L}]*\p{L}+\s+[\p{N}\p{Lu}().-]+\s*[—–:-]\s*/u, '');
      if (p.headings.length < HEADINGS_PER_PARENT && heading && !p.headings.includes(heading)) p.headings.push(heading);
      parents.set(row.id, p);
    }

    // The Acts in the order their provisions answered the question; the first with a rule to offer
    // is looked under and the rest are not. A score is only comparable among one Act's rules --
    // its weights come from how many rules that Act has -- and so is only compared there.
    for (const [parentId, p] of parents) {
      const children = childrenOf.all(opts.economy, parentId) as { id: number; title: string; kind: string | null }[];
      if (children.length === 0) continue;
      const inTitle = new Set(stems(p.title));
      const childStems = children.map((c) => new Set(stems(c.title)));
      const idfOf = (t: string): number => {
        const df = childStems.reduce((n, cs) => n + (cs.has(t) ? 1 : 0), 0);
        return df > 0 ? Math.log(children.length / df) : 0;
      };

      // One pick per provision, not one for all of them. Pooled, a long heading about monitoring
      // traffic data outvoted a short one about intermediaries with all of its words, and the
      // rules for the short one were the answer.
      const picks: DownCandidate[] = [];
      for (const heading of p.headings) {
        const terms = [...new Set(stems(heading).filter((t) => !inTitle.has(t)))];
        const weights = terms.map((t) => [t, idfOf(t)] as const).filter(([, w]) => w > 0);
        if (weights.length === 0) continue;

        const groups = new Map<string, { score: number; members: typeof children }>();
        children.forEach((c, i) => {
          let score = 0;
          for (const [t, w] of weights) if (childStems[i]!.has(t)) score += w;
          if (score <= 0) return;
          const key = versionKey(c.title);
          const g = groups.get(key) ?? { score: 0, members: [] };
          g.score = Math.max(g.score, score);
          g.members.push(c);
          groups.set(key, g);
        });

        const ranked = [...groups.entries()]
          // The rules a register lists most often are the ones in force and consolidated, not a
          // one-off amendment to them.
          .sort(
            ([ka, a], [kb, b]) =>
              b.score - a.score || b.members.length - a.members.length || latestYear(kb) - latestYear(ka),
          );
        for (const [key, g] of ranked) {
          // A version already read or on its way answers for all of them, and for this provision.
          if (g.members.some((m) => exclude.has(m.id))) break;
          if (taken.has(key)) break;
          const [first, ...rest] = [...g.members].sort(latestFirst);
          if (!first) break;
          taken.add(key);
          picks.push({
            instrumentId: first.id,
            title: first.title,
            parentId,
            because: [heading],
            alternates: rest.map((m) => m.id),
          });
          break;
        }
      }
      if (picks.length > 0) {
        out.push(...picks.slice(0, limit - out.length));
        break;
      }
    }
  }
  return out;
}

/** Title words stemmed just enough that "intermediaries" meets "intermediary". */
function stems(s: string): string[] {
  return normaliseTitle(s)
    .split(' ')
    .filter((w) => w.length >= 4 && !/^\d+$/.test(w))
    .map((w) => w.replace(/ies$/, 'y').replace(/(?<!s)s$/, ''));
}

/** A title up to and including its first year: what stays the same across versions of it. */
export function versionKey(title: string): string {
  const words = normaliseTitle(title).split(' ');
  const end = words.findIndex((w) => YEAR.test(w));
  return (end < 0 ? words : words.slice(0, end + 1)).join(' ');
}

/** The version dated latest first; made law before a notice about it; then the register's order. */
function latestFirst(
  a: { id: number; title: string; kind: string | null },
  b: { id: number; title: string; kind: string | null },
): number {
  return (
    latestYear(b.title) - latestYear(a.title) ||
    Number(a.kind === 'notice') - Number(b.kind === 'notice') ||
    a.id - b.id
  );
}

function latestYear(title: string): number {
  let best = 0;
  for (const m of title.matchAll(/(?<!\d)(1[6-9]|20)\d\d(?!\d)/g)) best = Math.max(best, Number(m[0]));
  return best;
}
