// Just enough HTML handling to read a blog post without a parser dependency.

const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] !== '#') return NAMED[e.toLowerCase()] ?? m;
    const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
  });
}

// The search APIs wrap matched words in <b> and escape entities.
export function stripTags(s) {
  return decodeEntities(String(s ?? '').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

export function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<br\s*\/?>|<\/(?:p|div|li|h[1-6]|tr|blockquote)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t ​]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

// Every absolute URL in the markup: hrefs, image sources, and the JSON that
// Naver's editor keeps in data-* attributes (where image links live), so a
// banner link is found wherever the editor put it.
export function extractUrls(html) {
  const flat = decodeEntities(html).replace(/\\\//g, '/');
  const urls = new Set();
  for (const m of flat.matchAll(/https?:\/\/[^\s"'<>()\\`]+/gi)) urls.add(m[0].replace(/[.,;]+$/, ''));
  return [...urls];
}

// The whole element that carries `marker` in its opening tag, matched by
// counting nested tags of the same name. Returns null when the marker is absent.
export function elementWith(html, marker) {
  const at = html.indexOf(marker);
  if (at === -1) return null;
  const start = html.lastIndexOf('<', at);
  const tag = /^<([a-z][a-z0-9]*)/i.exec(html.slice(start))?.[1]?.toLowerCase();
  if (!tag) return null;
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  re.lastIndex = start;
  let depth = 0;
  for (let m; (m = re.exec(html)); ) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index + m[0].length);
  }
  return html.slice(start); // unbalanced markup: take the rest rather than nothing
}

export function removeElements(html, marker) {
  for (let guard = 0; guard < 20; guard++) {
    const el = elementWith(html, marker);
    if (!el) break;
    html = html.replace(el, ' ');
  }
  return html;
}
