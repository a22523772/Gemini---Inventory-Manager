import localforage from 'localforage';

export const dbProducts = localforage.createInstance({ name: 'StockApp', storeName: 'products' });
export const dbStock = localforage.createInstance({ name: 'StockApp', storeName: 'stock' });
export const dbVendors = localforage.createInstance({ name: 'StockApp', storeName: 'vendors' });
export const dbSyncQueue = localforage.createInstance({ name: 'StockApp', storeName: 'syncQueue' });
export const dbSettings = localforage.createInstance({ name: 'StockApp', storeName: 'settings' });
export const dbTransactions = localforage.createInstance({ name: 'StockApp', storeName: 'transactions' });
export const dbOnlineOrders = localforage.createInstance({ name: 'StockApp', storeName: 'onlineOrders' });

export type OnlineOrder = {
  order_id: string;
  platform: string;
  product_id: string;
  product_name: string;
  quantity: number;
  price: number;
  customer_name: string;
  status: string; // Stored deadline string or raw status
  shipping_deadline?: string; // 最晚出貨期限
  order_status?: string; // 訂單狀態 (可手動修改或自動計算)
  created_at: string;
  specification?: string; // 商品規格
  shipping_method?: string; // 物流方式
};

export type Product = {
  product_id: string;
  barcode: string;
  name: string;
  category: string;
  brand?: string;
  unit: string;
  cost_price: number;
  vendor_id: string;
  has_expiry: boolean;
  min_stock?: number;
  specification?: string;
  expiry_date?: string;
  created_at: string;
  is_synced?: boolean;
  is_discontinued?: boolean; // 暫時停產 (廠商生產中)
  is_out_of_stock?: boolean; // 暫時缺貨
  status?: string; // 狀態 (例如: 正常、暫時缺貨、暫時停產)
};

export type Stock = {
  stock_id: string;
  product_id: string;
  name?: string;
  location: string;
  floor: string;
  area: string;
  quantity: number;
  expiry_date?: string;
  specification?: string;
  last_update: string;
};

export type Vendor = {
  vendor_id: string;
  vendor_name: string;
  contact?: string;
  phone?: string;
};

export type Transaction = {
  id: string;
  transaction_id: string; // for GAS
  online_order_id?: string; // 網路訂單編號
  batch_id?: string; // 批次出貨編號
  batch_tx_id?: string; // 批次出貨關聯號
  platform?: string; // 來源平台 (例如 蝦皮購物、MOMO購物網)
  product_id: string;
  product_name?: string; // 直接記錄商品名稱
  type: string; // 'stock_in' | 'stock_out' | 'adjust' | 平台名稱 (例如 蝦皮購物)
  quantity: number;
  delta?: number; // 盤點變化量 (如 +2 或 -3)
  final_quantity?: number; // 盤點校正後最終數量
  price?: number; // 售價/金額
  location: string;
  floor: string;
  area: string;
  specification?: string;
  cost_price?: number;
  vendor_id?: string;
  date: string;
  note?: string;
  operator: string;
};

// Queue item type
export type SyncItem = {
  id: string; // local uuid
  action: 'stockIn' | 'stockOut' | 'adjustStock' | 'addProduct' | 'addVendor' | 'editProduct' | 'deleteProduct' | 'editVendor' | 'deleteVendor';
  payload: any;
  timestamp: string;
};
