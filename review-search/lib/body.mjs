import { elementWith, extractUrls, htmlToText, removeElements } from './html.mjs';
import { hostMatches } from './classify.mjs';

// Disclosures usually sit at the very top or bottom of a post, outside the
// snippet the search API returns, so the post itself has to be read.
// Only blog hosts whose markup we know are fetched; cafe posts mostly need a
// login and are judged from the snippet.

const MAX_BYTES = 3_000_000;
const TIMEOUT_MS = 7000;
export const DEFAULT_UA = 'Mozilla/5.0 (compatible; JjinHugi/0.1; +https://github.com/kkwoogy/preflight)';

const BLOGS = [
  {
    match: (u) => naverPost(u),
    fetchUrl: (u) => {
      const { blogId, logNo } = naverPost(u);
      return `https://blog.naver.com/PostView.naver?blogId=${encodeURIComponent(blogId)}&logNo=${logNo}`;
    },
    hosts: ['blog.naver.com'],
    containers: ['se-main-container', 'id="postViewArea"', 'se_component_wrap'],
    drop: [],
  },
  {
    match: (u) => hostMatches(u.hostname, 'tistory.com') && /^\/(?:m\/)?(?:entry\/|\d)/.test(u.pathname),
    fetchUrl: (u) => `https://${u.hostname}${u.pathname.replace(/^\/m\//, '/')}`,
    hosts: ['tistory.com'],
    containers: ['tt_article_useless_p_margin', 'contents_style', 'entry-content', 'article_view', 'id="article-view"', 'class="article"'],
    drop: ['another_category', 'container_postbtn', 'revenue_unit_wrap'],
  },
  {
    match: (u) => u.hostname === 'brunch.co.kr' && /^\/@[^/]+\/\d+/.test(u.pathname),
    fetchUrl: (u) => `https://brunch.co.kr${u.pathname}`,
    hosts: ['brunch.co.kr'],
    containers: ['wrap_body'],
    drop: [],
  },
];

function naverPost(u) {
  if (u.hostname !== 'blog.naver.com' && u.hostname !== 'm.blog.naver.com') return null;
  const q = u.searchParams;
  if (q.get('blogId') && /^\d+$/.test(q.get('logNo') ?? '')) return { blogId: q.get('blogId'), logNo: q.get('logNo') };
  const m = /^\/([A-Za-z0-9_-]+)(?:\/(\d+))?\/?$/.exec(u.pathname);
  const logNo = m?.[2] ?? q.get('logNo'); // older links: /{blogId}?Redirect=Log&logNo=…
  return m && /^\d+$/.test(logNo ?? '') ? { blogId: m[1], logNo } : null;
}

function blogFor(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const blog = BLOGS.find((b) => b.match(u));
  return blog ? { blog, u } : null;
}

export function canFetchBody(url) {
  return Boolean(blogFor(url));
}

// One identity per post, so the same post found through Naver and Daum is shown once.
export function postKey(url) {
  try {
    const u = new URL(url);
    const n = naverPost(u);
    if (n) return `naver:${n.blogId.toLowerCase()}:${n.logNo}`;
    const host = u.hostname.replace(/^(?:www|m)\./, '');
    const path = u.pathname.replace(/^\/m\//, '/').replace(/\/+$/, '');
    return `${host}${path}${u.hostname.startsWith('cafe.') ? u.search : ''}`.toLowerCase();
  } catch {
    return String(url);
  }
}

/** @returns {Promise<{ text: string, urls: string[] } | null>} null when the post can't be read */
export async function fetchBody(url, { fetch, signal, userAgent = DEFAULT_UA }) {
  const found = blogFor(url);
  if (!found) return null;
  const { blog, u } = found;
  const html = await get(blog.fetchUrl(u), blog.hosts, { fetch, signal, userAgent });
  if (!html) return null;

  let part = null;
  for (const marker of blog.containers) {
    part = elementWith(html, marker);
    if (part) break;
  }
  if (!part) return null; // private, deleted, or a layout we don't know: don't guess from page chrome
  for (const marker of blog.drop) part = removeElements(part, marker);
  return { text: htmlToText(part), urls: extractUrls(part) };
}

async function get(url, hosts, { fetch, signal, userAgent }) {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const both = signal ? AbortSignal.any([signal, timeout]) : timeout;
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, {
      redirect: 'manual',
      signal: both,
      headers: { 'User-Agent': userAgent, Accept: 'text/html', 'Accept-Language': 'ko-KR,ko;q=0.9' },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const next = new URL(res.headers.get('location'), url);
      // Redirects stay on the blog host; anything else is left unread.
      if (!hosts.some((h) => hostMatches(next.hostname, h))) return null;
      url = next.href;
      continue;
    }
    if (!res.ok) return null;
    if (Number(res.headers.get('content-length')) > MAX_BYTES) return null;
    return await readCapped(res);
  }
  return null;
}

async function readCapped(res) {
  if (!res.body?.getReader) return (await res.text()).slice(0, MAX_BYTES);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
    if (out.length > MAX_BYTES) {
      await reader.cancel();
      break;
    }
  }
  return out + decoder.decode();
}
