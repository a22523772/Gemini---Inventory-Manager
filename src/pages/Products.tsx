import { useState, useMemo, useEffect } from 'react';
import { useStore, getProductStatusInfo, ProductStatusInfo } from '../store/useStore';
import { Search, ScanBarcode, PackageOpen, Pencil, Trash2, MoreHorizontal, Filter, AlertCircle, Clock, ArrowUpDown, SlidersHorizontal, X, PauseCircle, PlayCircle, Layers, TableProperties, TrendingUp, ClipboardList, Ban } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { differenceInDays } from 'date-fns';
import QuantityInput from '../components/QuantityInput';
import ReplenishmentOverview from '../components/ReplenishmentOverview';
import ProductCompactView from '../components/ProductCompactView';

type SortType = 'name_asc' | 'name_desc' | 'newest' | 'stock_low' | 'stock_high';

export default function Products() {
  const { products, stock, deleteProduct, showToast, vendors, lowStockAlertEnabled, expiryThreshold, productsPageState, setProductsPageState, toggleDiscontinued, toggleOutOfStock, setProductAvailability } = useStore();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'list' | 'compact' | 'replenishment'>(
    (productsPageState.activeTab as any) || 
    (searchParams.get('tab') === 'compact' ? 'compact' : searchParams.get('tab') === 'replenish' ? 'replenishment' : 'list')
  );
  const [searchTerm, setSearchTerm] = useState(productsPageState.searchTerm || searchParams.get('pid') || '');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(productsPageState.showFilters);
  const [filterBrand, setFilterBrand] = useState(productsPageState.filterBrand);
  const [filterCategory, setFilterCategory] = useState(productsPageState.filterCategory);
  const [filterVendor, setFilterVendor] = useState(productsPageState.filterVendor);
  const [filterDiscontinued, setFilterDiscontinued] = useState<'all' | 'active' | 'out_of_stock' | 'discontinued' | 'paused'>(
    (productsPageState.filterDiscontinued as any) || 'all'
  );
  const [sortOrder, setSortOrder] = useState<SortType>((productsPageState.sortOrder as SortType) || 'name_asc');
  const navigate = useNavigate();

  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 24;

  // Adjust stock modal state
  const [adjustGroup, setAdjustGroup] = useState<any | null>(null);
  const [selectedStockId, setSelectedStockId] = useState<string>('');
  const [targetQty, setTargetQty] = useState<string>('0');
  const [adjustNote, setAdjustNote] = useState<string>('盤點校正');
  const [isSubmittingAdjust, setIsSubmittingAdjust] = useState<boolean>(false);

  const openAdjustModal = (group: any, stockEntry?: any) => {
    setAdjustGroup(group);
    if (stockEntry) {
      setSelectedStockId(stockEntry.stock_id);
      setTargetQty(String(stockEntry.quantity));
    } else if (group.stockEntries && group.stockEntries.length > 0) {
      setSelectedStockId(group.stockEntries[0].stock_id);
      setTargetQty(String(group.stockEntries[0].quantity));
    } else {
      setSelectedStockId('');
      setTargetQty('0');
    }
    setAdjustNote('盤點校正');
  };

  const handleStockEntryChange = (stockId: string) => {
    setSelectedStockId(stockId);
    if (adjustGroup) {
      const entry = adjustGroup.stockEntries.find((s: any) => s.stock_id === stockId);
      if (entry) {
        setTargetQty(String(entry.quantity));
      }
    }
  };

  const handleConfirmAdjust = async () => {
    if (!adjustGroup || isSubmittingAdjust) return;
    const p = adjustGroup.product;
    const parsedQty = Number(targetQty);
    if (isNaN(parsedQty) || parsedQty < 0) {
      showToast('❌ 請輸入有效的庫存數量（不可為負數）！');
      return;
    }

    setIsSubmittingAdjust(true);
    try {
      const currentEntry = adjustGroup.stockEntries.find((s: any) => s.stock_id === selectedStockId) || adjustGroup.stockEntries[0];
      const prevQty = currentEntry ? Number(currentEntry.quantity) || 0 : 0;
      const delta = parsedQty - prevQty;
      const deltaStr = delta >= 0 ? `+${delta}` : `${delta}`;
      const changeNote = `[${deltaStr}=${parsedQty}] ${adjustNote.trim() || '盤點校正'}`.trim();

      const payload = {
        stock_id: currentEntry?.stock_id,
        product_id: p.product_id,
        quantity: parsedQty,
        delta: delta,
        final_quantity: parsedQty,
        location: currentEntry?.location || '倉庫',
        floor: currentEntry?.floor || '1F',
        area: currentEntry?.area || 'A區',
        specification: currentEntry?.specification || '',
        note: changeNote,
        operator: useStore.getState().operator
      };

      await useStore.getState().enqueueAction('adjustStock', payload);
      let successMsg = '✅ 庫存已成功調整！(離線緩存中)';
      if (navigator.onLine) {
        successMsg = '✅ 庫存已成功調整！';
      }
      showToast(successMsg);
      setAdjustGroup(null);
    } catch (err: any) {
      showToast('❌ 調整失敗: ' + (err.message || '未知錯誤'));
    } finally {
      setIsSubmittingAdjust(false);
    }
  };

  const now = new Date();

  useEffect(() => {
    const pid = searchParams.get('pid');
    if (pid) {
      setSearchTerm(pid);
    }
    const tabParam = searchParams.get('tab');
    if (tabParam === 'replenish') {
      setActiveTab('replenishment');
    }
  }, [searchParams]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterBrand, filterCategory, filterVendor, filterDiscontinued, sortOrder]);

  useEffect(() => {
    setProductsPageState({
      activeTab,
      searchTerm,
      filterBrand,
      filterCategory,
      filterVendor,
      filterDiscontinued,
      sortOrder,
      showFilters
    });
  }, [activeTab, searchTerm, filterBrand, filterCategory, filterVendor, filterDiscontinued, sortOrder, showFilters, setProductsPageState]);

  // Extract unique brands and categories for dropdowns
  const brands = useMemo(() => Array.from(new Set(products.map(p => p.brand).filter(Boolean))), [products]);
  const categories = useMemo(() => Array.from(new Set(products.map(p => p.category).filter(Boolean))), [products]);
  const uniqueVendors = useMemo(() => Array.from(new Set(products.map(p => p.vendor_id).filter(Boolean))), [products]);

  // Vendor map for O(1) vendor name lookup
  const vendorMap = useMemo(() => new Map(vendors.map(v => [v.vendor_id, v.vendor_name])), [vendors]);

  // Helper func to get vendor name
  const getVendorName = (vid: string) => {
     return vendorMap.get(vid) || vid;
  };

  // Grouping the products by product_id with O(1) map lookup
  const groupedProducts = useMemo(() => {
     const groups: Record<string, { 
       product: any, 
       stockEntries: any[], 
       totalStock: number, 
       totalCostValue: number,
       isExpired: boolean,
       isExpiringSoon: boolean 
     }> = {};
     
     // 1. Identify primary products
     products.forEach(p => {
        const key = p.product_id;
        if (!groups[key]) {
            groups[key] = { 
              product: { ...p }, 
              stockEntries: [], 
              totalStock: 0, 
              totalCostValue: 0,
              isExpired: false,
              isExpiringSoon: false
            };
        }
        if (p.specification) {
            const existingProd = groups[key].product;
            const specs = [existingProd.specification, p.specification]
                .flatMap(spec => spec ? spec.split(/[,\/，\s、]+/).map(s => s.trim()).filter(Boolean) : []);
            const uniqSpecs = Array.from(new Set(specs));
            existingProd.specification = uniqSpecs.join('、');
        }
     });

     // 2. Map stock entries using productMap O(1) lookup
     const productMap = new Map(products.map(prod => [prod.product_id, prod]));

     stock.forEach(s => {
        const p = productMap.get(s.product_id);
        if (p) {
            const key = p.product_id;
            if (groups[key]) {
               groups[key].stockEntries.push(s);
               groups[key].totalStock += s.quantity;
               if (p.cost_price && s.quantity > 0) {
                   groups[key].totalCostValue += p.cost_price * s.quantity;
               }

               // Check expiry per entry
               if (s.expiry_date && s.quantity > 0) {
                  const exp = new Date(s.expiry_date);
                  const diff = differenceInDays(exp, now);
                  if (diff < 0) groups[key].isExpired = true;
                  else if (diff <= expiryThreshold) groups[key].isExpiringSoon = true;
               }
            }
        }
     });

     // Filter groups by search/filters
     const filtered = Object.values(groups).filter(g => {
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
        
        const statusInfo = getProductStatusInfo(p);
        if (filterDiscontinued === 'active' && statusInfo.isPaused) return false;
        if (filterDiscontinued === 'out_of_stock' && statusInfo.status !== 'out_of_stock') return false;
        if (filterDiscontinued === 'discontinued' && statusInfo.status !== 'discontinued') return false;
        if (filterDiscontinued === 'paused' && !statusInfo.isPaused) return false;
        
        return true;
     });

     // Apply Sorting
     return filtered.sort((a, b) => {
        switch (sortOrder) {
          case 'name_asc':
            return a.product.name.localeCompare(b.product.name, 'zh-HK');
          case 'name_desc':
            return b.product.name.localeCompare(a.product.name, 'zh-HK');
          case 'newest':
            return new Date(b.product.created_at || 0).getTime() - new Date(a.product.created_at || 0).getTime();
          case 'stock_low':
            return a.totalStock - b.totalStock;
          case 'stock_high':
            return b.totalStock - a.totalStock;
          default:
            return 0;
        }
     });
  }, [products, stock, expiryThreshold, searchTerm, filterBrand, filterCategory, filterVendor, filterDiscontinued, sortOrder]);

  const totalPages = Math.ceil(groupedProducts.length / PAGE_SIZE) || 1;
  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return groupedProducts.slice(start, start + PAGE_SIZE);
  }, [groupedProducts, currentPage]);

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
      {/* Top Navigation Tabs */}
      <div className="flex border-b border-white/10 bg-[#0f172a]/95 px-4 pt-3 gap-2 shrink-0 overflow-x-auto">
        <button
          onClick={() => setActiveTab('list')}
          className={`pb-2.5 px-3 font-bold text-xs flex items-center gap-1.5 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'list'
              ? 'border-sky-400 text-sky-300'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <Layers className="w-4 h-4" />
          商品圖書卡片 ({products.length})
        </button>

        <button
          onClick={() => setActiveTab('compact')}
          className={`pb-2.5 px-3 font-bold text-xs flex items-center gap-1.5 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'compact'
              ? 'border-sky-400 text-sky-300'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <ClipboardList className="w-4 h-4 text-sky-400" />
          商品庫存簡覽 (廠商訂貨模式)
          <span className="px-1.5 py-0.2 bg-sky-500/20 text-sky-300 text-[10px] rounded-full font-mono">
            叫貨推薦
          </span>
        </button>

        <button
          onClick={() => setActiveTab('replenishment')}
          className={`pb-2.5 px-3 font-bold text-xs flex items-center gap-1.5 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'replenishment'
              ? 'border-emerald-400 text-emerald-300'
              : 'border-transparent text-slate-400 hover:text-white'
          }`}
        >
          <TableProperties className="w-4 h-4" />
          補貨分析與建議
        </button>
      </div>

      {activeTab === 'compact' ? (
        <ProductCompactView onOpenAdjustModal={openAdjustModal} />
      ) : activeTab === 'replenishment' ? (
        <ReplenishmentOverview />
      ) : (
        <>
          <div className="glass-panel border-x-0 border-t-0 px-4 pt-4 pb-4 sticky top-0 z-10">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-3">
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white shrink-0 whitespace-nowrap flex items-center gap-2">
                  商品清單
                  <span className="text-xs font-normal text-slate-400 font-mono">({groupedProducts.length})</span>
                </h1>
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap justify-end">
                {/* Status quick filter pills */}
                <div className="flex bg-white/5 border border-white/10 rounded-full p-0.5 text-xs overflow-x-auto max-w-full">
                  <button
                    onClick={() => setFilterDiscontinued('all')}
                    className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                      filterDiscontinued === 'all' ? 'bg-white/20 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    全部
                  </button>
                  <button
                    onClick={() => setFilterDiscontinued('active')}
                    className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                      filterDiscontinued === 'active' ? 'bg-emerald-500/30 text-emerald-300' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    🟢 正常供應
                  </button>
                  <button
                    onClick={() => setFilterDiscontinued('out_of_stock')}
                    className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                      filterDiscontinued === 'out_of_stock' ? 'bg-amber-500/30 text-amber-300' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    🟡 暫時缺貨
                  </button>
                  <button
                    onClick={() => setFilterDiscontinued('discontinued')}
                    className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                      filterDiscontinued === 'discontinued' ? 'bg-purple-500/30 text-purple-300' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    🟣 暫時停產
                  </button>
                </div>

                <div className="relative">
                  <select 
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as SortType)}
                    className="appearance-none bg-white/5 border border-white/10 rounded-full pl-8 pr-4 py-1.5 text-xs font-bold text-white outline-none focus:border-sky-400 transition-all cursor-pointer hover:bg-white/10"
                  >
                    <option value="name_asc" className="bg-[#0f172a]">名稱 A-Z</option>
                    <option value="name_desc" className="bg-[#0f172a]">名稱 Z-A</option>
                    <option value="newest" className="bg-[#0f172a]">最新建立</option>
                    <option value="stock_low" className="bg-[#0f172a]">庫存: 低 → 高</option>
                    <option value="stock_high" className="bg-[#0f172a]">庫存: 高 → 低</option>
                  </select>
                  <ArrowUpDown className="w-3 h-3 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
                <button 
                  onClick={() => setShowFilters(!showFilters)} 
                  className={`p-2 rounded-full transition-colors ${showFilters ? 'bg-white/20 text-white' : 'glass-panel text-slate-400 hover:text-white'}`}
                >
                  <Filter className="w-4 h-4" />
                </button>
                <Link to="/add-product" className="px-3.5 py-1.5 bg-sky-400 hover:bg-sky-300 text-slate-950 font-extrabold rounded-full transition-colors active:scale-95 text-xs shadow-md shadow-sky-400/20 whitespace-nowrap flex items-center gap-1">
                  <span>+ 新增商品</span>
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

      <div className="flex-1 overflow-y-auto p-4 space-y-3 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-4 md:space-y-0">
        {paginatedProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-[var(--color-text-dim)] py-12 md:col-span-2 lg:col-span-3">
            <PackageOpen className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm font-medium">找不到符合的商品</p>
          </div>
        ) : (
          paginatedProducts.map(group => {
            const p = group.product;
            const groupId = p.product_id;
            const isGroupExpanded = expandedId === groupId;

            const rawMin = p.min_stock;
            const alertThreshold = (typeof rawMin === 'number' && !isNaN(rawMin)) ? rawMin : (rawMin !== undefined && rawMin !== null && (rawMin as any) !== '' && !isNaN(Number(rawMin))) ? Number(rawMin) : 5;
            const isLowStock = lowStockAlertEnabled && group.totalStock <= alertThreshold;
            const isExpired = group.isExpired;
            const isExpiringSoon = group.isExpiringSoon;
            const statusInfo = getProductStatusInfo(p);
            const isDiscontinued = statusInfo.status === 'discontinued';
            const isOutOfStock = statusInfo.status === 'out_of_stock';
            const isPaused = statusInfo.isPaused;

            return (
              <div key={groupId} className={`glass-panel border ${isDiscontinued ? 'border-purple-500/40 bg-purple-500/5' : isOutOfStock ? 'border-amber-500/40 bg-amber-500/5' : isExpired ? 'border-red-500/50 bg-red-500/5' : isExpiringSoon ? 'border-orange-500/50 bg-orange-500/5' : isLowStock ? 'border-amber-500/50 bg-amber-500/5' : 'border-[var(--color-glass-border)]'} rounded-xl p-4 transition-all shadow-sm`}>
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1 pr-2">
                    <h3 className="font-bold text-[var(--color-text-main)] text-base flex flex-wrap gap-1 items-center">
                      {p.name} 
                      {p.brand && <span className="text-[10px] font-normal px-1.5 py-0.5 ml-1 bg-white/10 rounded-md text-[var(--color-text-dim)]">{p.brand}</span>}
                      {p.specification && <span className="text-[10px] font-normal px-1.5 py-0.5 ml-1 bg-white/10 rounded-md text-[var(--color-accent-blue)]">{p.specification}</span>}
                    </h3>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                       {isDiscontinued && (
                         <span className="text-[10px] font-bold px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded-md flex items-center gap-1 border border-purple-500/40 shadow-sm">
                           <PauseCircle className="w-3 h-3 text-purple-400" />
                           🟣 暫時停產 (原廠生產中)
                         </span>
                       )}
                       {isOutOfStock && (
                         <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded-md flex items-center gap-1 border border-amber-500/40 shadow-sm">
                           <Ban className="w-3 h-3 text-amber-400" />
                           🟡 暫時缺貨 (待補貨)
                         </span>
                       )}
                       {isExpired && (
                         <span className="text-[10px] font-bold px-1.5 py-0.5 bg-red-500/20 text-red-400 rounded flex items-center gap-1 border border-red-500/30">
                           <AlertCircle className="w-3 h-3" /> 已過期
                         </span>
                       )}
                       {isExpiringSoon && !isExpired && (
                         <span className="text-[10px] font-bold px-1.5 py-0.5 bg-orange-500/20 text-orange-400 rounded flex items-center gap-1 border border-orange-500/30">
                           <Clock className="w-3 h-3" /> 即將到期
                         </span>
                       )}
                       {isLowStock && !isPaused && (
                         <span className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-500/20 text-amber-500 rounded flex items-center gap-1 border border-amber-500/30">
                           補貨警示
                         </span>
                       )}
                    </div>
                    <p className="text-xs text-[var(--color-text-dim)] font-mono mt-1.5">
                      {p.barcode ? `條碼: ${p.barcode}` : p.product_id}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className={`${isExpired ? 'bg-red-500/20 text-red-400 border-red-500/30' : isExpiringSoon ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' : isLowStock ? 'bg-amber-500/20 text-amber-500 border-amber-500/30' : 'bg-[var(--color-glass-bg)] text-[var(--color-accent-blue)] border-[var(--color-glass-border)]'} px-2.5 py-1 rounded-lg text-sm font-bold border flex items-center`}>
                      庫存: {group.totalStock} {p.unit}
                    </div>
                    {group.totalStock > 0 && group.totalCostValue > 0 && (
                      <div className="text-[10px] text-[var(--color-accent-green)] font-medium">
                        平均進價: ${(group.totalCostValue / group.totalStock).toFixed(1)} / {p.unit || '個'}
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
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between p-2 bg-white/5 rounded-lg border border-white/5 gap-2">
                        <div className="text-xs">
                           <span className="text-[var(--color-text-dim)]">分類:</span> <span className="text-white ml-1">{p.category || '未分類'}</span>
                        </div>
                        <div className="flex gap-1.5 items-center flex-wrap">
                           {/* Status quick toggle dropdown / buttons */}
                           <select
                             value={statusInfo.status}
                             onChange={(e) => setProductAvailability(p.product_id, e.target.value as any)}
                             className={`px-2 py-1 text-xs font-bold rounded-lg border outline-none transition-all cursor-pointer ${
                               statusInfo.status === 'discontinued'
                                 ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                                 : statusInfo.status === 'out_of_stock'
                                 ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                 : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                             }`}
                           >
                             <option value="normal" className="bg-[#0f172a] text-emerald-300">🟢 正常供應</option>
                             <option value="out_of_stock" className="bg-[#0f172a] text-amber-300">🟡 暫時缺貨</option>
                             <option value="discontinued" className="bg-[#0f172a] text-purple-300">🟣 暫時停產</option>
                           </select>
                           <button onClick={() => navigate(`/add-product?editId=${p.product_id}`)} className="p-2 glass-panel text-[var(--color-accent-blue)] rounded-lg hover:bg-white/10" title="編輯商品">
                             <Pencil className="w-4 h-4" />
                           </button>
                           <button onClick={() => setConfirmDeleteId(p.product_id)} className="p-2 glass-panel text-red-400 rounded-lg hover:bg-red-500/10" title="刪除商品">
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
                              <div className="flex items-center gap-2">
                                <div className="text-right">
                                  <span className="text-sm font-bold text-white">{entry.quantity} {p.unit}</span>
                                </div>
                                <button
                                  onClick={() => openAdjustModal(group, entry)}
                                  className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-300 rounded-md text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1 shrink-0"
                                  title="調整此批次庫存"
                                >
                                  <SlidersHorizontal className="w-3 h-3" />
                                  調整
                                </button>
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
                      <button
                        onClick={() => openAdjustModal(group)}
                        className="flex-1 py-2.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 text-xs font-bold rounded-xl text-center transition-all flex items-center justify-center gap-1 cursor-pointer shadow-lg shadow-amber-500/5"
                      >
                        <SlidersHorizontal className="w-4 h-4" />
                        調整庫存
                      </button>
                    </div>
                  </div>
                )}

                {!isGroupExpanded && (
                  <div className="mt-3 flex gap-1.5">
                    <Link to={`/manage?type=stock_in&pid=${p.product_id}`} className="flex-1 py-2 glass-panel hover:bg-white/10 text-[var(--color-text-main)] text-xs font-semibold rounded-lg text-center transition-colors">
                      快速進貨
                    </Link>
                    <Link to={`/manage?type=stock_out&pid=${p.product_id}`} className="flex-1 py-2 glass-panel hover:bg-white/10 text-[var(--color-text-main)] text-xs font-semibold rounded-lg text-center transition-colors">
                      快速出貨
                    </Link>
                    <button
                      onClick={() => openAdjustModal(group)}
                      className="px-3 py-2 bg-amber-500/15 border border-amber-500/30 hover:bg-amber-500/25 text-amber-300 text-xs font-bold rounded-lg text-center transition-all flex items-center justify-center gap-1 cursor-pointer shrink-0"
                      title="調整庫存"
                    >
                      <SlidersHorizontal className="w-3.5 h-3.5" />
                      調整
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Footer */}
      {groupedProducts.length > 0 && (
        <div className="glass-panel border-x-0 border-b-0 px-4 py-3 flex items-center justify-between text-xs text-[var(--color-text-dim)] shrink-0 sticky bottom-0 z-10 bg-[#0f172a]/90 backdrop-blur-md">
          <div className="font-mono">
            共 <span className="text-white font-bold">{groupedProducts.length}</span> 項商品
            {totalPages > 1 && ` (第 ${currentPage} / ${totalPages} 頁)`}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg glass-panel hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent text-white font-medium transition-all"
              >
                上一頁
              </button>
              <span className="font-mono font-bold text-white px-1">
                {currentPage}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded-lg glass-panel hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent text-white font-medium transition-all"
              >
                下一頁
              </button>
            </div>
          )}
        </div>
      )}
      </>
      )}

      {/* 快速調整庫存 Modal */}
      {adjustGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="glass-panel border border-amber-500/30 rounded-2xl w-full max-w-md p-6 space-y-5 shadow-2xl bg-[#0f172a]/95 text-left">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h2 className="text-base font-bold text-amber-300 flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-amber-400" />
                調整商品庫存
              </h2>
              <button 
                onClick={() => setAdjustGroup(null)}
                className="p-1 text-white/50 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Product Summary */}
            <div className="p-3 bg-white/5 border border-white/10 rounded-xl space-y-1">
              <div className="flex justify-between items-start">
                <h3 className="font-bold text-white text-sm">{adjustGroup.product.name}</h3>
                <span className="text-xs px-2 py-0.5 bg-amber-500/20 text-amber-300 font-bold rounded-md border border-amber-500/30">
                  總庫存: {adjustGroup.totalStock} {adjustGroup.product.unit || '個'}
                </span>
              </div>
              <p className="text-xs text-[var(--color-text-dim)] font-mono">
                編號: {adjustGroup.product.product_id}
                {adjustGroup.product.brand && ` | 品牌: ${adjustGroup.product.brand}`}
              </p>
            </div>

            {/* Select Stock Batch if multiple exist */}
            {adjustGroup.stockEntries && adjustGroup.stockEntries.length > 0 ? (
              <div className="space-y-2">
                <label className="text-xs font-bold text-white/80 block">
                  選擇要調整的庫存批次位置
                </label>
                <select
                  value={selectedStockId}
                  onChange={(e) => handleStockEntryChange(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 cursor-pointer"
                >
                  {adjustGroup.stockEntries.map((entry: any) => (
                    <option key={entry.stock_id} value={entry.stock_id} className="bg-slate-900 text-white">
                      {entry.location}-{entry.floor}-{entry.area} {entry.specification ? `(${entry.specification})` : ''} - 現有 {entry.quantity} {adjustGroup.product.unit || '個'}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-200">
                ⚠️ 此商品目前無庫存批次紀錄，提交調整將自動於【倉庫-1F-A區】建立第一筆庫存紀錄。
              </div>
            )}

            {/* Target Quantity Input */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs">
                <label className="font-bold text-white/80">調整後目標庫存數量</label>
                {(() => {
                  const selectedEntry = (adjustGroup.stockEntries || []).find((s: any) => s.stock_id === selectedStockId) || (adjustGroup.stockEntries || [])[0];
                  const currentQty = selectedEntry ? selectedEntry.quantity : 0;
                  const diff = Number(targetQty) - currentQty;
                  if (isNaN(diff)) return null;
                  return (
                    <span className={`font-mono font-bold ${diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                      現有: {currentQty} ➔ 變動: {diff > 0 ? `+${diff}` : diff}
                    </span>
                  );
                })()}
              </div>

              <QuantityInput
                value={targetQty}
                onChange={setTargetQty}
                min={0}
                className="w-full"
              />

              {/* Quick adjustment buttons */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setTargetQty('0')}
                  className="px-2.5 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/20 rounded-lg text-xs font-bold transition-all cursor-pointer"
                >
                  歸零 (0)
                </button>
                {(() => {
                  const selectedEntry = (adjustGroup.stockEntries || []).find((s: any) => s.stock_id === selectedStockId) || (adjustGroup.stockEntries || [])[0];
                  const currentQty = selectedEntry ? selectedEntry.quantity : 0;
                  return (
                    <button
                      type="button"
                      onClick={() => setTargetQty(String(currentQty))}
                      className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-bold transition-all cursor-pointer"
                    >
                      還原 (現有 {currentQty})
                    </button>
                  );
                })()}
                {[+1, +5, +10, -1, -5].map((delta) => (
                  <button
                    key={delta}
                    type="button"
                    onClick={() => setTargetQty(String(Math.max(0, (Number(targetQty) || 0) + delta)))}
                    className="px-2.5 py-1 bg-white/5 hover:bg-white/15 border border-white/10 text-amber-200 rounded-lg text-xs font-bold transition-all cursor-pointer"
                  >
                    {delta > 0 ? `+${delta}` : delta}
                  </button>
                ))}
              </div>
            </div>

            {/* Reason / Note */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-white/80 block">調整原因與備註</label>
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {['盤點校正', '破損報廢', '盤盈歸庫', '樣品領用', '數據修正'].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setAdjustNote(tag)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                      adjustNote === tag
                        ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                        : 'bg-white/5 hover:bg-white/10 text-white/70 border border-white/10'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
                placeholder="輸入調整原因..."
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Actions */}
            <div className="pt-2 flex items-center justify-between gap-3">
              <Link
                to={`/manage?type=adjust&pid=${adjustGroup.product.product_id}`}
                onClick={() => setAdjustGroup(null)}
                className="text-xs text-amber-400 hover:underline flex items-center gap-1 font-medium"
              >
                完整調整頁面 ↗
              </Link>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustGroup(null)}
                  className="px-4 py-2 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={isSubmittingAdjust}
                  onClick={handleConfirmAdjust}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50 cursor-pointer flex items-center gap-1.5 font-bold"
                >
                  {isSubmittingAdjust ? '處理中...' : '確定調整'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
