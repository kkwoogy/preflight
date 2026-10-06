import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outboundLinks } from '../links.js';

test('outbound searches exclude disclosure wording and add 후기 once', () => {
  const { search, shops } = outboundLinks('에어랩');
  const google = new URL(search[0].href).searchParams.get('q');
  assert.match(google, /^에어랩 후기 /);
  assert.match(google, /-"파트너스 활동"/);
  assert.match(google, /-"원고료"/);
  assert.ok(!/-"협찬"/.test(google), 'posts saying "협찬 아님" stay in');
  assert.match(new URL(search[1].href).searchParams.get('q'), /site:clien\.net OR site:ppomppu\.co\.kr/);
  assert.equal(new URL(outboundLinks('에어랩 후기').search[0].href).searchParams.get('q').match(/후기/g).length, 1);
  assert.equal(shops.find((s) => s.label === '무신사').href, 'https://www.musinsa.com/search/goods?keyword=%EC%97%90%EC%96%B4%EB%9E%A9');
});
