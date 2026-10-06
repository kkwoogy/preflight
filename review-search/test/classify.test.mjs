import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../lib/classify.mjs';

const body = (text, urls = []) => ({ text, urls });
const labels = (r) => r.reasons.map((x) => x.label);

test('Coupang Partners disclosure makes it an ad', () => {
  const r = classify({
    title: '무선청소기 한 달 사용 후기',
    body: body('청소기 좋아요.\n이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.'),
  });
  assert.equal(r.verdict, 'ad');
  assert.ok(labels(r).includes('제휴 수수료 문구 (쿠팡 파트너스 등)'));
});

test('Naver Shopping Connect disclosure makes it an ad', () => {
  const r = classify({ title: '후기', body: body('이 포스팅은 네이버 쇼핑 커넥트 활동의 일환으로, 판매 발생 시 수수료를 제공받습니다.') });
  assert.equal(r.verdict, 'ad');
});

test('a Coupang link alone makes it an ad', () => {
  const r = classify({ title: '에어프라이어 후기', body: body('잘 쓰고 있어요', ['https://link.coupang.com/a/bXQEjf']) });
  assert.equal(r.verdict, 'ad');
  assert.ok(labels(r).includes('쿠팡 파트너스 링크'));
});

test('an experience-group banner makes it an ad, even with a Korean domain', () => {
  const r = classify({ title: '맛집 후기', body: body('맛있어요', ['https://강남맛집.net/cp/?id=1234']) });
  assert.equal(r.verdict, 'ad');
  assert.ok(labels(r).some((l) => l.includes('강남맛집')));
});

test('standard sponsorship sentences are ads', () => {
  for (const text of [
    '본 포스팅은 업체로부터 소정의 원고료를 지원받아 작성되었습니다.',
    '브랜드로부터 제품을 무상으로 제공받아 솔직하게 작성한 후기입니다.',
    '제품만 제공받았으며 원고료는 받지 않았습니다.',
    '[광고] 피부과 다녀왔어요',
    '#협찬 #신상',
    '유료광고 포함',
    '레뷰 체험단에 선정되어 다녀왔어요',
    '○○으로부터 협찬받아 작성했습니다',
  ]) {
    assert.equal(classify({ title: '후기', body: body(text) }).verdict, 'ad', text);
  }
});

test('the disclosure in the snippet is enough before the body is read', () => {
  const r = classify({ title: '[협찬] 수분크림 후기', snippet: '피부가 촉촉해져요' });
  assert.equal(r.verdict, 'ad');
  assert.equal(r.checked, false);
});

test('saying it is not sponsored counts for the post', () => {
  const r = classify({
    title: '다이슨 에어랩 3개월 사용 후기 (협찬 아님)',
    body: body('내돈내산입니다. 광고 아니에요. 원고료 없이 씁니다.\n3개월 써보니 단점은 무게예요. 손목이 좀 아파요.'),
  });
  assert.equal(r.verdict, 'likely');
  assert.ok(labels(r).includes('광고·협찬이 아니라고 밝힘'));
  assert.ok(labels(r).includes('직접 샀다고 밝힘'));
  assert.ok(labels(r).includes('오래 써 본 기록'));
  assert.ok(labels(r).includes('단점도 적음'));
});

test('a reviewer complaining about sponsored reviews is not an ad', () => {
  const r = classify({
    title: '에어팟 프로2 내돈내산 후기',
    body: body('블로그에 체험단 후기랑 협찬받은 후기만 많아서 그냥 샀어요. 원고료 받고 쓴 글들은 믿기 어렵더라고요.\n두 달 써보니 아쉬운 점은 케이스 흠집.'),
  });
  assert.notEqual(r.verdict, 'ad');
  assert.notEqual(r.verdict, 'suspect');
  assert.equal(r.verdict, 'likely');
});

test('the word 광고 in passing is not a disclosure', () => {
  const r = classify({ title: '광고 보고 산 쿠션 후기', body: body('광고에서 본 것보다 커버력이 별로였어요. 실망.') });
  assert.equal(r.verdict, 'likely');
});

test('"내돈내산" next to a disclosure is called out', () => {
  const r = classify({
    title: '내돈내산 탈모샴푸 후기',
    body: body('내돈내산 후기예요.\n...\n본 포스팅은 업체로부터 제품을 제공받아 작성했습니다.'),
  });
  assert.equal(r.verdict, 'ad');
  assert.ok(labels(r).includes('‘내돈내산’이라고 썼지만 광고 문구가 같이 있음'));
});

test('"내돈내산 아님" does not count as self-paid', () => {
  const r = classify({ title: '후기', body: body('내돈내산 아님 주의') });
  assert.ok(!labels(r).includes('직접 샀다고 밝힘'));
});

test('a listicle full of shop links is suspect', () => {
  const r = classify({
    title: '무선청소기 추천 TOP 7 가격비교',
    body: body('1위 제품 ...', [
      'https://smartstore.naver.com/a/products/1',
      'https://www.coupang.com/vp/products/2',
      'https://www.11st.co.kr/products/3',
    ]),
  });
  assert.equal(r.verdict, 'suspect');
});

test('"3개월" in a title is not a top-N list', () => {
  const r = classify({ title: '로봇청소기 3개월 사용기', body: body('좋아요') });
  assert.ok(!labels(r).includes('순위·추천 목록형 제목'));
});

test('a mention of 체험단 alone only warns', () => {
  const r = classify({ title: '후기', body: body('체험단 모집 공고를 봤는데') });
  assert.equal(r.verdict, 'clean');
  assert.ok(labels(r).includes('체험단 언급'));
});

test('without a body and without signs, the verdict is unknown', () => {
  const r = classify({ title: '아이패드 미니 후기', snippet: '카페 글 요약' });
  assert.equal(r.verdict, 'unknown');
});

test('ad reasons come first and carry the matched text', () => {
  const r = classify({ title: '내돈내산', body: body('좋아요. 소정의 원고료를 받아 작성') });
  assert.equal(r.reasons[0].kind, 'ad');
  assert.match(r.reasons[0].evidence, /원고료/);
});

test('one disclosure sentence matching several rules is listed once', () => {
  const r = classify({ title: '후기', body: body('좋아요.\n본 포스팅은 업체로부터 소정의 원고료를 지원받아 작성되었습니다.') });
  assert.equal(r.reasons.filter((x) => x.kind === 'ad').length, 1);
});

test('evidence stays on one line, so the title does not run into the body', () => {
  const r = classify({ title: '아주 긴 제목의 솔직 후기', body: body('업체로부터 제품을 무상으로 제공받아 작성한 후기입니다.') });
  assert.ok(!r.reasons[0].evidence.includes('제목'));
});
