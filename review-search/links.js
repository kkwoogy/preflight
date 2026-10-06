// Searches to open elsewhere, built from the query alone, so they work without the server.

// Disclosure wording that sponsored and affiliate posts are required to carry.
// "협찬" on its own is left out so posts saying "협찬 아님" stay in.
const EXCLUDE = ['파트너스 활동', '수수료를 제공', '원고료', '제공받아', '협찬받아', '체험단'];

// Communities where people post about things they bought.
const COMMUNITIES = ['clien.net', 'ppomppu.co.kr', 'theqoo.net', 'fmkorea.com', 'dcinside.com', 'ruliweb.com', 'instiz.net', '82cook.com'];

const SHOPS = [
  ['무신사', 'https://www.musinsa.com/search/goods?keyword='],
  ['에이블리', 'https://m.a-bly.com/search?keyword='],
  ['지그재그', 'https://zigzag.kr/search?keyword='],
  ['올리브영', 'https://www.oliveyoung.co.kr/store/search/getSearchMain.do?query='],
  ['쿠팡', 'https://www.coupang.com/np/search?q='],
  ['네이버쇼핑', 'https://search.shopping.naver.com/search/all?query='],
];

export function outboundLinks(q) {
  const review = /후기|리뷰|사용기|내돈내산/.test(q) ? q : `${q} 후기`;
  const minus = EXCLUDE.map((w) => `-"${w}"`).join(' ');
  const enc = encodeURIComponent;
  return {
    search: [
      { label: '구글', note: '광고 문구 뺀 후기', href: `https://www.google.com/search?q=${enc(`${review} ${minus}`)}` },
      { label: '구글', note: '커뮤니티 글만', href: `https://www.google.com/search?q=${enc(`${review} (${COMMUNITIES.map((d) => `site:${d}`).join(' OR ')})`)}` },
      { label: '네이버 블로그', note: '광고 문구 뺀 후기', href: `https://search.naver.com/search.naver?ssc=tab.blog.all&query=${enc(`${review} ${minus}`)}` },
    ],
    shops: SHOPS.map(([label, base]) => ({ label, href: base + enc(q) })),
  };
}
