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
  [/\bTHB\b|\bbaht\b/i, 'THB'],
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
 * A sum of money read out of the words the finding quoted, or null when they state none.
 *
 * The figure is copied from the provision by the reader as the words that make the measure out,
 * so this parses a quote rather than trusting a number a model wrote. A quote with no digits in
 * it -- "such value as may be prescribed" -- yields null, and the finding is held.
 */
export function moneyIn(words: string | null, economy: string): Money | null {
  if (!words) return null;
  const digits = /(\d[\d,]*(?:\.\d+)?)/.exec(words);
  if (!digits?.[1]) return null;
  const amount = Number(digits[1].replace(/,/g, ''));
  if (!Number.isFinite(amount)) return null;

  const named = MARKERS.find(([re]) => re.test(words))?.[1];
  const fallback = CURRENCY_OF[economy.toUpperCase()];
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
