import { create } from 'zustand';
import { dbProducts, dbStock, dbVendors, dbSyncQueue, dbSettings, dbTransactions, dbOnlineOrders, Product, Stock, Vendor, SyncItem, Transaction, OnlineOrder } from '../lib/db';
import { v4 as uuidv4 } from 'uuid';
import { format, subDays } from 'date-fns';

export const getTxTimestamp = (dateVal?: any): number => {
  if (!dateVal) return 0;
  if (typeof dateVal === 'number') return isNaN(dateVal) ? 0 : dateVal;
  if (dateVal instanceof Date) return isNaN(dateVal.getTime()) ? 0 : dateVal.getTime();
  const str = String(dateVal).trim();
  if (!str) return 0;

  if (str.includes('T') || str.endsWith('Z')) {
    try {
      const d = new Date(str);
      if (!isNaN(d.getTime())) return d.getTime();
    } catch {}
  }

  const ymdMatch = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (ymdMatch) {
    const y = parseInt(ymdMatch[1], 10);
    const m = parseInt(ymdMatch[2], 10) - 1;
    const d = parseInt(ymdMatch[3], 10);
    const hh = ymdMatch[4] !== undefined ? parseInt(ymdMatch[4], 10) : 0;
    const mm = ymdMatch[5] !== undefined ? parseInt(ymdMatch[5], 10) : 0;
    const ss = ymdMatch[6] !== undefined ? parseInt(ymdMatch[6], 10) : 0;
    return new Date(y, m, d, hh, mm, ss).getTime();
  }

  const mdyMatch = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (mdyMatch) {
    const m = parseInt(mdyMatch[1], 10) - 1;
    const d = parseInt(mdyMatch[2], 10);
    const y = parseInt(mdyMatch[3], 10);
    const hh = mdyMatch[4] !== undefined ? parseInt(mdyMatch[4], 10) : 0;
    const mm = mdyMatch[5] !== undefined ? parseInt(mdyMatch[5], 10) : 0;
    const ss = mdyMatch[6] !== undefined ? parseInt(mdyMatch[6], 10) : 0;
    return new Date(y, m, d, hh, mm, ss).getTime();
  }

  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d.getTime();
  } catch {}

  return 0;
};

const normalizeKeys = (obj: any) => {
  if (!obj || typeof obj !== 'object') return obj;
  const result: any = {};
  for (const key of Object.keys(obj)) {
    const cleanKey = key.trim().toLowerCase();
    result[cleanKey] = typeof obj[key] === 'string' ? obj[key].trim() : obj[key];
  }
  return result;
};

export const calculateOrderStatus = (deadlineStr: string, manualStatus?: string): string => {
  if (manualStatus && manualStatus.trim() && manualStatus.trim() !== 'AUTO') {
    return manualStatus.trim();
  }

  if (!deadlineStr) return '待出貨';

  const cleanStr = deadlineStr.replace(/\//g, '-').trim();
  const deadline = new Date(cleanStr);
  if (isNaN(deadline.getTime())) {
    return deadlineStr; // Return custom string if not a date
  }

  const now = new Date();
  
  // Extract year, month, day components for strict calendar day comparison
  const dYear = deadline.getFullYear();
  const dMonth = deadline.getMonth();
  const dDay = deadline.getDate();

  const nYear = now.getFullYear();
  const nMonth = now.getMonth();
  const nDay = now.getDate();

  // Date-only string handling (e.g. YYYY-MM-DD)
  const dateOnlyMatch = cleanStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (dateOnlyMatch) {
    const yr = parseInt(dateOnlyMatch[1], 10);
    const mo = parseInt(dateOnlyMatch[2], 10) - 1;
    const dy = parseInt(dateOnlyMatch[3], 10);

    const targetDate = new Date(yr, mo, dy);
    const todayDate = new Date(nYear, nMonth, nDay);

    if (targetDate < todayDate) {
      return '已逾期';
    } else if (targetDate.getTime() === todayDate.getTime() || (targetDate.getTime() - todayDate.getTime()) <= 24 * 60 * 60 * 1000) {
      return '即將到期';
    } else {
      return '待出貨';
    }
  }

  const diffMs = deadline.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);

  const deadlineDate = new Date(dYear, dMonth, dDay);
  const todayDate = new Date(nYear, nMonth, nDay);

  // If deadline is strictly earlier calendar day than today and time has passed
  if (deadlineDate < todayDate && diffHours < 0) {
    return '已逾期';
  } else if (deadlineDate.getTime() === todayDate.getTime() || (diffHours >= 0 && diffHours <= 24)) {
    return '即將到期';
  } else if (diffHours < 0) {
    return '已逾期';
  } else {
    return '待出貨';
  }
};

const stripKey = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '');

