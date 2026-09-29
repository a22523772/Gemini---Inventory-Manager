// Chrome Extension Background Service Worker (Manifest V3)
// 負責處理所有與 Google Apps Script (GAS) 的非同步 API 請求、重導向與錯誤攔截

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'TEST_GAS_CONNECTION') {
    handleTestConnection(request.gasUrl)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async response
  }

  if (request.type === 'FETCH_CLOUD_DATA') {
    handleFetchCloudData(request.gasUrl)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.type === 'EXECUTE_STOCK_OUT') {
    handleStockOut(request.gasUrl, request.payload)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (request.type === 'DELETE_ONLINE_ORDER') {
    handleDeleteOrder(request.gasUrl, request.orderId)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// 測試 GAS 連線是否正常
async function handleTestConnection(gasUrl) {
  if (!gasUrl) throw new Error('尚未設定 Google Apps Script Web App URL');
  const cleanUrl = gasUrl.trim();
  const res = await fetch(`${cleanUrl}?action=getProducts`, {
    method: 'GET',
    redirect: 'follow',
  });
  if (!res.ok) {
    throw new Error(`連線失敗 (HTTP ${res.status})，請確認 Web App 已發布為「任何人皆可存取」`);
  }
  const data = await res.json();
  return {
    success: true,
    productCount: Array.isArray(data) ? data.length : 0,
    timestamp: new Date().toISOString()
  };
}

// 安全解析 JSON 陣列
async function fetchSafeJson(url) {
  try {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) return [];
    const text = await res.text();
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn('fetchSafeJson error:', url, e);
    return [];
  }
}

// 一次撈取出貨所需的所有資料：商品表、現有庫存、網路訂單、採購單(在途)
async function handleFetchCloudData(gasUrl) {
  if (!gasUrl) throw new Error('尚未設定 Google Apps Script Web App URL');
  const cleanUrl = gasUrl.trim();

  // 同時平行發送請求，大幅縮減等待時間
  const [productsRes, stockRes, ordersRes, purchaseRes] = await Promise.all([
    fetchSafeJson(`${cleanUrl}?action=getProducts`),
    fetchSafeJson(`${cleanUrl}?action=getStock`),
    fetchSafeJson(`${cleanUrl}?action=getOnlineOrders`),
    fetchSafeJson(`${cleanUrl}?action=getPurchaseOrders`)
  ]);

  const cloudPayload = {
    products: Array.isArray(productsRes) ? productsRes : [],
    stock: Array.isArray(stockRes) ? stockRes : [],
    onlineOrders: Array.isArray(ordersRes) ? ordersRes : [],
    purchaseOrders: Array.isArray(purchaseRes) ? purchaseRes : [],
    lastSynced: new Date().toISOString()
  };

  // 同步更新至本地 chrome.storage.local 快取
  await chrome.storage.local.set({
    cachedCloudData: cloudPayload
  });

  return {
    success: true,
    data: cloudPayload
  };
}

// 執行 stockOut (扣除庫存並寫入交易紀錄 transactions)
async function handleStockOut(gasUrl, payload) {
  if (!gasUrl) throw new Error('尚未設定 Google Apps Script Web App URL');
  const cleanUrl = gasUrl.trim();

  const response = await fetch(`${cleanUrl}?action=stockOut`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    redirect: 'follow',
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`扣減庫存 API 失敗 (HTTP ${response.status})`);
  }

  const result = await response.json().catch(() => ({ success: true }));
  return { success: true, result };
}

// 執行 deleteOnlineOrder (自試算表刪除網路訂單)
async function handleDeleteOrder(gasUrl, orderId) {
  if (!gasUrl) throw new Error('尚未設定 Google Apps Script Web App URL');
  const cleanUrl = gasUrl.trim();

  const response = await fetch(`${cleanUrl}?action=deleteOnlineOrder`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    redirect: 'follow',
    body: JSON.stringify({ order_id: orderId })
  });

  if (!response.ok) {
    throw new Error(`刪除網路訂單 API 失敗 (HTTP ${response.status})`);
  }

  const result = await response.json().catch(() => ({ success: true }));
  return { success: true, result };
}
