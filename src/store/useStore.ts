import { create } from 'zustand';
import { dbProducts, dbStock, dbVendors, dbSyncQueue, dbSettings, dbTransactions, Product, Stock, Vendor, SyncItem, Transaction } from '../lib/db';
import { v4 as uuidv4 } from 'uuid';
import { format, subDays } from 'date-fns';

interface AppState {
  products: Product[];
  stock: Stock[];
  vendors: Vendor[];
  transactions: Transaction[];
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
  addProduct: (product: Omit<Product, 'created_at'>, isManual?: boolean) => Promise<void>;
  editProduct: (product: Product) => Promise<void>;
  deleteProduct: (productId: string) => Promise<void>;
  addVendor: (vendor: Vendor) => Promise<void>;
  editVendor: (vendor: Vendor) => Promise<void>;
  deleteVendor: (vendorId: string) => Promise<void>;
  reformatDatabase: () => Promise<void>;
  overwriteCloudStock: () => Promise<boolean>;
  overwriteCloudTransactions: () => Promise<boolean>;
  editTransaction: (transactionId: string, updatedFields: Partial<Transaction>) => Promise<void>;
  deleteTransaction: (transactionId: string) => Promise<void>;
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
    sortOrder: string;
    showFilters: boolean;
  };
  setProductsPageState: (state: Partial<AppState['productsPageState']>) => void;

  transactionsPageState: {
    filterType: string;
    searchTerm: string;
    startDate: string;
    endDate: string;
    filterLocation: string;
    showFilters: boolean;
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
    sortOrder: 'name_asc',
    showFilters: false
  },
  setProductsPageState: (newState) => {
    set((state) => ({ productsPageState: { ...state.productsPageState, ...newState } }));
  },

  transactionsPageState: {
    filterType: '',
    searchTerm: '',
    startDate: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    filterLocation: '',
    showFilters: false
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

      set({ products: pList, stock: sList, vendors: vList, transactions: tList.sort((a,b) => String(b.date || '').localeCompare(String(a.date || ''))) });
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
    if (product && !updatedPayload.name) {
        updatedPayload.name = product.name;
    }

    const item: SyncItem = {
      id: uuidv4(),
      action,
      payload: { ...updatedPayload, operator: get().operator },
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
                name: product?.name || '',
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
            id: uuidv4(),
            transaction_id: `TX_${Date.now()}`,
            product_id: updatedPayload.product_id,
            type: 'stock_in',
            quantity: Number(updatedPayload.quantity),
            location: updatedPayload.location,
            floor: updatedPayload.floor,
            area: updatedPayload.area,
            specification: updatedPayload.specification || '',
            cost_price: Number(updatedPayload.cost_price) || 0,
            vendor_id: updatedPayload.vendor_id || '',
            date: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
            note: updatedPayload.note || '',
            operator: get().operator
        };

        const updatedTx = [newTx, ...transactions];
        await dbTransactions.setItem(newTx.transaction_id, newTx);
        
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
            id: uuidv4(),
            transaction_id: `TX_${Date.now()}`,
            product_id: updatedPayload.product_id,
            type: 'stock_out',
            quantity: Number(updatedPayload.quantity),
            location: updatedPayload.location,
            floor: updatedPayload.floor,
            area: updatedPayload.area,
            specification: updatedPayload.specification || '',
            cost_price: product?.cost_price || 0,
            vendor_id: product?.vendor_id || '',
            date: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
            note: updatedPayload.note || '',
            operator: get().operator
        };

        const updatedTx = [newTx, ...transactions];
        await dbTransactions.setItem(newTx.transaction_id, newTx);

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
        }

        const newTx: Transaction = {
            id: uuidv4(),
            transaction_id: `TX_${Date.now()}`,
            product_id: updatedPayload.product_id,
            type: 'adjust',
            quantity: Number(updatedPayload.quantity),
            location: updatedPayload.location,
            floor: updatedPayload.floor,
            area: updatedPayload.area,
            specification: updatedPayload.specification || '',
            cost_price: product?.cost_price || 0,
            vendor_id: product?.vendor_id || '',
            date: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
            note: updatedPayload.note || '',
            operator: get().operator
        };

        const updatedTx = [newTx, ...transactions];
        await dbTransactions.setItem(newTx.transaction_id, newTx);

        set({ stock: updatedStock, transactions: updatedTx });
    }

    set((state) => ({ 
        syncQueue: [...state.syncQueue, item]
    }));
    
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
    if (!gasApiUrl) return;

    set({ isLoading: true, error: null });
    try {
      // Products
      const rP = await fetch(`${gasApiUrl}?action=getProducts`);
      if (rP.ok) {
        const dP = await rP.json();
        
        // If there are duplicate product_ids or multiple records, merge their specifications cleanly
        const productMap: Record<string, any> = {};
        dP.filter((p: any) => p && p.product_id).forEach((p: any) => {
          const id = p.product_id;
          if (!productMap[id]) {
            productMap[id] = {
              ...p,
              has_expiry: String(p.has_expiry).toUpperCase() === 'TRUE',
              cost_price: Number(p.cost_price) || 0,
              min_stock: p.min_stock !== undefined ? Number(p.min_stock) : undefined
            };
          } else {
            // Merge specifications
            const s1 = productMap[id].specification || '';
            const s2 = p.specification || '';
            const combinedSpecs = Array.from(new Set(
              [s1, s2]
                .flatMap(spec => spec ? spec.split(/[,\/，\s、]+/).map((s: any) => s.trim()).filter(Boolean) : [])
            )).join('、');
            productMap[id].specification = combinedSpecs;
          }
        });

        const normalizedProducts = Object.values(productMap);

        await dbProducts.clear();
        for (const p of normalizedProducts) {
          await dbProducts.setItem(p.product_id, p);
        }
        set({ products: normalizedProducts });
      } else {
         throw new Error(`商品資料獲取失敗狀態碼: ${rP.status}`);
      }

      // Stock
      const rS = await fetch(`${gasApiUrl}?action=getStock`);
      if (rS.ok) {
        const dS = await rS.json();
        const validS = dS.filter((s: any) => s && s.stock_id);
        await dbStock.clear();
        for (const s of validS) {
          await dbStock.setItem(s.stock_id, s);
        }
        set({ stock: validS });
      } else {
         throw new Error(`庫存資料獲取失敗狀態碼: ${rS.status}`);
      }

      // Vendors
      const rV = await fetch(`${gasApiUrl}?action=getVendors`);
      if (rV.ok) {
        const dV = await rV.json();
        const validV = dV.filter((v: any) => v && v.vendor_id);
        await dbVendors.clear();
        for (const v of validV) {
          await dbVendors.setItem(v.vendor_id, v);
        }
        set({ vendors: validV });
      } else {
         throw new Error(`供應商資料獲取失敗狀態碼: ${rV.status}`);
      }

      // Transactions
      const rT = await fetch(`${gasApiUrl}?action=getTransactions`);
      if (rT.ok) {
        const dT = await rT.json();
        const validT = dT.filter((t: any) => t && t.transaction_id);
        await dbTransactions.clear();
        for (const t of validT) {
          await dbTransactions.setItem(t.transaction_id, t);
        }
        set({ transactions: validT.sort((a: any, b: any) => String(b.date || '').localeCompare(String(a.date || ''))) });
      }

    } catch (e: any) {
      console.error("fetchRemoteData error:", e);
      set({ error: `獲取遠端資料失敗 (${e.message})。目前為離線模式。`});
    } finally {
      set({ isLoading: false });
    }
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
      return { products: [...filtered, newProduct] };
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
    const { gasApiUrl, transactions } = get();
    if (!gasApiUrl) return false;
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`${gasApiUrl}?action=overwriteTransactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(transactions)
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

  deleteTransaction: async (transactionId: string) => {
    const { stock, transactions } = get();
    const tx = transactions.find(t => t.transaction_id === transactionId);
    if (!tx) return;

    let updatedStock = [...stock];

    if (tx.type === 'stock_in') {
      const idx = updatedStock.findIndex(s =>
        s.product_id === tx.product_id &&
        s.location === tx.location &&
        s.floor === tx.floor &&
        s.area === tx.area &&
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
        s.location === tx.location &&
        s.floor === tx.floor &&
        s.area === tx.area &&
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
          location: tx.location,
          floor: tx.floor,
          area: tx.area,
          quantity: Number(tx.quantity),
          specification: tx.specification || '',
          last_update: new Date().toISOString()
        };
        updatedStock.push(newS);
        await dbStock.setItem(newS.stock_id, newS);
      }
    }

    const updatedTx = transactions.filter(t => t.transaction_id !== transactionId);
    await dbTransactions.removeItem(transactionId);

    set({ stock: updatedStock, transactions: updatedTx });
    get().showToast('✅ 已成功刪除紀錄，並已更新本地庫存！');

    // Sync to cloud spreadsheet if configured
    if (get().gasApiUrl) {
      await get().overwriteCloudTransactions();
      await get().overwriteCloudStock();
    }
  },

  editTransaction: async (transactionId: string, updatedFields: Partial<Transaction>) => {
    const { stock, transactions } = get();
    const oldTx = transactions.find(t => t.transaction_id === transactionId);
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

    const updatedTx = transactions.map(t => t.transaction_id === transactionId ? newTx : t);
    await dbTransactions.setItem(transactionId, newTx);

    set({ stock: updatedStock, transactions: updatedTx });
    get().showToast('✅ 紀錄已成功更新，並已對應調整本地庫存！');

    // Sync to cloud spreadsheet if configured
    if (get().gasApiUrl) {
      await get().overwriteCloudTransactions();
      await get().overwriteCloudStock();
    }
  }
}));
