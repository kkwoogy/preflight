(() => {
  const status = document.getElementById('status');
  const radios = document.querySelectorAll('input[name="mode"]');

  chrome.storage.sync.get({ mode: 'inline' }, (v) => {
    const r = document.getElementById('mode-' + v.mode);
    if (r) r.checked = true;
  });
  radios.forEach((r) => r.addEventListener('change', () => {
    chrome.storage.sync.set({ mode: r.value });
    status.textContent = r.value === 'custom'
      ? '지침을 복사해서 ChatGPT 맞춤 지침에 붙여넣어 주세요.'
      : '대화의 첫 ✈ 메시지에 지침이 함께 가요.';
  }));

  document.getElementById('copy').addEventListener('click', () => {
    navigator.clipboard.writeText(PREFLIGHT_INSTRUCTIONS).then(
      () => { status.textContent = '복사했어요. ChatGPT 설정 → 개인 맞춤 설정 → 맞춤 지침에 붙여넣으세요.'; },
      () => { status.textContent = '복사하지 못했어요. 다시 눌러주세요.'; }
    );
  });
})();
