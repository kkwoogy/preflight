import { stripTags } from './html.mjs';

// Official search APIs only. Each one is used when its keys are in the environment.
export const SOURCES = [
  { id: 'naver-blog', label: '네이버 블로그', keys: ['NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET'], run: naver('blog'), size: 50 },
  { id: 'naver-cafe', label: '네이버 카페', keys: ['NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET'], run: naver('cafearticle'), size: 30 },
  { id: 'daum-blog', label: '다음 블로그', keys: ['KAKAO_REST_API_KEY'], run: kakao('blog'), size: 30 },
  { id: 'daum-cafe', label: '다음 카페', keys: ['KAKAO_REST_API_KEY'], run: kakao('cafe'), size: 20 },
];

export function configuredSources(env) {
  return SOURCES.filter((s) => s.keys.every((k) => env[k]));
}

export class SourceError extends Error {}

function naver(kind) {
  return async ({ query, sort, size, env, fetch, signal }) => {
    const url = new URL(`https://openapi.naver.com/v1/search/${kind}.json`);
    url.search = new URLSearchParams({ query, display: String(Math.min(size, 100)), start: '1', sort: sort === 'date' ? 'date' : 'sim' });
    const data = await getJson(fetch, url, {
      'X-Naver-Client-Id': env.NAVER_CLIENT_ID,
      'X-Naver-Client-Secret': env.NAVER_CLIENT_SECRET,
    }, signal);
    return (data.items ?? []).map((it) => ({
      title: stripTags(it.title),
      snippet: stripTags(it.description),
      url: it.link,
      author: stripTags(it.bloggername ?? it.cafename ?? ''),
      date: it.postdate ? `${it.postdate.slice(0, 4)}-${it.postdate.slice(4, 6)}-${it.postdate.slice(6, 8)}` : '',
    }));
  };
}

function kakao(kind) {
  return async ({ query, sort, size, env, fetch, signal }) => {
    const url = new URL(`https://dapi.kakao.com/v2/search/${kind}`);
    url.search = new URLSearchParams({ query, size: String(Math.min(size, 50)), page: '1', sort: sort === 'date' ? 'recency' : 'accuracy' });
    const data = await getJson(fetch, url, { Authorization: `KakaoAK ${env.KAKAO_REST_API_KEY}` }, signal);
    return (data.documents ?? []).map((d) => ({
      title: stripTags(d.title),
      snippet: stripTags(d.contents),
      url: d.url,
      author: stripTags(d.blogname ?? d.cafename ?? ''),
      date: d.datetime ? d.datetime.slice(0, 10) : '',
    }));
  };
}

async function getJson(fetch, url, headers, signal) {
  const res = await fetch(url, { headers, signal });
  if (res.ok) return res.json();
  const hint = res.status === 401 || res.status === 403 ? 'API 키를 확인해 주세요' : res.status === 429 ? '오늘 호출 한도를 넘었어요' : '응답 오류';
  throw new SourceError(`${hint} (HTTP ${res.status})`);
}
