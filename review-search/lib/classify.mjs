import { AD_PHRASES, AD_DOMAINS, GOOD_PHRASES, NEGATION, SHOP_DOMAINS, TITLE_WARNINGS } from './rules.mjs';

// A post is an ad when one piece of hard evidence (a disclosure sentence, an
// affiliate or experience-group link: rules worth AD_AT) is found. Weaker hints
// only add up to "suspect", so the "ad" label always has something to point at.
export const AD_AT = 100;
export const SUSPECT_AT = 40;
const LIKELY_AT = 20;

export const VERDICTS = {
  likely: '찐후기 가능성 높음',
  clean: '광고 표시 없음',
  unknown: '본문 미확인',
  suspect: '광고 의심',
  ad: '광고·협찬',
};

/**
 * @param {{ title: string, snippet?: string, body?: { text: string, urls: string[] } | null }} post
 * @returns {{ verdict: keyof VERDICTS, ad: number, good: number, checked: boolean,
 *             reasons: { kind: 'ad'|'warn'|'good', label: string, evidence?: string }[] }}
 */
export function classify({ title = '', snippet = '', body = null }) {
  const text = [title, body ? body.text : snippet].join('\n');
  const reasons = [];
  const seen = new Set();
  let ad = 0;
  let good = 0;

  // `key` makes rules of one family count once (the strong form is listed first).
  const add = (kind, label, points, evidence, key = label) => {
    if (seen.has(key)) return;
    seen.add(key);
    reasons.push(evidence ? { kind, label, evidence } : { kind, label });
    if (kind === 'good') good += points;
    else ad += points;
  };
  const severity = (points) => (points >= AD_AT ? 'ad' : 'warn');

  // One disclosure sentence often matches several rules; it is shown once.
  const spans = [];
  for (const rule of AD_PHRASES) {
    if (seen.has(rule.family)) continue;
    for (const m of text.matchAll(globalize(rule.re))) {
      if (negated(text, m)) {
        add('good', '광고·협찬이 아니라고 밝힘', 10, around(text, m));
        continue;
      }
      const [from, to] = sentenceOf(text, m);
      if (spans.some(([a, b]) => from < b && a < to)) break;
      spans.push([from, to]);
      add(severity(rule.points), rule.label, rule.points, around(text, m), rule.family);
      break;
    }
  }

  const urls = body?.urls ?? [];
  const hosts = urls.map(hostOf);
  for (const d of AD_DOMAINS) {
    const i = hosts.findIndex((h) => hostMatches(h, d.host));
    if (i !== -1) add(severity(d.points), d.label, d.points, shorten(urls[i]));
  }

  const shopLinks = hosts.filter((h) => SHOP_DOMAINS.some((d) => hostMatches(h, d))).length;
  if (shopLinks >= 3) add('warn', `구매 링크 ${shopLinks}개`, 40);

  for (const rule of TITLE_WARNINGS) {
    const m = title.match(rule.re);
    if (m) add('warn', rule.label, rule.points, m[0]);
  }

  for (const rule of GOOD_PHRASES) {
    for (const m of text.matchAll(globalize(rule.re))) {
      if (negated(text, m)) continue; // "내돈내산 아님"
      add('good', rule.label, rule.points, around(text, m));
      break;
    }
  }

  const hard = reasons.some((r) => r.kind === 'ad');
  if (hard && seen.has('직접 샀다고 밝힘')) {
    reasons.push({ kind: 'ad', label: '‘내돈내산’이라고 썼지만 광고 문구가 같이 있음' });
  }

  const checked = Boolean(body);
  let verdict;
  if (hard) verdict = 'ad';
  else if (ad >= SUSPECT_AT) verdict = 'suspect';
  else if (!checked) verdict = 'unknown';
  else verdict = good >= LIKELY_AT ? 'likely' : 'clean';

  const order = { ad: 0, warn: 1, good: 2 };
  reasons.sort((a, b) => order[a.kind] - order[b.kind]);
  return { verdict, ad, good, checked, reasons };
}

function negated(text, m) {
  const end = m.index + m[0].length;
  return NEGATION.test(text.slice(end, end + 12));
}

function globalize(re) {
  return re.global ? re : new RegExp(re.source, re.flags + 'g');
}

function sentenceOf(text, m) {
  const end = m.index + m[0].length;
  const stops = /[.!?\n]/g;
  let from = 0;
  for (let i = m.index - 1; i >= 0; i--) {
    if (/[.!?\n]/.test(text[i])) {
      from = i + 1;
      break;
    }
  }
  stops.lastIndex = end;
  const next = stops.exec(text);
  return [from, next ? next.index : text.length];
}

// The matched words with a little context, kept inside one line so the title
// doesn't run into the body.
function around(text, m, pad = 18) {
  const end = m.index + m[0].length;
  const lineStart = text.lastIndexOf('\n', m.index - 1) + 1;
  const lineEnd = text.indexOf('\n', end) === -1 ? text.length : text.indexOf('\n', end);
  const from = Math.max(lineStart, m.index - pad);
  const to = Math.min(lineEnd, end + pad);
  return (from > lineStart ? '…' : '') + text.slice(from, to).replace(/\s+/g, ' ').trim() + (to < lineEnd ? '…' : '');
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function hostMatches(host, domain) {
  return host === domain || host.endsWith('.' + domain);
}

function shorten(url) {
  return url.length > 60 ? url.slice(0, 57) + '…' : url;
}
