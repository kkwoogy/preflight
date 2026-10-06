import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elementWith, extractUrls, htmlToText, removeElements, stripTags } from '../lib/html.mjs';
import { canFetchBody, postKey } from '../lib/body.mjs';

test('stripTags removes API highlighting and decodes entities', () => {
  assert.equal(stripTags('<b>에어랩</b> 후기 &amp; 단점 &#39;솔직&#x27;'), "에어랩 후기 & 단점 '솔직'");
});

test('htmlToText keeps line breaks and drops scripts', () => {
  assert.equal(htmlToText('<p>첫 줄</p><script>var x="광고"</script><p>둘째&nbsp;줄<br>셋째</p>'), '첫 줄\n둘째 줄\n셋째');
});

test('extractUrls finds links inside data-* JSON', () => {
  const html = `<a href="https://a.com/x?y=1&amp;z=2">a</a>
    <div data-linkdata='{"link":"https:\\/\\/link.coupang.com\\/a\\/abc"}'></div>
    <img src="https://revu.net/banner.png">`;
  assert.deepEqual(extractUrls(html).sort(), ['https://a.com/x?y=1&z=2', 'https://link.coupang.com/a/abc', 'https://revu.net/banner.png']);
});

test('elementWith returns the whole nested element', () => {
  const html = '<div class="top"><div class="se-main-container"><div>a</div><div>b</div></div><div class="footer">c</div></div>';
  assert.equal(elementWith(html, 'se-main-container'), '<div class="se-main-container"><div>a</div><div>b</div></div>');
  assert.equal(elementWith(html, 'missing'), null);
});

test('removeElements drops blocks such as related-post lists', () => {
  const html = '<div class="post">본문<div class="another_category"><a>[협찬] 다른 글</a></div></div>';
  assert.equal(htmlToText(removeElements(html, 'another_category')), '본문');
});

test('postKey matches the same Naver post across URL forms', () => {
  const keys = [
    'https://blog.naver.com/abc_1/223344556677',
    'https://m.blog.naver.com/abc_1/223344556677',
    'https://blog.naver.com/PostView.naver?blogId=abc_1&logNo=223344556677',
    'https://blog.naver.com/abc_1?Redirect=Log&logNo=223344556677',
  ].map(postKey);
  assert.equal(new Set(keys).size, 1);
  assert.equal(postKey('https://foo.tistory.com/m/12'), postKey('https://foo.tistory.com/12'));
});

test('only known blog hosts are fetched', () => {
  assert.ok(canFetchBody('https://blog.naver.com/abc/223344556677'));
  assert.ok(canFetchBody('https://foo.tistory.com/entry/review'));
  assert.ok(canFetchBody('https://brunch.co.kr/@me/12'));
  assert.ok(!canFetchBody('https://cafe.naver.com/somecafe/123'));
  assert.ok(!canFetchBody('https://blog.naver.com/abc_1'), 'a blog home page is not a post');
  assert.ok(!canFetchBody('http://127.0.0.1/blog'));
  assert.ok(!canFetchBody('not a url'));
});
