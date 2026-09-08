/**
 * The backend service.
 *
 * Node's own http server: no framework, because a stranger deploying this on a clean machine in
 * under thirty minutes should not be installing one. Routes grow as the zones land; right now it
 * serves what the skeleton has, which is the rubric and the state of the store.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { loadRubric } from '../rubric/index.js';
import { openDb } from '../db/index.js';
import { availableProfiles, loadProfile } from '../profile/index.js';
import { fuse, loadVectors, searchDense, searchLexical } from '../index/index.js';

const PORT = Number(process.env['PORT'] ?? 4000);

type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  url: URL,
) => void | Promise<void>;

const routes: { method: string; pattern: RegExp; keys: string[]; handler: Handler }[] = [];

function route(method: string, path: string, handler: Handler): void {
  const keys: string[] = [];
  const pattern = new RegExp(
    '^' +
      path.replace(/:([A-Za-z]+)/g, (_m, key: string) => {
        keys.push(key);
        return '([^/]+)';
      }) +
      '$',
  );
  routes.push({ method, pattern, keys, handler });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

route('GET', '/health', (_req, res) => {
  const db = openDb();
  const runs = (db.prepare('SELECT COUNT(*) c FROM run').get() as { c: number }).c;
  const rubric = loadRubric();
  json(res, 200, {
    status: 'ok',
    rubric: {
      version: rubric.version,
      derivedAt: rubric.derivedAt,
      pillars: rubric.pillars.length,
      indicators: rubric.indicators.length,
    },
    runs,
  });
});

route('GET', '/api/rubric', (_req, res) => {
  const rubric = loadRubric();
  json(res, 200, {
    version: rubric.version,
    derivedAt: rubric.derivedAt,
    sources: rubric.sources,
    nonRegulatory: rubric.nonRegulatory,
    pillars: rubric.pillars.map((p) => ({
      ...p,
      indicators: rubric.indicators
        .filter((i) => i.pillarId === p.id)
        .map((i) => ({ id: i.id, category: i.category, shape: i.shape, bands: i.bands.length })),
    })),
  });
});

route('GET', '/api/rubric/:id', (_req, res, params) => {
  const rubric = loadRubric();
  const found = rubric.indicators.find((i) => i.id === params['id']);
  if (!found) return json(res, 404, { error: `No indicator ${params['id']}` });
  json(res, 200, found);
});

// ------------------------------------------------------------------------------------------
// Zone 0 and Zone 1: what the tool knows about an economy, and what its corpus can answer.
// ------------------------------------------------------------------------------------------

interface CorpusCounts {
  instruments: number;
  documents: number;
  sections: number;
  embedded: number;
  unread: { reason: string; count: number }[];
}

function corpusOf(code: string): CorpusCounts {
  const db = openDb();
  const count = (sql: string): number => (db.prepare(sql).get(code) as { c: number }).c;
  return {
    instruments: count('SELECT COUNT(*) c FROM instrument WHERE economy_code = ?'),
    documents: count('SELECT COUNT(*) c FROM document d JOIN instrument i ON i.id = d.instrument_id WHERE i.economy_code = ?'),
    sections: count(`SELECT COUNT(*) c FROM section s JOIN document d ON d.id = s.document_id
                     JOIN instrument i ON i.id = d.instrument_id WHERE i.economy_code = ?`),
    embedded: count(`SELECT COUNT(*) c FROM section_embedding e JOIN section s ON s.id = e.section_id
                     JOIN document d ON d.id = s.document_id JOIN instrument i ON i.id = d.instrument_id
                     WHERE i.economy_code = ?`),
    unread: (
      db
        .prepare(
          `SELECT u.reason, COUNT(*) c FROM unread_document u JOIN document d ON d.id = u.document_id
           JOIN instrument i ON i.id = d.instrument_id WHERE i.economy_code = ? GROUP BY u.reason ORDER BY c DESC`,
        )
        .all(code) as { reason: string; c: number }[]
    ).map((r) => ({ reason: r.reason, count: r.c })),
  };
}

route('GET', '/api/economies', (_req, res) => {
  json(res, 200, {
    economies: availableProfiles().map((code) => {
      const p = loadProfile(code);
      return {
        code: p.code, name: p.name, legalSystem: p.legalSystem.family,
        officialLanguages: p.officialLanguages, portals: p.portals.length,
        corpus: corpusOf(p.code),
      };
    }),
  });
});

route('GET', '/api/economies/:code', (_req, res, params) => {
  const code = (params['code'] ?? '').toUpperCase();
  if (!availableProfiles().includes(code)) return json(res, 404, { error: `No Zone 0 profile for ${code}` });
  json(res, 200, { profile: loadProfile(code), corpus: corpusOf(code) });
});

/**
 * The shortlist stage, exposed so a person can ask the corpus a question directly.
 *
 * Both channels and the fusion are returned separately rather than merged, because "the lexical
 * channel found nothing" is the most useful thing this endpoint can tell you -- it is how a
 * tokenizer that has silently switched itself off becomes visible.
 */
