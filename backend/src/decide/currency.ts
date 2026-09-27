/**
 * What a threshold stated in local money is worth in US dollars.
 *
 * One indicator needs this and only one: 12.5 scores a customs de minimis against a line ESCAP
 * draws at 200 USD, and no statute states its threshold in dollars. Australia's is a thousand
 * Australian dollars, Malaysia's five hundred ringgit, Singapore's four hundred Singapore dollars.
 *
 * The rate is fetched, not written down here. A table of rates typed into source is wrong the day
 * after it is written and says nothing about when it was right, so this asks the European Central
 * Bank's daily reference rates through Frankfurter, records the day they are for, and prints that
 * day into the rationale of every row that used them. Zone 3 stays a pure function: the rates are
 * an input to the decision, fetched once per run and stored on the run, so re-deriving a score
 * next month reproduces it rather than re-pricing it.
 *
 * A run that cannot reach the rate falls back to the last one on disk and, failing that, holds the
 * finding. A threshold we cannot put in dollars is not evidence that the economy has no threshold.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from 'undici';

const here = dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = join(here, '..', '..', 'data', 'fx-rates.json');

/** The European Central Bank's daily reference rates, served without a key or a licence. */
const ENDPOINT = 'https://api.frankfurter.dev/v1/latest';
const SOURCE = 'European Central Bank daily reference rates, via api.frankfurter.dev';

/** The currencies the in-scope economies state money in. */
const WANTED = ['AUD', 'SGD', 'MYR', 'INR', 'THB', 'IDR', 'CNY'] as const;

export interface FxRates {
  /** Everything is expressed against the dollar, because the band ESCAP draws is in dollars. */
  base: 'USD';
  /** The day the rates are for, as the publisher states it. Printed into the row. */
  asOf: string;
  source: string;
  fetchedAt: string;
  /** How many US dollars one unit of each currency buys. */
  usdPer: Readonly<Record<string, number>>;
}

/** The currency an economy's own statutes state money in, when they use a bare symbol. */
export const CURRENCY_OF: Readonly<Record<string, string>> = {
  AUS: 'AUD',
  SGP: 'SGD',
  MYS: 'MYR',
  IND: 'INR',
  THA: 'THB',
  IDN: 'IDR',
  CHN: 'CNY',
};

/** A currency named in the words, longest marker first so "US$" is not read as "$". */
const MARKERS: readonly (readonly [RegExp, string])[] = [
  [/\bUS\s?\$|\bUSD\b|\bUS dollars?\b/i, 'USD'],
  [/\bA\s?\$|\bAUD\b|\bAustralian dollars?\b/i, 'AUD'],
  [/\bS\s?\$|\bSGD\b|\bSingapore dollars?\b/i, 'SGD'],
  [/\bRM(?=\s?\d)|\bMYR\b|\bringgit\b/i, 'MYR'],
  [/₹(?=\s?\d)|\bINR\b|\bIndian rupees?\b|\brupees?\b/i, 'INR'],
  [/\bTHB\b|\bbaht\b|บาท/i, 'THB'],
  [/\bIDR\b|\bRp(?=\s?\d)|\brupiah\b/i, 'IDR'],
  [/\bCNY\b|\bRMB\b|\byuan\b|\brenminbi\b/i, 'CNY'],
];

export interface Money {
  amount: number;
  currency: string;
  /** True where the provision used a bare symbol and the economy's own currency was assumed. */
  assumedCurrency: boolean;
}

/**
 * A figure, with its thousands separators, and never the comma that ends a clause. Thousands are
 * grouped three ways in the law read here: "1,000"; "1 000", which Commonwealth drafting uses, and
 * which was read as one dollar ("For subparagraph 68(1)(f)(iii) of the Act, the amount is $1 000");
 * and the Indian "1,00,000".
 */
