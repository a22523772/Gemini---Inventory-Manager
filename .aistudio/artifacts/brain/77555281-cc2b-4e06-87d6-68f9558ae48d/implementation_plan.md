# 擴充功能插件：獨立「訂單總覽抓取」選取器與分頁架構實作計畫

此計畫旨在重構 Chrome 擴充功能插件（Content Script）的設定架構，將「訂單總覽抓取設定」與「單筆訂單利潤與出貨設定」完全解耦為獨立分頁，並為訂單總覽頁面提供完整 8 項欄位選取器與視覺化點擊選取（🎯 選取）及即時抓取預覽功能。

---

### 使用者確認與決策摘要 (User Review & Confirmed Decisions)

> [!IMPORTANT]
> 依據前一輪討論與確認之決策事項：
> 1. **分頁劃分架構**：插件設定面板（⚙️）改為頂部次分頁切換「📥 訂單抓取設定」與「💰 利潤與出貨設定」，避免兩者混淆。
> 2. **選取器支援完整 8 大欄位**：
>    - 📦 訂單卡片容器 (`orderCardSelector`)
>    - 🏷️ 訂單編號 (`orderIdSelector`)
>    - 👤 買家名稱 (`customerNameSelector`)
>    - 💵 訂單金額 (`totalAmountSelector`)
>    - 🛍️ 商品品名 (`productNameSelector`)
>    - 🔖 商品規格 (`specificationSelector`)
>    - 🔢 購買數量 (`quantitySelector`)
>    - 🚚 物流方式 (`shippingMethodSelector`)
>    - ⏰ 最晚出貨期限 (`shippingDeadlineSelector`)
> 3. **預設規則策略**：預設留空，不強行套用靜態寫死類名，完全提供「🎯 選取」按鈕由使用者在當前賣場網頁視覺化點選並驗證。

---

## 1. 核心概念與運作模式 (Overview & Core Concept)

- **情境區隔**：
  - **訂單總覽頁面（如使用者截圖中之蝦皮待出貨清單）**：同時呈現多筆或單筆訂單摘要卡片，包含商品品名、規格（專用濾網 / 專用海綿）、數量、金額、物流與出貨期限。
  - **單筆訂單詳細頁面**：呈現單一訂單之手續費、撥款利潤明細。
- **目標流程**：
  1. 使用者在訂單總覽頁面開啟插件 ⚙️ 設定，切換至「📥 訂單抓取設定」。
  2. 使用者點擊「🎯 選取」依序點選網頁上的訂單卡片、單號、買家、品名、規格等，插件自動產生抗混淆 CSS Selector 並顯示抓取文字預覽。
  3. 點擊「💾 儲存此平台訂單抓取選取器」。
  4. 回到主面板點擊「📥 抓取訂單入庫」，系統嚴格依照使用者配置的選取器精確定位所有訂單卡片與其子商品列，不再發生未抓取成功或退回假單號的情況。

---

## 2. 使用者體驗與視覺設計 (User Experience & Visual Design)

