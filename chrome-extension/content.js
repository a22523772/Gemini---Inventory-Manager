// 電商賣場出貨與真實利潤助手 - Content Script (Manifest V3)
// 封裝於 Shadow DOM，確保樣式隔離，不破壞賣場版面

(function () {
  // 防止重複注入
  if (document.getElementById('ecommerce-ship-assistant-root')) return;

  // 1. 偵測當前電商平台
  const currentHost = window.location.hostname;
  let currentPlatform = 'shopee';
  let platformLabel = '蝦皮 (Shopee)';
  if (currentHost.includes('momo.com.tw')) {
    currentPlatform = 'momo';
    platformLabel = 'MO店+ (Momo)';
  } else if (currentHost.includes('coupang.com') || currentHost.includes('coupang.tw')) {
    currentPlatform = 'coupang';
    platformLabel = '酷澎 (Coupang)';
  }

  // 狀態管理
  let state = {
    isOpen: false,
    opacity: 0.95,
    gasUrl: '',
    currentOrderId: '',
    togglePos: {
      top: 38,
      isPercent: true,
      side: 'right'
    },
    platformSelectors: {
      shopee: { incomeSelector: '', feeSelector: '', orderIdSelector: '' },
      momo: { incomeSelector: '', feeSelector: '', orderIdSelector: '' },
      coupang: { incomeSelector: '', feeSelector: '', orderIdSelector: '' }
    },
    cloudData: {
      products: [],
      stock: [],
      onlineOrders: [],
      purchaseOrders: []
    },
    shippedOrders: {}, // { [order_id]: timestamp }
    checkedItems: {}, // { [order_id + '_' + item_idx]: boolean }
    selectedSpecs: {}, // { [order_id + '_' + item_idx]: resolvedSpec } 選項 A: 規格對齊與下拉選單選擇
    currentTab: 'main', // 'main' | 'settings'
    isSyncing: false,
    isShipping: false,
    shippingSuccess: false
  };

  // 2. 建立 Shadow DOM 容器
  const host = document.createElement('div');
  host.id = 'ecommerce-ship-assistant-root';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  // 注入樣式
  const styleLink = document.createElement('link');
  styleLink.rel = 'stylesheet';
  styleLink.href = chrome.runtime.getURL('styles.css');
  shadow.appendChild(styleLink);

  const container = document.createElement('div');
  shadow.appendChild(container);

  // 3. 初始載入本地設定與快取
  chrome.storage.local.get(
    ['gasUrl', 'opacity', 'platformSelectors', 'cachedCloudData', 'shippedOrders', 'isOpen', 'lastOrderId', 'togglePos'],
    (res) => {
      if (res.gasUrl) state.gasUrl = res.gasUrl;
      if (res.opacity !== undefined) state.opacity = Number(res.opacity);
      if (res.platformSelectors) state.platformSelectors = { ...state.platformSelectors, ...res.platformSelectors };
      if (res.cachedCloudData) {
        state.cloudData = {
          products: Array.isArray(res.cachedCloudData.products) ? res.cachedCloudData.products : [],
          stock: Array.isArray(res.cachedCloudData.stock) ? res.cachedCloudData.stock : [],
          onlineOrders: Array.isArray(res.cachedCloudData.onlineOrders) ? res.cachedCloudData.onlineOrders : [],
          purchaseOrders: Array.isArray(res.cachedCloudData.purchaseOrders) ? res.cachedCloudData.purchaseOrders : [],
          lastSynced: res.cachedCloudData.lastSynced || null
        };
      }
      if (res.shippedOrders) state.shippedOrders = res.shippedOrders;
      if (res.isOpen !== undefined) state.isOpen = res.isOpen;
      if (res.lastOrderId && !state.currentOrderId) state.currentOrderId = res.lastOrderId;
      if (res.togglePos) state.togglePos = { ...state.togglePos, ...res.togglePos };

      // 依網頁 Selector 嘗試自動抓取訂單編號 (完全不使用 URL)
      detectOrderId();
      render();

      // 背景靜默更新雲端最新資料 (SWR 策略)
      if (state.gasUrl) {
        silentRefreshCloudData();
      }
    }
  );

  // 監聽網頁 DOM 變化 (若賣場延遲渲染出訂單編號，自動捕獲)
  let domCheckTimeout = null;
  const domObserver = new MutationObserver(() => {
    if (domCheckTimeout) clearTimeout(domCheckTimeout);
    domCheckTimeout = setTimeout(() => {
      // 僅在尚未手動設定單號，或需要同步更新時偵測
      if (!state.currentOrderId) {
        if (detectOrderId()) {
          render();
        }
      }
    }, 800);
  });
  domObserver.observe(document.body, { subtree: true, childList: true });

  // 4. 偵測訂單編號 (純從網頁 Selector 抓取，已徹底刪除 URL 抓取)
  function detectOrderId(force = false) {
    const customSelector = state.platformSelectors[currentPlatform]?.orderIdSelector;
    if (!customSelector) return false;

    try {
      const el = document.querySelector(customSelector);
      if (el) {
        const rawText = el.innerText || el.textContent || '';
        const clean = extractCleanOrderId(rawText);
        if (clean && (clean !== state.currentOrderId || force)) {
          state.currentOrderId = clean;
          chrome.storage.local.set({ lastOrderId: clean });
          return true;
        }
      }
    } catch (e) {
      console.warn('[E-Commerce Assistant] Failed to parse custom orderIdSelector', e);
    }
    return false;
  }

  // 智慧純訂單編號提取：自動去除「訂單編號:」、「Order SN:」、「複製」等中英贅字
  function extractCleanOrderId(rawText) {
    if (!rawText) return '';
    let str = String(rawText).trim();

    // 移除常見按鈕文字
    str = str.replace(/(?:複製|查看|詳情|Copy|Detail)/gi, ' ');

    // 優先匹配「訂單編號 / 訂單號 / Order SN / Order ID」之後的編號
    const matchPrefix = str.match(/(?:訂單編號|訂單號|訂單SN|訂單碼|Order\s*(?:ID|SN|No\.?))\s*[:：#]?\s*([0-9a-zA-Z_-]{5,40})/i);
    if (matchPrefix && matchPrefix[1]) {
      return matchPrefix[1].trim();
    }

    // 次之：以空白/符號切割，尋找最長且含英數的編號字串 (通常 6~35 碼)
    const tokens = str.split(/[\s,;:：\n\r\t#]+/);
    for (const token of tokens) {
      const clean = token.replace(/[^a-zA-Z0-9_-]/g, '');
      if (clean.length >= 6 && /[0-9]/.test(clean)) {
        return clean;
      }
    }

    // 兜底過濾
    return str.replace(/[^a-zA-Z0-9_-]/g, '').trim();
  }

  // 5. 抓取網頁實際入帳金額與平台手續費 (使用自訂選取器)
  function scrapeFinancials() {
    const selectors = state.platformSelectors[currentPlatform] || {};
    let actualIncome = 0;
    let platformFee = 0;

    // 實際入帳金額
    if (selectors.incomeSelector) {
      try {
        const el = document.querySelector(selectors.incomeSelector);
        if (el) {
          const text = el.innerText || el.textContent || '';
          actualIncome = parseMoney(text);
        }
      } catch (e) {}
    }

    // 平台手續費
    if (selectors.feeSelector) {
      try {
        const el = document.querySelector(selectors.feeSelector);
        if (el) {
          const text = el.innerText || el.textContent || '';
          platformFee = parseMoney(text);
        }
      } catch (e) {}
    }

    return { actualIncome, platformFee };
  }

  function parseMoney(str) {
    if (!str) return 0;
    const cleaned = String(str).replace(/[$,NT\s]/gi, '').replace(/,/g, '');
    const match = cleaned.match(/[-+]?[0-9]+(?:\.[0-9]+)?/);
    if (match) {
      const num = parseFloat(match[0]);
      return isNaN(num) ? 0 : Math.abs(num);
    }
    return 0;
  }

  // 預覽 Selector 抓取結果（供設定面板顯示）
  function previewScrapeResult(selectorType, selectorStr) {
    if (!selectorStr) return { found: false, text: '尚未設定選取器' };
    try {
      const el = document.querySelector(selectorStr);
      if (!el) return { found: false, text: '目前網頁未找到符合之元素' };
      const raw = el.innerText || el.textContent || '';
      if (selectorType === 'orderIdSelector') {
        const clean = extractCleanOrderId(raw);
        return { found: true, text: clean ? `【${clean}】` : '無法解析出純單號' };
      } else {
        const val = parseMoney(raw);
        return { found: true, text: `$${val.toLocaleString()} (原始文字: "${raw.trim().slice(0, 25)}")` };
      }
    } catch (e) {
      return { found: false, text: `語法錯誤: ${e.message}` };
    }
  }

  // 6. 背景靜默更新雲端資料 (支援手動觸發與防死鎖安全計時器)
  let syncTimeoutId = null;
  function silentRefreshCloudData(isManual = false) {
    if (!state.gasUrl) {
      if (isManual) alert('⚠️ 尚未設定 Google Apps Script Web App URL，請點擊右上角 ⚙️ 進行設定');
      return;
    }
    if (state.isSyncing && !isManual) return;

    state.isSyncing = true;
    render();

    if (syncTimeoutId) clearTimeout(syncTimeoutId);
    // 安全計時器：30 秒自動解除鎖定，容納 Google Apps Script 冷啟動延遲
    syncTimeoutId = setTimeout(() => {
      if (state.isSyncing) {
        state.isSyncing = false;
        render();
        if (isManual) alert('⚠️ 試算表同步逾時，請檢查 Google Apps Script 網址與網路連線');
      }
    }, 30000);

    chrome.runtime.sendMessage(
      { type: 'FETCH_CLOUD_DATA', gasUrl: state.gasUrl },
      (res) => {
        if (syncTimeoutId) clearTimeout(syncTimeoutId);
        state.isSyncing = false;

        if (chrome.runtime.lastError) {
          if (isManual) alert(`❌ 插件背景通訊異常: ${chrome.runtime.lastError.message}`);
          render();
          return;
        }

        if (res && res.success && res.data) {
          state.cloudData = res.data;
          if (isManual) {
            const counts = res.data.fetchedCounts || {};
            alert(`✅ 試算表資料同步成功！\n- 網路訂單：${counts.onlineOrders ?? res.data.onlineOrders?.length ?? 0} 筆\n- 系統商品：${counts.products ?? res.data.products?.length ?? 0} 項\n- 現有庫存：${counts.stock ?? res.data.stock?.length ?? 0} 筆\n- 在途採購：${counts.purchaseOrders ?? res.data.purchaseOrders?.length ?? 0} 筆`);
          }
        } else if (isManual) {
          alert(`❌ 同步失敗: ${res?.error || '無法讀取資料，請確認 Web App 已發布為「任何人皆可存取」'}`);
        }
        render();
      }
    );
  }

  // 規格化網路訂單欄位 (支援中英文欄位別名、去除空白符號、多品項訂單向上繼承 fill-down)
  function normalizeOnlineOrders(rawOrders) {
    if (!Array.isArray(rawOrders)) return [];

    const strip = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
    let lastHeader = null;
    const normalized = [];

    for (const raw of rawOrders) {
      if (!raw || typeof raw !== 'object') continue;

      const map = {};
      for (const k of Object.keys(raw)) {
        const val = typeof raw[k] === 'string' ? raw[k].trim() : raw[k];
        map[k.trim().toLowerCase()] = val;
        map[k.trim()] = val;
        const sk = strip(k);
        if (sk) map[sk] = val;
      }

      const getVal = (aliases) => {
        for (const alias of aliases) {
          if (map[alias] !== undefined && map[alias] !== '') return map[alias];
          const lower = alias.toLowerCase();
          if (map[lower] !== undefined && map[lower] !== '') return map[lower];
          const sk = strip(alias);
          if (map[sk] !== undefined && map[sk] !== '') return map[sk];
          for (const mk of Object.keys(map)) {
            const strippedMk = strip(mk);
            if (strippedMk && sk && (strippedMk === sk || strippedMk.includes(sk) || sk.includes(strippedMk))) {
              if (map[mk] !== undefined && map[mk] !== '') return map[mk];
            }
          }
        }
        return '';
      };

      let order_id = String(getVal(['order_id', '訂單編號', '訂單id', 'id', '訂單號', '單號', '訂單序號', 'ordersn', 'order_sn'])).trim();
      let platform = String(getVal(['platform', '來源平台', '平台'])).trim();
      let customer_name = String(getVal(['customer_name', '收件人', '顧客姓名', '買家', '顧客', '姓名', '買家帳號'])).trim();
      let shipping_deadline = String(getVal(['最晚出貨期限', 'shipping_deadline', '最晚出貨時間', '出貨期限', 'deadline'])).trim();
      let order_status = String(getVal(['order_status', '訂單狀態', '狀態', 'status'])).trim();
      let created_at = String(getVal(['created_at', '下單時間', '下單日期', '建立時間', '日期', '時間'])).trim();
      let shipping_method = String(getVal(['shipping_method', '物流方式', '物流', '寄送方式'])).trim();
      let price = Number(getVal(['price', 'totalprice', 'totalamount', 'orderprice', '價格', '售價', '金額', '訂單金額', '總金額', '總價'])) || 0;

      // 多品項訂單向上補齊 (第 2 列以後常留白訂單號或單號相同留白標題)
      if (lastHeader && (!order_id || order_id === lastHeader.order_id)) {
        if (!order_id) order_id = lastHeader.order_id;
        if (!platform) platform = lastHeader.platform;
        if (!customer_name) customer_name = lastHeader.customer_name;
        if (!shipping_deadline) shipping_deadline = lastHeader.shipping_deadline;
        if (!order_status) order_status = lastHeader.order_status;
        if (!created_at) created_at = lastHeader.created_at;
        if (!shipping_method) shipping_method = lastHeader.shipping_method;
        if (!price) price = lastHeader.price;
      }

      if (!order_id) continue;

      lastHeader = {
        order_id,
        platform,
        customer_name,
        shipping_deadline,
        order_status,
        created_at,
        shipping_method,
        price
      };

      let product_id = String(getVal([
        'product_id', 'productid', 'product_no', 'productno', 'item_id', 'itemid', 'sku',
        '商品編號', '商品代碼', '商品id', '商品ID', '商品料號', '商品貨號', '商品條碼',
        '產品編號', '產品id', '產品料號', '代碼', '料號', '貨號', '條碼', 'SKU', 'PID', '品號'
      ])).trim();

      // 若未透過表頭找到，嘗試以第 4 欄 (Index 3) 提取
      if (!product_id) {
        const rawKeys = Object.keys(raw);
        if (rawKeys.length >= 4 && raw[rawKeys[3]]) {
          const possiblePid = String(raw[rawKeys[3]]).trim();
          if (possiblePid && !possiblePid.includes(' ') && (possiblePid.startsWith('P') || possiblePid.length >= 3)) {
            product_id = possiblePid;
          }
        }
      }

      let product_name = String(getVal([
        'product_name', 'productname', 'item_name', 'itemname', 'name', 'title',
        '商品名稱', '產品名稱', '品名', '名稱', '商品', '產品', '項目名稱'
      ])).trim();

      let specification = String(getVal([
        'specification', 'spec', 'variant', '商品規格', '規格', '規格描述', '選項'
      ])).trim();

      let quantity = Number(getVal(['quantity', 'qty', 'count', '數量', '件數', '個數', '買家購買數量'])) || 1;

      normalized.push({
        ...raw,
        order_id,
        platform,
        customer_name,
        shipping_deadline,
        order_status,
        created_at,
        shipping_method,
        price,
        product_id,
        product_name,
        specification,
        quantity
      });
    }

    return normalized;
  }

  // 規格化商品資料表欄位
  function normalizeProducts(rawProds) {
    if (!Array.isArray(rawProds)) return [];
    return rawProds.map(p => ({
      ...p,
      product_id: String(p.product_id || p['商品編號'] || p['商品ID'] || p.id || '').trim(),
      name: String(p.name || p.product_name || p['商品名稱'] || p['品名'] || '').trim(),
      cost_price: Number(p.cost_price ?? p['進價'] ?? p['成本'] ?? p['成本價'] ?? 0),
      selling_price: Number(p.selling_price ?? p['售價'] ?? p['售價金額'] ?? 0),
      specification: String(p.specification || p['規格'] || '').trim()
    }));
  }

  // 規格化庫存資料表欄位
  function normalizeStock(rawStock) {
    if (!Array.isArray(rawStock)) return [];
    return rawStock.map((s) => {
      if (!s || typeof s !== 'object') return null;
      const map = {};
      for (const k of Object.keys(s)) {
        const val = typeof s[k] === 'string' ? s[k].trim() : s[k];
        map[k.trim().toLowerCase()] = val;
        map[k.trim()] = val;
        const sk = String(k || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
        if (sk) map[sk] = val;
      }
      const getVal = (aliases) => {
        for (const alias of aliases) {
          if (map[alias] !== undefined && map[alias] !== '') return map[alias];
          const lower = alias.toLowerCase();
          if (map[lower] !== undefined && map[lower] !== '') return map[lower];
          const sk = String(alias || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');
          if (map[sk] !== undefined && map[sk] !== '') return map[sk];
        }
        return '';
      };
      const product_id = String(getVal([
        'product_id', 'productid', '商品編號', '商品代碼', '商品id', '商品ID', '品號', '料號', '貨號', '代碼', '條碼', 'sku', 'id'
      ])).trim();
      const name = String(getVal(['name', 'product_name', '商品名稱', '品名', '名稱', '商品', '產品'])).trim();
      const stock_id = String(getVal(['stock_id', '庫存id', '庫存編號', 'id'])).trim();
      const specification = String(getVal(['specification', 'spec', '規格', '商品規格', '選項'])).trim();
      const quantity = Number(getVal(['quantity', 'qty', '數量', '庫存量', '現有庫存'])) || 0;
      const expiry_date = String(getVal(['expiry_date', '有效期限', '效期', '到期日'])).trim();
      const location = String(getVal(['location', '儲位', '位置', '庫位'])).trim();
      const floor = String(getVal(['floor', '樓層'])).trim();
      const area = String(getVal(['area', '區域', '區'])).trim();
      return {
        ...s,
        stock_id,
        product_id,
        name,
        specification,
        quantity,
        expiry_date,
        location,
        floor,
        area
      };
    }).filter(Boolean);
  }

  // 選項 A: 智能規格自動提取 (去除促銷字眼、括號、前綴序號，模糊比對)
  function smartMatchSpec(orderSpec, availableSpecs) {
    if (!availableSpecs || availableSpecs.length === 0) return '';
    if (!orderSpec) {
      if (availableSpecs.length === 1) return availableSpecs[0];
      return '';
    }

    const cleanOrder = String(orderSpec).trim();

    // 1. 完全相同 (不分大小寫)
    const exact = availableSpecs.find(s => s.toLowerCase() === cleanOrder.toLowerCase());
    if (exact) return exact;

    // 2. 清洗函式：移除【】、[]、()、前綴 01.、促銷尾綴
    const cleanStr = (str) => {
      return String(str)
        .replace(/【.*?】|\[.*?\]|\(.*?\)|（.*?）|「.*?」/g, ' ')
        .replace(/^[0-9]+[\.\-、_]\s*/, '')
        .replace(/(?:現貨|特價|熱銷|免運|秒發|促銷|升級款|加贈.*?|附贈.*?|贈品.*?)$/gi, '')
        .replace(/[\s\-_/]+/g, '')
        .toLowerCase()
        .trim();
    };

    const normOrder = cleanStr(cleanOrder);
    if (normOrder) {
      const normExact = availableSpecs.find(s => cleanStr(s) === normOrder);
      if (normExact) return normExact;
    }

    // 3. 子字串包含判定：訂單規格包含系統規格，或系統規格包含訂單規格
    const containing = availableSpecs.filter(s => {
      const sClean = cleanStr(s);
      if (!sClean) return false;
      return cleanOrder.toLowerCase().includes(s.toLowerCase()) || 
             (normOrder && normOrder.includes(sClean)) ||
             s.toLowerCase().includes(cleanOrder.toLowerCase());
    });
    if (containing.length === 1) {
      return containing[0];
    }

    // 4. 若該商品在現有庫存中「只有唯一規格」，直接對齊！
    if (availableSpecs.length === 1) {
      return availableSpecs[0];
    }

    return '';
  }

  // 7. 計算當前訂單資料、成本與淨利 (嚴格不顯示總售價)
  function getOrderAnalysis() {
    const { actualIncome, platformFee } = scrapeFinancials();
    const orderId = String(state.currentOrderId || '').trim();
    const cleanCurrentOrderId = orderId.replace(/[^0-9a-zA-Z_-]/g, '').toLowerCase();

    const rawOrders = state.cloudData.onlineOrders || [];
    const orders = normalizeOnlineOrders(rawOrders);
    const products = normalizeProducts(state.cloudData.products || []);
    const stockList = normalizeStock(state.cloudData.stock || []);
    const poList = state.cloudData.purchaseOrders || [];

    // 從 onlineOrders 找出該訂單的所有品項 (支援完全相符、無前綴相符或純英數相符)
    const matchingRows = cleanCurrentOrderId
      ? orders.filter((o) => {
          const rawOid = String(o.order_id || '').trim();
          const cleanOid = rawOid.replace(/[^0-9a-zA-Z_-]/g, '').toLowerCase();
          return (
            rawOid.toLowerCase() === orderId.toLowerCase() ||
            cleanOid === cleanCurrentOrderId ||
            (cleanOid && cleanCurrentOrderId && (cleanOid.endsWith(cleanCurrentOrderId) || cleanCurrentOrderId.endsWith(cleanOid)))
          );
        })
      : [];

    let totalCost = 0;
    const items = matchingRows.map((row, idx) => {
      const rawPid = String(row.product_id || '').trim();
      const pid = rawPid.toLowerCase();
      const rowName = String(row.product_name || '').trim();
      const spec = String(row.specification || '').trim();
      const qty = Number(row.quantity) || 1;

      // 比對 products 取得商品資料與進價成本 (以 product_id 優先比對，其次品名)
      const prod = products.find((p) => {
        const pPid = String(p.product_id || '').trim().toLowerCase();
        const pName = String(p.name || '').trim().toLowerCase();
        return (pid && pPid === pid) || (!pid && rowName && (pName === rowName.toLowerCase() || pPid === rowName.toLowerCase()));
      });
      const resolvedPid = rawPid || String(prod?.product_id || '').trim();
      const resolvedName = rowName || String(prod?.name || '').trim() || '未命名商品';
      const costPrice = prod ? Number(prod.cost_price) || 0 : 0;
      const itemTotalCost = costPrice * qty;
      totalCost += itemTotalCost;

      // 取得該商品在 stock 庫存表中的所有項目 (優先以 product_id 精確比對，若無 ID 則以品名比對)
      const allProductStocks = stockList.filter((s) => {
        const sPid = String(s.product_id || '').trim().toLowerCase();
        const sName = String(s.name || '').trim().toLowerCase();
        if (resolvedPid) {
          return sPid === resolvedPid.toLowerCase();
        }
        return resolvedName && sName === resolvedName.toLowerCase();
      });

      const isFoundInStock = allProductStocks.length > 0;
      const availableSpecs = [...new Set(allProductStocks.map((s) => String(s.specification || '').trim()).filter(Boolean))];

      // 計算各規格庫存量
      const specStockMap = {};
      allProductStocks.forEach((s) => {
        const sSpec = String(s.specification || '').trim();
        specStockMap[sSpec] = (specStockMap[sSpec] || 0) + (Number(s.quantity) || 0);
      });

      const itemKey = `${orderId}_${idx}`;
      let resolvedSpec = state.selectedSpecs[itemKey];
      let isAutoMatched = false;

      if (resolvedSpec === undefined) {
        if (!isFoundInStock) {
          resolvedSpec = '';
        } else if (!spec) {
          // 訂單未指定規格時：若庫存只有單一規格，自動鎖定
          if (availableSpecs.length === 1) {
            resolvedSpec = availableSpecs[0];
            isAutoMatched = true;
          } else {
            resolvedSpec = '';
          }
        } else {
          // 訂單有指定規格：精確/智能比對該規格
          const autoMatch = smartMatchSpec(spec, availableSpecs);
          if (autoMatch) {
            resolvedSpec = autoMatch;
            isAutoMatched = true;
          } else {
            // 訂單規格在此商品的現有庫存中不存在 (缺貨) -> 絕不盲目套用其他規格！
            resolvedSpec = '';
            isAutoMatched = false;
          }
        }
        state.selectedSpecs[itemKey] = resolvedSpec;
      } else if (resolvedSpec && resolvedSpec !== '__FORCED__') {
        if (spec) {
          if (smartMatchSpec(spec, [resolvedSpec])) {
            isAutoMatched = true;
          }
        } else if (availableSpecs.length === 1 && resolvedSpec === availableSpecs[0]) {
          isAutoMatched = true;
        }
      }

      // 依解析後 (或手動指定) 的規格篩選庫存
      const matchedStock = allProductStocks.filter((s) => {
        if (resolvedSpec === '__FORCED__') return false; // 使用者刻意選擇不扣庫存
        if (resolvedSpec) {
          return String(s.specification || '').trim().toLowerCase() === resolvedSpec.toLowerCase();
        }
        if (spec) {
          return String(s.specification || '').trim().toLowerCase() === spec.toLowerCase();
        }
        return true;
      });
      const existingStock = matchedStock.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);

      // 比對 purchaseOrders 取得在途採購量 (支援巢狀 items 及扁平 PO 記錄，支援 ID 或 品名比對)
      let inTransitPO = 0;
      poList.forEach((po) => {
        const poStatus = String(po.status || '').trim().toLowerCase();
        if (poStatus === 'completed' || poStatus === '已到貨' || poStatus === 'cancelled' || poStatus === '已取消') return;

        const poItems = Array.isArray(po.items) && po.items.length > 0 ? po.items : [po];
        const matchingPoItems = poItems.filter((pItem) => {
          const pPid = String(pItem.product_id || '').trim().toLowerCase();
          const pName = String(pItem.name || pItem.product_name || pItem['商品名稱'] || '').trim().toLowerCase();
          const cleanResPid = resolvedPid ? resolvedPid.toLowerCase() : '';
          const cleanResName = resolvedName ? resolvedName.toLowerCase() : '';
          const matchId = cleanResPid && pPid && (pPid === cleanResPid || pPid === cleanResName);
          const matchName = cleanResName && pName && (pName === cleanResName || pName === cleanResPid);
          return matchId || matchName;
        });

        matchingPoItems.forEach((pItem) => {
          const pItemSpec = String(pItem.specification || pItem['規格'] || '').trim();
          const targetSpec = resolvedSpec && resolvedSpec !== '__FORCED__' ? resolvedSpec : spec;
          let matchSpec = false;

          if (!targetSpec) {
            matchSpec = !pItemSpec || matchingPoItems.length === 1;
          } else {
            if (pItemSpec && (pItemSpec.toLowerCase() === targetSpec.toLowerCase() || smartMatchSpec(pItemSpec, [targetSpec]))) {
              matchSpec = true;
            } else if (!pItemSpec && matchingPoItems.length === 1) {
              matchSpec = true;
            }
          }

          if (matchSpec) {
            const ordered = Number(pItem.ordered_quantity ?? pItem.order_quantity ?? pItem.quantity ?? pItem['採購數量'] ?? pItem['訂購數量'] ?? 0);
            const received = Number(pItem.received_quantity ?? pItem.delivered_quantity ?? pItem['已到貨數量'] ?? pItem['已收數量'] ?? 0);
            const pending = Math.max(0, ordered - received);
            if (pending > 0) inTransitPO += pending;
          }
        });
      });

      return {
        idx,
        product_id: resolvedPid,
        name: resolvedName,
        specification: spec,
        resolvedSpec,
        isAutoMatched,
        isFoundInStock,
        availableSpecs,
        specStockMap,
        quantity: qty,
        costPrice,
        existingStock,
        inTransitPO
      };
    });

    // 核心財務計算 (公式嚴格落實)
    // 真實淨利 = 實際入帳金額 - 平台手續費 - 總進價成本
    // 實賺淨利率 = (真實淨利 ÷ 實際入帳金額) × 100%
    const realProfit = actualIncome - platformFee - totalCost;
    const profitRate = actualIncome > 0 ? (realProfit / actualIncome) * 100 : 0;

    // 出貨狀態判定 (優先以試算表 onlineOrders 存在性判定)
    const isOrderInCloud = matchingRows.length > 0;
    const isShippedInLocal = Boolean(state.shippedOrders[orderId]);
    // 只有當本地已出貨，且雲端已找不到該單時，才視為已出貨完畢；若雲端重新出現，自動恢復出貨狀態！
    const isShipped = isShippedInLocal && !isOrderInCloud;
    const isReimported = isShippedInLocal && isOrderInCloud;

    return {
      orderId,
      actualIncome,
      platformFee,
      totalCost,
      realProfit,
      profitRate,
      items,
      isOrderInCloud,
      isShipped,
      isReimported
    };
  }

  // 8. 視覺化元素選取器 (Visual Element Picker)
  let activePickerTarget = null;
  let pickerOverlay = null;

  function startElementPicker(targetField) {
    activePickerTarget = targetField;
    state.isOpen = false;
    render();

    // 建立反白覆蓋框
    pickerOverlay = document.createElement('div');
    pickerOverlay.style.position = 'fixed';
    pickerOverlay.style.zIndex = '2147483645';
    pickerOverlay.style.border = '2px dashed #3b82f6';
    pickerOverlay.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
    pickerOverlay.style.pointerEvents = 'none';
    pickerOverlay.style.transition = 'all 0.05s ease';
    pickerOverlay.style.borderRadius = '4px';

    const tooltip = document.createElement('div');
    tooltip.style.position = 'absolute';
    tooltip.style.top = '-28px';
    tooltip.style.left = '0';
    tooltip.style.backgroundColor = '#0f172a';
    tooltip.style.border = '1px solid #3b82f6';
    tooltip.style.color = '#38bdf8';
    tooltip.style.padding = '3px 8px';
    tooltip.style.borderRadius = '4px';
    tooltip.style.fontSize = '12px';
    tooltip.style.fontWeight = 'bold';
    tooltip.style.whiteSpace = 'nowrap';
    tooltip.innerText = `🎯 點選【${targetField === 'incomeSelector' ? '實際入帳金額' : targetField === 'feeSelector' ? '平台手續費' : '訂單編號'}】(按 ESC 取消)`;
    pickerOverlay.appendChild(tooltip);
    document.body.appendChild(pickerOverlay);

    const onMouseMove = (e) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || host.contains(el) || el === pickerOverlay || pickerOverlay.contains(el)) return;
      const rect = el.getBoundingClientRect();
      pickerOverlay.style.top = `${rect.top}px`;
      pickerOverlay.style.left = `${rect.left}px`;
      pickerOverlay.style.width = `${rect.width}px`;
      pickerOverlay.style.height = `${rect.height}px`;
    };

    const onClick = (e) => {
      e.preventDefault();
      e.stopPropagation();

      const el = document.elementFromPoint(e.clientX, e.clientY);
      const target = activePickerTarget; // 關鍵修復：在 cleanup 前先暫存目標欄位！
      cleanup();

      if (el && !host.contains(el) && target) {
        const selector = generateOptimalSelector(el);
        if (selector) {
          if (!state.platformSelectors[currentPlatform]) {
            state.platformSelectors[currentPlatform] = {};
          }
          state.platformSelectors[currentPlatform][target] = selector;
          chrome.storage.local.set({ platformSelectors: state.platformSelectors });

          // 若選取的是訂單編號，立刻執行一次辨識
          if (target === 'orderIdSelector') {
            detectOrderId(true);
          }
        }
      }

      state.isOpen = true;
      state.currentTab = 'settings'; // 保持在設定分頁，讓使用者親眼看見填入與預覽結果！
      render();
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        cleanup();
        state.isOpen = true;
        state.currentTab = 'settings';
        render();
      }
    };

    function cleanup() {
      document.removeEventListener('mousemove', onMouseMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKeyDown, true);
      if (pickerOverlay && pickerOverlay.parentNode) {
        pickerOverlay.parentNode.removeChild(pickerOverlay);
      }
      pickerOverlay = null;
      activePickerTarget = null;
    }

    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
  }

  // 產生穩定、不易受賣場動態雜湊影響的 CSS Selector
  function generateOptimalSelector(el) {
    if (!el || el === document.body) return '';

    // 1. 若有穩定 ID (不含長數字或隨機碼)
    if (el.id && !el.id.match(/\d{5,}/) && !el.id.match(/^[a-z0-9_-]{15,}$/i)) {
      return `#${CSS.escape(el.id)}`;
    }

    // 2. 檢查測試與標籤屬性 (data-qa, data-testid, etc.)
    const testAttrs = ['data-qa', 'data-testid', 'data-cy', 'aria-label', 'name'];
    for (const attr of testAttrs) {
      if (el.hasAttribute(attr)) {
        return `[${attr}="${CSS.escape(el.getAttribute(attr))}"]`;
      }
    }

    // 3. 向上遍歷 DOM 樹建立路徑
    const path = [];
    let current = el;
    while (current && current !== document.body && current !== document.documentElement && path.length < 5) {
      let selector = current.nodeName.toLowerCase();

      // 檢查是否有含義穩定的 class (排除動態 hash 如 _3k91j, css-1234 等)
      if (current.className && typeof current.className === 'string') {
        const validClasses = current.className
          .split(/\s+/)
          .filter((c) => {
            if (!c) return false;
            if (c.match(/active|hover|focus|selected/i)) return false;
            if (c.match(/^css-[a-z0-9]+/i)) return false;
            if (c.match(/^_[a-zA-Z0-9]{5,}/)) return false; // 蝦皮常見動態混淆類名
            if (c.match(/^[a-zA-Z0-9]{7,}$/)) return false; // 純隨機字串
            return true;
          })
          .slice(0, 2);

        if (validClasses.length > 0) {
          selector += '.' + validClasses.map((c) => CSS.escape(c)).join('.');
        }
      }

      // 如果有兄弟節點且沒有 class，加上 nth-of-type
      if (current.parentElement) {
        const siblings = Array.from(current.parentElement.children).filter(
          (s) => s.nodeName === current.nodeName
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }

      path.unshift(selector);

      // 若當前節點已具備唯一 ID，可提前停止
      if (current.id && !current.id.match(/\d{5,}/)) {
        path[0] = `#${CSS.escape(current.id)}`;
        break;
      }

      current = current.parentElement;
    }

    return path.join(' > ');
  }

  // 9. 出貨黃金三部曲 (嚴格比對 APP 的 Home.tsx 出貨邏輯)
  async function handleExecuteShipment(analysis) {
    if (state.isShipping) return;
    const orderId = analysis.orderId;
    if (!orderId) {
      alert('⚠️ 未設定訂單編號，無法出貨！請先於上方輸入或抓取訂單編號。');
      return;
    }

    if (!analysis.items || analysis.items.length === 0) {
      alert('⚠️ 試算表「網路訂單」中目前查無此訂單品項！\n\n請確認單號是否完全相符，或點右上角 🔄 重新同步試算表後再出貨。');
      return;
    }

    // 檢查是否有未在 stock 庫存表建檔且無在途採購之商品
    const unrecordedItems = analysis.items.filter((i) => !i.isFoundInStock && i.inTransitPO <= 0);
    const inTransitPendingItems = analysis.items.filter((i) => i.existingStock < i.quantity && i.inTransitPO > 0);
    const regularShortageItems = analysis.items.filter((i) => i.isFoundInStock && i.existingStock < i.quantity && i.inTransitPO <= 0);

    if (unrecordedItems.length > 0) {
      const namesList = unrecordedItems.map((i) => `• [${i.product_id || '無編號'}] ${i.name}`).join('\n');
      const confirmUnrecorded = confirm(
        `⚠️ 警告提示：此訂單包含 ${unrecordedItems.length} 項【未在庫存表 (stock) 建檔且無在途採購】的商品：\n\n${namesList}\n\n出貨將無法扣除該項目的真實庫存！是否確認要【強行出貨】？\n（系統將自動標記為缺貨出貨並從試算表扣除與刪除網路訂單）`
      );
      if (!confirmUnrecorded) return;
    } else if (inTransitPendingItems.length > 0) {
      const namesList = inTransitPendingItems.map((i) => `• [${i.product_id || '無編號'}] ${i.name} (現存 ${i.existingStock} 件，在途 +${i.inTransitPO} 件)`).join('\n');
      const confirmInTransit = confirm(
        `🚚 提示：此訂單包含 ${inTransitPendingItems.length} 項【採購在途 (尚未到貨入庫)】的商品：\n\n${namesList}\n\n商品尚未到貨入庫，是否確認要【強行出貨】？\n（系統將標記為缺貨出貨並從試算表刪除網路訂單）`
      );
      if (!confirmInTransit) return;
    } else if (regularShortageItems.length > 0) {
      const confirmForced = confirm(
        `⚠️ 警告：此訂單包含 ${regularShortageItems.length} 項缺貨之商品！\n是否確認要【強行出貨】？\n（系統將自動標記為缺貨出貨並從試算表扣除與刪除網路訂單）`
      );
      if (!confirmForced) return;
    }

    state.isShipping = true;
    state.shippingStatusText = '⚡ 秒級出貨中 (扣庫存與結案)...';
    render();

    try {
      // 步驟 1: 極速秒級出貨方案 (直接使用記憶體中已核對呈現之 stock 與 products，杜絕出貨前再次發送 4 個 GET 請求)
      const currentProducts = state.cloudData.products || [];
      const currentStock = state.cloudData.stock || [];
      const currentOrders = state.cloudData.onlineOrders || [];

      // 冪等性防護：若本地紀錄中已結案，直接標記為出貨完成
      const cleanCurrentOrderId = orderId.replace(/[^0-9a-zA-Z_-]/g, '').toLowerCase();
      if (state.shippedOrders[orderId]) {
        state.shippingSuccess = true;
        state.isShipping = false;
        state.shippingStatusText = '';
        render();
        alert(`✅ 本地紀錄確認此訂單已完成出貨與銷帳！`);
        return;
      }

      const cleanOrderId = orderId.replace(/[^a-zA-Z0-9_-]/g, '_');
      const orderTxId = `TX_ORD_${cleanOrderId}`;

      // 格式化日期時間：yyyy/M/d  HH:mm:ss (24H制，雙空格)
      const formatAppDateTime = (d = new Date()) => {
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        const day = d.getDate();
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');
        return `${y}/${m}/${day}  ${hh}:${mm}:${ss}`;
      };
      const nowStr = formatAppDateTime(new Date());

      // 步驟 2: 一次性計算打包所有品項的扣庫存項目
      const batchItems = [];

      for (let itemIdx = 0; itemIdx < analysis.items.length; itemIdx++) {
        const item = analysis.items[itemIdx];
        let remainingNeeded = Number(item.quantity) || 1;
        const targetPid = String(item.product_id || '').trim().toLowerCase();
        const itemSpec = item.specification ? String(item.specification).trim() : '';
        const targetSpecToDeduct = item.resolvedSpec !== undefined ? item.resolvedSpec : itemSpec;

        // 篩選出該商品所有庫存批次，並依效期排序 (FIFO: 效期早者優先出貨)
        const productStock = (targetSpecToDeduct === '__FORCED__') ? [] : currentStock.filter((s) => {
          const sPid = String(s.product_id || '').trim().toLowerCase();
          const sName = String(s.name || '').trim().toLowerCase();
          const pidMatch = targetPid ? sPid === targetPid : (item.name && sName === item.name.toLowerCase());
          if (!pidMatch) return false;
          if (targetSpecToDeduct && s.specification) {
            return String(s.specification).trim().toLowerCase() === targetSpecToDeduct.toLowerCase();
          }
          return true;
        });

        const sortedStock = [...productStock].sort((a, b) => {
          if (!a.expiry_date) return 1;
          if (!b.expiry_date) return -1;
          return a.expiry_date.localeCompare(b.expiry_date);
        });

        const p = currentProducts.find((prod) => {
          const pPid = String(prod.product_id || '').trim().toLowerCase();
          const pName = String(prod.name || '').trim().toLowerCase();
          return (targetPid && pPid === targetPid) || (item.name && pName === item.name.toLowerCase());
        });
        const itemCostPrice = p ? Number(p.cost_price) || 0 : item.costPrice || 0;
        let deductIdx = 0;

        // 依批次加入待扣除清單
        if (sortedStock.length > 0) {
          for (const entry of sortedStock) {
            if (remainingNeeded <= 0) break;
            const currentQty = Number(entry.quantity) || 0;
            const deductQty = Math.min(currentQty, remainingNeeded);
            if (deductQty <= 0) continue;

            const rowUniqueId = `${orderTxId}_${itemIdx}_${deductIdx}_${Math.random().toString(36).substring(2, 6)}`;
            const noteSpecText = targetSpecToDeduct && targetSpecToDeduct !== itemSpec
              ? ` | 規格對應: [${itemSpec || '無'}]->[${targetSpecToDeduct}]`
              : '';

            batchItems.push({
              id: rowUniqueId,
              transaction_id: orderTxId,
              online_order_id: orderId,
              platform: platformLabel,
              type: `stock_out ${platformLabel}`,
              stock_id: entry.stock_id,
              product_id: item.product_id || p?.product_id || entry.product_id || '',
              product_name: item.name || p?.name || entry.name || '',
              name: item.name || p?.name || entry.name || '',
              cost_price: itemCostPrice,
              price: 0,
              quantity: deductQty,
              location: entry.location || '',
              floor: entry.floor || '',
              area: entry.area || '',
              expiry_date: entry.expiry_date,
              specification: targetSpecToDeduct !== '__FORCED__' ? (targetSpecToDeduct || entry.specification || item.specification || '') : (item.specification || ''),
              date: nowStr,
              note: `網路訂單出貨 | 訂單號: ${orderId}${noteSpecText} | 平台: ${platformLabel}`
            });

            remainingNeeded -= deductQty;
            deductIdx++;
          }
        }

        // 若庫存不足或非系統商品，強行出貨剩餘件數 (註記缺貨)
        if (remainingNeeded > 0) {
          const rowUniqueId = `${orderTxId}_${itemIdx}_forced_${deductIdx}_${Math.random().toString(36).substring(2, 6)}`;
          batchItems.push({
            id: rowUniqueId,
            transaction_id: orderTxId,
            online_order_id: orderId,
            platform: platformLabel,
            type: `stock_out ${platformLabel}`,
            product_id: item.product_id || p?.product_id || '',
            product_name: item.name || p?.name || '',
            name: item.name || p?.name || '',
            cost_price: itemCostPrice,
            price: 0,
            quantity: remainingNeeded,
            location: '',
            floor: '',
            area: '',
            specification: item.specification || '',
            date: nowStr,
            note: `[強行出貨-缺貨紀錄] 網路訂單出貨 | 訂單號: ${orderId} | 平台: ${platformLabel}`
          });
        }
      }

      // 步驟 3: 單一 HTTP POST 請求執行雲端批次出貨 (扣庫存 + 寫交易明細 + 刪除網路訂單)
      state.shippingStatusText = '🚀 雲端單一請求批次銷帳中...';
      render();

      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
          {
            type: 'EXECUTE_BATCH_SHIPMENT',
            gasUrl: state.gasUrl,
            payload: {
              order_id: orderId,
              platform: platformLabel,
              items: batchItems
            }
          },
          (res) => (res && res.success ? resolve(res) : reject(new Error(res?.error || '批次出貨失敗')))
        );
      });

      // 步驟 4: 極速樂觀更新（秒級體感核心）
      // A. 本地庫存即時扣除對應數量，使用者無需等待試算表重新讀取
      if (Array.isArray(state.cloudData.stock)) {
        for (const bItm of batchItems) {
          const qtyToDeduct = Number(bItm.quantity) || 0;
          if (qtyToDeduct <= 0) continue;
          if (bItm.stock_id) {
            const stockRow = state.cloudData.stock.find((s) => s.stock_id === bItm.stock_id);
            if (stockRow) {
              stockRow.quantity = Math.max(0, (Number(stockRow.quantity) || 0) - qtyToDeduct);
            }
          } else if (bItm.product_id) {
            const stockRow = state.cloudData.stock.find(
              (s) => String(s.product_id || '').trim().toLowerCase() === String(bItm.product_id || '').trim().toLowerCase()
            );
            if (stockRow) {
              stockRow.quantity = Math.max(0, (Number(stockRow.quantity) || 0) - qtyToDeduct);
            }
          }
        }
        // 清理數量已歸零的庫存記錄
        state.cloudData.stock = state.cloudData.stock.filter((s) => (Number(s.quantity) || 0) > 0);
      }

      // B. 從記憶體中的 onlineOrders 立即移除該訂單
      state.cloudData.onlineOrders = state.cloudData.onlineOrders.filter((o) => {
        const oId = String(o.order_id || o['訂單編號'] || '').trim().replace(/[^0-9a-zA-Z_-]/g, '').toLowerCase();
        return oId !== cleanCurrentOrderId;
      });

      // C. 寫入本地已出貨紀錄與儲存快取
      state.shippedOrders[orderId] = new Date().toISOString();
      chrome.storage.local.set({
        shippedOrders: state.shippedOrders,
        cachedCloudData: state.cloudData
      });

      // D. 立即切換為出貨成功，耗時僅需 2~3 秒！
      state.shippingSuccess = true;
      state.isShipping = false;
      state.shippingStatusText = '';
      render();

      // E. 背景延遲靜默同步 (10 秒後在背景溫和更新，避免阻塞下一筆出貨)
      setTimeout(() => {
        if (!state.isShipping) {
          silentRefreshCloudData(false);
        }
      }, 10000);
    } catch (err) {
      alert(`❌ 出貨失敗: ${err.message}\n\n系統將自動重新同步試算表最新狀態。`);
      silentRefreshCloudData();
    } finally {
      state.isShipping = false;
      state.shippingStatusText = '';
      render();
    }
  }

  // 重設出貨狀態 (給使用者手動覆蓋的彈性)
  function handleResetShipStatus(orderId) {
    if (!orderId) return;
    delete state.shippedOrders[orderId];
    chrome.storage.local.set({ shippedOrders: state.shippedOrders });
    state.shippingSuccess = false;
    // 立即向試算表重新抓取最新資料（以恢復被本地樂觀更新移出的品項）
    silentRefreshCloudData();
    render();
  }

  // 10. 渲染介面 (HTML 模板建構)
  function render() {
    const analysis = getOrderAnalysis();
    const selectors = state.platformSelectors[currentPlatform] || {};

    let contentHtml = '';

    if (state.currentTab === 'settings') {
      const incomePreview = previewScrapeResult('incomeSelector', selectors.incomeSelector);
      const feePreview = previewScrapeResult('feeSelector', selectors.feeSelector);
      const orderIdPreview = previewScrapeResult('orderIdSelector', selectors.orderIdSelector);

      contentHtml = `
        <div class="settings-view">
          <div class="settings-card">
            <div class="settings-title">🔗 後端 Google Apps Script 連線設定</div>
            <div class="form-group">
              <label class="form-label">Web App URL (即 APP 後端部屬網址)</label>
              <input type="text" id="cfg-gas-url" class="form-input" value="${escapeHtml(state.gasUrl)}" placeholder="https://script.google.com/macros/s/.../exec" />
            </div>
            <div style="display: flex; gap: 8px;">
              <button id="btn-test-gas" class="btn-secondary" style="flex: 1;">🧪 測試連線</button>
              <button id="btn-save-gas" class="btn-primary" style="flex: 1;">💾 儲存網址</button>
            </div>
            <div id="gas-test-result" style="font-size: 11px; margin-top: 4px;"></div>
          </div>

          <div class="settings-card">
            <div class="settings-title">🎯 ${platformLabel} - 網頁元素選取器設定</div>
            <div style="font-size: 11px; color: #94a3b8;">
              點擊「🎯 選取」後，滑鼠移動到賣場網頁上對應的文字點一下，即可自動鎖定並即時預覽！
            </div>

            <!-- 訂單編號選取器 -->
            <div class="form-group">
              <label class="form-label">🏷️ 訂單編號 CSS Selector</label>
              <div class="selector-input-row">
                <input type="text" id="cfg-orderid-sel" class="form-input" value="${escapeHtml(selectors.orderIdSelector || '')}" placeholder="例如: .order-sn, #order_id" />
                <button class="btn-pick" data-pick="orderIdSelector">🎯 選取</button>
              </div>
              <div class="selector-preview-badge ${orderIdPreview.found ? 'success' : 'muted'}">
                👁️ 網頁抓取預覽：${escapeHtml(orderIdPreview.text)}
              </div>
            </div>

            <!-- 實際入帳金額選取器 -->
            <div class="form-group">
              <label class="form-label">💵 實際入帳金額 CSS Selector</label>
              <div class="selector-input-row">
                <input type="text" id="cfg-income-sel" class="form-input" value="${escapeHtml(selectors.incomeSelector || '')}" placeholder="例如: .income-amount, #net-payout" />
                <button class="btn-pick" data-pick="incomeSelector">🎯 選取</button>
              </div>
              <div class="selector-preview-badge ${incomePreview.found ? 'success' : 'muted'}">
                👁️ 網頁抓取預覽：${escapeHtml(incomePreview.text)}
              </div>
            </div>

            <!-- 平台手續費選取器 -->
            <div class="form-group">
              <label class="form-label">📉 平台手續費 CSS Selector</label>
              <div class="selector-input-row">
                <input type="text" id="cfg-fee-sel" class="form-input" value="${escapeHtml(selectors.feeSelector || '')}" placeholder="例如: .fee-total, #service-fee" />
                <button class="btn-pick" data-pick="feeSelector">🎯 選取</button>
              </div>
              <div class="selector-preview-badge ${feePreview.found ? 'success' : 'muted'}">
                👁️ 網頁抓取預覽：${escapeHtml(feePreview.text)}
              </div>
            </div>

            <button id="btn-save-selectors" class="btn-primary" style="width: 100%; margin-top: 6px;">💾 儲存此平台選取器</button>
          </div>

          <!-- 浮動按鈕位置設定 -->
          <div class="settings-card">
            <div class="settings-title">📍 浮動展開按鈕位置 (防止遮擋網頁重要按鈕)</div>
            <div style="font-size: 11px; color: #94a3b8; margin-bottom: 8px;">
              提示：您也可以在網頁上直接<b>「按住浮動按鈕 ⠿ 上下拖曳」</b>至任意高度（或拖到左側邊緣）。
            </div>
            <div style="display: flex; gap: 6px; flex-wrap: wrap;">
              <button class="btn-pos-preset" data-pos="top-right">靠右上 (20%)</button>
              <button class="btn-pos-preset" data-pos="mid-right">靠右中 (38%)</button>
              <button class="btn-pos-preset" data-pos="bottom-right">靠右下 (70%)</button>
              <button class="btn-pos-preset" data-pos="mid-left">靠左中 (38%)</button>
              <button class="btn-pos-preset" data-pos="reset">🔄 恢復預設</button>
            </div>
          </div>

          <div style="text-align: center;">
            <button id="btn-back-main" class="btn-secondary" style="width: 100%;">⬅️ 返回利潤與出貨看板</button>
          </div>
        </div>
      `;
    } else {
      // 主頁面看板
      const isNegative = analysis.realProfit <= 0;
      const profitRateFormatted = (analysis.profitRate || 0).toFixed(1);

      contentHtml = `
        <!-- 訂單識別與手動編輯欄位 (雙軌：支援自動抓取與手動貼上) -->
        <div class="order-banner">
          <div style="width: 100%;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span class="platform-badge">${platformLabel}</span>
              <button class="btn-xs" id="btn-re-scrape-order" title="使用設定的選取器重新從網頁抓取">🎯 網頁抓取單號</button>
            </div>
            <div class="order-id-input-group">
              <span style="font-size: 11px; color: #94a3b8; font-weight: 600; white-space: nowrap;">訂單編號：</span>
              <input type="text" id="main-order-id-input" class="order-id-input" value="${escapeHtml(state.currentOrderId)}" placeholder="輸入/貼上訂單號，或點網頁抓取" />
            </div>
          </div>
        </div>

        ${
          analysis.isReimported
            ? `<div class="alert-box warning" style="margin-top: -6px;">
                 <span>ℹ️ 提示：偵測到此單在試算表中重新匯入，已自動解除鎖定，允許再次出貨。</span>
               </div>`
            : ''
        }

        ${
          !state.gasUrl
            ? `<div class="alert-box warning">
                 <span>⚠️ 尚未設定 Google Apps Script Web App URL，請點擊右上角 ⚙️ 設定！</span>
               </div>`
            : ''
        }

        <!-- 財務利潤重點看板 (嚴格不顯示總售價) -->
        <div class="profit-hero-card ${isNegative ? 'negative' : ''}">
          <div>
            <div class="profit-title">⭐ 真實淨利</div>
            <div class="profit-amount">$${Math.round(analysis.realProfit).toLocaleString()}</div>
          </div>
          <div class="profit-rate-badge">
            📈 實賺淨利率 ${profitRateFormatted}%
          </div>
        </div>

        <!-- 財務拆解小卡格 (3格) -->
        <div class="finance-breakdown-grid">
          <div class="finance-box">
            <div class="finance-box-label">💵 實際入帳</div>
            <div class="finance-box-val income">$${Math.round(analysis.actualIncome).toLocaleString()}</div>
          </div>
          <div class="finance-box">
            <div class="finance-box-label">📉 平台手續費</div>
            <div class="finance-box-val fee">-$${Math.round(analysis.platformFee).toLocaleString()}</div>
          </div>
          <div class="finance-box">
            <div class="finance-box-label">📦 總進價成本</div>
            <div class="finance-box-val cost">-$${Math.round(analysis.totalCost).toLocaleString()}</div>
          </div>
        </div>

        <!-- 訂單品項與庫存/採購核對 -->
        <div class="section-title">
          <span>📦 訂單商品品項 (${analysis.items.length})</span>
          <span style="font-size: 10px; color: #64748b;">(勾選防呆包裝)</span>
        </div>

        <div class="items-list">
          ${
            analysis.items.length === 0
              ? `<div style="text-align: center; color: #64748b; padding: 18px 12px; font-size: 12px; background: #1e293b; border-radius: 8px; line-height: 1.6;">
                   ${
                     analysis.orderId
                       ? `雲端試算表「網路訂單」中目前無單號 <strong style="color: #38bdf8;">#${escapeHtml(analysis.orderId)}</strong> 的品項。<br/><span style="font-size: 11px; color: #94a3b8;">（請確認單號是否完全相符，或點右上角 🔄 重新同步試算表）</span>`
                       : '請於上方輸入訂單編號，或點擊「🎯 網頁抓取單號」'
                   }
                 </div>`
              : analysis.items
                  .map((item) => {
                    const checkKey = `${analysis.orderId}_${item.idx}`;
                    const isChecked = Boolean(state.checkedItems[checkKey]);

                    // 庫存健康度燈號
                    let badgeClass = 'green';
                    let badgeText = `🟢 現貨充足 (${item.existingStock}件)`;

                    if (item.existingStock >= item.quantity) {
                      badgeClass = 'green';
                      badgeText = `🟢 現貨充足 (${item.existingStock}件)`;
                    } else if (item.inTransitPO > 0) {
                      if (item.existingStock + item.inTransitPO >= item.quantity) {
                        badgeClass = 'yellow';
                        badgeText = item.existingStock > 0
                          ? `🟡 現貨不足 (在途採購 +${item.inTransitPO} 件已補齊)`
                          : `🟡 現貨 0 件 (在途採購 +${item.inTransitPO} 件已補齊)`;
                      } else {
                        const shortfall = item.quantity - item.existingStock - item.inTransitPO;
                        badgeClass = 'red';
                        badgeText = `🔴 缺貨 ${shortfall} 件 (在途僅 +${item.inTransitPO} 件仍不足)`;
                      }
                    } else if (!item.isFoundInStock) {
                      badgeClass = 'red';
                      badgeText = `🔴 未在庫存表建檔 (現存 0件)`;
                    } else {
                      const shortfall = item.quantity - item.existingStock;
                      badgeClass = 'red';
                      badgeText = `🔴 缺貨預警 (現存 ${item.existingStock} 件，無在途採購)`;
                    }

                    return `
                      <div class="item-card ${isChecked ? 'checked' : ''}" data-idx="${item.idx}">
                        <div class="item-main-row">
                          <input type="checkbox" class="item-checkbox" data-check-key="${checkKey}" ${isChecked ? 'checked' : ''} />
                          <div class="item-details">
                            <div class="item-name">${escapeHtml(item.name)}</div>
                            ${item.product_id ? `<div style="font-size: 11px; color: #38bdf8; font-family: monospace; font-weight: 600; margin-top: 1px;">編號: #${escapeHtml(item.product_id)}</div>` : ''}
                            ${item.specification ? `<div class="item-spec">賣場訂單規格: <span class="spec-highlight">${escapeHtml(item.specification)}</span></div>` : ''}
                            <div style="font-size: 11px; margin-top: 4px; display: flex; justify-content: space-between;">
                              <span>需求數量: <span class="item-qty-tag">${item.quantity} 件</span></span>
                              <span style="color: #fbbf24;">進價: $${item.costPrice}</span>
                            </div>
                          </div>
                        </div>

                        ${
                          item.inTransitPO > 0 && item.existingStock < item.quantity
                            ? `<div style="font-size: 11px; color: #38bdf8; background: rgba(56, 189, 248, 0.12); border: 1px solid rgba(56, 189, 248, 0.35); border-radius: 6px; padding: 6px 8px; margin-top: 6px; line-height: 1.4;">
                                 🚚 <strong>採購在途補貨中</strong>：已有採購單待入庫 <strong>+${item.inTransitPO} 件</strong>（現存 ${item.existingStock} 件，待到貨入庫後即可出貨）
                               </div>`
                            : !item.isFoundInStock
                            ? `<div style="font-size: 11px; color: #f87171; background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.35); border-radius: 6px; padding: 6px 8px; margin-top: 6px; line-height: 1.4;">
                                 ⚠️ stock 庫存現存 0 件且無在途採購，請先建立採購單或至庫存表建檔
                               </div>`
                            : (item.isAutoMatched && item.resolvedSpec)
                            ? `<div class="spec-match-container" style="background: rgba(15, 23, 42, 0.4); border-color: rgba(56, 189, 248, 0.2); margin-top: 6px;">
                                 <div class="spec-match-label-row">
                                   <span class="spec-match-label">🎯 扣減庫存：</span>
                                   <span class="spec-match-badge auto">⚡ 自動鎖定現貨</span>
                                 </div>
                                 <div style="font-size: 11px; color: #94a3b8; margin-top: 3px;">
                                   規格：<span style="color: #38bdf8; font-weight: 600;">${escapeHtml(item.resolvedSpec)}</span> (現存: ${item.existingStock} 件)
                                 </div>
                               </div>`
                            : `<!-- 規格選擇與缺貨下拉選單 -->
                               <div class="spec-match-container">
                                 <div class="spec-match-label-row">
                                   <span class="spec-match-label">🎯 扣減庫存規格：</span>
                                   ${
                                     item.resolvedSpec && item.resolvedSpec !== '__FORCED__'
                                       ? `<span class="spec-match-badge manual">✍️ 手動指定</span>`
                                       : item.resolvedSpec === '__FORCED__'
                                       ? `<span class="spec-match-badge forced">⚠️ 缺貨強出</span>`
                                       : item.specification
                                       ? `<span class="spec-match-badge warn">⚠️ [${escapeHtml(item.specification)}] 缺貨中</span>`
                                       : `<span class="spec-match-badge warn">⚠️ 請選擇規格</span>`
                                   }
                                 </div>
                                 <select class="spec-select" data-spec-key="${checkKey}">
                                   ${
                                     !item.resolvedSpec
                                       ? `<option value="" selected>-- ⚠️ 訂單規格 ${item.specification ? `[${escapeHtml(item.specification)}] 缺貨中 (0件)` : '請點選要扣減的庫存規格'} --</option>`
                                       : ''
                                   }
                                   ${item.availableSpecs
                                     .map((s) => {
                                       const sQty = item.specStockMap[s] || 0;
                                       const isSel = item.resolvedSpec && item.resolvedSpec.toLowerCase() === s.toLowerCase();
                                       return `<option value="${escapeHtml(s)}" ${isSel ? 'selected' : ''}>${escapeHtml(s)} (現存: ${sQty}件)</option>`;
                                     })
                                     .join('')}
                                   <option value="__FORCED__" ${item.resolvedSpec === '__FORCED__' ? 'selected' : ''}>⚠️ 強行出貨 (不扣規格庫存)</option>
                                 </select>
                               </div>`
                        }

                        <div class="stock-status-bar">
                          <span class="status-badge ${badgeClass}">${badgeText}</span>
                          ${
                            item.inTransitPO > 0
                              ? `<span class="po-transit-badge active">🚚 已採購在途: +${item.inTransitPO} 件</span>`
                              : `<span class="po-transit-badge none">無在途採購</span>`
                          }
                        </div>
                      </div>
                    `;
                  })
                  .join('')
          }
        </div>
      `;
    }

    // 抽屜底部出貨按鈕區
    let footerHtml = '';
    if (state.currentTab === 'main') {
      if (analysis.isShipped) {
        footerHtml = `
          <button class="btn-ship-success" disabled>
            ✅ 出貨成功，庫存已扣除
          </button>
          <div class="reset-ship-link" id="btn-reset-ship">
            🔄 重設出貨狀態（允許再次出貨）
          </div>
        `;
      } else {
        footerHtml = `
          <button id="btn-do-ship" class="btn-ship" ${state.isShipping || !analysis.orderId || analysis.items.length === 0 ? 'disabled' : ''}>
            ${state.isShipping ? `<div class="spinner"></div> ${escapeHtml(state.shippingStatusText || '出貨處理中，扣除庫存...')}` : '🚀 執行出貨 (同步扣庫存與刪除訂單)'}
          </button>
        `;
      }
    }

    // 組裝整體 Drawer 面板
    const isDockLeft = state.togglePos.side === 'left';
    const topStyle = state.togglePos.isPercent ? `${state.togglePos.top}%` : `${state.togglePos.top}px`;

    container.innerHTML = `
      <!-- 浮動展開按鈕 (支援自由拖曳上下位置與左右側停靠，防止遮擋網頁重要按鈕) -->
      <div class="drawer-toggle-btn ${isDockLeft ? 'dock-left' : 'dock-right'}" 
           id="btn-drawer-toggle" 
           title="📦 點擊展開助手（按住 ⠿ 可上下自由拖曳更換位置）"
           style="display: ${state.isOpen ? 'none' : 'flex'}; top: ${topStyle};">
        <div class="drawer-drag-grip" title="按住可上下拖曳調整位置">⠿</div>
        <span>📦</span>
        <span>出貨</span>
        <span>利潤</span>
        ${analysis.orderId && analysis.items.length > 0 ? `<span class="drawer-toggle-badge">${analysis.items.length}件</span>` : ''}
      </div>

      <!-- 側邊抽屜主體 -->
      <div class="drawer-panel ${state.isOpen ? 'open' : ''}" id="drawer-main-panel" style="opacity: ${state.opacity};">
        <!-- 頂部 Header -->
        <div class="drawer-header">
          <div class="header-top-row">
            <div class="brand-title">
              <span>🛒</span>
              <span>賣場出貨與利潤助手</span>
              ${state.isSyncing ? '<div class="spinner" title="正在背景同步雲端試算表..."></div>' : ''}
            </div>
            <div class="header-actions">
              <button class="icon-btn" id="btn-refresh-cloud" title="立即同步試算表最新庫存">🔄</button>
              <button class="icon-btn" id="btn-toggle-settings" title="${state.currentTab === 'settings' ? '回主面板' : '設定選取器與 API'}">⚙️</button>
              <button class="icon-btn close" id="btn-close-drawer" title="收合面板">✖️</button>
            </div>
          </div>

          <!-- 透明度滑桿 -->
          <div class="opacity-control-row">
            <span>面板透明度</span>
            <input type="range" min="20" max="100" value="${Math.round(state.opacity * 100)}" class="opacity-slider" id="opacity-range" />
            <span id="opacity-label">${Math.round(state.opacity * 100)}%</span>
          </div>
        </div>

        <!-- 內容滾動區 -->
        <div class="drawer-body">
          ${contentHtml}
        </div>

        <!-- 底部出貨動作列 -->
        <div class="drawer-footer">
          ${footerHtml}
        </div>
      </div>
    `;

    // 綁定事件監聽
    bindEvents(analysis);
  }

  // 11. 綁定各項互動事件
  function bindEvents(analysis) {
    const mainPanel = shadow.getElementById('drawer-main-panel');

    // 滑鼠移入 100% 清晰，移出恢復透明度
    if (mainPanel) {
      mainPanel.addEventListener('mouseenter', () => {
        mainPanel.style.opacity = '1';
      });
      mainPanel.addEventListener('mouseleave', () => {
        mainPanel.style.opacity = String(state.opacity);
      });
    }

    // 展開/拖曳按鈕處理 (支援自由上下拖曳位置與左右停靠，防止誤觸面板)
    const toggleBtn = shadow.getElementById('btn-drawer-toggle');
    if (toggleBtn) {
      let isPointerDown = false;
      let hasDragged = false;
      let startY = 0;
      let startTopPx = 0;

      const handlePointerDown = (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        isPointerDown = true;
        hasDragged = false;
        startY = e.clientY || (e.touches && e.touches[0].clientY) || 0;
        const rect = toggleBtn.getBoundingClientRect();
        startTopPx = rect.top;

        const handlePointerMove = (moveEvt) => {
          if (!isPointerDown) return;
          const currentY = moveEvt.clientY || (moveEvt.touches && moveEvt.touches[0].clientY) || startY;
          const currentX = moveEvt.clientX || (moveEvt.touches && moveEvt.touches[0].clientX) || 0;
          const deltaY = currentY - startY;

          if (Math.abs(deltaY) > 5) {
            hasDragged = true;
            toggleBtn.classList.add('is-dragging');
          }

          if (hasDragged) {
            const btnHeight = toggleBtn.offsetHeight || 90;
            const maxTop = window.innerHeight - btnHeight - 10;
            const clampedTop = Math.max(10, Math.min(startTopPx + deltaY, maxTop));

            // 判斷是否拖曳換邊 (靠左或靠右)
            const side = currentX < (window.innerWidth / 2) ? 'left' : 'right';
            if (side !== state.togglePos.side) {
              state.togglePos.side = side;
              toggleBtn.classList.toggle('dock-left', side === 'left');
              toggleBtn.classList.toggle('dock-right', side === 'right');
            }

            toggleBtn.style.top = `${clampedTop}px`;
            state.togglePos.top = clampedTop;
            state.togglePos.isPercent = false;
          }
        };

        const handlePointerUp = () => {
          if (!isPointerDown) return;
          isPointerDown = false;
          toggleBtn.classList.remove('is-dragging');
          window.removeEventListener('mousemove', handlePointerMove);
          window.removeEventListener('mouseup', handlePointerUp);
          window.removeEventListener('touchmove', handlePointerMove);
          window.removeEventListener('touchend', handlePointerUp);

          if (hasDragged) {
            // 拖曳結束：儲存使用者設定的新位置
            chrome.storage.local.set({ togglePos: state.togglePos });
          } else {
            // 純點擊：開啟面板
            state.isOpen = true;
            chrome.storage.local.set({ isOpen: true });
            detectOrderId();
            render();
          }
        };

        window.addEventListener('mousemove', handlePointerMove, { passive: true });
        window.addEventListener('mouseup', handlePointerUp, { passive: true });
        window.addEventListener('touchmove', handlePointerMove, { passive: true });
        window.addEventListener('touchend', handlePointerUp, { passive: true });
      };

      toggleBtn.addEventListener('mousedown', handlePointerDown);
      toggleBtn.addEventListener('touchstart', handlePointerDown, { passive: true });
    }

    const closeBtn = shadow.getElementById('btn-close-drawer');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        state.isOpen = false;
        chrome.storage.local.set({ isOpen: false });
        render();
      });
    }

    // 透明度滑桿
    const opacitySlider = shadow.getElementById('opacity-range');
    const opacityLabel = shadow.getElementById('opacity-label');
    if (opacitySlider) {
      opacitySlider.addEventListener('input', (e) => {
        const val = Number(e.target.value) / 100;
        state.opacity = val;
        if (opacityLabel) opacityLabel.innerText = `${e.target.value}%`;
        chrome.storage.local.set({ opacity: val });
      });
    }

    // 同步雲端
    const refreshBtn = shadow.getElementById('btn-refresh-cloud');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        silentRefreshCloudData();
      });
    }

    // 主面板：手動修改/輸入訂單編號
    const orderInput = shadow.getElementById('main-order-id-input');
    if (orderInput) {
      orderInput.addEventListener('change', (e) => {
        const val = e.target.value.trim();
        state.currentOrderId = val;
        chrome.storage.local.set({ lastOrderId: val });
        render();
      });
      orderInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const val = e.target.value.trim();
          state.currentOrderId = val;
          chrome.storage.local.set({ lastOrderId: val });
          render();
        }
      });
    }

    // 主面板：從網頁重新抓取訂單編號
    const reScrapeBtn = shadow.getElementById('btn-re-scrape-order');
    if (reScrapeBtn) {
      reScrapeBtn.addEventListener('click', () => {
        const found = detectOrderId(true);
        if (found) {
          render();
        } else {
          alert('⚠️ 未能從網頁抓取到訂單編號，請確認【⚙️ 設定】中的「訂單編號 CSS Selector」是否已正確選取，或直接在文字框手動輸入！');
        }
      });
    }

    // 設定切換
    const toggleSettingsBtn = shadow.getElementById('btn-toggle-settings');
    if (toggleSettingsBtn) {
      toggleSettingsBtn.addEventListener('click', () => {
        state.currentTab = state.currentTab === 'settings' ? 'main' : 'settings';
        render();
      });
    }

    const backMainBtn = shadow.getElementById('btn-back-main');
    if (backMainBtn) {
      backMainBtn.addEventListener('click', () => {
        state.currentTab = 'main';
        render();
      });
    }

    // 執行出貨
    const doShipBtn = shadow.getElementById('btn-do-ship');
    if (doShipBtn) {
      doShipBtn.addEventListener('click', () => {
        handleExecuteShipment(analysis);
      });
    }

    // 重設出貨狀態
    const resetShipBtn = shadow.getElementById('btn-reset-ship');
    if (resetShipBtn) {
      resetShipBtn.addEventListener('click', () => {
        handleResetShipStatus(analysis.orderId);
      });
    }

    // 品項包裝核對打勾
    shadow.querySelectorAll('.item-checkbox').forEach((chk) => {
      chk.addEventListener('change', (e) => {
        const key = e.target.getAttribute('data-check-key');
        state.checkedItems[key] = e.target.checked;
        const card = e.target.closest('.item-card');
        if (card) {
          card.classList.toggle('checked', e.target.checked);
        }
      });
    });

    // 規格下拉選單變更事件 (選項 A: 即時切換並刷新庫存燈號與計算)
    shadow.querySelectorAll('.spec-select').forEach((sel) => {
      sel.addEventListener('change', (e) => {
        const key = e.target.getAttribute('data-spec-key');
        const chosen = e.target.value;
        state.selectedSpecs[key] = chosen;
        render();
      });
    });

    // 設定頁：儲存 GAS URL
    const saveGasBtn = shadow.getElementById('btn-save-gas');
    const gasInput = shadow.getElementById('cfg-gas-url');
    if (saveGasBtn && gasInput) {
      saveGasBtn.addEventListener('click', () => {
        state.gasUrl = gasInput.value.trim();
        chrome.storage.local.set({ gasUrl: state.gasUrl });
        alert('✅ Google Apps Script 網址已儲存！');
        silentRefreshCloudData();
      });
    }

    // 設定頁：測試 GAS 連線
    const testGasBtn = shadow.getElementById('btn-test-gas');
    const testResultEl = shadow.getElementById('gas-test-result');
    if (testGasBtn && testResultEl) {
      testGasBtn.addEventListener('click', () => {
        const url = (gasInput ? gasInput.value : state.gasUrl).trim();
        if (!url) {
          testResultEl.innerHTML = '<span style="color: #f87171;">❌ 請先輸入 Web App URL</span>';
          return;
        }
        testResultEl.innerHTML = '<span style="color: #38bdf8;">連線測試中...</span>';
        chrome.runtime.sendMessage({ type: 'TEST_GAS_CONNECTION', gasUrl: url }, (res) => {
          if (res && res.success) {
            testResultEl.innerHTML = `<span style="color: #34d399;">✅ 連線成功！商品檔讀取到 ${res.productCount} 筆商品</span>`;
          } else {
            testResultEl.innerHTML = `<span style="color: #f87171;">❌ 連線失敗: ${res?.error || '未知錯誤'}</span>`;
          }
        });
      });
    }

    // 設定頁：儲存 Selectors
    const saveSelectorsBtn = shadow.getElementById('btn-save-selectors');
    if (saveSelectorsBtn) {
      saveSelectorsBtn.addEventListener('click', () => {
        const incomeSel = shadow.getElementById('cfg-income-sel')?.value.trim() || '';
        const feeSel = shadow.getElementById('cfg-fee-sel')?.value.trim() || '';
        const orderIdSel = shadow.getElementById('cfg-orderid-sel')?.value.trim() || '';

        state.platformSelectors[currentPlatform] = {
          incomeSelector: incomeSel,
          feeSelector: feeSel,
          orderIdSelector: orderIdSel
        };
        chrome.storage.local.set({ platformSelectors: state.platformSelectors });
        alert(`✅ 已儲存 ${platformLabel} 的選取器！`);
        detectOrderId(true);
        state.currentTab = 'main';
        render();
      });
    }

    // 設定頁：啟動視覺化選取器 (🎯 選取)
    shadow.querySelectorAll('.btn-pick').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const targetField = e.currentTarget.getAttribute('data-pick');
        startElementPicker(targetField);
      });
    });

    // 設定頁：浮動按鈕快速位置切換
    shadow.querySelectorAll('.btn-pos-preset').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const pos = e.currentTarget.getAttribute('data-pos');
        if (pos === 'top-right') {
          state.togglePos = { top: 20, isPercent: true, side: 'right' };
        } else if (pos === 'mid-right') {
          state.togglePos = { top: 38, isPercent: true, side: 'right' };
        } else if (pos === 'bottom-right') {
          state.togglePos = { top: 70, isPercent: true, side: 'right' };
        } else if (pos === 'mid-left') {
          state.togglePos = { top: 38, isPercent: true, side: 'left' };
        } else if (pos === 'reset') {
          state.togglePos = { top: 38, isPercent: true, side: 'right' };
        }
        chrome.storage.local.set({ togglePos: state.togglePos });
        render();
      });
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();

