import { useState, useMemo, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Search, ScanBarcode, PackageOpen, Pencil, Trash2, MoreHorizontal, Filter } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

export default function Products() {
  const { products, stock, deleteProduct, showToast, vendors } = useStore();
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchParams.get('pid') || '');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filterBrand, setFilterBrand] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterVendor, setFilterVendor] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const pid = searchParams.get('pid');
    if (pid) {
      setSearchTerm(pid);
    }
  }, [searchParams]);

  // Extract unique brands and categories for dropdowns
  const brands = useMemo(() => Array.from(new Set(products.map(p => p.brand).filter(Boolean))), [products]);
  const categories = useMemo(() => Array.from(new Set(products.map(p => p.category).filter(Boolean))), [products]);
  const uniqueVendors = useMemo(() => Array.from(new Set(products.map(p => p.vendor_id).filter(Boolean))), [products]);

  // Helper func to get vendor name
  const getVendorName = (vid: string) => {
     const v = vendors.find(v => v.vendor_id === vid);
     return v ? v.vendor_name : vid;
  };

  // Grouping the products by barcode (or product_id if no barcode)
  const groupedProducts = useMemo(() => {
     const groups: Record<string, { product: any, stockEntries: any[], totalStock: number, totalCostValue: number }> = {};
     
     // 1. Identify primary products
     products.forEach(p => {
        const key = p.barcode || p.product_id;
        if (!groups[key]) {
            groups[key] = { product: p, stockEntries: [], totalStock: 0, totalCostValue: 0 };
        } else {
            // Keep the one with simpler/original looking ID if duplicates exist (legacy compatibility)
            if (p.product_id.length < groups[key].product.product_id.length) {
                groups[key].product = p;
            }
        }
     });

     // 2. Map stock entries to these groups
     stock.forEach(s => {
        const p = products.find(prod => prod.product_id === s.product_id);
        if (p) {
            const key = p.barcode || p.product_id;
            if (groups[key]) {
               groups[key].stockEntries.push(s);
               groups[key].totalStock += s.quantity;
               if (p.cost_price && s.quantity > 0) {
                   groups[key].totalCostValue += p.cost_price * s.quantity;
               }
            }
        }
     });

     // Filter groups by search/filters
     const result = Object.values(groups).filter(g => {
        const p = g.product;
        // Search
        if (searchTerm) {
            const q = searchTerm.toLowerCase();
            const matchesSearch = p.name.toLowerCase().includes(q) || 
                                 (p.barcode && String(p.barcode).includes(q)) || 
                                 (p.specification && p.specification.toLowerCase().includes(q)) ||
                                 p.product_id.toLowerCase().includes(q);
            if (!matchesSearch) return false;
        }
        // Filters
        if (filterBrand && p.brand !== filterBrand) return false;
        if (filterCategory && p.category !== filterCategory) return false;
        if (filterVendor && p.vendor_id !== filterVendor) return false;
        
        return true;
     });

     return result.slice(0, 50);
  }, [products, stock, searchTerm, filterBrand, filterCategory, filterVendor]);

  const executeDelete = async (pid: string) => {
    try {
      await deleteProduct(pid);
      showToast('✅ 商品已刪除！');
      setConfirmDeleteId(null);
      setExpandedId(null);
    } catch (e: any) {
      showToast('❌ 刪除失敗: ' + e.message);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="glass-panel border-x-0 border-t-0 px-4 pt-6 pb-4 sticky top-0 z-10">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-main)]">商品列表</h1>
          <div className="flex gap-2">
            <button 
              onClick={() => setShowFilters(!showFilters)} 
              className={`p-2 rounded-full transition-colors ${showFilters ? 'bg-white/20 text-white' : 'glass-panel text-[var(--color-text-dim)] hover:text-white'}`}
            >
              <Filter className="w-5 h-5" />
            </button>
            <Link to="/add-product" className="p-2 bg-[var(--color-accent-blue)] text-[#0f172a] rounded-full hover:opacity-90 transition-opacity active:scale-95 shadow-lg shadow-sky-400/20">
              <span className="flex items-center text-sm font-bold px-2">
                + 新增
              </span>
            </Link>
          </div>
        </div>
        
        <div className="flex flex-col gap-3">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-[var(--color-text-dim)]" />
            </div>
            <input
              type="text"
              className="block w-full pl-10 pr-12 py-3 border border-white/10 rounded-xl leading-5 bg-white/5 placeholder-[var(--color-text-dim)] text-[var(--color-text-main)] focus:outline-none focus:bg-white/10 focus:ring-1 focus:ring-[var(--color-accent-blue)] focus:border-[var(--color-accent-blue)] sm:text-sm transition-colors"
              placeholder="搜尋商品名稱、ID 或條碼..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Link to="/scan?returnTo=/products" className="absolute inset-y-0 right-0 pr-3 flex items-center">
              <ScanBarcode className="h-5 w-5 text-[var(--color-accent-blue)]" />
            </Link>
          </div>

          {showFilters && (
            <div className="flex gap-2 animate-in fade-in slide-in-from-top-2 overflow-x-auto pb-1">
              <select 
                value={filterCategory} 
                onChange={e => setFilterCategory(e.target.value)}
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] appearance-none min-w-[100px]"
              >
                <option value="" className="bg-[#0f172a]">所有分類</option>
                {categories.map(c => <option key={c} value={c} className="bg-[#0f172a]">{c}</option>)}
              </select>
              
              <select 
                value={filterBrand} 
                onChange={e => setFilterBrand(e.target.value)}
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] appearance-none min-w-[100px]"
              >
                <option value="" className="bg-[#0f172a]">所有品牌</option>
                {brands.map(b => <option key={b} value={b} className="bg-[#0f172a]">{b}</option>)}
              </select>

              <select 
                value={filterVendor} 
                onChange={e => setFilterVendor(e.target.value)}
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] appearance-none min-w-[120px]"
              >
                <option value="" className="bg-[#0f172a]">所有供應商</option>
                {uniqueVendors.map(v => <option key={v} value={v} className="bg-[#0f172a]">{getVendorName(v)}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {groupedProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-[var(--color-text-dim)] py-12">
            <PackageOpen className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm font-medium">找不到符合的商品</p>
          </div>
        ) : (
          groupedProducts.map(group => {
            const p = group.product;
            const groupId = p.barcode || p.product_id;
            const isGroupExpanded = expandedId === groupId;

            return (
              <div key={groupId} className="glass-panel border border-[var(--color-glass-border)] rounded-xl p-4 transition-all">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1 pr-2">
                    <h3 className="font-bold text-[var(--color-text-main)] text-base">
                      {p.name} 
                      {p.brand && <span className="text-[10px] font-normal px-1.5 py-0.5 ml-1 bg-white/10 rounded-md text-[var(--color-text-dim)]">{p.brand}</span>}
                      {p.specification && <span className="text-[10px] font-normal px-1.5 py-0.5 ml-1 bg-white/10 rounded-md text-[var(--color-accent-blue)]">{p.specification}</span>}
                    </h3>
                    <p className="text-xs text-[var(--color-text-dim)] font-mono mt-1">
                      {p.barcode ? `條碼: ${p.barcode}` : p.product_id}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="bg-[var(--color-glass-bg)] text-[var(--color-accent-blue)] px-2.5 py-1 rounded-lg text-sm font-bold border border-[var(--color-glass-border)] flex items-center">
                      總庫存: {group.totalStock} {p.unit}
                    </div>
                    {group.totalStock > 0 && group.totalCostValue > 0 && (
                      <div className="text-[10px] text-[var(--color-accent-green)] font-medium">
                        庫存價值: ${group.totalCostValue.toFixed(0)}
                      </div>
                    )}
                    <button 
                      onClick={() => setExpandedId(isGroupExpanded ? null : groupId)}
                      className="p-1 -mr-1 text-[var(--color-text-dim)] hover:text-white flex items-center gap-1 text-xs"
                    >
                      {isGroupExpanded ? '收起詳情' : '管理詳情'} <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {isGroupExpanded && (
                  <div className="mt-3 pt-3 border-t border-white/5 space-y-3 animate-in fade-in slide-in-from-top-2">
                    {/* Basic Info & Actions */}
                    <div className="flex items-center justify-between p-2 bg-white/5 rounded-lg border border-white/5">
                        <div className="text-xs">
                           <span className="text-[var(--color-text-dim)]">分類:</span> <span className="text-white ml-1">{p.category || '未分類'}</span>
                        </div>
                        <div className="flex gap-2">
                           <button onClick={() => navigate(`/add-product?editId=${p.product_id}`)} className="p-2 glass-panel text-[var(--color-accent-blue)] rounded-lg">
                             <Pencil className="w-4 h-4" />
                           </button>
                           <button onClick={() => setConfirmDeleteId(p.product_id)} className="p-2 glass-panel text-red-400 rounded-lg">
                             <Trash2 className="w-4 h-4" />
                           </button>
                        </div>
                    </div>

                    {confirmDeleteId === p.product_id && (
                       <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-between animate-in slide-in-from-top-2">
                          <p className="text-xs font-bold text-red-400">確認刪除此商品定義？</p>
                          <div className="flex gap-2">
                            <button onClick={() => executeDelete(p.product_id)} className="px-3 py-1 bg-red-500 text-white text-xs font-bold rounded-lg transition-colors">確認</button>
                            <button onClick={() => setConfirmDeleteId(null)} className="px-3 py-1 glass-panel text-white text-xs font-bold rounded-lg transition-colors">取消</button>
                          </div>
                       </div>
                    )}

                    {/* Stock Batches */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-[var(--color-text-dim)] uppercase tracking-widest pl-1">庫存批次詳情</p>
                      {group.stockEntries.length === 0 ? (
                        <p className="text-[10px] text-[var(--color-text-dim)] italic pl-1">目前無庫存紀錄</p>
                      ) : (
                        group.stockEntries.map(entry => (
                          <div key={entry.stock_id} className="bg-black/20 rounded-lg p-3 border border-white/5">
                            <div className="flex justify-between items-start">
                              <div className="space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 bg-[var(--color-accent-blue)]/20 text-[var(--color-accent-blue)] rounded">
                                    {entry.location} - {entry.floor} - {entry.area}
                                  </span>
                                  {entry.specification && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 bg-sky-400/20 text-sky-400 rounded">
                                      規格: {entry.specification}
                                    </span>
                                  )}
                                  {entry.expiry_date && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 bg-orange-400/20 text-orange-400 rounded">
                                      效期: {entry.expiry_date}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-[var(--color-text-dim)]">最後異動: {entry.last_update}</p>
                              </div>
                              <div className="text-right">
                                <span className="text-sm font-bold text-white">{entry.quantity} {p.unit}</span>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    
                    <div className="flex gap-2 pt-2">
                      <Link to={`/manage?type=stock_in&pid=${p.product_id}`} className="flex-1 py-2.5 bg-[var(--color-accent-blue)] text-[#0f172a] text-xs font-bold rounded-xl text-center shadow-lg shadow-sky-400/10">
                        進貨在此
                      </Link>
                      <Link to={`/manage?type=stock_out&pid=${p.product_id}`} className="flex-1 py-2.5 glass-panel text-white text-xs font-bold rounded-xl text-center">
                        出貨在此
                      </Link>
                    </div>
                  </div>
                )}

                {!isGroupExpanded && (
                  <div className="mt-3 flex gap-2">
                    <Link to={`/manage?type=stock_in&pid=${p.product_id}`} className="flex-1 py-2 glass-panel hover:bg-white/10 text-[var(--color-text-main)] text-xs font-semibold rounded-lg text-center transition-colors">
                      快速進貨
                    </Link>
                    <Link to={`/manage?type=stock_out&pid=${p.product_id}`} className="flex-1 py-2 glass-panel hover:bg-white/10 text-[var(--color-text-main)] text-xs font-semibold rounded-lg text-center transition-colors">
                      快速出貨
                    </Link>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
