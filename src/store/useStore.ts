import { create } from 'zustand';
import { dbProducts, dbStock, dbVendors, dbSyncQueue, dbSettings, dbTransactions, Product, Stock, Vendor, SyncItem, Transaction } from '../lib/db';
import { v4 as uuidv4 } from 'uuid';

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
  toastMessage: string | null;
  showToast: (msg: string) => void;
  lowStockAlertEnabled: boolean;
  setLowStockAlertEnabled: (enabled: boolean) => Promise<void>;
  expiryThreshold: number;
  setExpiryThreshold: (days: number) => Promise<void>;
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

      set({ products: pList, stock: sList, vendors: vList, transactions: tList.sort((a,b) => b.date.localeCompare(a.date)) });
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
    const item: SyncItem = {
      id: uuidv4(),
      action,
      payload: { ...payload, operator: get().operator },
      timestamp: new Date().toISOString()
    };
    await dbSyncQueue.setItem(item.id, item);
    
    // Locally optimistically update stock and transactions
    const { stock, transactions } = get();
    const now = new Date().toISOString().replace('T', ' ').split('.')[0];
    const stockId = payload.stock_id || `${payload.product_id}_${payload.location}_${payload.floor}_${payload.area}_${payload.expiry_date || ''}_${payload.specification || ''}`;
    
    let newStock = [...stock];
    const existingIndex = newStock.findIndex(s => s.stock_id === stockId);
    
    let transactionType: 'stock_in' | 'stock_out' | 'adjust' = 'adjust';

    if (action === 'stockIn') {
        transactionType = 'stock_in';
        if (existingIndex > -1) {
            newStock[existingIndex] = { ...newStock[existingIndex], quantity: newStock[existingIndex].quantity + payload.quantity, last_update: now };
        } else {
            newStock.push({
                stock_id: stockId,
                product_id: payload.product_id,
                location: payload.location,
                floor: payload.floor,
                area: payload.area,
                quantity: payload.quantity,
                expiry_date: payload.expiry_date,
                specification: payload.specification,
                last_update: now
            });
        }
    } else if (action === 'stockOut') {
        transactionType = 'stock_out';
        if (existingIndex > -1) {
            const updatedQty = Math.max(0, newStock[existingIndex].quantity - payload.quantity);
            if (updatedQty <= 0) {
                const idToRemove = newStock[existingIndex].stock_id;
                newStock.splice(existingIndex, 1);
                await dbStock.removeItem(idToRemove);
            } else {
                newStock[existingIndex] = { ...newStock[existingIndex], quantity: updatedQty, last_update: now };
            }
        }
    } else if (action === 'adjustStock') {
        transactionType = 'adjust';
        if (payload.quantity <= 0) {
            if (existingIndex > -1) {
                const idToRemove = newStock[existingIndex].stock_id;
                newStock.splice(existingIndex, 1);
                await dbStock.removeItem(idToRemove);
            }
        } else {
            if (existingIndex > -1) {
                newStock[existingIndex] = { ...newStock[existingIndex], quantity: payload.quantity, last_update: now };
            } else {
                newStock.push({
                    stock_id: stockId,
                    product_id: payload.product_id,
                    location: payload.location,
                    floor: payload.floor,
                    area: payload.area,
                    quantity: payload.quantity,
                    expiry_date: payload.expiry_date,
                    specification: payload.specification,
                    last_update: now
                });
            }
        }
    }

    // Add optimistic transaction
    const newId = uuidv4();
    const newTransaction: Transaction = {
        id: newId,
        transaction_id: `OPT_${newId}`,
        product_id: payload.product_id,
        type: transactionType,
        quantity: payload.quantity,
        date: now,
        operator: get().operator,
        location: payload.location,
        floor: payload.floor,
        area: payload.area,
        cost_price: payload.cost_price,
        vendor_id: payload.vendor_id,
        note: payload.note
    };

    set((state) => ({ 
        syncQueue: [...state.syncQueue, item], 
        stock: newStock,
        transactions: [newTransaction, ...state.transactions]
    }));
    
    // Also save updated stock and transaction to localforage immediately
    await dbTransactions.setItem(newTransaction.transaction_id!, newTransaction);
    for (const s of newStock) {
        await dbStock.setItem(s.stock_id, s);
    }
    
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
        
        // Normalize boolean strings from GAS DisplayValues
        const normalizedProducts = dP.map((p: any) => ({
          ...p,
          has_expiry: String(p.has_expiry).toUpperCase() === 'TRUE',
          cost_price: Number(p.cost_price) || 0,
          min_stock: p.min_stock !== undefined ? Number(p.min_stock) : undefined
        }));

        await dbProducts.clear();
        for (const p of normalizedProducts) {
          if (p.product_id) await dbProducts.setItem(p.product_id, p);
        }
        set({ products: normalizedProducts });
      } else {
         throw new Error(`商品資料獲取失敗狀態碼: ${rP.status}`);
      }

      // Stock
      const rS = await fetch(`${gasApiUrl}?action=getStock`);
      if (rS.ok) {
        const dS = await rS.json();
        await dbStock.clear();
        for (const s of dS) {
          if (s.stock_id) await dbStock.setItem(s.stock_id, s);
        }
        set({ stock: dS });
      } else {
         throw new Error(`庫存資料獲取失敗狀態碼: ${rS.status}`);
      }

      // Vendors
      const rV = await fetch(`${gasApiUrl}?action=getVendors`);
      if (rV.ok) {
        const dV = await rV.json();
        await dbVendors.clear();
        for (const v of dV) {
          if (v.vendor_id) await dbVendors.setItem(v.vendor_id, v);
        }
        set({ vendors: dV });
      } else {
         throw new Error(`供應商資料獲取失敗狀態碼: ${rV.status}`);
      }

      // Transactions
      const rT = await fetch(`${gasApiUrl}?action=getTransactions`);
      if (rT.ok) {
        const dT = await rT.json();
        await dbTransactions.clear();
        for (const t of dT) {
          if (t.transaction_id) await dbTransactions.setItem(t.transaction_id, t);
        }
        set({ transactions: dT.sort((a: any, b: any) => b.date.localeCompare(a.date)) });
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

    const newProduct: Product = { ...product, created_at: formattedDate };
    
    // Save to local cache optimistic update
    await dbProducts.setItem(newProduct.product_id, newProduct);
    set(state => ({ products: [...state.products, newProduct] }));
    
    // Queue the sync to Google Sheets
    await get().enqueueAction('addProduct', newProduct);
  },

  editProduct: async (product) => {
    await dbProducts.setItem(product.product_id, product);
    set(state => ({ products: state.products.map(p => p.product_id === product.product_id ? product : p) }));
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
  }
}));
