/**
 * Zone 0 -- the economy profile.
 *
 * ESCAP's step 1 is to understand the legal system before searching it: what the instrument types
 * are called locally, which body publishes what, and where. v1 skipped this and went straight to
 * searching, which is why it could not tell a Malaysian Act from a BNM circular.
 *
 * A profile is small, human-authored, checked-in configuration. It is deliberately NOT derived
 * from ESCAP's legal inventory: that file is the answer key, and reading it here would make
 * discovery a lookup. Portals are the public front doors of a government -- the legislation
 * database, the gazette, the sectoral regulators -- and are found the way a researcher finds them.
 *
 * This is also the file someone fills in during the live hour for an economy nobody has touched.
 */
import { z } from 'zod';

/** How the trigram index and the reader should treat this economy's text. */
export const LanguageTag = z.string().regex(/^[a-z]{2,3}(-[A-Za-z]{2,8})*$/, 'BCP-47 tag');

export const PortalKind = z.enum([
  'legislation-database',
  'gazette',
  'regulator',
  'court',
  'registry',
]);

export const Portal = z.object({
  name: z.string().min(1),
  url: z.string().url(),
  kind: PortalKind,
  /** The body that publishes it. Named because ESCAP records the issuing authority per row. */
  authority: z.string().min(1),
  /** Pillars this portal plausibly serves. A hint for ordering work, never a filter on evidence. */
  pillars: z.array(z.number().int().min(1).max(12)).default([]),
  /**
   * Which discovery adapter walks this portal, and its settings. A portal with no adapter is
   * still recorded -- it is a lead a researcher can follow -- but nothing is crawled from it.
   */
  adapter: z.string().nullable().default(null),
  adapterConfig: z.record(z.unknown()).default({}),
  notes: z.string().nullable().default(null),
});
export type Portal = z.infer<typeof Portal>;

/**
 * What the economy calls its instruments, strongest first. This is what stops rank being confused
 * with coverage: in Malaysia an Act outranks a Bank Negara circular, but the circular is still
 * evidence, and v1 threw the Acts away because it had no model of either.
 */
export const InstrumentType = z.object({
  rank: z.number().int().min(1),
  /** Our normalised kind, matching instrument.kind in the store. */
  kind: z.enum(['act', 'regulation', 'notice', 'guideline', 'order', 'rule']),
  /** What this economy actually calls it. */
  localName: z.string().min(1),
  bindingness: z.enum(['binding', 'binding-on-licensees', 'advisory']),
  note: z.string().nullable().default(null),
});
export type InstrumentType = z.infer<typeof InstrumentType>;

export const Commitment = z.object({
  name: z.string().min(1),
  status: z.enum(['ratified', 'signatory', 'in-force', 'observer', 'not-a-party']),
  sourceUrl: z.string().url().nullable().default(null),
});
export type Commitment = z.infer<typeof Commitment>;

export const EconomyProfile = z.object({
  /** ISO 3166-1 alpha-3, matching the store's primary key. */
  code: z.string().regex(/^[A-Z]{3}$/),
  name: z.string().min(1),
  legalSystem: z.object({
    family: z.enum(['common-law', 'civil-law', 'mixed', 'customary']),
    note: z.string(),
  }),
  /**
   * Languages law is PUBLISHED in, not languages spoken. Malaysia publishes in Bahasa Melayu with
   * an English translation of varying authority; that distinction belongs here, in the note.
   */
  officialLanguages: z.array(LanguageTag).min(1),
  languageNote: z.string().nullable().default(null),
  instrumentTypes: z.array(InstrumentType).min(1),
  portals: z.array(Portal).min(1),
  commitments: z.array(Commitment).default([]),
  notes: z.string().nullable().default(null),
  /** Who wrote this and from what, so a reviewer can check it rather than trust it. */
  authoredBy: z.string(),
  authoredOn: z.string(),
  sources: z.array(z.string()).default([]),
});
export type EconomyProfile = z.infer<typeof EconomyProfile>;