const GROUP_SPACE = '[ \\u00a0\\u2009\\u202f]';
const NUMBER = new RegExp(
  [
    String.raw`\d{1,2}(?:,\d{2})+,\d{3}(?:\.\d+)?(?!\d)`,
    String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?`,
    String.raw`\d{1,3}(?:${GROUP_SPACE}\d{3})+(?![\d,])(?:\.\d+)?`,
    String.raw`\d+(?:\.\d+)?`,
  ].join('|'),
  'g',
);
const SEPARATORS = new RegExp(`[,]|${GROUP_SPACE}`, 'g');

/**
 * A currency written immediately before a figure: "S$400", "RM 500", "USD 20", "$1,000".
 * Case-sensitive, because "a $400 fine" is not Australian dollars.
 */
const BEFORE = /(US\s?\$|A\s?\$|S\s?\$|RM|₹|Rp|\$|\b(?:USD|AUD|SGD|MYR|INR|THB|IDR|CNY|RMB))\s?$/;

/** A currency written immediately after one: "400 SGD", "5,000 rupees", "20 Singapore dollars". */
const AFTER = /^\s?((?:US|Australian|Singapore|Indian)\s+)?(dollars?|ringgit|rupees?|baht|rupiah|yuan|renminbi|USD|AUD|SGD|MYR|INR|THB|IDR|CNY|RMB)\b/i;

/**
 * The same, for a currency named by a word in a script without word boundaries. `\b` never
 * matches beside a Thai letter, so "๑,๕๐๐ บาท" has to be looked for on its own terms.
 */
const AFTER_UNSPACED = /^\s?()(บาท)/;

/**
 * Digits in any script, as the ASCII digits they are. A statute written in Thai states its sums in
 * Thai digits; one character for one, so every index into the words is still an index into them.
 */
function asciiDigits(words: string): string {
  return words.replace(/\p{Nd}/gu, (d) => {
    const cp = d.codePointAt(0)!;
    let zero = cp;
    while (zero > cp - 9 && /\p{Nd}/u.test(String.fromCodePoint(zero - 1))) zero -= 1;
    return String(cp - zero);
  });
}

const UNITS: Readonly<Record<string, number>> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
};
const SCALES: Readonly<Record<string, number>> = { hundred: 100, thousand: 1000, million: 1_000_000 };
const NUMBER_WORD = `(?:${[...Object.keys(UNITS), ...Object.keys(SCALES)].join('|')})`;
/** A sum written out in words and then a currency: "five hundred ringgit", "one thousand dollars". */
const WORDED_SUM = new RegExp(
  `\\b(${NUMBER_WORD}(?:(?:\\s+and\\s+|[\\s-]+)${NUMBER_WORD})*)(?=\\s+(?:(?:US|Australian|Singapore|Indian)\\s+)?(?:dollars?|ringgit|rupees?|baht|rupiah|yuan)\\b)`,
  'gi',
);

/**
 * A sum written out in words, as the digits it is, where a currency follows it.
 *
 * Malaysia's low-value-goods order states its line as "five hundred ringgit", with no digit in the
 * provision, and a quote with no digit in it was read as stating no figure. Only a run of number
 * words standing against a currency is rewritten: "one person to another" stays as it is.
 */
export function wordedSums(words: string): string {
  return words.replace(WORDED_SUM, (run) => {
    let total = 0;
    let group = 0;
    for (const w of run.toLowerCase().split(/[\s-]+/)) {
      if (w === 'and') continue;
      if (w in UNITS) group += UNITS[w]!;
      else if (w === 'hundred') group = (group || 1) * 100;
      else {
        total += (group || 1) * SCALES[w]!;
        group = 0;
      }
    }
    return String(total + group);
  });
}

/** The number a citation carries: "section 3", "s. 12", "regulation 4", "item 2". */
const CITED = /\b(?:sections?|ss?|articles?|art|regulations?|regs?|rules?|paragraphs?|paras?|items?|clauses?|parts?|chapters?|schedules?|subsections?|divisions?|forms?|no)\.?\s*$/i;

/** A number that is a duration, a rate or a count rather than a sum. */
const NOT_MONEY_AFTER = /^\s?(?:%|per\s?cent|percent|days?|weeks?|months?|years?|hours?|minutes?|[a-z]\b|\()/i;

/**
 * A sum of money read out of the words the finding quoted, or null when they state none.
 *
 * The figure is copied from the provision by the reader as the words that make the measure out,
 * so this parses a quote rather than trusting a number a model wrote. A quote with no digits in
 * it -- "such value as may be prescribed" -- yields null, and the finding is held.
 *
 * The figure has to be the one the currency is written against. The first number anywhere, with a
 * currency found anywhere else, read "goods under section 3 with a value not exceeding S$400" as
 * three dollars and put a real threshold in the lowest band. A number written against a currency
 * wins; a bare number counts only where it is the only candidate and no citation owns it; and two
 * different sums in one quote is a question this cannot answer, so it answers null and the
 * finding is held rather than guessed.
 */
export function moneyIn(written: string | null, economy: string): Money | null {
  if (!written) return null;
  const words = wordedSums(asciiDigits(written));
  const fallback = CURRENCY_OF[economy.toUpperCase()];
  const currencyOf = (marker: string): string | undefined =>
    MARKERS.find(([re]) => re.test(marker))?.[1] ??
    // "$" and "dollars" alone name no country; the economy's own statutes are in its own dollar.
    (/^\$$|^dollars?$/i.test(marker.trim()) ? fallback : undefined);

  const bound = new Map<string, Money>();
  const bare = new Set<number>();
  for (const m of words.matchAll(NUMBER)) {
    const at = m.index ?? 0;
    const amount = Number(m[0].replace(SEPARATORS, ''));
    if (!Number.isFinite(amount)) continue;
    const before = words.slice(Math.max(0, at - 24), at);
    const after = words.slice(at + m[0].length, at + m[0].length + 32);
    // Part of a longer token: "12A", "3(1)", "s3".
    if (/[A-Za-z]$/.test(before) && !BEFORE.test(before)) continue;

    const pre = BEFORE.exec(before);
    const post = AFTER.exec(after) ?? AFTER_UNSPACED.exec(after);
    const marker = pre?.[1] ?? (post ? `${post[1] ?? ''}${post[2]}` : null);
    if (marker) {
      // Tested as written, figure included: "RM" and "₹" are currencies only in front of one.
      const written = pre ? `${marker}${m[0]}` : `${m[0]} ${marker}`;
      const named = MARKERS.find(([re]) => re.test(written))?.[1];
      const currency = named ?? currencyOf(marker);
      if (!currency) continue;
      const assumedCurrency = !named;
      bound.set(`${amount} ${currency}`, { amount, currency, assumedCurrency });
      continue;
    }
    if (CITED.test(before) || /\($/.test(before) || NOT_MONEY_AFTER.test(after)) continue;
    // A year standing alone is a date.
    if (/^(?:19|20)\d\d$/.test(m[0])) continue;
    bare.add(amount);
  }

  if (bound.size === 1) return [...bound.values()][0]!;
  if (bound.size > 1) return null;
  if (bare.size !== 1) return null;

  const amount = [...bare][0]!;
  const named = MARKERS.find(([re]) => re.test(words))?.[1];
  if (!named && !fallback) return null;
  return { amount, currency: named ?? fallback!, assumedCurrency: !named };
}

/** The same sum in US dollars, or null when no rate for it was available to the run. */
export function inUsd(money: Money, rates: FxRates | null): number | null {
  if (money.currency === 'USD') return money.amount;
  const rate = rates?.usdPer[money.currency];
  return rate === undefined ? null : money.amount * rate;
}

function parse(raw: string): FxRates | null {
  try {
    const j = JSON.parse(raw) as { base?: string; asOf?: string; source?: string; fetchedAt?: string; usdPer?: Record<string, number> };
    if (!j.asOf || !j.usdPer || Object.keys(j.usdPer).length === 0) return null;
    return { base: 'USD', asOf: j.asOf, source: j.source ?? SOURCE, fetchedAt: j.fetchedAt ?? j.asOf, usdPer: j.usdPer };
  } catch {
    return null;
  }
}

/** The rates on disk from an earlier run, whatever day they are for. */
export function cachedRates(): FxRates | null {
  try {
    return parse(readFileSync(CACHE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

/** Ask the publisher. Throws on anything but a well-formed answer, so a bad one is never cached. */
export async function fetchRates(timeoutMs = 10_000): Promise<FxRates> {
  const url = `${ENDPOINT}?base=USD&symbols=${WANTED.join(',')}`;
  const res = await request(url, {
    method: 'GET',
    headersTimeout: timeoutMs,
    bodyTimeout: timeoutMs,
  });
  if (res.statusCode !== 200) throw new Error(`${url} answered ${res.statusCode}`);

  const body = (await res.body.json()) as { date?: string; rates?: Record<string, number> };
  if (!body.date || !body.rates) throw new Error(`${url} answered without a date or rates`);

  // The publisher quotes units per dollar; every band here is in dollars, so it is inverted once.
  const usdPer: Record<string, number> = { USD: 1 };
  for (const [code, perUsd] of Object.entries(body.rates)) {
    if (typeof perUsd === 'number' && perUsd > 0) usdPer[code] = 1 / perUsd;
  }
  if (Object.keys(usdPer).length < 2) throw new Error(`${url} answered with no usable rate`);

  return { base: 'USD', asOf: body.date, source: SOURCE, fetchedAt: new Date().toISOString(), usdPer };
}

export interface LoadRatesOptions {
  /** False for a cache-only run, which must not touch the network for anything. */
  allowNetwork?: boolean;
  /** Where a message about a failed fetch goes. Silence about a stale rate is the thing to avoid. */
  log?: (line: string) => void;
}

/**
 * The rates this run will use: today's if they can be had, yesterday's if not, null if neither.
 *
 * Null is a legitimate outcome and is handled where it lands -- a de minimis finding is held with
 * the reason, and no other indicator consults a rate at all.
 */
export async function loadRates(opts: LoadRatesOptions = {}): Promise<FxRates | null> {
  const cached = cachedRates();
  const today = new Date().toISOString().slice(0, 10);
  if (cached && cached.fetchedAt.slice(0, 10) === today) return cached;
  if (opts.allowNetwork === false) return cached;

  try {
    const fresh = await fetchRates();
    try {
      mkdirSync(dirname(CACHE_PATH), { recursive: true });
      writeFileSync(CACHE_PATH, JSON.stringify(fresh, null, 2));
    } catch {
      // A cache we could not write is a slower next run, not a wrong answer.
    }
    return fresh;
  } catch (err) {
    opts.log?.(
      `exchange rates could not be fetched (${(err as Error).message}); ` +
        (cached ? `using the rates for ${cached.asOf}` : 'no rate is available, so a de minimis will be held'),
    );
    return cached;
  }
}
