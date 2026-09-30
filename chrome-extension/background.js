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

  if (request.type === 'EXECUTE_BATCH_SHIPMENT') {
    handleBatchShipment(request.gasUrl, request.payload)
      .then(result => sendResponse(result))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

// 建立乾淨的 GAS Web App API 網址 (自動清除結尾斜線、處理問號與參數)
function buildGasUrl(rawUrl, action) {
  if (!rawUrl) throw new Error('尚未設定 Google Apps Script Web App URL');
  let clean = rawUrl.trim().replace(/\/+$/, '');
  const sep = clean.includes('?') ? '&' : '?';
  return `${clean}${sep}action=${encodeURIComponent(action)}`;
}

// 安全解析 JSON 陣列 (優先讀取 text 去除 BOM，杜絕 body stream already read 崩潰，並攔截 HTML 權限錯誤)
async function fetchSafeJson(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`HTTP 錯誤 ${res.status}`);
  }
  const rawText = await res.text();
  if (!rawText || !rawText.trim()) return [];
  const cleanText = rawText.replace(/^\uFEFF/, '').trim();
  if (cleanText.startsWith('<') || cleanText.includes('<!DOCTYPE') || cleanText.includes('<html')) {
    throw new Error('Web App 回傳了 HTML 頁面而非 JSON 資料，請確認 Apps Script 權限已設定為「任何人 (Anyone)」');
  }
  const data = JSON.parse(cleanText);
  return Array.isArray(data) ? data : [];
}

// 測試 GAS 連線是否正常
async function handleTestConnection(gasUrl) {
  if (!gasUrl) throw new Error('尚未設定 Google Apps Script Web App URL');
  const [products, orders] = await Promise.all([
    fetchSafeJson(buildGasUrl(gasUrl, 'getProducts')),
    fetchSafeJson(buildGasUrl(gasUrl, 'getOnlineOrders'))
  ]);

  return {
    success: true,
    productCount: Array.isArray(products) ? products.length : 0,
    orderCount: Array.isArray(orders) ? orders.length : 0,
    timestamp: new Date().toISOString()
  };
}

// 一次撈取出貨所需的所有資料：商品表、現有庫存、網路訂單、採購單(在途)
async function handleFetchCloudData(gasUrl) {
  if (!gasUrl) throw new Error('尚未設定 Google Apps Script Web App URL');

  // 先讀取現有快取作為備援
  let prevCached = {};
  try {
    const prevStorage = await chrome.storage.local.get('cachedCloudData');
    prevCached = prevStorage?.cachedCloudData || {};
  } catch (e) {
    console.warn('[Background] Failed to read prev storage:', e);
  }

  // 1. 優先嘗試單一 HTTP GET 請求 (getAllData)，1.5 秒獲取全部資料，徹底解決 Google 免費帳戶並發請求限制！
  try {
    const allRes = await fetch(buildGasUrl(gasUrl, 'getAllData'), { redirect: 'follow' });
    if (allRes.ok) {
      const rawText = await allRes.text();
      const cleanText = rawText ? rawText.replace(/^\uFEFF/, '').trim() : '';
      if (cleanText && !cleanText.startsWith('<')) {
        const parsed = JSON.parse(cleanText);
        if (parsed && (Array.isArray(parsed.products) || Array.isArray(parsed.stock) || Array.isArray(parsed.onlineOrders))) {
          const finalProducts = Array.isArray(parsed.products) ? parsed.products : (prevCached.products || []);
          const finalStock = Array.isArray(parsed.stock) ? parsed.stock : (prevCached.stock || []);
          const finalOrders = Array.isArray(parsed.onlineOrders) ? parsed.onlineOrders : (prevCached.onlineOrders || []);
          const finalPurchases = Array.isArray(parsed.purchaseOrders) ? parsed.purchaseOrders : (prevCached.purchaseOrders || []);

          const cloudPayload = {
            products: finalProducts,
            stock: finalStock,
            onlineOrders: finalOrders,
            purchaseOrders: finalPurchases,
            lastSynced: new Date().toISOString(),
            fetchedCounts: {
              products: finalProducts.length,
              stock: finalStock.length,
              onlineOrders: finalOrders.length,
              purchaseOrders: finalPurchases.length
            }
          };

          await chrome.storage.local.set({ cachedCloudData: cloudPayload }).catch(() => {});
          return { success: true, data: cloudPayload };
        }
      }
    }
  } catch (err) {
    console.warn('[Background] getAllData not available or failed, falling back to multi-endpoint:', err);
  }

  // 2. 回退備援：若使用者尚未更新 GAS 指令碼，執行漸進式請求 (Promise.allSettled)
  const [pResult, sResult, oResult, poResult] = await Promise.allSettled([
    fetchSafeJson(buildGasUrl(gasUrl, 'getProducts')),
    fetchSafeJson(buildGasUrl(gasUrl, 'getStock')),
    fetchSafeJson(buildGasUrl(gasUrl, 'getOnlineOrders')),
    fetchSafeJson(buildGasUrl(gasUrl, 'getPurchaseOrders'))
  ]);

  const pOk = pResult.status === 'fulfilled';
  const sOk = sResult.status === 'fulfilled';
  const oOk = oResult.status === 'fulfilled';
  const poOk = poResult.status === 'fulfilled';

  // 若全部 4 個 API 都失敗，拋出明確錯誤給前端提示使用者
  if (!pOk && !sOk && !oOk && !poOk) {
    const errorMsg = pResult.reason?.message || sResult.reason?.message || oResult.reason?.message || poResult.reason?.message || '無法連線至 Google Apps Script';
    throw new Error(`試算表讀取失敗: ${errorMsg}`);
  }

  const finalProducts = pOk ? pResult.value : (prevCached.products || []);
  const finalStock = sOk ? sResult.value : (prevCached.stock || []);
  const finalOrders = oOk ? oResult.value : (prevCached.onlineOrders || []);
  const finalPurchases = poOk ? poResult.value : (prevCached.purchaseOrders || []);

  const cloudPayload = {
    products: finalProducts,
    stock: finalStock,
    onlineOrders: finalOrders,
    purchaseOrders: finalPurchases,
    lastSynced: new Date().toISOString(),
    fetchedCounts: {
      products: finalProducts.length,
      stock: finalStock.length,
      onlineOrders: finalOrders.length,
      purchaseOrders: finalPurchases.length
    }
  };

  // 同步更新至本地 chrome.storage.local 快取
  try {
    await chrome.storage.local.set({
      cachedCloudData: cloudPayload
    });
  } catch (e) {
    console.warn('[Background] Failed to set cachedCloudData:', e);
  }

  return {
    success: true,
    data: cloudPayload
  };
}