### 2.1 設定面板分頁切換 (Settings Tab Navigation)
在抽屜設定面板頂部新增清晰的膠囊分頁按鈕：
```
┌────────────────────────────────────────────────────────┐
│ ⚙️ 網頁選取器與系統設定                                │
│ ┌──────────────────────────┬─────────────────────────┐ │
│ │  📥 訂單總覽抓取設定 (當前) │ 💰 單筆利潤與出貨設定    │ │
│ └──────────────────────────┴─────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

### 2.2 訂單總覽選取器表單 (Order Scraper Form)
每一項欄位皆配備：
- 欄位說明與圖示
- CSS Selector 輸入框
- 「🎯 選取」按鈕（點擊後啟動網頁元素高亮與點選器）
- 「👁️ 預覽抓取」標籤（顯示即時提取之文字）

欄位分組清單：
1. **訂單卡片層級 (Card Scope)**：
   - `orderCardSelector`（訂單整列卡片容器，例如每筆訂單的外框）
2. **訂單共用資訊層級 (Order Scope)**：
   - `orderIdSelector`（訂單編號）
   - `customerNameSelector`（買家名稱）
   - `totalAmountSelector`（訂單總金額）
   - `shippingMethodSelector`（物流方式）
   - `shippingDeadlineSelector`（最晚出貨期限）
3. **商品品項層級 (Item Scope，支援一單多品項)**：
   - `productRowSelector`（單一商品行容器，留空則以卡片內直接查找）
   - `productNameSelector`（商品品名）
   - `specificationSelector`（商品規格）
   - `quantitySelector`（購買數量）

### 2.3 視覺化選取器 (Element Picker) 最佳化
- 使用者點擊「🎯 選取」後，透明度自動提升並最小化抽屜，滑鼠懸停元素出現螢光藍邊框與浮動標籤（例如：`🏷️ 正在選取【訂單編號】`）。
- 點擊網頁目標文字後，自動生成最佳 CSS Selector、回填輸入框並切回設定頁，且立即刷新文字預覽。
- 支援 `ESC` 鍵隨時取消選取。

---

## 3. 技術架構與資料結構 (Technical Architecture & Data Strategy)

### 3.1 系統架構圖
```
┌─────────────────────────────────────────────────────────────────────────┐
│ Chrome Extension (content.js)                                           │
│                                                                         │
│ ┌─────────────────────────────────────────────────────────────────────┐ │
│ │ State: platformSelectors[currentPlatform]                           │ │
│ │  ├── orderScraper: {                                                │ │
│ │  │     cardSelector, orderIdSelector, customerNameSelector,        │ │
│ │  │     amountSelector, productRowSelector, productNameSelector,     │ │
│ │  │     specSelector, qtySelector, shipMethodSelector, deadlineSel   │ │
│ │  │   }                                                              │ │
│ │  └── profitScraper: { incomeSelector, feeSelector, orderIdSelector } │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                   │                                     │
│             ┌─────────────────────┴─────────────────────┐               │
│             ▼                                           ▼               │
│ ┌───────────────────────┐                   ┌─────────────────────────┐ │
│ │ 訂單總覽抓取引擎      │                   │ 單筆利潤出貨引擎        │ │
│ │ detectAndScrapeOrders │                   │ scrapeFinancials        │ │
│ └───────────────────────┘                   └─────────────────────────┘ │
│             │                                           │               │
│             ▼                                           ▼               │
│ ┌───────────────────────┐                   ┌─────────────────────────┐ │
│ │ 訂單挑選與核對面板   │                   │ 真實利潤與出貨抽屜      │ │
│ │ (scrape_orders tab)   │                   │ (main tab)              │ │
│ └───────────────────────┘                   └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.2 本地儲存資料結構相容性 (Data Migration & Storage)
`chrome.storage.local` 的 `platformSelectors` 擴展結構：
```typescript
interface PlatformSelectors {
  shopee: {
    // 單筆利潤設定 (保持既有結構不破壞)
    incomeSelector?: string;
    feeSelector?: string;
    orderIdSelector?: string;
    // 訂單總覽抓取專屬設定 (新增)
    orderScraper?: {
      cardSelector?: string;
      orderIdSelector?: string;
      customerNameSelector?: string;
      totalAmountSelector?: string;
      productRowSelector?: string;
      productNameSelector?: string;
      specificationSelector?: string;
      quantitySelector?: string;
      shippingMethodSelector?: string;
      shippingDeadlineSelector?: string;
    };
  };
  momo: { ... };
  coupang: { ... };
}
```

### 3.3 訂單總覽抓取引擎改造 (`detectAndScrapeOrdersFromPage`)
- 若使用者已設定 `cardSelector`：
  - 以 `document.querySelectorAll(cardSelector)` 取得網頁上所有訂單卡片。
  - 在卡片內使用子選取器 (`cardEl.querySelector(...)`) 分別解析單號、買家、總額、物流與出貨期限。
  - 在卡片內尋找商品行（若有設定 `productRowSelector` 則遍歷每行；否則在卡片內查找品名與規格清單）。
  - 精準抽取品名文字、規格文字、購買數量與單價。
- 若使用者尚未設定任何選取器，在「📥 選擇要抓取的訂單」面板中顯眼提示：「尚未配置訂單總覽選取器，請至 ⚙️ 設定點選 🎯 選取以精確鎖定訂單資料」，並提供快速引導按鈕。

---

## 4. 執行步驟與驗證

1. **更新 `chrome-extension/content.js`**：
   - 擴充狀態管理中的 `settingsSubTab` ('scraper' | 'profit')。
   - 重構 `render()` 中的設定介面，提供頂部次分頁切換。
   - 實作完整 8 大欄位選取器表單、即時預覽與選取按鈕綁定。
   - 改造 `detectAndScrapeOrdersFromPage()`，完全以使用者自訂的總覽選取器進行卡片遍歷與多品項抽取。
2. **更新 `chrome-extension/styles.css`**：
   - 新增設定頁次分頁切換按鈕、選取器分組卡片與預覽徽章樣式。
3. **驗證與編譯**：
   - 執行 `lint_applet` 與 `compile_applet` 確保無語法與建置錯誤。