const vectorCache = new Map<string, ReturnType<typeof loadVectors>>();

route('GET', '/api/search', async (_req, res, _params, url) => {
  const q = url.searchParams.get('q');
  const economy = (url.searchParams.get('economy') ?? 'SGP').toUpperCase();
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 10), 50);
  if (!q) return json(res, 400, { error: 'q is required' });

  const db = openDb();
  const lexical = searchLexical(db, q, { economy, limit: limit * 3 });

  if (!vectorCache.has(economy)) vectorCache.set(economy, loadVectors(db, { economy }));
  const vectors = vectorCache.get(economy)!;
  const dense = vectors.ids.length > 0 ? await searchDense(q, vectors, { limit: limit * 3 }) : [];

  const describe = db.prepare(
    `SELECT s.id, s.heading_path, s.label, s.text, i.title, i.source_url, i.official_number
     FROM section s JOIN document d ON d.id = s.document_id JOIN instrument i ON i.id = d.instrument_id
     WHERE s.id = ?`,
  );
  const hydrate = (sectionId: number): unknown => {
    const r = describe.get(sectionId) as
      | { id: number; heading_path: string; label: string | null; text: string; title: string; source_url: string; official_number: string | null }
      | undefined;
    if (!r) return { sectionId };
    return {
      sectionId: r.id, instrument: r.title, officialNumber: r.official_number, sourceUrl: r.source_url,
      headingPath: r.heading_path, label: r.label, preview: r.text.slice(0, 300),
    };
  };

  json(res, 200, {
    economy, query: q, indexedSections: vectors.ids.length,
    lexical: lexical.slice(0, limit).map((h) => ({ rank: h.rank, score: h.score, ...(hydrate(h.sectionId) as object) })),
    dense: dense.slice(0, limit).map((h) => ({ rank: h.rank, score: h.score, ...(hydrate(h.sectionId) as object) })),
    fused: fuse([lexical, dense]).slice(0, limit).map((h, i) => ({ rank: i + 1, channels: h.channels, ...(hydrate(h.sectionId) as object) })),
  });
});

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = r.pattern.exec(url.pathname);
    if (!m) continue;
    const params: Record<string, string> = {};
    r.keys.forEach((k, i) => {
      params[k] = decodeURIComponent(m[i + 1] ?? '');
    });
    try {
      const out = r.handler(req, res, params, url);
      if (out instanceof Promise) {
        out.catch((err: unknown) => json(res, 500, { error: err instanceof Error ? err.message : String(err) }));
      }
      return;
    } catch (err: unknown) {
      return json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  }
  json(res, 404, { error: `No route for ${req.method} ${url.pathname}` });
});

server.listen(PORT, () => {
  const rubric = loadRubric();
  console.log(`lexdroid backend on http://localhost:${PORT}`);
  console.log(`  rubric ${rubric.version}: ${rubric.indicators.length} indicators, ${rubric.pillars.length} pillars`);
});