// 執行 stockOut (扣除庫存並寫入交易紀錄 transactions)
async function handleStockOut(gasUrl, payload) {
  const url = buildGasUrl(gasUrl, 'stockOut');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      redirect: 'follow',
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`扣減庫存 API 失敗 (HTTP ${response.status})`);
    }

    const result = await response.json().catch(() => ({ success: true }));
    return { success: true, result };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('扣除庫存請求逾時 (超過 25 秒無回應)');
    }
    throw err;
  }
}

// 執行 deleteOnlineOrder (自試算表刪除網路訂單)
async function handleDeleteOrder(gasUrl, orderId) {
  const url = buildGasUrl(gasUrl, 'deleteOnlineOrder');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      redirect: 'follow',
      body: JSON.stringify({ order_id: orderId }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`刪除網路訂單 API 失敗 (HTTP ${response.status})`);
    }

    const result = await response.json().catch(() => ({ success: true }));
    return { success: true, result };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('刪除網路訂單請求逾時 (超過 25 秒無回應)');
    }
    throw err;
  }
}

// 執行 batchShipment (一次性打包所有品項扣減＋交易紀錄＋網路訂單刪除，只發送單一 HTTP POST 請求)
async function handleBatchShipment(gasUrl, payload) {
  const url = buildGasUrl(gasUrl, 'batchShipment');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      redirect: 'follow',
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`批次出貨 API 失敗 (HTTP ${response.status})`);
    }

    const rawText = await response.text();
    const cleanText = rawText ? rawText.replace(/^\uFEFF/, '').trim() : '';
    if (!cleanText || cleanText.startsWith('<')) {
      throw new Error('Google 試算表尚未支援 batchShipment 批次出貨，請先前往 Google 試算表更新指令碼並發布新版本！');
    }

    let parsed;
    try {
      parsed = JSON.parse(cleanText);
    } catch (e) {
      throw new Error(`試算表回傳格式錯誤: ${cleanText.slice(0, 100)}`);
    }

    if (!parsed || parsed.success !== true) {
      throw new Error(parsed?.error || '試算表批次出貨處理失敗');
    }

    return { success: true, result: parsed };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('出貨請求逾時 (超過 25 秒無回應)');
    }
    throw err;
  }
}
