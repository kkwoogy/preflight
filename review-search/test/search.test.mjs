import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queriesFor, searchReviews } from '../lib/search.mjs';
import { createServer } from '../server.mjs';

const ENV = { NAVER_CLIENT_ID: 'id', NAVER_CLIENT_SECRET: 'secret', KAKAO_REST_API_KEY: 'kakao' };

const seOne = (inner) => `<html><body><div id="whole"><div class="se-main-container">${inner}</div></div>
  <div class="blog_footer">[협찬] 이웃 블로그 인기글</div></body></html>`;

// Stand-ins for the Naver/Kakao APIs and the blog pages they point to.
const PAGES = {
  'https://blog.naver.com/PostView.naver?blogId=alice&logNo=1001': seOne(
    '<p>내돈내산으로 올리브영에서 샀어요.</p><p>3개월 써보니 단점은 무게.</p>',
  ),
  'https://blog.naver.com/PostView.naver?blogId=bob&logNo=1002': seOne(
    `<p>에어랩 최저가 정리</p><div class="se-module-oglink" data-linkdata='{"link":"https:\\/\\/link.coupang.com\\/a\\/xyz"}'></div>`,
  ),
  'https://carol.tistory.com/12': `<html><body>
    <div class="tt_article_useless_p_margin contents_style"><p>두 달 사용했는데 아쉬운 점도 있어요.</p>
      <div class="another_category"><a>[협찬] 다른 글</a></div></div>
    <aside><script src="https://ads-partners.coupang.com/g.js"></script></aside></body></html>`,
};

function mockFetch(calls = []) {
  return async (input, opts = {}) => {
    const url = String(input);
    calls.push({ url, headers: opts.headers ?? {} });
    const u = new URL(url);
    if (u.hostname === 'openapi.naver.com' && u.pathname.endsWith('/blog.json')) {
      return Response.json({
        items: [
          { title: '<b>에어랩</b> 내돈내산 후기', link: 'https://blog.naver.com/alice/1001', description: '샀어요', bloggername: '앨리스', postdate: '20260301' },
          { title: '에어랩 추천 TOP 5', link: 'https://blog.naver.com/bob/1002', description: '정리', bloggername: '밥', postdate: '20260302' },
        ],
      });
    }
    if (u.hostname === 'openapi.naver.com' && u.pathname.endsWith('/cafearticle.json')) {
      return Response.json({ items: [{ title: '에어랩 써보신 분', link: 'https://cafe.naver.com/beauty/555', description: '한 달 썼는데 단점은 소음', cafename: '뷰티카페' }] });
    }
    if (u.hostname === 'dapi.kakao.com' && u.pathname.endsWith('/blog')) {
      return Response.json({
        documents: [
          { title: '에어랩 후기', contents: '샀어요', url: 'https://m.blog.naver.com/alice/1001', blogname: '앨리스', datetime: '2026-03-01T10:00:00.000+09:00' },
          { title: '에어랩 두 달', contents: '사용기', url: 'https://carol.tistory.com/12', blogname: '캐럴', datetime: '2026-03-03T10:00:00.000+09:00' },
          { title: '에어랩 비공개', contents: '...', url: 'https://blog.naver.com/dave/1004', blogname: '데이브', datetime: '2026-03-04T10:00:00.000+09:00' },
        ],
      });
    }
    if (u.hostname === 'dapi.kakao.com') return new Response('boom', { status: 500 });
    if (url in PAGES) return new Response(PAGES[url], { headers: { 'content-type': 'text/html' } });
    return new Response('not found', { status: 404 });
  };
}

async function collect(gen) {
  const out = [];
  for await (const ev of gen) out.push(ev);
  return out;
}

test('queriesFor adds review words only when missing', () => {
  assert.deepEqual(queriesFor('에어랩'), ['에어랩 후기', '에어랩 내돈내산']);
  assert.deepEqual(queriesFor('에어랩 단점'), ['에어랩 단점']);
});

