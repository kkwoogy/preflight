// What the classifier looks for. A 100-point rule is hard evidence of an ad; weaker
// ones add up to "suspect" at 40. A passing mention ("체험단 후기만 많아서") is 10,
// so a reviewer complaining about sponsored posts isn't flagged for it.
// Phrases follow the FTC (공정위) 추천·보증 심사지침 (revised 2024-12) and the
// sentences affiliate programs require word for word; sources in README.md.
// Rules in the same `family` count once, so list the strong form first.
// Strong forms want a first-person ending (받아/받았/받음) so that a reviewer
// writing "협찬받은 후기들 말고" isn't mistaken for one.

export const AD_PHRASES = [
  // Affiliate programs
  { family: 'affiliate', label: '제휴 수수료 문구 (쿠팡 파트너스 등)', points: 100, re: /파트너스\s*활동의?\s*일환/ },
  { family: 'affiliate', label: '네이버 쇼핑 커넥트 문구', points: 100, re: /쇼핑\s*커넥트\s*활동/ },
  { family: 'affiliate', label: '제휴(어필리에이트) 문구', points: 100, re: /어필리에이트\s*활동/ },
  { family: 'affiliate', label: '수수료를 받는다는 문구', points: 100, re: /수수료를?\s*(?:제공|지급|지원)\s*받|일정액의\s*수수료|수수료\s*지급/ },

  // Paid or free-product posts
  { family: 'fee', label: '원고료를 받았다는 문구', points: 100, re: /소정의\s*원고료|원고료(?:를|을)?\s*(?:제공|지원|지급)?\s*받(?:아|았|음)/ },
  { family: 'fee', label: '원고료 언급', points: 10, re: /원고료/ },
  { family: 'free', label: '제품을 무상으로 받았다는 문구', points: 100, re: /(?:무상|무료)(?:으로|로)?\s*(?:제공|지원|대여|협찬)\s*받/ },
  { family: 'free', label: '제품을 제공받았다는 문구', points: 100, re: /(?:제품|상품|샘플|물건|이용권|숙박권|식사권)(?:을|를|만|은|는)?\s*(?:제공|지원|협찬)\s*받(?:아|았|음)/ },
  { family: 'free', label: '업체에서 받았다는 문구', points: 100, re: /(?:업체|브랜드|회사|광고주|매장)(?:\s*측)?(?:으로부터|로부터|에서|에게서)\s*[^.!?\n]{0,25}?(?:제공|지원|협찬)\s*받/ },
  { family: 'free', label: '제공받아 작성했다는 문구', points: 100, re: /(?:제공|지원|협찬)\s*받(?:아|았)[^.!?\n]{0,20}?(?:작성|썼|쓴)/ },
  { family: 'free', label: '할인을 받고 썼다는 문구', points: 100, re: /할인[^.!?\n]{0,6}받(?:아|고)\s*작성/ },
  { family: 'free', label: '업체가 보내줬다는 말', points: 30, re: /(?:업체|브랜드|회사)(?:\s*측)?(?:으로부터|로부터|에서)\s*[^.!?\n]{0,15}?보내\s*주(?:셔|셨|어|었)/ },
  { family: 'money', label: '경제적 대가 문구', points: 100, re: /경제적\s*(?:대가|지원|이해\s*관계)|금전적\s*(?:지원|대가)|제작비\s*(?:지원|협찬)|광고비\s*(?:를|을)?\s*(?:지급|지원|받)/ },

  // Labels
  { family: 'label', label: '광고 표시', points: 100, re: /[[(【<]\s*(?:유료\s*)?(?:광고|협찬|AD)\s*[\])】>]/ },
  { family: 'label', label: '광고 해시태그', points: 100, re: /#(?:광고|협찬|유료광고|체험단|AD|ad|sponsored)(?![가-힣A-Za-z])/ },
  { family: 'label', label: '광고 표시', points: 100, re: /(?:유료|상업)\s*광고|광고(?:를|가)?\s*포함|이\s*(?:글|포스팅|게시물|영상)은\s*(?:광고|협찬)|(?:광고|협찬)\s*(?:글|게시물|포스팅)\s*(?:입니다|이에요|예요|임)/ },
  { family: 'label', label: '영문 광고 표시', points: 60, re: /paid\s*partnership|\bsponsored\b|\bgifted\b/i },

  { family: 'sponsor', label: '협찬받았다는 문구', points: 100, re: /협찬(?:을)?\s*받(?:아|았|음)|(?:으로부터|로부터|에서)\s*협찬|협찬\s*(?:제품|상품)(?:입니다|이에요|이고|으로)/ },
  { family: 'sponsor', label: '협찬 언급', points: 10, re: /협찬/ },
  { family: 'trial', label: '체험단 활동 문구', points: 100, re: /체험단(?:으로|에)?\s*(?:선정|당첨|참여|활동|자격)|체험단으로/ },
  { family: 'trial', label: '체험단 언급', points: 10, re: /체험단/ },
  { family: 'supporter', label: '서포터즈·앰배서더 활동', points: 60, re: /서포터즈\s*(?:\d+\s*기|활동|로|자격)|앰배서더/ },
  { family: 'event', label: '후기 이벤트·페이백', points: 60, re: /(?:후기|리뷰)[^.!?\n]{0,15}(?:페이백|환급)|(?:후기|리뷰)\s*이벤트/ },
];

// Text right after a match that turns it around: "협찬 아님", "원고료는 받지 않았", "광고 X".
export const NEGATION = /^\s*[)\]】>]?\s*(?:은|는|도|을|를|이|가|\s)*\s*(?:아님|아닙|아니|아냐|않|지\s*않|안\s*받|받지\s*않|안\s*했|없|x(?![a-z])|❌|✕|no\b|0원)/i;

