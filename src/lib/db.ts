import localforage from 'localforage';

export const dbProducts = localforage.createInstance({ name: 'StockApp', storeName: 'products' });
export const dbStock = localforage.createInstance({ name: 'StockApp', storeName: 'stock' });
export const dbVendors = localforage.createInstance({ name: 'StockApp', storeName: 'vendors' });
export const dbSyncQueue = localforage.createInstance({ name: 'StockApp', storeName: 'syncQueue' });
export const dbSettings = localforage.createInstance({ name: 'StockApp', storeName: 'settings' });

export type Product = {
  product_id: string;
  barcode: string;
  name: string;
  category: string;
  unit: string;
  cost_price: number;
  vendor_id: string;
  has_expiry: boolean;
  created_at: string;
};

export type Stock = {
  stock_id: string;
  product_id: string;
  location: string;
  floor: string;
  area: string;
  quantity: number;
  expiry_date?: string;
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
  product_id: string;
  type: 'stock_in' | 'stock_out' | 'adjust';
  quantity: number;
  location: string;
  floor: string;
  area: string;
  cost_price?: number;
  vendor_id?: string;
  date: string;
  note?: string;
  operator: string;
};

// Queue item type
export type SyncItem = {
  id: string; // local uuid
  action: 'stockIn' | 'stockOut' | 'adjustStock' | 'addProduct' | 'addVendor';
  payload: any;
  timestamp: string;
};
