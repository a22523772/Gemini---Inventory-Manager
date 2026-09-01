import React, { useState, useMemo } from 'react';
import { Product, Vendor } from '../lib/db';
import { useStore, getOnOrderStockQty } from '../store/useStore';
import { 
  Search, X, Plus, Minus, Check, Package, 
  Layers, Building2, DollarSign, Filter, Sparkles, AlertCircle, Truck 
} from 'lucide-react';

interface ProductCatalogPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  vendors: Vendor[];
  stockMap: Map<string, number>;
  vendorMap: Map<string, string>;
  selectedItems: Array<{
    product_id: string;
    ordered_quantity: number;
    name: string;
    cost_price: number;
  }>;
  onAddProduct: (p: Product, qty?: number) => void;
  onUpdateQuantity: (productId: string, delta: number) => void;
  onAddCustomItem?: () => void;
  defaultVendorName?: string;
}

export default function ProductCatalogPickerModal({
  isOpen,
  onClose,
  products,
  vendors,
  stockMap,
  vendorMap,
  selectedItems,
  onAddProduct,
  onUpdateQuantity,
  onAddCustomItem,
  defaultVendorName
}: ProductCatalogPickerModalProps) {
  const { purchaseOrders } = useStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedVendorFilter, setSelectedVendorFilter] = useState<string>(defaultVendorName || 'ALL');

  // Build quantity map for quick lookup
  const itemQtyMap = useMemo(() => {
    const map = new Map<string, number>();
    selectedItems.forEach(item => {
      if (item.product_id) {
        map.set(item.product_id, (map.get(item.product_id) || 0) + Number(item.ordered_quantity || 0));
      }
    });
    return map;
  }, [selectedItems]);

  // Extract all categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.category && p.category.trim()) {
        set.add(p.category.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  }, [products]);

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      // Safe string checks
      const pName = (p.name || '').toLowerCase();
      const pId = (p.product_id || '').toLowerCase();
      const pSpec = (p.specification || '').toLowerCase();
      const pBarcode = (p.barcode || '').toLowerCase();
      const pCategory = (p.category || '').toLowerCase();
      const pVendorId = (p.vendor_id || '').toLowerCase();
      const pVendorName = (vendorMap.get(p.vendor_id) || '').toLowerCase();

      // Category filter
      if (selectedCategory !== 'ALL' && (p.category || '').trim() !== selectedCategory) {
        return false;
      }

      // Vendor filter
      if (selectedVendorFilter !== 'ALL') {
        const vFilterLower = selectedVendorFilter.toLowerCase();
        const matchesVendor = 
          pVendorId === vFilterLower ||
          pVendorName === vFilterLower ||
          pVendorName.includes(vFilterLower) ||
          vFilterLower.includes(pVendorName);
        if (!matchesVendor) return false;
      }

      // Keyword search
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const matches = 
          pName.includes(term) ||
          pId.includes(term) ||
          pSpec.includes(term) ||
          pBarcode.includes(term) ||
          pCategory.includes(term) ||
          pVendorName.includes(term);
        if (!matches) return false;
      }

      return true;
    });
  }, [products, searchTerm, selectedCategory, selectedVendorFilter, vendorMap]);

  if (!isOpen) return null;

  const totalSelectedCount = selectedItems.reduce((acc, it) => acc + (it.ordered_quantity || 1), 0);
  const totalSelectedKinds = selectedItems.length;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[110] flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-150">
      <div className="w-full max-w-4xl bg-slate-900 border border-white/15 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border-b border-white/10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-xl">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>挑選商品加入採購清單</span>
                <span className="text-xs px-2 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full font-mono">
                  系統建檔共 {products.length} 項
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                可依品名、條碼、類別或供應商篩選，點擊「+ 加入」或調整數量直接登記
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Controls Bar */}
        <div className="p-4 bg-slate-950/60 border-b border-white/10 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                autoFocus
                placeholder="搜尋商品品名、貨號編號、條碼、規格、類別..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-9 py-2.5 bg-white/5 border border-white/15 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:bg-white/10 transition-all"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Vendor Filter */}
            <div className="sm:w-56 shrink-0">
              <select
                value={selectedVendorFilter}
                onChange={(e) => setSelectedVendorFilter(e.target.value)}
                className="w-full bg-slate-900 border border-white/15 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="ALL">全部供應商 ({products.length})</option>
                {vendors.map(v => (
                  <option key={v.vendor_id} value={v.vendor_name || v.name || v.vendor_id}>
                    {v.vendor_name || v.name || v.vendor_id}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar text-xs">
            <span className="text-[11px] text-slate-400 shrink-0 mr-1 flex items-center gap-1">
              <Filter className="w-3 h-3" /> 類別：
            </span>
            <button
              onClick={() => setSelectedCategory('ALL')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 transition-all ${
                selectedCategory === 'ALL'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/5'
              }`}
            >
              全部 ({products.length})
            </button>
            {categories.map(cat => {
              const count = products.filter(p => (p.category || '').trim() === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium shrink-0 transition-all ${
                    selectedCategory === cat
                      ? 'bg-indigo-600 text-white shadow-sm font-bold'
                      : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/5'
                  }`}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Product Cards / Table Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 custom-scrollbar min-h-[300px]">
          {filteredProducts.length === 0 ? (
            <div className="text-center py-12 px-4 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-slate-400">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-slate-300">找不到符合條件的建檔商品</p>
                <p className="text-xs text-slate-500">
                  {searchTerm ? `搜尋「${searchTerm}」無結果` : '目前此篩選條件下沒有商品'}
                </p>
              </div>
              {onAddCustomItem && (
                <button
                  onClick={() => {
                    onAddCustomItem();
                    onClose();
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/20"
                >
                  <Plus className="w-4 h-4" />
                  <span>直接新增自訂採購品項 (非建檔商品)</span>
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {filteredProducts.map(p => {
                const currentQty = itemQtyMap.get(p.product_id) || 0;
                const inStock = stockMap.get(p.product_id) || 0;
                const onOrderQty = getOnOrderStockQty(purchaseOrders, p.product_id, p.specification);
                const vName = vendorMap.get(p.vendor_id) || (p as any).vendor_name || '';

                return (
                  <div
                    key={p.product_id}
                    className={`p-3 rounded-xl border transition-all flex flex-col justify-between gap-2.5 ${
                      currentQty > 0
                        ? 'bg-indigo-950/30 border-indigo-500/50 shadow-sm shadow-indigo-500/10'
                        : 'bg-white/5 hover:bg-white/[0.08] border-white/10'
                    }`}
                  >
                    {/* Top row: Title and info */}
                    <div className="space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-bold text-xs text-white line-clamp-2 leading-relaxed">
                          {p.name}
                        </span>
                        {currentQty > 0 && (
                          <span className="shrink-0 text-[10px] px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full font-bold">
                            已挑選 x{currentQty}
                          </span>
                        )}
                      </div>

                      {/* Specs & Tags */}
                      <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-400">
                        <span className="font-mono text-slate-500 text-[10px]">{p.product_id}</span>
                        {p.specification && (
                          <span className="bg-white/5 px-1.5 py-0.5 rounded text-slate-300 border border-white/5">
                            {p.specification}
                          </span>
                        )}
                        {p.category && (
                          <span className="text-slate-400">
                            • {p.category}
                          </span>
                        )}
                        {vName && (
                          <span className="text-slate-400">
                            • 廠商: {vName}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Bottom Row: Stock, On-Order, Cost Price & Action Controls */}
                    <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs flex-wrap gap-2">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-[11px] text-slate-400">
                          現存: <strong className="text-sky-300 font-mono">{inStock}</strong>
                        </span>
                        {onOrderQty > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded font-mono font-bold">
                            <Truck className="w-3 h-3 text-amber-400" />
                            <span>在途: {onOrderQty}</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500">
                            在途: 0
                          </span>
                        )}
                        <span className="text-[11px] text-slate-400">
                          進價: <strong className="text-amber-300 font-mono">${p.cost_price || 0}</strong>
                        </span>
                      </div>

                      {/* Add / Adjust buttons */}
                      {currentQty > 0 ? (
                        <div className="flex items-center gap-1.5 bg-slate-900 border border-indigo-500/40 rounded-lg p-0.5">
                          <button
                            type="button"
                            onClick={() => onUpdateQuantity(p.product_id, -1)}
                            className="p-1 hover:bg-white/10 text-slate-300 hover:text-white rounded transition-colors"
                            title="減少 1"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="px-2 font-mono font-bold text-xs text-indigo-300">
                            {currentQty}
                          </span>
                          <button
                            type="button"
                            onClick={() => onUpdateQuantity(p.product_id, 1)}
                            className="p-1 hover:bg-white/10 text-indigo-300 hover:text-white rounded transition-colors"
                            title="增加 1"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onAddProduct(p)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow-sm transition-all cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>加入清單</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Summary & Confirmation */}
        <div className="p-4 bg-slate-950 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-xs text-slate-300">
            {onAddCustomItem && (
              <button
                type="button"
                onClick={() => {
                  onAddCustomItem();
                  onClose();
                }}
                className="text-xs text-indigo-400 hover:text-indigo-300 underline cursor-pointer flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>手動新增未建檔自訂品項</span>
              </button>
            )}
            <span className="text-slate-500">|</span>
            <span>
              已挑選：<strong className="text-indigo-300 font-mono font-bold">{totalSelectedKinds}</strong> 種品項（共 <strong className="text-indigo-300 font-mono font-bold">{totalSelectedCount}</strong> 件）
            </span>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold rounded-xl text-xs shadow-lg shadow-indigo-600/20 transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>挑選完成 ({totalSelectedKinds} 項)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