// Links that only show up in paid posts.
export const AD_DOMAINS = [
  { host: 'link.coupang.com', label: '쿠팡 파트너스 링크', points: 100 },
  { host: 'coupa.ng', label: '쿠팡 파트너스 링크', points: 100 },
  { host: 'ads-partners.coupang.com', label: '쿠팡 파트너스 배너', points: 100 },
  { host: 's.click.aliexpress.com', label: '알리익스프레스 제휴 링크', points: 100 },
  { host: 'click.linkprice.com', label: '링크프라이스 제휴 링크', points: 100 },
  { host: 'tenping.kr', label: '텐핑 제휴 링크', points: 100 },
  { host: 'tenping.link', label: '텐핑 제휴 링크', points: 100 },
  ...['nico.kr', 'cacu.kr', 'click.gl', 'cay.kr'].map((host) => ({ host, label: '애드픽 제휴 링크', points: 100 })),
  { host: 'amzn.to', label: '아마존 단축 링크 (제휴일 수 있음)', points: 40 },

  // 체험단 platforms make bloggers put a banner that links back to them.
  ...[
    ['revu.net', '레뷰'],
    ['reviewnote.co.kr', '리뷰노트'],
    ['dinnerqueen.net', '디너의여왕'],
    ['dq-files.gcdn.ntruss.com', '디너의여왕'],
    ['xn--939au0g4vj8sq.net', '강남맛집'],
    ['mrblog.net', '미블'],
    ['seoulouba.co.kr', '서울오빠'],
    ['seoulouba.com', '서울오빠'],
    ['4blog.net', '포블로그'],
    ['reviewplace.co.kr', '리뷰플레이스'],
    ['chvu.co.kr', '체험뷰'],
    ['cometoplay.kr', '놀러와체험단'],
    ['cloudreview.co.kr', '클라우드리뷰'],
    ['ringble.co.kr', '링블'],
    ['tble.kr', '티블'],
    ['xn--o39an53a23h.com', '가보자체험단'],
    ['marketingchef.kr', '마케팅셰프'],
    ['kormedia.co.kr', '오마이블로그'],
    ['assaview.co.kr', '아싸뷰'],
    ['tagby.io', '태그바이'],
    ['modan.kr', '모두의체험단'],
    ['reviewshare.io', '리뷰쉐어'],
    ['cherivu.co.kr', '체리뷰'],
  ].map(([host, name]) => ({ host, label: `체험단 배너·링크 (${name})`, points: 100 })),
];

// Shops: one product link is normal, a post full of them is selling.
export const SHOP_DOMAINS = [
  'smartstore.naver.com', 'brand.naver.com', 'shopping.naver.com', 'coupang.com', '11st.co.kr', 'gmarket.co.kr',
  'auction.co.kr', 'aliexpress.com', 'ssg.com', 'lotteon.com', 'musinsa.com', 'a-bly.com', '29cm.co.kr', 'zigzag.kr',
  'oliveyoung.co.kr', 'kurly.com', 'tmon.co.kr', 'wemakeprice.com', 'interpark.com', 'iherb.com', 'amazon.com',
];

// Titles of listicles written to sell. Weak on their own; they count with other signs.
export const TITLE_WARNINGS = [
  { label: '순위·추천 목록형 제목', points: 30, re: /(?:추천|순위|랭킹|베스트|best|top)\s*\d{1,2}(?!\s*(?:일|주|개월|달|년))|\d{1,2}\s*선(?![가-힣])/i },
  { label: '가격 비교·할인 제목', points: 30, re: /가격\s*비교|최저가|할인\s*(?:코드|쿠폰|정보)|특가/ },
];

// What people who used the thing tend to write.
export const GOOD_PHRASES = [
  { label: '직접 샀다고 밝힘', points: 20, re: /내돈\s*내산|(?:내|제)\s*돈\s*(?:주고|으로|내고)\s*(?:산|샀|구매|구입)|(?:사비|자비)로\s*(?:산|샀|구매|구입)|직접\s*(?:구매|구입)(?:해|했|한)|직접\s*(?:샀|사서)/ },
  { label: '오래 써 본 기록', points: 20, re: /(?:\d{1,3}|한|두|세|네|다섯|몇|반)\s*(?:일|주|주일|달|개월|년)\s*(?:째|동안|간|넘게|이상|정도)?\s*(?:사용|써|쓰|썼|착용|입|신|먹|발라|발랐|복용|타고|탔)/ },
  { label: '단점도 적음', points: 20, re: /단점|아쉬운\s*점|아쉬웠|아쉽(?:다|네|더|긴)|별로(?:였|예요|에요|다|임)|실망|불편(?:했|하다|한\s*점|해요)|비추|후회(?:했|돼|되|중)|반품(?:했|하|함)|환불(?:했|받|함)/ },
  { label: '재구매 언급', points: 10, re: /재구매/ },
];