const normalizeAndFillOnlineOrders = (rawItems: any[], _products?: Product[]): OnlineOrder[] => {
  if (!Array.isArray(rawItems)) return [];

  let lastOrderHeader: {
    order_id: string;
    platform: string;
    customer_name: string;
    shipping_deadline: string;
    order_status: string;
    created_at: string;
    shipping_method: string;
    price: number;
  } | null = null;

  const result: OnlineOrder[] = [];

  for (const rawItem of rawItems) {
    if (!rawItem || typeof rawItem !== 'object') continue;

    const map: Record<string, any> = {};
    for (const k of Object.keys(rawItem)) {
      const val = rawItem[k];
      const cleanKey = k.trim().toLowerCase();
      const stripped = stripKey(k);
      map[cleanKey] = typeof val === 'string' ? val.trim() : val;
      map[k.trim()] = typeof val === 'string' ? val.trim() : val;
      if (stripped) map[stripped] = typeof val === 'string' ? val.trim() : val;
    }

    const getVal = (keys: string[]) => {
      for (const key of keys) {
        if (map[key] !== undefined && map[key] !== '') return map[key];
        if (map[key.toLowerCase()] !== undefined && map[key.toLowerCase()] !== '') return map[key.toLowerCase()];
        const targetStripped = stripKey(key);
        if (map[targetStripped] !== undefined && map[targetStripped] !== '') return map[targetStripped];
        
        // Substring / prefix search on keys
        for (const mk of Object.keys(map)) {
          const strippedMk = stripKey(mk);
          if (strippedMk && targetStripped && (strippedMk === targetStripped || strippedMk.includes(targetStripped) || targetStripped.includes(strippedMk))) {
            if (map[mk] !== undefined && map[mk] !== '') return map[mk];
          }
        }
      }
      return '';
    };

    let order_id = String(getVal(['order_id', '訂單編號', '訂單id', 'id'])).trim();
    let platform = String(getVal(['platform', '來源平台', '平台'])).trim();
    let customer_name = String(getVal(['customer_name', '收件人', '顧客姓名', '買家', '顧客', '姓名', '買家帳號', '會員名稱'])).trim();
    let shipping_deadline = String(getVal(['最晚出貨期限', 'shipping_deadline', '最晚出貨時間', '出貨期限', 'shipping_date', 'deadline', '預計出貨日', '最晚發貨日'])).trim();
    let order_status = String(getVal(['order_status', '訂單狀態', '狀態'])).trim();

    let rawStatus = String(getVal(['status'])).trim();
    if (!shipping_deadline && rawStatus) {
      if (!isNaN(new Date(rawStatus).getTime())) {
        shipping_deadline = rawStatus;
      } else if (!order_status) {
        order_status = rawStatus;
      }
    }

    let created_at = String(getVal(['created_at', '下單時間', '下單日期', '建立時間', '日期', '時間', '訂單成立時間'])).trim();
    let shipping_method = String(getVal(['shipping_method', '物流方式', '物流', '寄送方式', '物流管道', '配送方式'])).trim();
    
    let rawPriceVal = getVal([
      'price', 'totalprice', 'totalamount', 'orderamount', 'orderprice', 'amount', 'total', 'grandtotal', 'subtotal',
      '價格', '售價', '金額', '訂單金額', '訂單總金額', '總金額', '總價', '買家支付金額', '實付金額', '結帳金額', '總計', '買家付費金額', '商品金額'
    ]);
    let cleanedPriceStr = typeof rawPriceVal === 'number' ? String(rawPriceVal) : String(rawPriceVal || '').replace(/[^0-9.]/g, '');
    let priceNum = Number(cleanedPriceStr) || 0;

    // Fill-down for multi-item orders where spreadsheet only logs order_id on first row or repeats order_id with empty header fields
    if (lastOrderHeader && (!order_id || order_id === lastOrderHeader.order_id)) {
      if (!order_id) order_id = lastOrderHeader.order_id;
      if (!platform) platform = lastOrderHeader.platform;
      if (!customer_name) customer_name = lastOrderHeader.customer_name;
      if (!shipping_deadline) shipping_deadline = lastOrderHeader.shipping_deadline;
      if (!order_status) order_status = lastOrderHeader.order_status;
      if (!created_at) created_at = lastOrderHeader.created_at;
      if (!shipping_method) shipping_method = lastOrderHeader.shipping_method;
      if (!priceNum) priceNum = lastOrderHeader.price;
    }

    if (!order_id) continue;

    lastOrderHeader = {
      order_id,
      platform: platform || '蝦皮購物',
      customer_name: customer_name || '顧客',
      shipping_deadline,
      order_status,
      created_at,
      shipping_method,
      price: priceNum || (lastOrderHeader?.order_id === order_id ? lastOrderHeader.price : 0)
    };

    let product_id = String(getVal([
      'product_id', 'productid', 'productcode', 'sku', 'itemid', 'itemcode', 'barcode',
      '商品id', '商品ID', '商品編號', '商品料號', '商品貨號', '商品條碼', '商品代碼',
      '產品編號', '產品id', '產品ID', '產品料號', '代碼', '料號', '貨號', '條碼', 'SKU', 'SKU編號', '主商品貨號', '規格貨號'
    ])).trim();

    let product_name = String(getVal([
      'product_name', 'productname', 'itemname', 'name', 'title',
      '商品名稱', '產品名稱', '品名', '名稱', '商品', '產品'
    ])).trim();

    const quantity = Number(getVal(['quantity', 'qty', 'count', '數量', '件數', '個數', '買家購買數量'])) || 1;
    const specification = String(getVal(['specification', 'spec', 'variant', '商品規格', '規格', '規格描述', '選項'])).trim();

    // Fallback: if product_name is empty but product_id is provided, use product_id as name
    if (!product_name && product_id) {
      product_name = product_id;
    } else if (!product_name && specification) {
      product_name = specification;
    } else if (!product_name) {
      product_name = '非系統商品 (未命名)';
    }

    const calcStatus = calculateOrderStatus(shipping_deadline, order_status);

    result.push({
      order_id,
      platform: platform || '蝦皮購物',
      product_id,
      product_name,
      quantity,
      price: priceNum,
      customer_name: customer_name || '顧客',
      status: shipping_deadline || rawStatus || calcStatus,
      shipping_deadline: shipping_deadline || rawStatus,
      order_status: calcStatus,
      created_at,
      specification,
      shipping_method
    });
  }

  // Ensure every item under the same order has the non-zero order price if available anywhere in the order
  const orderPriceMap = new Map<string, number>();
  for (const item of result) {
    if (item.price && item.price > 0) {
      orderPriceMap.set(item.order_id, item.price);
    }
  }

  for (const item of result) {
    if (!item.price && orderPriceMap.has(item.order_id)) {
      item.price = orderPriceMap.get(item.order_id)!;
    }
  }

  return result;
};

interface AppState {
  products: Product[];
  stock: Stock[];
  vendors: Vendor[];
  transactions: Transaction[];
  onlineOrders: OnlineOrder[];
  syncQueue: SyncItem[];
  gasApiUrl: string;
  operator: string;
  isLoading: boolean;
  isSyncing: boolean;
  error: string | null;
  loadInitialData: () => Promise<void>;
  setGasApiUrl: (url: string) => Promise<void>;
  setOperator: (op: string) => Promise<void>;
  enqueueAction: (action: SyncItem['action'], payload: any) => Promise<void>;
  syncData: () => Promise<void>;
  fetchRemoteData: () => Promise<void>;
  fetchOnlineOrders: () => Promise<void>;
  updateOnlineOrderStatus: (orderId: string, status: string, productId?: string) => Promise<boolean>;
  deleteOnlineOrder: (orderId: string) => Promise<boolean>;
  addProduct: (product: Omit<Product, 'created_at'>, isManual?: boolean) => Promise<void>;
  editProduct: (product: Product) => Promise<void>;
  deleteProduct: (productId: string) => Promise<void>;
  toggleDiscontinued: (productId: string) => Promise<void>;
  addVendor: (vendor: Vendor) => Promise<void>;
  editVendor: (vendor: Vendor) => Promise<void>;
  deleteVendor: (vendorId: string) => Promise<void>;
  reformatDatabase: () => Promise<void>;
  overwriteCloudStock: () => Promise<boolean>;
  overwriteCloudTransactions: () => Promise<boolean>;
  editTransaction: (transactionId: string, updatedFields: Partial<Transaction>) => Promise<void>;
  deleteTransaction: (transactionId: string) => Promise<void>;
  deleteTransactionGroup: (groupIdOrIds: string | string[]) => Promise<void>;
  toastMessage: string | null;
  showToast: (msg: string) => void;
  lowStockAlertEnabled: boolean;
  setLowStockAlertEnabled: (enabled: boolean) => Promise<void>;
  expiryThreshold: number;
  setExpiryThreshold: (days: number) => Promise<void>;

  // Page Preserving States
  productsPageState: {
    searchTerm: string;
    filterBrand: string;
    filterCategory: string;
    filterVendor: string;
    filterDiscontinued: 'all' | 'active' | 'discontinued';
    activeTab: 'cards' | 'restock';
    sortOrder: string;
    showFilters: boolean;
  };
  setProductsPageState: (state: Partial<AppState['productsPageState']>) => void;

  transactionsPageState: {
    filterType: string;
    filterPlatform: string;
    searchTerm: string;
    startDate: string;
    endDate: string;
    filterLocation: string;
    filterVendor: string;
    showFilters: boolean;
    viewMode: 'detailed' | 'grouped_by_order';
  };
  setTransactionsPageState: (state: Partial<AppState['transactionsPageState']>) => void;

  reportsPageState: {
    activeTab: 'dashboard' | 'list';
  };
  setReportsPageState: (state: Partial<AppState['reportsPageState']>) => void;

  vendorsPageState: {
    searchTerm: string;
  };
  setVendorsPageState: (state: Partial<AppState['vendorsPageState']>) => void;

  // Route Memory
  lastPaths: {
    home: string;
    products: string;
    scan: string;
    manage: string;
    setup: string;
  };
  setLastPath: (key: 'home' | 'products' | 'scan' | 'manage' | 'setup', path: string) => void;
}

