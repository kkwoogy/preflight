import { outboundLinks } from './links.js';

const VERDICTS = {
  likely: '찐후기 가능성 높음',
  clean: '광고 표시 없음',
  unknown: '본문 미확인',
  checking: '본문 확인 중…',
  suspect: '광고 의심',
  ad: '광고·협찬',
};
// Most trustworthy first; within a group, the search order is kept.
const RANK = { likely: 0, clean: 1, checking: 2, unknown: 3, suspect: 4, ad: 5 };
const FILTERS = [
  ['pass', '걸러낸 결과', (v) => v !== 'suspect' && v !== 'ad'],
  ['suspect', '광고 의심', (v) => v === 'suspect'],
  ['ad', '광고·협찬', (v) => v === 'ad'],
  ['all', '전체', () => true],
];

const $ = (sel) => document.querySelector(sel);
const state = { server: null, sort: 'sim', filter: 'pass', items: new Map(), done: false, stream: null, head: null };

function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

const verdictOf = (it) => (it.checking ? 'checking' : it.verdict);

async function probeServer() {
  try {
    const res = await fetch('api/health', { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data.ok ? data : null;
  } catch {
    return null;
  }
}

function renderLinks(q) {
  const { search, shops } = outboundLinks(q);
  const a = (l) => h('a', { href: l.href, target: '_blank', rel: 'noopener noreferrer' }, l.label, l.note ? h('small', {}, ` ${l.note}`) : null);
  $('#search-links').replaceChildren(...search.map(a));
  $('#shop-links').replaceChildren(...shops.map(a));
  $('#elsewhere').hidden = false;
}

const SETUP = 'https://github.com/kkwoogy/preflight/tree/main/review-search#직접-돌리기';

function notice(...parts) {
  $('#notice').replaceChildren(...parts);
  $('#notice').hidden = !parts.some(Boolean);
}
const setupLink = () => h('a', { href: SETUP, target: '_blank', rel: 'noopener noreferrer' }, '켜는 법');

function run(q) {
  renderLinks(q);
  state.stream?.close();
  state.items = new Map();
  state.done = false;
  state.head = null;
  state.filter = 'pass';

  if (!state.server) {
    notice('분석 서버 없이 열린 페이지라서, 지금은 위 링크로 다른 곳에서 광고 문구를 빼고 찾는 것만 돼요. 블로그·카페 글을 하나씩 열어 거르려면 서버를 켜 주세요 (', setupLink(), ').');
    $('#results').hidden = true;
    return;
  }
  if (!state.server.sources.length) {
    notice('서버에 검색 API 키가 없어요. .env에 네이버나 카카오 키를 넣고 서버를 다시 켜 주세요 (', setupLink(), ').');
    $('#results').hidden = true;
    return;
  }

  notice('');
  $('#results').hidden = false;
  $('#status').textContent = '블로그·카페 글을 찾는 중…';
  $('#filters').replaceChildren();
  $('#list').replaceChildren();
  $('#empty').hidden = true;

  const es = new EventSource(`api/search?${new URLSearchParams({ q, sort: state.sort })}`);
  state.stream = es;
  es.addEventListener('results', (e) => {
    const data = JSON.parse(e.data);
    state.head = data;
    for (const it of data.items) state.items.set(it.id, it);
    if (data.errors.length) notice(data.errors.map((x) => `${x.source}: ${x.message}`).join(' · '));
    render();
  });
  es.addEventListener('update', (e) => {
    const { item } = JSON.parse(e.data);
    state.items.set(item.id, item);
    scheduleRender();
  });
  es.addEventListener('done', () => {
    state.done = true;
    es.close();
    render();
  });
  es.addEventListener('fail', (e) => {
    es.close();
    notice(JSON.parse(e.data).error);
  });
  // A dropped connection: EventSource would retry and restart the search, so stop instead.
  es.onerror = () => {
    if (state.done || es !== state.stream) return;
    es.close();
    if (!state.head) {
      $('#status').textContent = '';
      notice('검색하지 못했어요. 서버가 켜져 있는지, 검색어가 60자 이하인지 확인해 주세요.');
    } else {
      state.done = true;
      render();
    }
  };
}

let pending = 0;
function scheduleRender() {
  if (pending) return;
  pending = requestAnimationFrame(() => {
    pending = 0;
    render();
  });
}

function render() {
  const items = [...state.items.values()];
  const count = (pred) => items.filter((it) => pred(verdictOf(it))).length;
  const checking = count((v) => v === 'checking');
  const ads = count((v) => v === 'ad');
  const suspects = count((v) => v === 'suspect');

  const status = $('#status');
  if (!items.length) status.textContent = state.done || state.head ? '' : '블로그·카페 글을 찾는 중…';
  else {
    status.replaceChildren(
      `블로그·카페 글 ${items.length}개 중 `,
      h('strong', {}, `광고·협찬 ${ads}개`), `, 의심 ${suspects}개를 걸렀어요`,
      checking ? ` · 본문 확인 중 ${checking}개` : '',
    );
  }

  $('#filters').replaceChildren(
    ...FILTERS.map(([key, label, pred]) =>
      h('button', { type: 'button', 'aria-pressed': String(state.filter === key), 'data-filter': key }, label, h('span', {}, String(count(pred)))),
    ),
  );

  const pred = FILTERS.find(([key]) => key === state.filter)[2];
  const shown = items
    .filter((it) => pred(verdictOf(it)))
    .sort((a, b) => RANK[verdictOf(a)] - RANK[verdictOf(b)] || Number(a.id) - Number(b.id));
  $('#list').replaceChildren(...shown.map(card));

  const empty = $('#empty');
  empty.hidden = shown.length > 0 || !state.head;
  if (!items.length) empty.textContent = '검색 결과가 없어요. 이름을 더 짧게 써 보세요.';
  else if (state.filter === 'pass') empty.textContent = '광고가 아닌 글을 못 찾았어요. 위의 쇼핑몰 구매 후기나 커뮤니티 검색을 써 보세요.';
  else empty.textContent = '여기에 해당하는 글이 없어요.';
}

function card(it) {
  const v = verdictOf(it);
  return h('li', { class: `post v-${v} ${v}` },
    h('div', { class: 'meta' },
      h('span', { class: 'src' }, it.sourceLabel),
      it.author ? h('span', {}, it.author) : null,
      it.date ? h('span', {}, it.date.replaceAll('-', '.')) : null,
      h('span', { class: 'badge' }, VERDICTS[v]),
    ),
    h('h3', {}, h('a', { href: safeHref(it.url), target: '_blank', rel: 'noopener noreferrer' }, it.title || '(제목 없음)')),
    it.snippet ? h('p', { class: 'snippet' }, it.snippet) : null,
    it.reasons.length
      ? h('ul', { class: 'reasons' }, ...it.reasons.map((r) => h('li', { class: r.kind, title: r.evidence ?? null }, r.label, r.evidence && r.kind !== 'good' ? h('q', {}, r.evidence) : null)))
      : null,
  );
}

function safeHref(url) {
  return /^https?:\/\//i.test(url) ? url : '#';
}

$('#filters').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-filter]');
  if (!btn) return;
  state.filter = btn.dataset.filter;
  render();
});

for (const btn of document.querySelectorAll('.sort button')) {
  btn.addEventListener('click', () => {
    state.sort = btn.dataset.sort;
    for (const b of document.querySelectorAll('.sort button')) b.setAttribute('aria-pressed', String(b === btn));
    const q = $('#q').value.trim();
    if (q) search(q);
  });
}

// Searches typed before the probe answers wait for it.
const ready = probeServer().then((server) => (state.server = server));

async function search(q) {
  const url = new URL(location.href);
  url.searchParams.set('q', q);
  history.replaceState(null, '', url);
  await ready;
  run(q);
}

$('#search').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = $('#q').value.replace(/\s+/g, ' ').trim();
  if (q) search(q);
});

const initial = new URLSearchParams(location.search).get('q');
if (initial) {
  $('#q').value = initial;
  search(initial.trim());
}
