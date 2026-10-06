import { classify } from './classify.mjs';
import { canFetchBody, fetchBody, postKey } from './body.mjs';
import { configuredSources, SourceError } from './sources.mjs';

const REVIEW_WORDS = /후기|리뷰|사용기|내돈내산|단점|장단점|review/i;
const MAX_BODY_CHECKS = 40;
const BODY_CONCURRENCY = 6;

// Search terms we actually send. A bare product name mostly returns shop
// listings, so "후기" is added; a second "내돈내산" query pulls in posts that
// say they were self-paid (the classifier still checks that claim).
export function queriesFor(q) {
  return REVIEW_WORDS.test(q) ? [q] : [`${q} 후기`, `${q} 내돈내산`];
}

/**
 * Yields { type: 'results' }, then one { type: 'update' } per post whose body
 * was read, then { type: 'done' }.
 */
export async function* searchReviews(q, { env, fetch, sort = 'sim', signal, cache = new Map() }) {
  const sources = configuredSources(env);
  const queries = queriesFor(q);
  const errors = [];

  const lists = await Promise.all(
    sources.map(async (source) => {
      const perQuery = await Promise.all(
        queries.map((query, i) =>
          // The follow-up query fills in; it shouldn't double the list.
          cached(cache, `api:${source.id}:${sort}:${query}`, () =>
            source.run({ query, sort, size: i === 0 ? source.size : Math.ceil(source.size / 2), env, fetch, signal }),
          ).catch((err) => {
            if (signal?.aborted) throw err;
            if (!errors.some((e) => e.source === source.label)) errors.push({ source: source.label, message: err instanceof SourceError ? err.message : '연결하지 못했어요' });
            return [];
          }),
        ),
      );
      return perQuery.flat().map((hit) => ({ ...hit, source: source.id, sourceLabel: source.label }));
    }),
  );

  // Interleave the sources by rank so no single one floods the top, and drop
  // the same post found twice (Daum also indexes Naver blogs).
  const items = [];
  const keys = new Set();
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let r = 0; r < longest; r++) {
    for (const list of lists) {
      const hit = list[r];
      if (!hit?.url) continue;
      const key = postKey(hit.url);
      if (keys.has(key)) continue;
      keys.add(key);
      const id = String(items.length);
      const checkable = canFetchBody(hit.url) && env.CHECK_BODIES !== '0';
      items.push({ id, ...hit, checking: checkable, ...classify(hit) });
    }
  }

  const toCheck = items.filter((it) => it.checking).slice(0, MAX_BODY_CHECKS);
  for (const it of items) if (it.checking && !toCheck.includes(it)) it.checking = false;

  yield { type: 'results', query: q, queries, sources: sources.map((s) => s.label), errors, items };

  const ua = env.FETCH_USER_AGENT || undefined;
  for await (const it of pool(toCheck, BODY_CONCURRENCY, async (it) => {
    const body = await cached(cache, `body:${postKey(it.url)}`, () => fetchBody(it.url, { fetch, signal, userAgent: ua })).catch(() => null);
    return { ...it, checking: false, ...classify({ title: it.title, snippet: it.snippet, body }) };
  })) {
    if (signal?.aborted) return;
    yield { type: 'update', item: it };
  }

  yield { type: 'done' };
}

// Runs `fn` over `items` with at most `n` in flight, yielding results as they finish.
async function* pool(items, n, fn) {
  const running = new Map();
  let next = 0;
  const launch = () => {
    const i = next++;
    running.set(i, fn(items[i]).then((value) => ({ i, value })));
  };
  while (next < items.length && running.size < n) launch();
  while (running.size) {
    const { i, value } = await Promise.race(running.values());
    running.delete(i);
    if (next < items.length) launch();
    yield value;
  }
}

const TTL_MS = 30 * 60 * 1000;
const CACHE_MAX = 1000;

async function cached(cache, key, make) {
  const hit = cache.get(key);
  if (hit && hit.until > Date.now()) return hit.value;
  const value = await make();
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { value, until: Date.now() + TTL_MS });
  return value;
}