test('searchReviews merges sources, reads bodies, and judges each post', async () => {
  const calls = [];
  const events = await collect(searchReviews('에어랩', { env: ENV, fetch: mockFetch(calls) }));

  assert.equal(events[0].type, 'results');
  assert.equal(events.at(-1).type, 'done');
  const first = events[0];
  assert.deepEqual(first.errors, [{ source: '다음 카페', message: '응답 오류 (HTTP 500)' }]);

  const byUrl = new Map(first.items.map((it) => [it.url, it]));
  for (const ev of events.filter((e) => e.type === 'update')) byUrl.set(ev.item.url, ev.item);
  const urls = [...byUrl.keys()];
  // The Naver post Daum also found appears once.
  assert.equal(urls.filter((u) => u.includes('alice')).length, 1);
  assert.equal(urls.length, 5);

  const get = (part) => [...byUrl.values()].find((it) => it.url.includes(part));
  assert.equal(get('alice').verdict, 'likely');
  assert.equal(get('alice').title, '에어랩 내돈내산 후기');
  assert.equal(get('alice').date, '2026-03-01');
  assert.equal(get('bob').verdict, 'ad');
  assert.ok(get('bob').reasons.some((r) => r.label === '쿠팡 파트너스 링크'));
  // Related-post lists and sidebars are not part of the post.
  assert.equal(get('carol').verdict, 'likely');
  assert.equal(get('beauty').verdict, 'unknown');
  assert.equal(get('beauty').checking, false);
  assert.ok(get('beauty').reasons.some((r) => r.label === '단점도 적음'));
  assert.equal(get('dave').verdict, 'unknown');
  assert.equal(get('dave').checking, false);

  const naverApi = calls.find((c) => c.url.startsWith('https://openapi.naver.com'));
  assert.equal(naverApi.headers['X-Naver-Client-Id'], 'id');
  assert.ok(calls.some((c) => c.url.startsWith('https://dapi.kakao.com') && c.headers.Authorization === 'KakaoAK kakao'));
  assert.ok(!calls.some((c) => c.url.includes('cafe.naver.com')), 'cafe posts are not fetched');
});

test('CHECK_BODIES=0 skips reading posts', async () => {
  const calls = [];
  const events = await collect(searchReviews('에어랩', { env: { ...ENV, CHECK_BODIES: '0' }, fetch: mockFetch(calls) }));
  assert.ok(!calls.some((c) => c.url.includes('PostView')));
  assert.deepEqual(events.map((e) => e.type), ['results', 'done']);
});

async function withServer(env, fn) {
  const server = createServer({ env, fetch: mockFetch() });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

test('server: health, JSON and streamed search, and errors', async () => {
  await withServer(ENV, async (base) => {
    assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), { ok: true, sources: ['네이버 블로그', '네이버 카페', '다음 블로그', '다음 카페'] });

    const json = await (await fetch(`${base}/api/search?q=${encodeURIComponent('에어랩')}&stream=0`)).json();
    assert.equal(json.items.length, 5);
    assert.ok(json.items.every((it) => !it.checking));

    const sse = await fetch(`${base}/api/search?q=${encodeURIComponent('에어랩')}`);
    assert.match(sse.headers.get('content-type'), /text\/event-stream/);
    const text = await sse.text();
    assert.match(text, /^event: results\n/);
    assert.match(text, /event: done\n/);

    assert.equal((await fetch(`${base}/api/search?q=`)).status, 400);
    assert.equal((await fetch(`${base}/api/search?q=${'가'.repeat(61)}`)).status, 400);
    assert.match(await (await fetch(`${base}/`)).text(), /<title>찐후기<\/title>/);
    assert.equal((await fetch(`${base}/server.mjs`)).status, 404);
    assert.equal((await fetch(`${base}/.env`)).status, 404);
  });
});

test('server without keys says so', async () => {
  await withServer({}, async (base) => {
    assert.deepEqual((await (await fetch(`${base}/api/health`)).json()).sources, []);
    const res = await fetch(`${base}/api/search?q=x`);
    assert.equal(res.status, 503);
    assert.match((await res.json()).error, /API 키/);
  });
});
