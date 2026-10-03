// Preflight for ChatGPT: adds a launcher next to the composer and turns
// {"pf":1,...} code blocks in replies into buttons and sliders.
(() => {
  'use strict';
  if (window.__preflightLoaded) return;
  window.__preflightLoaded = true;

  const hasExt = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
  const asset = (p) => (hasExt ? chrome.runtime.getURL(p) : '../' + p);
  let mode = 'inline'; // 'inline' = send instructions with the first ✈ message; 'custom' = already in custom instructions
  if (hasExt && chrome.storage) {
    chrome.storage.sync.get({ mode: 'inline' }, (v) => { mode = v.mode; });
    chrome.storage.onChanged.addListener((ch) => { if (ch.mode) mode = ch.mode.newValue; });
  }

  // ---------- small DOM helpers ----------
  function h(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function visible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function firstVisible(selectors) {
    for (const s of selectors) {
      for (const el of document.querySelectorAll(s)) if (visible(el)) return el;
    }
    return null;
  }
  function hash(s) {
    let x = 0;
    for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) | 0;
    return String(x >>> 0);
  }

  // ---------- composer (several fallbacks: ChatGPT's markup changes often) ----------
  const COMPOSER = [
    '#prompt-textarea',
    'textarea#mobile-composer-prompt',
    'textarea[id*="composer"]',
    '[contenteditable="true"][role="textbox"]',
    'textarea[aria-label*="ChatGPT"]',
    'textarea[placeholder*="ChatGPT"]',
    'form textarea',
    'main textarea'
  ];
  const SEND = [
    'button[data-testid="send-button"]',
    '#composer-submit-button',
    'button[aria-label="메시지 보내기"]',
    'button[aria-label="Send message"]',
    'button[aria-label="Send prompt"]',
    'button[aria-label*="보내기"]',
    'button[aria-label*="Send"]'
  ];
  const findComposer = () => firstVisible(COMPOSER);
  const getText = (c) => (c.tagName === 'TEXTAREA' ? c.value : c.innerText);

  function setText(c, text) {
    c.focus();
    if (c.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
      setter.call(c, text);
      c.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const sel = window.getSelection();
    const r = document.createRange();
    r.selectNodeContents(c);
    sel.removeAllRanges();
    sel.addRange(r);
    if (!document.execCommand('insertText', false, text)) {
      c.textContent = text;
      c.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
    }
  }

  function send(text) {
    const c = findComposer();
    if (!c) { toast('ChatGPT 입력창을 찾지 못했어요. 페이지를 새로고침해 주세요.'); return false; }
    setText(c, text);
    let tries = 0;
    const attempt = () => {
      const b = firstVisible(SEND);
      if (b && !b.disabled && b.getAttribute('aria-disabled') !== 'true') { b.click(); return; }
      if (++tries < 15) { setTimeout(attempt, 100); return; }
      c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    };
    setTimeout(attempt, 80);
    return true;
  }

  // ---------- toast ----------
  let toastTimer;
  const toastEl = h('div', 'pf-toast');
  toastEl.setAttribute('role', 'status');
  toastEl.hidden = true;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 3200);
  }

  // ---------- launcher ----------
  const launcher = h('button', 'pf-launcher');
  launcher.type = 'button';
  launcher.title = '대충 쓴 요청을 Preflight로 보내기 (Ctrl+Shift+Enter)';
  launcher.append(h('span', 'pf-launcher-plane', '✈'), h('span', null, 'Preflight'));
  launcher.hidden = true;

  function conversationHasInstructions() {
    return (document.body.innerText || '').includes(PREFLIGHT_MARK);
  }

  function start() {
    const c = findComposer();
    if (!c) { toast('ChatGPT 입력창을 찾지 못했어요. 페이지를 새로고침해 주세요.'); return; }
    const draft = getText(c).trim();
    if (!draft) { c.focus(); toast('하고 싶은 걸 먼저 대충 쓰고 눌러주세요. 예: 보고서 검토해줘'); return; }
    const body = draft.startsWith('✈') ? draft : '✈ ' + draft;
    const needsInstructions = mode === 'inline' && !conversationHasInstructions();
    send(needsInstructions ? PREFLIGHT_INSTRUCTIONS + '\n\n' + body : body);
  }
  launcher.addEventListener('click', start);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey && e.shiftKey) {
      const c = findComposer();
      if (c && (document.activeElement === c || c.contains(document.activeElement))) {
        e.preventDefault();
        e.stopPropagation();
        start();
      }
    }
  }, true);

  // ---------- theme: follow the page's actual background, not just the OS setting ----------
  function bgIsDark(el) {
    if (!el) return null;
    const m = (getComputedStyle(el).backgroundColor || '').match(/[\d.]+/g);
    if (!m || m.length < 3) return null;
    const [r, g, b, a = 1] = m.map(Number);
    if (a === 0) return null;
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
  }
  function applyTheme() {
    let dark = bgIsDark(document.body);
    if (dark === null) dark = bgIsDark(document.documentElement);
    if (dark === null) dark = bgIsDark(document.querySelector('main'));
    if (dark === null) dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const t = dark ? 'dark' : 'light';
    document.querySelectorAll('.pf-card, .pf-launcher, .pf-toast').forEach((n) => {
      if (n.dataset.pfTheme !== t) n.dataset.pfTheme = t;
    });
  }

  function place() {
    applyTheme();
    const c = findComposer();
    if (!c) { launcher.hidden = true; return; }
    // climb to the visible composer box (stay below ~260px tall so we don't grab the whole page)
    let box = c;
    for (let i = 0; i < 4 && box.parentElement; i++) {
      const pr = box.parentElement.getBoundingClientRect();
      if (pr.height > 260 || pr.width > window.innerWidth - 8) break;
      box = box.parentElement;
    }
    const r = box.getBoundingClientRect();
    launcher.hidden = false;
    const w = launcher.offsetWidth || 120;
    launcher.style.top = Math.max(8, r.top - 44) + 'px';
    launcher.style.left = Math.min(window.innerWidth - w - 8, Math.max(8, r.right - w)) + 'px';
  }

  // ---------- cards ----------
  function brand(title) {
    const head = h('div', 'pf-head');
    const logo = h('span', 'pf-logo');
    const ink = h('img', 'pf-logo-ink'); ink.src = asset('icons/logo-ink.png'); ink.alt = 'Preflight';
    const white = h('img', 'pf-logo-white'); white.src = asset('icons/logo-white.png'); white.alt = '';
    logo.append(ink, white);
    head.append(logo, h('span', 'pf-head-title', title));
    return head;
  }

  function lockCard(card, note) {
    card.classList.add('pf-done');
    card.querySelectorAll('button, input').forEach((b) => { b.disabled = true; });
    const s = card.querySelector('.pf-status');
    if (s) s.textContent = note;
  }

  function forksCard(d) {
    const card = h('div', 'pf-card');
    card.append(brand('확인 질문'));
    card.append(h('p', 'pf-sub', '추천을 미리 골라뒀어요. 바꿀 것만 누르고 보내세요.'));
    const picks = {};
    const notes = {};
    (d.forks || []).forEach((f) => {
      const g = h('div', 'pf-group');
      g.append(h('div', 'pf-q', f.n + '. ' + f.q));
      const row = h('div', 'pf-opts');
      const other = h('input', 'pf-input');
      other.type = 'text';
      other.placeholder = '직접 적어주세요';
      other.hidden = true;
      other.addEventListener('input', () => { notes[f.n] = other.value.trim(); });
      (f.options || []).forEach((o) => {
        const b = h('button', 'pf-opt' + (o.rec ? ' pf-rec' : ''), o.k + '  ' + o.t + (o.rec ? '  · 추천' : ''));
        b.type = 'button';
        b.setAttribute('aria-pressed', 'false');
        b.addEventListener('click', () => {
          picks[f.n] = o;
          row.querySelectorAll('.pf-opt').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          other.hidden = !o.other;
          if (o.other) other.focus();
        });
        if (o.rec && !picks[f.n]) { picks[f.n] = o; b.setAttribute('aria-pressed', 'true'); }
        row.append(b);
      });
      g.append(row, other);
      card.append(g);
    });
    const fix = h('input', 'pf-input');
    fix.type = 'text';
    fix.placeholder = '이해한 내용 중 틀린 게 있으면 적어주세요 (선택)';
    card.append(fix);
    if (d.attach) card.append(h('p', 'pf-attach', '📎 ' + d.attach));
    const act = h('div', 'pf-actions');
    const go = h('button', 'pf-primary', '보내기');
    go.type = 'button';
    const status = h('span', 'pf-status');
    act.append(go, status);
    card.append(act);
    go.addEventListener('click', () => {
      // a question without a recommendation (e.g. "which report?") must be answered
      const missing = (d.forks || []).filter((f) => !picks[f.n]);
      if (missing.length) {
        toast(missing.map((f) => f.n).join(', ') + '번을 골라주세요.');
        return;
      }
      const parts = (d.forks || []).map((f) => {
        const o = picks[f.n];
        if (!o) return null;
        const memo = notes[f.n];
        return f.n + o.k + (o.other && memo ? '(' + memo + ')' : '');
      }).filter(Boolean);
      let msg = parts.join(' ');
      if (fix.value.trim()) msg += (msg ? '\n' : '') + '고칠 점: ' + fix.value.trim();
      if (!msg) { toast('하나 이상 골라주세요.'); return; }
      if (send(msg)) lockCard(card, '보냈어요');
    });
    return card;
  }

  function feedbackCard(d) {
    const card = h('div', 'pf-card');
    card.append(brand('결과 어때요?'));
    const row = h('div', 'pf-opts');
    const good = h('button', 'pf-opt', '좋아');
    const tweak = h('button', 'pf-opt', '조금 고칠래');
    const redo = h('button', 'pf-opt', '방향이 달라');
    [good, tweak, redo].forEach((b) => { b.type = 'button'; b.setAttribute('aria-pressed', 'false'); row.append(b); });
    card.append(row);

    const panel = h('div', 'pf-panel');
    panel.hidden = true;
    card.append(panel);
    const status = h('span', 'pf-status');

    function press(b) { [good, tweak, redo].forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }

    good.addEventListener('click', () => { press(good); lockCard(card, '좋아요. 다음 요청도 ✈ Preflight로 보내세요.'); });

    tweak.addEventListener('click', () => {
      press(tweak);
      panel.textContent = '';
      panel.hidden = false;
      panel.append(h('p', 'pf-sub', '지금 결과 위치에 맞춰뒀어요. 바꾸고 싶은 것만 옮기세요.'));
      const dials = (d.dials || []).map((dl) => {
        const wrap = h('div', 'pf-dial');
        const top = h('div', 'pf-dial-top');
        const val = h('span', 'pf-dial-val', String(dl.value));
        top.append(h('span', 'pf-dial-name', dl.name), val);
        const line = h('div', 'pf-dial-line');
        const range = h('input');
        range.type = 'range';
        range.min = dl.min != null ? dl.min : 1;
        range.max = dl.max != null ? dl.max : 5;
        range.step = 1;
        range.value = dl.value;
        range.setAttribute('aria-label', dl.name);
        range.addEventListener('input', () => {
          val.textContent = range.value === String(dl.value) ? range.value : dl.value + ' → ' + range.value;
          wrap.classList.toggle('pf-changed', range.value !== String(dl.value));
        });
        line.append(h('span', 'pf-dial-end', dl.low || ''), range, h('span', 'pf-dial-end', dl.high || ''));
        wrap.append(top, line);
        panel.append(wrap);
        return { dl, range };
      });
      const where = h('input', 'pf-input');
      where.type = 'text';
      where.placeholder = '어디를? (선택) 예: 3번째 문단, 표 2';
      panel.append(where);
      const act = h('div', 'pf-actions');
      const go = h('button', 'pf-primary', '고쳐줘');
      go.type = 'button';
      act.append(go, status);
      panel.append(act);
      go.addEventListener('click', () => {
        const changed = dials.filter((x) => x.range.value !== String(x.dl.value))
          .map((x) => x.dl.name + ' ' + x.dl.value + '→' + x.range.value);
        if (!changed.length && !where.value.trim()) { toast('바꿀 걸 하나 이상 골라주세요.'); return; }
        let msg = '조금 고칠래: ' + (changed.join(', ') || '아래 위치만');
        if (where.value.trim()) msg += '. 위치: ' + where.value.trim();
        if (send(msg)) lockCard(card, '보냈어요');
      });
    });

    redo.addEventListener('click', () => {
      press(redo);
      panel.textContent = '';
      panel.hidden = false;
      const why = h('input', 'pf-input');
      why.type = 'text';
      why.placeholder = '어디가 달라요? (선택)';
      const act = h('div', 'pf-actions');
      const go = h('button', 'pf-primary', '다시 물어봐줘');
      go.type = 'button';
      act.append(go, status);
      panel.append(why, act);
      why.focus();
      go.addEventListener('click', () => {
        const msg = '방향이 달라' + (why.value.trim() ? ': ' + why.value.trim() : '');
        if (send(msg)) lockCard(card, '보냈어요');
      });
    });
    return card;
  }

  // ---------- turn {"pf":1,...} code blocks into cards ----------
  function codeHolder(el) {
    let node = el.closest('pre') || el;
    for (let i = 0; i < 3; i++) {
      const p = node.parentElement;
      if (!p || p === document.body) break;
      const extra = (p.textContent || '').trim().length - (node.textContent || '').trim().length;
      if (extra >= 0 && extra < 40) node = p; else break; // parent only adds a small header ("preflight", "Copy")
    }
    return node;
  }

  function scan() {
    document.querySelectorAll('pre, code').forEach((el) => {
      if (el.dataset.pfDone) return;
      if (el.tagName === 'CODE' && el.closest('pre')) return;
      if (el.closest('[data-pf-collapsed], .pf-card, textarea, [contenteditable="true"]')) return;
      const raw = (el.textContent || '').trim();
      if (raw[0] !== '{' || raw.indexOf('"pf"') === -1) return;
      let data;
      try { data = JSON.parse(raw); } catch (e) { return; } // still streaming; try again next scan
      if (!data || data.pf !== 1) return;
      el.dataset.pfDone = '1';
      const key = hash(raw);
      const holder = codeHolder(el);
      holder.classList.add('pf-src-hidden');
      if (document.querySelector('.pf-card[data-key="' + key + '"]')) return;
      if (data.type === 'forks' && !(data.forks || []).length) return;
      const card = data.type === 'feedback' ? feedbackCard(data) : forksCard(data);
      card.dataset.key = key;
      holder.insertAdjacentElement('afterend', card);
    });
    collapseInstructions();
    applyTheme();
  }

  // Fold the long instruction text in the user's first message into one line.
  function collapseInstructions() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeValue.indexOf(PREFLIGHT_MARK) > -1 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP)
    });
    let n;
    while ((n = walker.nextNode())) {
      const block = n.parentElement && n.parentElement.closest('div, p');
      if (!block || block.dataset.pfCollapsed) continue;
      if (block.closest('.pf-card, .pf-launcher, textarea, [contenteditable="true"]')) continue;
      block.dataset.pfCollapsed = '1';
      block.classList.add('pf-collapsed');
      block.title = '눌러서 Preflight 지침 펼치기·접기';
      block.addEventListener('click', () => block.classList.toggle('pf-expanded'));
    }
  }

  // ---------- boot ----------
  function mount() {
    if (!document.body) return;
    if (!launcher.isConnected) document.body.append(launcher);
    if (!toastEl.isConnected) document.body.append(toastEl);
  }
  let scanTimer;
  const observer = new MutationObserver(() => {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(() => { mount(); scan(); }, 350);
  });
  function boot() {
    mount();
    scan();
    place();
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    setInterval(place, 500);
    window.addEventListener('resize', place);
  }
  if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
})();
