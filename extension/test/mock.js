// A fake chat that answers with fixed Preflight replies, for testing content.js without ChatGPT.
(() => {
  const thread = document.getElementById('thread');
  const ta = document.getElementById('mobile-composer-prompt');
  const btn = document.getElementById('sendbtn');
  window.__sent = [];

  function add(cls, text) {
    const d = document.createElement('div');
    d.className = 'msg ' + cls;
    d.textContent = text;
    thread.append(d);
    return d;
  }
  function addCode(parent, json) {
    const wrap = document.createElement('div');
    wrap.className = 'codewrap';
    wrap.innerHTML = '<div class="codehead"><span>preflight</span><span>복사</span></div><pre><code class="language-preflight"></code></pre>';
    const code = wrap.querySelector('code');
    parent.append(wrap);
    // simulate streaming: half the JSON first, the rest a moment later
    const half = Math.floor(json.length / 2);
    code.textContent = json.slice(0, half);
    setTimeout(() => { code.textContent = json; }, 400);
  }

  const FORKS = JSON.stringify({
    pf: 1, type: 'forks',
    forks: [
      { n: 1, q: '어떤 보고서예요?', options: [
        { k: 'A', t: '지난번 열기관 순환 실험 보고서 (지난 대화 기준)' },
        { k: 'B', t: '다른 거야, 첨부할게', other: true }] },
      { n: 2, q: '어디를 중점으로 볼까요?', options: [
        { k: 'A', t: '계산·그래프·결론 (감점 요소)', rec: true },
        { k: 'B', t: '형식·문장' },
        { k: 'C', t: '잘 모르겠어, 추천해줘' }] }
    ],
    attach: '검토하려면 보고서 파일을 이 대화에 첨부해 주세요.'
  });
  const FEEDBACK = (len) => JSON.stringify({
    pf: 1, type: 'feedback',
    dials: [
      { name: '분량', value: len, min: 1, max: 5, low: '짧게', high: '길게' },
      { name: '지적 기준', value: 3, min: 1, max: 5, low: '중대한 것만', high: '사소한 것까지' },
      { name: '말투', value: 2, min: 1, max: 5, low: '부드럽게', high: '단호하게' }
    ]
  });

  function respond(v) {
    setTimeout(() => {
      if (v.includes('✈')) {
        const a = add('assistant', '이렇게 이해했어요:\n· 무엇을: 보고서 검토 — 지난번 열기관 순환 실험 보고서일 수도 있어요 (지난 대화 기준)\n· 누구를 위해: 교수님 채점용\n· 어떤 느낌으로: 감점 요소부터, 고칠 곳마다 이유와 수정안');
        addCode(a, FORKS);
      } else if (/^\d[A-Z]/.test(v)) {
        const a = add('assistant', '이렇게 진행할게요: 계산·그래프·결론 위주로 감점 요소를 찾아요.\n\n전체 판단: (가짜 결과) …\n\n좋아 / 조금 고칠래 / 방향이 달라?');
        addCode(a, FEEDBACK(3));
      } else if (v.startsWith('조금 고칠래')) {
        const a = add('assistant', '요청대로 고쳤어요. (가짜 결과) …');
        addCode(a, FEEDBACK(2));
      } else if (v.startsWith('방향이 달라')) {
        const a = add('assistant', '다시 이해해볼게요:\n· 무엇을: …');
        addCode(a, FORKS);
      } else {
        add('assistant', '(평소 답변)');
      }
    }, 300);
  }

  btn.addEventListener('click', () => {
    const v = ta.value.trim();
    if (!v) return;
    window.__sent.push(v);
    add('user', v);
    ta.value = '';
    respond(v);
  });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) { e.preventDefault(); btn.click(); }
  });
})();
