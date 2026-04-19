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

  // 模糊搜尋，本地快取中查找 (支援 < 100ms 要求)
  const filteredProducts = useMemo(() => {
    let result = products;

    if (filterBrand) {
      result = result.filter(p => p.brand === filterBrand);
    }
    if (filterCategory) {
      result = result.filter(p => p.category === filterCategory);
    }
    if (filterVendor) {
      result = result.filter(p => p.vendor_id === filterVendor);
    }

    if (!searchTerm && !filterBrand && !filterCategory && !filterVendor) return result.slice(0, 50);

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(
        p => p.name.toLowerCase().includes(q) || 
             (p.barcode && String(p.barcode).includes(q)) || 
             p.product_id.toLowerCase().includes(q)
      );
    }
    
    return result.slice(0, 100);
  }, [searchTerm, filterBrand, filterCategory, filterVendor, products]);

  // 取的某商品的總庫存
  const getProductStock = (pid: string) => {
    return stock.filter(s => s.product_id === pid).reduce((a, b) => a + b.quantity, 0);
  };

  // Grouping the filtered products by barcode (or name if no barcode)
  const groupedProducts = useMemo(() => {
     const groups: Record<string, { main: any, clones: any[], totalStock: number, totalCostValue: number }> = {};
     filteredProducts.forEach(p => {
        const key = p.barcode || p.name;
        if (!groups[key]) {
            groups[key] = { main: p, clones: [], totalStock: 0, totalCostValue: 0 };
        } else {
            // Check if this one is an "older" main definition
             if (p.product_id < groups[key].main.product_id) {
                groups[key].clones.push(groups[key].main);
                groups[key].main = p;
             } else {
                groups[key].clones.push(p);
             }
        }
        const stk = getProductStock(p.product_id);
        groups[key].totalStock += stk;
        if (p.cost_price && stk > 0) {
            groups[key].totalCostValue += p.cost_price * stk;
        }
     });
     return Object.values(groups);
  }, [filteredProducts, stock]);

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
            const p = group.main;
            const hasClones = group.clones.length > 0;
            const isGroupExpanded = expandedId === p.barcode || expandedId === p.product_id;
            const groupId = p.barcode || p.product_id;

            return (
              <div key={groupId} className="glass-panel border border-[var(--color-glass-border)] rounded-xl p-4 transition-all">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1 pr-2">
                    <h3 className="font-bold text-[var(--color-text-main)] text-base">
                      {p.name} {p.brand && <span className="text-[10px] font-normal px-1.5 py-0.5 ml-1 bg-white/10 rounded-md text-[var(--color-text-dim)]">{p.brand}</span>}
                    </h3>
                    <p className="text-xs text-[var(--color-text-dim)] font-mono mt-1">
                      {p.barcode ? `條碼: ${p.barcode}` : p.product_id}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="bg-[var(--color-glass-bg)] text-[var(--color-accent-blue)] px-2.5 py-1 rounded-lg text-sm font-bold border border-[var(--color-glass-border)] flex items-center">
                      總計: {group.totalStock} {p.unit}
                    </div>
                    {group.totalStock > 0 && group.totalCostValue > 0 && (
                      <div className="text-[10px] text-[var(--color-accent-green)] font-medium">
                        平均進價: ${(group.totalCostValue / group.totalStock).toFixed(2)}
                      </div>
                    )}
                    {(hasClones || p.expiry_date || p.vendor_id || group.totalStock > 0) && (
                      <button 
                        onClick={() => setExpandedId(isGroupExpanded ? null : groupId)}
                        className="p-1 -mr-1 text-[var(--color-text-dim)] hover:text-white flex items-center gap-1 text-xs"
                      >
                        {isGroupExpanded ? '收起批次' : '展開批次管理'} <MoreHorizontal className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {isGroupExpanded && (
                  <div className="mt-3 pt-3 border-t border-white/5 space-y-3 animate-in fade-in slide-in-from-top-2">
                    {[p, ...group.clones].map(clone => (
                      <div key={clone.product_id} className="bg-black/20 rounded-lg p-3 border border-white/5">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="text-xs text-[var(--color-text-main)] font-medium">ID: {clone.product_id}</p>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {clone.vendor_id && <span className="text-[10px] text-[var(--color-accent-blue)] bg-[var(--color-accent-blue)]/10 px-1.5 py-0.5 rounded">供應商: {getVendorName(clone.vendor_id)}</span>}
                              {clone.expiry_date && <span className="text-[10px] text-orange-300 bg-orange-400/10 px-1.5 py-0.5 rounded">效期: {clone.expiry_date}</span>}
                              {clone.cost_price > 0 && <span className="text-[10px] text-[var(--color-accent-green)] bg-[var(--color-accent-green)]/10 px-1.5 py-0.5 rounded">進價: ${clone.cost_price}</span>}
                            </div>
                          </div>
                          <div className="text-right">
                             <div className="text-sm font-bold text-[var(--color-text-main)] mb-1">
                               庫存: {getProductStock(clone.product_id)} {clone.unit}
                             </div>
                          </div>
                        </div>

                        {/* Clone Actions */}
                        <div className="flex gap-2 mt-2 pt-2 border-t border-white/5">
                          {confirmDeleteId === clone.product_id ? (
                            <div className="flex-1 flex gap-2 w-full animate-in slide-in-from-right-2">
                               <div className="flex-1 py-1 flex items-center justify-center text-xs font-bold text-red-400">確定刪除？</div>
                               <button onClick={() => executeDelete(clone.product_id)} className="flex-1 py-1 glass-panel hover:bg-red-500/20 text-red-400 text-xs font-bold rounded flex items-center justify-center">確認</button>
                               <button onClick={() => setConfirmDeleteId(null)} className="flex-1 py-1 glass-panel hover:bg-white/10 text-white text-xs font-bold rounded flex items-center justify-center">取消</button>
                            </div>
                          ) : (
                            <>
                              <Link to={`/manage?type=stock_in&pid=${clone.product_id}`} className="flex-1 py-1.5 bg-white/5 hover:bg-white/10 text-[var(--color-text-main)] text-xs font-semibold rounded text-center transition-colors">
                                此批進貨
                              </Link>
                              <Link to={`/manage?type=stock_out&pid=${clone.product_id}`} className="flex-1 py-1.5 bg-white/5 hover:bg-white/10 text-[var(--color-text-main)] text-xs font-semibold rounded text-center transition-colors">
                                此批出貨
                              </Link>
                              <button onClick={() => navigate(`/add-product?editId=${clone.product_id}`)} className="p-1.5 bg-white/5 hover:bg-white/10 text-[var(--color-accent-blue)] rounded transition-colors">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => setConfirmDeleteId(clone.product_id)} className="p-1.5 bg-white/5 hover:bg-red-500/20 text-red-400 rounded transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
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