export const useStore = create<AppState>((set, get) => ({
  products: [],
  stock: [],
  vendors: [],
  transactions: [],
  onlineOrders: [],
  syncQueue: [],
  gasApiUrl: '',
  operator: 'staff',
  isLoading: false,
  isSyncing: false,
  error: null,
  toastMessage: null,
  lowStockAlertEnabled: true,
  expiryThreshold: 30,

  // Page Preserving States
  productsPageState: {
    searchTerm: '',
    filterBrand: '',
    filterCategory: '',
    filterVendor: '',
    filterDiscontinued: 'all',
    activeTab: 'cards',
    sortOrder: 'name_asc',
    showFilters: false
  },
  setProductsPageState: (newState) => {
    set((state) => ({ productsPageState: { ...state.productsPageState, ...newState } }));
  },

  transactionsPageState: {
    filterType: '',
    filterPlatform: '',
    searchTerm: '',
    startDate: '',
    endDate: '',
    filterLocation: '',
    filterVendor: '',
    showFilters: false,
    viewMode: 'detailed' as 'detailed' | 'grouped_by_order'
  },
  setTransactionsPageState: (newState) => {
    set((state) => ({ transactionsPageState: { ...state.transactionsPageState, ...newState } }));
  },

  reportsPageState: {
    activeTab: 'dashboard'
  },
  setReportsPageState: (newState) => {
    set((state) => ({ reportsPageState: { ...state.reportsPageState, ...newState } }));
  },

  vendorsPageState: {
    searchTerm: ''
  },
  setVendorsPageState: (newState) => {
    set((state) => ({ vendorsPageState: { ...state.vendorsPageState, ...newState } }));
  },

  lastPaths: {
    home: '/',
    products: '/products',
    scan: '/scan',
    manage: '/manage?type=stock_in',
    setup: '/setup'
  },
  setLastPath: (key, path) => {
    set((state) => ({ lastPaths: { ...state.lastPaths, [key]: path } }));
  },

  setLowStockAlertEnabled: async (enabled: boolean) => {
    await dbSettings.setItem('lowStockAlertEnabled', enabled);
    set({ lowStockAlertEnabled: enabled });
  },

  setExpiryThreshold: async (days: number) => {
    await dbSettings.setItem('expiryThreshold', days);
    set({ expiryThreshold: days });
  },

  showToast: (msg: string) => {
    set({ toastMessage: msg });
    setTimeout(() => {
      set((state) => state.toastMessage === msg ? { toastMessage: null } : state);
    }, 3000);
  },

  loadInitialData: async () => {
    set({ isLoading: true });
    try {
      const url = await dbSettings.getItem<string>('gasApiUrl') || '';
      const op = await dbSettings.getItem<string>('operator') || 'staff';
      const lowStockAlert = await dbSettings.getItem<boolean>('lowStockAlertEnabled');
      const threshold = await dbSettings.getItem<number>('expiryThreshold') || 30;
      
      const qKeys = await dbSyncQueue.keys();
      const q: SyncItem[] = [];
      for (const k of qKeys) {
        const item = await dbSyncQueue.getItem<SyncItem>(k);
        if (item) q.push(item);
      }

      set({ 
        gasApiUrl: url, 
        operator: op, 
        syncQueue: q.sort((a,b) => a.timestamp.localeCompare(b.timestamp)),
        lowStockAlertEnabled: lowStockAlert === null ? true : lowStockAlert,
        expiryThreshold: threshold
      });

      // Load products and stock from cache
      const pKeys = await dbProducts.keys();
      const pList: Product[] = [];
      for (const k of pKeys) {
        const item = await dbProducts.getItem<Product>(k);
        if (item) pList.push(item);
      }

      const sKeys = await dbStock.keys();
      const sList: Stock[] = [];
      for (const k of sKeys) {
        const item = await dbStock.getItem<Stock>(k);
        if (item) sList.push(item);
      }

      const vKeys = await dbVendors.keys();
      const vList: Vendor[] = [];
      for (const k of vKeys) {
        const item = await dbVendors.getItem<Vendor>(k);
        if (item) vList.push(item);
      }

      const tKeys = await dbTransactions.keys();
      const tList: Transaction[] = [];
      for (const k of tKeys) {
        const item = await dbTransactions.getItem<Transaction>(k);
        if (item) tList.push(item);
      }

      const oKeys = await dbOnlineOrders.keys();
      const oList: OnlineOrder[] = [];
      for (const k of oKeys) {
        const item = await dbOnlineOrders.getItem<OnlineOrder>(k);
        if (item) oList.push(item);
      }

      set({ 
        products: pList, 
        stock: sList, 
        vendors: vList, 
        transactions: tList.sort((a, b) => getTxTimestamp(b.date) - getTxTimestamp(a.date)),
        onlineOrders: oList
      });
    } catch (e: any) {
      set({ error: e.message });
    } finally {
      set({ isLoading: false });
    }
  },

  setGasApiUrl: async (url) => {
    await dbSettings.setItem('gasApiUrl', url);
    set({ gasApiUrl: url });
  },

  setOperator: async (op) => {
    await dbSettings.setItem('operator', op);
    set({ operator: op });
  },

  enqueueAction: async (action, payload) => {
    // Fill in product name for GAS if missing first!
    const { products } = get();
    const product = products.find(p => p.product_id === payload.product_id);
    const updatedPayload = { ...payload };
    if (updatedPayload.product_name) {
        updatedPayload.name = updatedPayload.product_name;
    } else if (product && !updatedPayload.name) {
        updatedPayload.name = product.name;
    }

    // Deterministic or generated transaction ID
    const targetTxId = updatedPayload.transaction_id || `TX_${Date.now()}_${Math.random().toString(36).substring(2,6)}`;
    const targetUniqueId = updatedPayload.id || targetTxId;
    const finalPayload = { ...updatedPayload, transaction_id: targetTxId, id: targetUniqueId, operator: get().operator };

    const item: SyncItem = {
      id: targetUniqueId,
      action,
      payload: finalPayload,
      timestamp: new Date().toISOString()
    };
    await dbSyncQueue.setItem(item.id, item);

    // Optimistic Local Updates for instant local UI responsiveness & sheet sync assurance!
    if (action === 'stockIn') {
        const { stock, transactions } = get();
        const existingIdx = stock.findIndex(s => 
            s.product_id === updatedPayload.product_id &&
            s.location === updatedPayload.location &&
            s.floor === updatedPayload.floor &&
            s.area === updatedPayload.area &&
            (s.expiry_date || '') === (updatedPayload.expiry_date || '') &&
            (s.specification || '') === (updatedPayload.specification || '')
        );

        let updatedStock = [...stock];
        if (existingIdx !== -1) {
            updatedStock[existingIdx] = {
                ...updatedStock[existingIdx],
                quantity: updatedStock[existingIdx].quantity + Number(updatedPayload.quantity),
                last_update: new Date().toISOString()
            };
            await dbStock.setItem(updatedStock[existingIdx].stock_id, updatedStock[existingIdx]);
        } else {
            const newStock: Stock = {
                stock_id: `STK_${Date.now()}_${Math.random().toString(36).substring(2,7)}`,
                product_id: updatedPayload.product_id,
                name: updatedPayload.product_name || product?.name || '',
                location: updatedPayload.location,
                floor: updatedPayload.floor,
                area: updatedPayload.area,
                quantity: Number(updatedPayload.quantity),
                expiry_date: updatedPayload.expiry_date || '',
                specification: updatedPayload.specification || '',
                last_update: new Date().toISOString()
            };
            updatedStock.push(newStock);
            await dbStock.setItem(newStock.stock_id, newStock);
        }

        const newTx: Transaction = {
            id: targetUniqueId,
            transaction_id: targetTxId,
            online_order_id: updatedPayload.online_order_id || updatedPayload.order_id || '',
            platform: updatedPayload.platform || (updatedPayload.type && !['stock_in', 'stock_out', 'adjust'].includes(updatedPayload.type) ? updatedPayload.type.replace(/^stock_out\s*/, '') : '') || '',
            product_id: updatedPayload.product_id || '',
            product_name: updatedPayload.product_name || updatedPayload.name || product?.name || '',
            type: updatedPayload.type || 'stock_in',
            quantity: Number(updatedPayload.quantity),
            location: updatedPayload.location,
            floor: updatedPayload.floor,
            area: updatedPayload.area,
            specification: updatedPayload.specification || '',
            cost_price: Number(updatedPayload.cost_price) || 0,
            price: Number(updatedPayload.price) || 0,
            vendor_id: updatedPayload.vendor_id || '',
            date: updatedPayload.date || format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
            note: updatedPayload.note || '',
            operator: get().operator
        };

        const existingTxIdx = transactions.findIndex(t => (t.id && t.id === newTx.id) || (t.transaction_id && t.transaction_id === newTx.transaction_id));
        let updatedTx: Transaction[];
        if (existingTxIdx >= 0) {
            updatedTx = [...transactions];
            updatedTx[existingTxIdx] = newTx;
        } else {
            updatedTx = [newTx, ...transactions];
        }
        updatedTx.sort((a, b) => getTxTimestamp(b.date) - getTxTimestamp(a.date));
        await dbTransactions.setItem(newTx.id, newTx);
        
        set({ stock: updatedStock, transactions: updatedTx });
    } else if (action === 'stockOut') {
        const { stock, transactions } = get();
        const existingIdx = stock.findIndex(s => s.stock_id === updatedPayload.stock_id);

        let updatedStock = [...stock];
        if (existingIdx !== -1) {
            const currentQty = updatedStock[existingIdx].quantity;
            const deduct = Number(updatedPayload.quantity);
            if (currentQty <= deduct) {
                const deletedId = updatedStock[existingIdx].stock_id;
                updatedStock.splice(existingIdx, 1);
                await dbStock.removeItem(deletedId);
            } else {
                updatedStock[existingIdx] = {
                    ...updatedStock[existingIdx],
                    quantity: currentQty - deduct,
                    last_update: new Date().toISOString()
                };
                await dbStock.setItem(updatedStock[existingIdx].stock_id, updatedStock[existingIdx]);
            }
        }

        const newTx: Transaction = {
            id: targetUniqueId,
            transaction_id: targetTxId,
            online_order_id: updatedPayload.online_order_id || updatedPayload.order_id || '',
            platform: updatedPayload.platform || (updatedPayload.type && !['stock_in', 'stock_out', 'adjust'].includes(updatedPayload.type) ? updatedPayload.type.replace(/^stock_out\s*/, '') : '') || '',
            product_id: updatedPayload.product_id || '',
            product_name: updatedPayload.product_name || updatedPayload.name || product?.name || '',
            type: updatedPayload.type || 'stock_out',
            quantity: Number(updatedPayload.quantity),
            location: updatedPayload.location,
            floor: updatedPayload.floor,
            area: updatedPayload.area,
            specification: updatedPayload.specification || '',
            cost_price: product?.cost_price || 0,
            price: Number(updatedPayload.price) || 0,
            vendor_id: product?.vendor_id || '',
            date: updatedPayload.date || format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
            note: updatedPayload.note || '',
            operator: get().operator
        };

        const existingTxIdx = transactions.findIndex(t => (t.id && t.id === newTx.id) || (t.transaction_id && t.transaction_id === newTx.transaction_id));
        let updatedTx: Transaction[];
        if (existingTxIdx >= 0) {
            updatedTx = [...transactions];
            updatedTx[existingTxIdx] = newTx;
        } else {
            updatedTx = [newTx, ...transactions];
        }
        updatedTx.sort((a, b) => getTxTimestamp(b.date) - getTxTimestamp(a.date));
        await dbTransactions.setItem(newTx.id, newTx);

        set({ stock: updatedStock, transactions: updatedTx });
    } else if (action === 'adjustStock') {
        const { stock, transactions } = get();
        const existingIdx = stock.findIndex(s => s.stock_id === updatedPayload.stock_id);

        let updatedStock = [...stock];
        if (existingIdx !== -1) {
            updatedStock[existingIdx] = {
                ...updatedStock[existingIdx],
                quantity: Number(updatedPayload.quantity),
                last_update: new Date().toISOString()
            };
            await dbStock.setItem(updatedStock[existingIdx].stock_id, updatedStock[existingIdx]);
        } else {
            const newS: Stock = {
                stock_id: `STK_${Date.now()}_${Math.random().toString(36).substring(2,7)}`,
                product_id: updatedPayload.product_id,
                location: updatedPayload.location || '倉庫',
                floor: updatedPayload.floor || '1F',
                area: updatedPayload.area || 'A區',
                quantity: Number(updatedPayload.quantity),
                specification: updatedPayload.specification || '',
                last_update: new Date().toISOString()
            };
            updatedStock.push(newS);
            await dbStock.setItem(newS.stock_id, newS);
        }

        const newTx: Transaction = {
            id: targetUniqueId,
            transaction_id: targetTxId,
            online_order_id: updatedPayload.online_order_id || updatedPayload.order_id || '',
            platform: updatedPayload.platform || (updatedPayload.type && !['stock_in', 'stock_out', 'adjust'].includes(updatedPayload.type) ? updatedPayload.type.replace(/^stock_out\s*/, '') : '') || '',
            product_id: updatedPayload.product_id || '',
            product_name: updatedPayload.product_name || updatedPayload.name || product?.name || '',
            type: updatedPayload.type || 'adjust',
            quantity: Number(updatedPayload.quantity),
            location: updatedPayload.location,
            floor: updatedPayload.floor,
            area: updatedPayload.area,
            specification: updatedPayload.specification || '',
            cost_price: product?.cost_price || 0,
            price: Number(updatedPayload.price) || 0,
            vendor_id: product?.vendor_id || '',
            date: updatedPayload.date || format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
            note: updatedPayload.note || '',
            operator: get().operator
        };

        const existingTxIdx = transactions.findIndex(t => (t.id && t.id === newTx.id) || (t.transaction_id && t.transaction_id === newTx.transaction_id));
        let updatedTx: Transaction[];
        if (existingTxIdx >= 0) {
            updatedTx = [...transactions];
            updatedTx[existingTxIdx] = newTx;
        } else {
            updatedTx = [newTx, ...transactions];
        }
        updatedTx.sort((a, b) => getTxTimestamp(b.date) - getTxTimestamp(a.date));
        await dbTransactions.setItem(newTx.id, newTx);

        set({ stock: updatedStock, transactions: updatedTx });
    }

    set((state) => {
        const queueExists = state.syncQueue.some(q => q.id === item.id || (q.payload?.transaction_id && q.payload.transaction_id === item.payload?.transaction_id));
        return {
            syncQueue: queueExists ? state.syncQueue.map(q => q.id === item.id ? item : q) : [...state.syncQueue, item]
        };
    });
    
    // Try to sync immediately
    get().syncData();
  },

  syncData: async () => {
    const { gasApiUrl, isSyncing } = get();
    if (!gasApiUrl || isSyncing) return;

    set({ isSyncing: true, isLoading: true, error: null });
    
    let hasError = false;

    // Loop until queue is empty or an error occurs
    while (get().syncQueue.length > 0 && !hasError) {
      const item = get().syncQueue[0]; // Process one by one

      try {
        const res = await fetch(`${gasApiUrl}?action=${item.action}`, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(item.payload)
        });
        
        if (res.ok) {
          await dbSyncQueue.removeItem(item.id);
          set((state) => ({ syncQueue: state.syncQueue.filter(q => q.id !== item.id) }));
        } else {
          set({ error: `同步失敗： ${item.action}` });
          hasError = true;
        }
      } catch (e: any) {
        console.error("Sync error:", e);
        set({ error: '同步遇到網路異常，將於稍後重試。' });
        hasError = true;
      }
    }
    
    if (!hasError) {
      // Small delay to allow GAS and Sheets to process the write before we fetch back
      setTimeout(async () => {
        await get().fetchRemoteData();
      }, 1000);
    }
    set({ isLoading: false, isSyncing: false });
  },

  fetchRemoteData: async () => {
    const { gasApiUrl } = get();
    if (!gasApiUrl || !gasApiUrl.trim() || !gasApiUrl.trim().startsWith('http')) return;

    const cleanUrl = gasApiUrl.trim();

    set({ isLoading: true });
    try {
      // Products
      const rP = await fetch(`${cleanUrl}?action=getProducts`);
      if (rP.ok) {
        const dP = await rP.json();
        
        const normalizedList = (dP || []).map((item: any) => normalizeKeys(item));
        
        // Build maps of currently tracked states and pending sync items
        const currentProducts = get().products;
        const currentDiscontinuedMap = new Map<string, boolean>();
        currentProducts.forEach(p => {
          if (p.product_id && p.is_discontinued) {
            currentDiscontinuedMap.set(p.product_id, true);
          }
        });

        // Also check if there are pending editProduct actions in syncQueue
        const pendingQueue = get().syncQueue || [];
        const pendingDiscontinuedMap = new Map<string, boolean>();
        pendingQueue.forEach(q => {
          if (q.action === 'editProduct' && q.payload && q.payload.product_id) {
            if (q.payload.is_discontinued !== undefined) {
              pendingDiscontinuedMap.set(String(q.payload.product_id), Boolean(q.payload.is_discontinued));
            }
          }
        });

        // If there are duplicate product_ids or multiple records, merge their specifications cleanly
        const productMap: Record<string, any> = {};
        normalizedList.filter((p: any) => p && p.product_id).forEach((p: any) => {
          const id = String(p.product_id).trim();

          // Determine discontinued status with resilience:
          // 1. Pending local sync queue has highest priority
          // 2. Remote explicit TRUE / FALSE
          // 3. Current local state if remote value is blank/undefined
          let isDiscontinued = false;
          if (pendingDiscontinuedMap.has(id)) {
            isDiscontinued = pendingDiscontinuedMap.get(id)!;
          } else {
            const rawDisc = p.is_discontinued !== undefined ? p.is_discontinued : (p['停產'] !== undefined ? p['停產'] : p['暫時停產']);
            if (rawDisc !== undefined && rawDisc !== null && String(rawDisc).trim() !== '') {
              const strVal = String(rawDisc).trim().toUpperCase();
              isDiscontinued = (strVal === 'TRUE' || strVal === '1' || strVal === 'YES' || rawDisc === true);
            } else if (currentDiscontinuedMap.has(id)) {
              isDiscontinued = true;
            }
          }

          const cleanP = {
            ...p,
            product_id: id,
            barcode: p.barcode ? String(p.barcode).trim() : '',
            name: p.name ? String(p.name).trim() : '',
            brand: p.brand ? String(p.brand).trim() : '',
            category: p.category ? String(p.category).trim() : '',
            unit: p.unit ? String(p.unit).trim() : '',
            specification: p.specification ? String(p.specification).trim() : '',
            has_expiry: String(p.has_expiry).toUpperCase() === 'TRUE',
            is_discontinued: isDiscontinued,
            cost_price: Number(p.cost_price) || 0,
            min_stock: (() => {
              const raw = p.min_stock ?? p['安全庫存'] ?? p['安全庫存量'] ?? p['最低庫存'] ?? p['最低庫存量'] ?? p['警示庫存'] ?? p.minstock;
              return (raw !== undefined && raw !== null && raw !== '' && !isNaN(Number(raw))) ? Number(raw) : undefined;
            })()
          };
          if (!productMap[id]) {
            productMap[id] = cleanP;
          } else {
            // Merge specifications
            const s1 = productMap[id].specification || '';
            const s2 = cleanP.specification || '';
            const combinedSpecs = Array.from(new Set(
              [s1, s2]
                .flatMap(spec => spec ? spec.split(/[,\/，\s、]+/).map((s: any) => s.trim()).filter(Boolean) : [])
            )).join('、');
            productMap[id].specification = combinedSpecs;
            if (cleanP.is_discontinued !== undefined) {
              productMap[id].is_discontinued = cleanP.is_discontinued;
            }
          }
        });

        const normalizedProducts = Object.values(productMap);

        await dbProducts.clear();
        for (const p of normalizedProducts) {
          await dbProducts.setItem(p.product_id, p);
        }
        set({ products: normalizedProducts });
      }

      // Stock
      const rS = await fetch(`${cleanUrl}?action=getStock`);
      if (rS.ok) {
        const dS = await rS.json();
        const validS = (dS || []).map((item: any) => normalizeKeys(item))
          .filter((s: any) => s && s.stock_id)
          .map((s: any) => ({
            ...s,
            stock_id: String(s.stock_id).trim(),
            product_id: s.product_id ? String(s.product_id).trim() : ''
          }));
        await dbStock.clear();
        for (const s of validS) {
          await dbStock.setItem(s.stock_id, s);
        }
        set({ stock: validS });
      }

      // Vendors
      const rV = await fetch(`${cleanUrl}?action=getVendors`);
      if (rV.ok) {
        const dV = await rV.json();
        const validV = (dV || []).map((item: any) => normalizeKeys(item))
          .filter((v: any) => v && v.vendor_id)
          .map((v: any) => ({
            ...v,
            vendor_id: String(v.vendor_id).trim()
          }));
        await dbVendors.clear();
        for (const v of validV) {
          await dbVendors.setItem(v.vendor_id, v);
        }
        set({ vendors: validV });
      }

      // Transactions
      const rT = await fetch(`${cleanUrl}?action=getTransactions`);
      if (rT.ok) {
        const dT = await rT.json();
        const currentProds = get().products;
        const prodCostMap = new Map<string, number>();
        currentProds.forEach(p => {
          if (p.product_id) {
            prodCostMap.set(p.product_id, Number(p.cost_price) || 0);
          }
        });

        const seenTxIds = new Set<string>();
        const validT: any[] = [];

        for (let idx = 0; idx < (dT || []).length; idx++) {
          const item = dT[idx];
          const norm = normalizeKeys(item);
          const txId = norm.transaction_id ? String(norm.transaction_id).trim() : `TX_${Date.now()}_${idx}`;
          const id = (norm.id && String(norm.id).trim() !== '') ? `${String(norm.id).trim()}` : `${txId}_${norm.product_id || ''}_${idx}`;

          // Avoid duplicate transaction records if the remote sheet has duplicate transaction_ids
          if (norm.transaction_id && seenTxIds.has(txId)) {
            continue;
          }
          if (norm.transaction_id) {
            seenTxIds.add(txId);
          }

          const online_order_id = norm.online_order_id || norm['網路訂單編號'] || norm.order_id || '';
          const platformVal = norm.platform || norm['平台'] || norm['銷售平台'] || (norm.type && !['stock_in', 'stock_out', 'adjust'].includes(norm.type) ? norm.type.replace(/^stock_out\s*/, '') : '') || '';
          const product_name = norm.product_name || norm.name || norm['商品名稱'] || norm['名稱'] || '';
          const pid = norm.product_id ? String(norm.product_id).trim() : '';
          const priceVal = Number(norm.price || norm['金額'] || norm['售價']) || 0;

          // Clean cost_price: prevent date string contamination (e.g. 1899/12/30 0:00:00)
          let costPriceVal = 0;
          const rawCost = norm.cost_price || norm['進價'] || norm['成本'] || norm['進貨成本'] || norm['成本價'];
          if (rawCost !== undefined && rawCost !== null && rawCost !== '' && !String(rawCost).includes('1899')) {
            const parsed = Number(rawCost);
            if (!isNaN(parsed)) {
              costPriceVal = parsed;
            }
          }
          if (costPriceVal === 0 && pid && prodCostMap.has(pid)) {
            costPriceVal = prodCostMap.get(pid) || 0;
          }

          const rawDate = norm.date || norm['日期'] || norm['異動時間'] || norm['時間'] || norm['date'] || '';
          let cleanDate = String(rawDate || '').trim();
          if (cleanDate && (cleanDate.includes('T') || cleanDate.endsWith('Z'))) {
            try {
              const d = new Date(cleanDate);
              if (!isNaN(d.getTime())) {
                cleanDate = format(d, 'yyyy-MM-dd HH:mm:ss');
              }
            } catch {}
          }

          validT.push({
            ...norm,
            id,
            transaction_id: txId,
            online_order_id: String(online_order_id).trim(),
            platform: String(platformVal).trim(),
            product_id: pid,
            product_name: String(product_name).trim(),
            type: norm.type ? String(norm.type).trim() : 'stock_out',
            quantity: Number(norm.quantity) || 0,
            cost_price: costPriceVal,
            price: priceVal,
            date: cleanDate
          });
        }
        await dbTransactions.clear();
        for (const t of validT) {
          await dbTransactions.setItem(t.id, t);
        }
        set({ transactions: validT.sort((a: any, b: any) => getTxTimestamp(b.date) - getTxTimestamp(a.date)) });
      }

      // Online Orders
      try {
        const rO = await fetch(`${cleanUrl}?action=getOnlineOrders`);
        if (rO.ok) {
          const dO = await rO.json();
          const currentProducts = get().products;
          const resolvedO = normalizeAndFillOnlineOrders(dO || [], currentProducts);

          await dbOnlineOrders.clear();
          for (let i = 0; i < resolvedO.length; i++) {
            const o = resolvedO[i];
            await dbOnlineOrders.setItem(`${o.order_id}_${o.product_id || 'unlinked'}_${i}`, o);
          }
          set({ onlineOrders: resolvedO });
        }
      } catch (err) {
        console.warn("Failed to fetch online orders in fetchRemoteData, ignoring:", err);
      }

    } catch (e: any) {
      console.warn("fetchRemoteData failed:", e.message || e);
    } finally {
      set({ isLoading: false });
    }
  },

  fetchOnlineOrders: async () => {
    const { gasApiUrl, showToast } = get();
    if (!gasApiUrl) {
      showToast("❌ 請先至設定頁面設定 Google Apps Script 網址！");
      return;
    }
    set({ isLoading: true });
    try {
      const rO = await fetch(`${gasApiUrl}?action=getOnlineOrders`);
      if (rO.ok) {
        const dO = await rO.json();
        const currentProducts = get().products;
        const resolvedO = normalizeAndFillOnlineOrders(dO || [], currentProducts);

        await dbOnlineOrders.clear();
        for (let i = 0; i < resolvedO.length; i++) {
          const o = resolvedO[i];
          await dbOnlineOrders.setItem(`${o.order_id}_${o.product_id || 'unlinked'}_${i}`, o);
        }
        set({ onlineOrders: resolvedO });
        showToast(`✨ 成功讀取 ${resolvedO.length} 筆網路訂單資料！`);
      } else {
        throw new Error(`狀態碼: ${rO.status}`);
      }
    } catch (e: any) {
      console.error("fetchOnlineOrders error:", e);
      showToast(`❌ 讀取網路訂單失敗: ${e.message}`);
    } finally {
      set({ isLoading: false });
    }
  },

  updateOnlineOrderStatus: async (orderId: string, status: string, productId?: string) => {
    const { gasApiUrl, onlineOrders } = get();
    // Update local state first for instant responsiveness
    const updatedOrders = onlineOrders.map(o => {
      const matchOrder = o.order_id === orderId;
      const matchProduct = productId ? o.product_id === productId : true;
      if (matchOrder && matchProduct) {
        return { ...o, order_status: status, status: status };
      }
      return o;
    });
    set({ onlineOrders: updatedOrders });
    
    // Save to local cache
    await dbOnlineOrders.clear();
    for (const o of updatedOrders) {
      await dbOnlineOrders.setItem(`${o.order_id}_${o.product_id}`, o);
    }

    if (!gasApiUrl) return true;

    // Send status update request to the Google Apps Script
    try {
      const response = await fetch(`${gasApiUrl}?action=updateOnlineOrder`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ order_id: orderId, status, order_status: status, product_id: productId })
      });
      if (response.ok) {
        return true;
      }
    } catch (err) {
      console.error("Failed to update order status on cloud:", err);
    }
    return true;
  },

  deleteOnlineOrder: async (orderId: string) => {
    const { gasApiUrl, onlineOrders } = get();
    const updatedOrders = onlineOrders.filter(o => o.order_id !== orderId);
    set({ onlineOrders: updatedOrders });

    // Save to local cache
    await dbOnlineOrders.clear();
    for (const o of updatedOrders) {
      await dbOnlineOrders.setItem(`${o.order_id}_${o.product_id}`, o);
    }

    if (!gasApiUrl) return true;

    // Send delete request to the Google Apps Script
    try {
      const response = await fetch(`${gasApiUrl}?action=deleteOnlineOrder`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ order_id: orderId })
      });
      if (response.ok) {
        return true;
      }
    } catch (err) {
      console.error("Failed to delete online order on cloud:", err);
    }
    return true;
  },

  addProduct: async (product) => {
    // Format date specifically as requested
    const d = new Date();
    const pad = (n: number) => n < 10 ? '0' + n : n;
    const formattedDate = `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

    // If product_id is not provided, we store it with a temporary UUID locally
    const id = product.product_id || `TEMP_${uuidv4().substring(0, 8)}`;
    const newProduct: Product = { ...product, product_id: id, created_at: formattedDate };
    
    // Save to local cache optimistic update
    await dbProducts.setItem(newProduct.product_id, newProduct);
    set(state => {
      const filtered = state.products.filter(p => p.product_id !== id);
      const newProducts = [...filtered, newProduct];
      return { products: newProducts };
    });
    
    // Queue the sync to Google Sheets (Original payload if it was empty id)
    const syncPayload = { ...product, created_at: formattedDate };
    await get().enqueueAction('addProduct', syncPayload);
  },

  editProduct: async (product) => {
    // Write updated product directly to dbProducts cache
    await dbProducts.setItem(product.product_id, product);
    
    // Update state first
    set(state => ({
      products: state.products.map(p => p.product_id === product.product_id ? { ...p, ...product } : p)
    }));

    await get().enqueueAction('editProduct', product);
  },

  deleteProduct: async (productId) => {
    await dbProducts.removeItem(productId);
    set(state => ({ products: state.products.filter(p => p.product_id !== productId) }));
    await get().enqueueAction('deleteProduct', { product_id: productId });
  },

  toggleDiscontinued: async (productId: string) => {
    const { products, editProduct, showToast } = get();
    const prod = products.find(p => p.product_id === productId);
    if (!prod) return;
    const nextStatus = !prod.is_discontinued;
    const updated = { ...prod, is_discontinued: nextStatus };
    await editProduct(updated);
    showToast(nextStatus ? `⏸️ 【${prod.name}】已標記為暫時停產（廠商生產中）` : `🟢 【${prod.name}】已恢復為正常供應`);
  },

  addVendor: async (vendor) => {
    // Save to local cache optimistic update
    await dbVendors.setItem(vendor.vendor_id, vendor);
    set(state => ({ vendors: [...state.vendors, vendor] }));
    
    // Queue the sync to Google Sheets
    await get().enqueueAction('addVendor', vendor);
  },

  editVendor: async (vendor) => {
    await dbVendors.setItem(vendor.vendor_id, vendor);
    set(state => ({ vendors: state.vendors.map(v => v.vendor_id === vendor.vendor_id ? vendor : v) }));
    await get().enqueueAction('editVendor', vendor);
  },

  deleteVendor: async (vendorId) => {
    await dbVendors.removeItem(vendorId);
    set(state => ({ vendors: state.vendors.filter(v => v.vendor_id !== vendorId) }));
    await get().enqueueAction('deleteVendor', { vendor_id: vendorId });
  },

  reformatDatabase: async () => {
    const { gasApiUrl } = get();
    if (!gasApiUrl) return;
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`${gasApiUrl}?action=reformatDatabase`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({})
      });
      if (res.ok) {
        get().showToast('✅ 資料庫已重新排版並派發 ID！');
        await get().fetchRemoteData();
      } else {
        throw new Error('伺服器回應異常');
      }
    } catch (e: any) {
      set({ error: `重整失敗: ${e.message}` });
    } finally {
      set({ isLoading: false });
    }
  },

  overwriteCloudStock: async () => {
    const { gasApiUrl, stock } = get();
    if (!gasApiUrl) return false;
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`${gasApiUrl}?action=overwriteStock`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(stock)
      });
      if (res.ok) {
        const d = await res.json();
        if (d.success) {
          get().showToast(`✅ 庫存工作表已同步修復！共覆載了 ${stock.length} 筆庫存紀錄。`);
          return true;
        }
      }
      throw new Error('伺服器回應異常，請確認 Web App 已更新為最新代碼！');
    } catch (e: any) {
      set({ error: `強行修復庫存表失敗: ${e.message}` });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  overwriteCloudTransactions: async () => {
    const { gasApiUrl, transactions, products } = get();
    if (!gasApiUrl) return false;
    set({ isLoading: true, error: null });
    try {
      const prodCostMap = new Map(products.map(p => [p.product_id, Number(p.cost_price) || 0]));
      const sanitized = transactions.map(t => {
        let cp = Number(t.cost_price);
        if (isNaN(cp) || cp === 0) {
          if (t.product_id && prodCostMap.has(t.product_id)) {
            cp = prodCostMap.get(t.product_id) || 0;
          } else {
            cp = 0;
          }
        }
        return {
          ...t,
          cost_price: cp,
          price: Number(t.price) || 0,
          quantity: Number(t.quantity) || 0
        };
      });

      const res = await fetch(`${gasApiUrl}?action=overwriteTransactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(sanitized)
      });
      if (res.ok) {
        const d = await res.json();
        if (d.success) {
          get().showToast(`✅ 進出貨紀錄工作表已補齊！共覆載了 ${transactions.length} 筆紀錄。`);
          return true;
        }
      }
      throw new Error('伺服器回應異常，請確認 Web App 已更新為最新代碼！');
    } catch (e: any) {
      set({ error: `強行修復紀錄表失敗: ${e.message}` });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  deleteTransaction: async (targetId: string) => {
    const { stock, transactions } = get();
    // Match by item unique ID first, or fall back to transaction_id
    const tx = transactions.find(t => t.id === targetId) || transactions.find(t => t.transaction_id === targetId);
    if (!tx) return;

    let updatedStock = [...stock];

    if (tx.type === 'stock_in') {
      const idx = updatedStock.findIndex(s =>
        s.product_id === tx.product_id &&
        (s.location || '') === (tx.location || '') &&
        (s.floor || '') === (tx.floor || '') &&
        (s.area || '') === (tx.area || '') &&
        (s.specification || '') === (tx.specification || '')
      );
      if (idx !== -1) {
        const newQty = updatedStock[idx].quantity - Number(tx.quantity);
        if (newQty <= 0) {
          const removedStockId = updatedStock[idx].stock_id;
          updatedStock.splice(idx, 1);
          await dbStock.removeItem(removedStockId);
        } else {
          updatedStock[idx] = {
            ...updatedStock[idx],
            quantity: newQty,
            last_update: new Date().toISOString()
          };
          await dbStock.setItem(updatedStock[idx].stock_id, updatedStock[idx]);
        }
      }
    } else if (tx.type === 'stock_out') {
      const idx = updatedStock.findIndex(s =>
        s.product_id === tx.product_id &&
        (s.location || '') === (tx.location || '') &&
        (s.floor || '') === (tx.floor || '') &&
        (s.area || '') === (tx.area || '') &&
        (s.specification || '') === (tx.specification || '')
      );
      if (idx !== -1) {
        updatedStock[idx] = {
          ...updatedStock[idx],
          quantity: updatedStock[idx].quantity + Number(tx.quantity),
          last_update: new Date().toISOString()
        };
        await dbStock.setItem(updatedStock[idx].stock_id, updatedStock[idx]);
      } else {
        const newS: Stock = {
          stock_id: `STK_${Date.now()}_${Math.random().toString(36).substring(2,7)}`,
          product_id: tx.product_id,
          location: tx.location || '倉庫',
          floor: tx.floor || '1F',
          area: tx.area || 'A區',
          quantity: Number(tx.quantity),
          specification: tx.specification || '',
          last_update: new Date().toISOString()
        };
        updatedStock.push(newS);
        await dbStock.setItem(newS.stock_id, newS);
      }
    }

    // Filter out ONLY the single matched item
    const updatedTx = transactions.filter(t => t.id ? t.id !== tx.id : t.transaction_id !== targetId);
    if (tx.id) {
      await dbTransactions.removeItem(tx.id);
    } else {
      await dbTransactions.removeItem(tx.transaction_id);
    }

    set({ stock: updatedStock, transactions: updatedTx });
    get().showToast('✅ 已成功刪除該品項交易紀錄，並已更新庫存！');

    // Sync to cloud spreadsheet if configured
    if (get().gasApiUrl) {
      await get().overwriteCloudTransactions();
      await get().overwriteCloudStock();
    }
  },

  deleteTransactionGroup: async (groupIdOrIds: string | string[]) => {
    const { stock, transactions } = get();
    let groupTxs: Transaction[] = [];

    if (Array.isArray(groupIdOrIds)) {
      const idSet = new Set(groupIdOrIds.map(id => String(id)));
      groupTxs = transactions.filter(t => (t.id && idSet.has(t.id)) || (t.transaction_id && idSet.has(t.transaction_id)));
    } else {
      const gid = String(groupIdOrIds);
      groupTxs = transactions.filter(t => t.transaction_id === gid || t.online_order_id === gid || t.id === gid);
    }

    if (groupTxs.length === 0) return;

    let updatedStock = [...stock];

    for (const tx of groupTxs) {
      if (tx.type === 'stock_in') {
        const idx = updatedStock.findIndex(s =>
          s.product_id === tx.product_id &&
          (s.location || '') === (tx.location || '') &&
          (s.floor || '') === (tx.floor || '') &&
          (s.area || '') === (tx.area || '') &&
          (s.specification || '') === (tx.specification || '')
        );
        if (idx !== -1) {
          const newQty = updatedStock[idx].quantity - Number(tx.quantity);
          if (newQty <= 0) {
            const removedStockId = updatedStock[idx].stock_id;
            updatedStock.splice(idx, 1);
            await dbStock.removeItem(removedStockId);
          } else {
            updatedStock[idx] = {
              ...updatedStock[idx],
              quantity: newQty,
              last_update: new Date().toISOString()
            };
            await dbStock.setItem(updatedStock[idx].stock_id, updatedStock[idx]);
          }
        }
      } else if (tx.type === 'stock_out') {
        const idx = updatedStock.findIndex(s =>
          s.product_id === tx.product_id &&
          (s.location || '') === (tx.location || '') &&
          (s.floor || '') === (tx.floor || '') &&
          (s.area || '') === (tx.area || '') &&
          (s.specification || '') === (tx.specification || '')
        );
        if (idx !== -1) {
          updatedStock[idx] = {
            ...updatedStock[idx],
            quantity: updatedStock[idx].quantity + Number(tx.quantity),
            last_update: new Date().toISOString()
          };
          await dbStock.setItem(updatedStock[idx].stock_id, updatedStock[idx]);
        } else {
          const newS: Stock = {
            stock_id: `STK_${Date.now()}_${Math.random().toString(36).substring(2,7)}`,
            product_id: tx.product_id,
            location: tx.location || '倉庫',
            floor: tx.floor || '1F',
            area: tx.area || 'A區',
            quantity: Number(tx.quantity),
            specification: tx.specification || '',
            last_update: new Date().toISOString()
          };
          updatedStock.push(newS);
          await dbStock.setItem(newS.stock_id, newS);
        }
      }
      if (tx.id) {
        await dbTransactions.removeItem(tx.id);
      }
      if (tx.transaction_id) {
        await dbTransactions.removeItem(tx.transaction_id);
      }
    }

    const removedIdSet = new Set(groupTxs.map(t => t.id || t.transaction_id));
    const removedTxIdSet = new Set(groupTxs.map(t => t.transaction_id));
    const updatedTx = transactions.filter(t => !removedIdSet.has(t.id || t.transaction_id) && !removedTxIdSet.has(t.transaction_id));

    set({ stock: updatedStock, transactions: updatedTx });
    get().showToast('✅ 已成功刪除整批交易紀錄，並已還原對應庫存！');

    if (get().gasApiUrl) {
      await get().overwriteCloudTransactions();
      await get().overwriteCloudStock();
    }
  },

  editTransaction: async (targetId: string, updatedFields: Partial<Transaction>) => {
    const { stock, transactions } = get();
    const oldTx = transactions.find(t => t.id === targetId) || transactions.find(t => t.transaction_id === targetId);
    if (!oldTx) return;

    const newTx = { ...oldTx, ...updatedFields } as Transaction;

    // We first revert the oldTx stock effect, then apply the newTx stock effect
    let updatedStock = [...stock];

    // 1. Revert Old Transaction's Effect on Stock
    if (oldTx.type === 'stock_in') {
      const idx = updatedStock.findIndex(s =>
        s.product_id === oldTx.product_id &&
        s.location === oldTx.location &&
        s.floor === oldTx.floor &&
        s.area === oldTx.area &&
        (s.specification || '') === (oldTx.specification || '')
      );
      if (idx !== -1) {
        const prevQty = updatedStock[idx].quantity - Number(oldTx.quantity);
        if (prevQty <= 0) {
          const removedStockId = updatedStock[idx].stock_id;
          updatedStock.splice(idx, 1);
          await dbStock.removeItem(removedStockId);
        } else {
          updatedStock[idx] = {
            ...updatedStock[idx],
            quantity: prevQty,
            last_update: new Date().toISOString()
          };
          await dbStock.setItem(updatedStock[idx].stock_id, updatedStock[idx]);
        }
      }
    } else if (oldTx.type === 'stock_out') {
      const idx = updatedStock.findIndex(s =>
        s.product_id === oldTx.product_id &&
        s.location === oldTx.location &&
        s.floor === oldTx.floor &&
        s.area === oldTx.area &&
        (s.specification || '') === (oldTx.specification || '')
      );
      if (idx !== -1) {
        updatedStock[idx] = {
          ...updatedStock[idx],
          quantity: updatedStock[idx].quantity + Number(oldTx.quantity),
          last_update: new Date().toISOString()
        };
        await dbStock.setItem(updatedStock[idx].stock_id, updatedStock[idx]);
      } else {
        const newS: Stock = {
          stock_id: `STK_${Date.now()}_${Math.random().toString(36).substring(2,7)}`,
          product_id: oldTx.product_id,
          location: oldTx.location,
          floor: oldTx.floor,
          area: oldTx.area,
          quantity: Number(oldTx.quantity),
          specification: oldTx.specification || '',
          last_update: new Date().toISOString()
        };
        updatedStock.push(newS);
        await dbStock.setItem(newS.stock_id, newS);
      }
    }

    // 2. Apply New Transaction's Effect on Stock
    if (newTx.type === 'stock_in') {
      const idx = updatedStock.findIndex(s =>
        s.product_id === newTx.product_id &&
        s.location === newTx.location &&
        s.floor === newTx.floor &&
        s.area === newTx.area &&
        (s.specification || '') === (newTx.specification || '')
      );
      if (idx !== -1) {
        updatedStock[idx] = {
          ...updatedStock[idx],
          quantity: updatedStock[idx].quantity + Number(newTx.quantity),
          last_update: new Date().toISOString()
        };
        await dbStock.setItem(updatedStock[idx].stock_id, updatedStock[idx]);
      } else {
        const newS: Stock = {
          stock_id: `STK_${Date.now()}_${Math.random().toString(36).substring(2,7)}`,
          product_id: newTx.product_id,
          location: newTx.location,
          floor: newTx.floor,
          area: newTx.area,
          quantity: Number(newTx.quantity),
          specification: newTx.specification || '',
          last_update: new Date().toISOString()
        };
        updatedStock.push(newS);
        await dbStock.setItem(newS.stock_id, newS);
      }
    } else if (newTx.type === 'stock_out') {
      const idx = updatedStock.findIndex(s =>
        s.product_id === newTx.product_id &&
        s.location === newTx.location &&
        s.floor === newTx.floor &&
        s.area === newTx.area &&
        (s.specification || '') === (newTx.specification || '')
      );
      if (idx !== -1) {
        const newQty = updatedStock[idx].quantity - Number(newTx.quantity);
        if (newQty <= 0) {
          const removedStockId = updatedStock[idx].stock_id;
          updatedStock.splice(idx, 1);
          await dbStock.removeItem(removedStockId);
        } else {
          updatedStock[idx] = {
            ...updatedStock[idx],
            quantity: newQty,
            last_update: new Date().toISOString()
          };
          await dbStock.setItem(updatedStock[idx].stock_id, updatedStock[idx]);
        }
      } else {
        const newS: Stock = {
          stock_id: `STK_${Date.now()}_${Math.random().toString(36).substring(2,7)}`,
          product_id: newTx.product_id,
          location: newTx.location,
          floor: newTx.floor,
          area: newTx.area,
          quantity: -Number(newTx.quantity),
          specification: newTx.specification || '',
          last_update: new Date().toISOString()
        };
        updatedStock.push(newS);
        await dbStock.setItem(newS.stock_id, newS);
      }
    } else if (newTx.type === 'adjust') {
      const idx = updatedStock.findIndex(s =>
        s.product_id === newTx.product_id &&
        s.location === newTx.location &&
        s.floor === newTx.floor &&
        s.area === newTx.area &&
        (s.specification || '') === (newTx.specification || '')
      );
      if (idx !== -1) {
        updatedStock[idx] = {
          ...updatedStock[idx],
          quantity: Number(newTx.quantity),
          last_update: new Date().toISOString()
        };
        await dbStock.setItem(updatedStock[idx].stock_id, updatedStock[idx]);
      } else {
        const newS: Stock = {
          stock_id: `STK_${Date.now()}_${Math.random().toString(36).substring(2,7)}`,
          product_id: newTx.product_id,
          location: newTx.location,
          floor: newTx.floor,
          area: newTx.area,
          quantity: Number(newTx.quantity),
          specification: newTx.specification || '',
          last_update: new Date().toISOString()
        };
        updatedStock.push(newS);
        await dbStock.setItem(newS.stock_id, newS);
      }
    }

    const updatedTx = transactions
      .map(t => (t.id ? t.id === oldTx.id : t.transaction_id === targetId) ? newTx : t)
      .sort((a, b) => getTxTimestamp(b.date) - getTxTimestamp(a.date));
    await dbTransactions.setItem(newTx.id || newTx.transaction_id, newTx);

    set({ stock: updatedStock, transactions: updatedTx });
    get().showToast('✅ 紀錄已成功更新，並已對應調整本地庫存！');

    // Sync to cloud spreadsheet if configured
    if (get().gasApiUrl) {
      await get().overwriteCloudTransactions();
      await get().overwriteCloudStock();
    }
  }
}));
