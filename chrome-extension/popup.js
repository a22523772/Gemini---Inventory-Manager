document.addEventListener('DOMContentLoaded', () => {
  const statusDisplay = document.getElementById('status-display');
  const gasUrlInput = document.getElementById('gas-url');
  const saveBtn = document.getElementById('btn-save');

  // 讀取當前儲存的 URL
  chrome.storage.local.get(['gasUrl'], (res) => {
    if (res.gasUrl) {
      gasUrlInput.value = res.gasUrl;
      checkConnection(res.gasUrl);
    } else {
      statusDisplay.className = 'status-badge status-disconnected';
      statusDisplay.innerText = '🔴 尚未設定 Web App URL';
    }
  });

  saveBtn.addEventListener('click', () => {
    const url = gasUrlInput.value.trim();
    if (!url) {
      alert('請輸入有效的 Google Apps Script Web App URL');
      return;
    }
    chrome.storage.local.set({ gasUrl: url }, () => {
      checkConnection(url);
    });
  });

  function checkConnection(url) {
    statusDisplay.className = 'status-badge';
    statusDisplay.innerText = '🟡 測試連線中...';

    chrome.runtime.sendMessage({ type: 'TEST_GAS_CONNECTION', gasUrl: url }, (res) => {
      if (res && res.success) {
        statusDisplay.className = 'status-badge status-connected';
        statusDisplay.innerText = `🟢 雲端已連線 (商品 ${res.productCount} 筆)`;
      } else {
        statusDisplay.className = 'status-badge status-disconnected';
        statusDisplay.innerText = '🔴 連線失敗，請檢查 URL';
      }
    });
  }
});
