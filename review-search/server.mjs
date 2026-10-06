// 찐후기 server: serves the page and /api/search. No dependencies; Node 20+.
//   node server.mjs          → http://localhost:8787
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { searchReviews } from './lib/search.mjs';
import { configuredSources } from './lib/sources.mjs';

const ROOT = new URL('./', import.meta.url);
const STATIC = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/links.js': ['links.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
};
const MAX_QUERY = 60;

export function createServer({ env = process.env, fetch = globalThis.fetch } = {}) {
  const cache = new Map();

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname === '/api/health') {
        return json(res, 200, { ok: true, sources: configuredSources(env).map((s) => s.label) });
      }
      if (url.pathname === '/api/search') return await search(req, res, url, { env, fetch, cache });
      const file = STATIC[url.pathname];
      if (file && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-cache' });
        return res.end(await readFile(new URL(file[0], ROOT)));
      }
      json(res, 404, { error: '없는 주소예요' });
    } catch (err) {
      console.error(err);
      if (!res.headersSent) json(res, 500, { error: '서버 오류' });
      else res.end();
    }
  });
}

async function search(req, res, url, { env, fetch, cache }) {
  const q = (url.searchParams.get('q') ?? '').replace(/\s+/g, ' ').trim();
  const sort = url.searchParams.get('sort') === 'date' ? 'date' : 'sim';
  if (!q || q.length > MAX_QUERY) return json(res, 400, { error: `검색어는 1~${MAX_QUERY}자로 써 주세요` });
  if (!configuredSources(env).length) {
    return json(res, 503, { error: 'API 키가 없어요. review-search/README.md의 "API 키 받기"를 따라 .env를 채워 주세요' });
  }

  const abort = new AbortController();
  res.on('close', () => abort.abort());
  const events = searchReviews(q, { env, fetch, sort, signal: abort.signal, cache });

  // Streamed by default so results show while posts are still being read;
  // ?stream=0 waits and returns one JSON document (handy for curl and tests).
  if (url.searchParams.get('stream') === '0') {
    const byId = new Map();
    let head;
    for await (const ev of events) {
      if (ev.type === 'results') {
        head = ev;
        for (const it of ev.items) byId.set(it.id, it);
      } else if (ev.type === 'update') byId.set(ev.item.id, ev.item);
    }
    return json(res, 200, { ...head, type: undefined, items: [...byId.values()] });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // hosts behind nginx would otherwise hold the stream until it ends
  });
  try {
    for await (const ev of events) {
      if (abort.signal.aborted) break;
      res.write(`event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`);
    }
  } catch (err) {
    if (!abort.signal.aborted) {
      console.error(err);
      res.write(`event: fail\ndata: ${JSON.stringify({ error: '검색 중 오류가 났어요' })}\n\n`);
    }
  }
  res.end();
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

// KEY=value lines from .env next to this file; real environment variables win.
export function loadEnvFile(path, env = process.env) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  loadEnvFile(fileURLToPath(new URL('.env', ROOT)));
  const port = Number(process.env.PORT) || 8787;
  const host = process.env.HOST || '127.0.0.1';
  createServer().listen(port, host, () => {
    const sources = configuredSources(process.env).map((s) => s.label);
    console.log(`찐후기 → http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
    console.log(sources.length ? `검색 출처: ${sources.join(', ')}` : 'API 키가 없어요. .env.example을 .env로 복사하고 키를 채워 주세요.');
  });
}
