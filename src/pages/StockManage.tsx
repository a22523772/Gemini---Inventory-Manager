import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { ArrowLeft, Save, Search, X, Filter, Plus, ScanBarcode } from 'lucide-react';
import OutboundCart from '../components/OutboundCart';

export default function StockManage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { enqueueAction, addProduct, products, showToast, operator, stock, vendors } = useStore();
  
  const initialType = (searchParams.get('type') as 'stock_in' | 'stock_out' | 'adjust') || 'stock_in';
  
  const [type, setType] = useState(initialType);
  const [pid, setPid] = useState(searchParams.get('pid') || '');
  const [quantity, setQuantity] = useState('');
  const [location, setLocation] = useState('倉庫');
  const [floor, setFloor] = useState('1F');
  const [area, setArea] = useState('A區');
  const [costPrice, setCostPrice] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [note, setNote] = useState('');
  const [currentExpiry, setCurrentExpiry] = useState('');
  const [currentSpecification, setCurrentSpecification] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedStockId, setSelectedStockId] = useState<string>('');

  // Search Modal State
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterVendor, setFilterVendor] = useState('');

  // Extract unique brands and categories for dropdowns
  const brands = useMemo(() => Array.from(new Set(products.map(p => p.brand).filter(Boolean))), [products]);
  const categories = useMemo(() => Array.from(new Set(products.map(p => p.category).filter(Boolean))), [products]);
  const uniqueVendors = useMemo(() => Array.from(new Set(products.map(p => p.vendor_id).filter(Boolean))), [products]);

  const searchResults = useMemo(() => {
    let result = products;
    
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(p => 
        p.name.toLowerCase().includes(term) || 
        p.product_id.toLowerCase().includes(term) || 
        (p.barcode && p.barcode.toLowerCase().includes(term))
      );
    }
    
    if (filterCategory) result = result.filter(p => p.category === filterCategory);
    if (filterBrand) result = result.filter(p => p.brand === filterBrand);
    if (filterVendor) result = result.filter(p => p.vendor_id === filterVendor);

    return result;
  }, [searchTerm, products, filterCategory, filterBrand, filterVendor]);

  const getVendorName = (vid: string) => {
    const v = vendors.find(v => v.vendor_id === vid);
    return v ? v.vendor_name : vid;
  };

  // Extract unique locations, floors, areas for datalists
  const uniqueLocations = Array.from(new Set(stock.map(s => s.location).filter(Boolean)));
  const uniqueFloors = Array.from(new Set(stock.map(s => s.floor).filter(Boolean)));
  const uniqueAreas = Array.from(new Set(stock.map(s => s.area).filter(Boolean)));

  useEffect(() => {
    const scannedPid = searchParams.get('pid');
    if (scannedPid) {
      setPid(scannedPid);
    }
  }, [searchParams]);

  const product = useMemo(() => {
    if (!pid) return null;
    const term = pid.trim().toLowerCase();
    return products.find(p => p.product_id.toLowerCase() === term || p.barcode?.toLowerCase() === term) || null;
  }, [pid, products]);

  const availableStockEntries = useMemo(() => {
    if (!product) return [];
    return stock.filter(s => s.product_id === product.product_id);
  }, [product, stock]);

  useEffect(() => {
    if (availableStockEntries.length > 0) {
      if (!availableStockEntries.find(s => s.stock_id === selectedStockId)) {
        setSelectedStockId(availableStockEntries[0].stock_id);
      }
    } else {
      setSelectedStockId('');
    }
  }, [availableStockEntries, selectedStockId]);

  const selectedStock = availableStockEntries.find(s => s.stock_id === selectedStockId);

  const getSpecOptions = useMemo(() => {
    if (!product?.specification) return [];
    // Split by comma, slash, or full-width comma
    return product.specification.split(/[,\/，\s]+/).map(s => s.trim()).filter(Boolean);
  }, [product?.specification]);

  useEffect(() => {
    if (product) {
      if (type === 'stock_in') {
        setCurrentExpiry('');
        const specs = product.specification?.split(/[,\/，\s]+/).map(s => s.trim()).filter(Boolean) || [];
        setCurrentSpecification(specs[0] || '');
        setCostPrice(product.cost_price?.toString() || '');
        setVendorId(product.vendor_id || '');
      } else if (selectedStock) {
        setCurrentExpiry(selectedStock.expiry_date || '');
        setCurrentSpecification(selectedStock.specification || '');
        setLocation(selectedStock.location);
        setFloor(selectedStock.floor);
        setArea(selectedStock.area);
      }
    }
  }, [product?.product_id, selectedStock?.stock_id, type]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pid || !quantity || isSubmitting || !product) return;
    setIsSubmitting(true);

    const targetPid = product.product_id;

    // Helper: Check if expired
    const isExpired = (dateStr?: string) => {
        if (!dateStr) return false;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const exp = new Date(dateStr);
        exp.setHours(0, 0, 0, 0);
        return exp < today;
    };

    if (type === 'stock_out' && isExpired(currentExpiry)) {
        showToast('❌ 此商品已過期，禁止出貨！');
        setIsSubmitting(false);
        return;
    }

    let isNewVendorEntered = vendorId.trim() && !vendors.find(v => v.vendor_id === vendorId || v.vendor_name === vendorId);
    let actualVendorId = vendorId;

    const existingVendor = useStore.getState().vendors.find(v => v.vendor_id === vendorId || v.vendor_name === vendorId);
    if (existingVendor) {
        actualVendorId = existingVendor.vendor_id;
    } else if (vendorId.trim()) {
        isNewVendorEntered = true;
        actualVendorId = `V${Date.now().toString().slice(-6)}`;
    }

    if (product && type === 'stock_in') {
       if (!currentExpiry && product.has_expiry) {
           showToast('❌ 此商品需要填寫有效日期！');
           setIsSubmitting(false);
           return;
       }
    }

    let payload: any = {
      stock_id: type !== 'stock_in' ? selectedStockId : undefined,
      product_id: targetPid,
      quantity: Number(quantity),
      location,
      floor,
      area,
      expiry_date: currentExpiry || '',
      specification: currentSpecification,
      operator
    };

    if (type === 'stock_out' && product) {
       const available = selectedStock?.quantity || 0;
       if (Number(quantity) > available) {
           showToast(`❌ 出貨數量大於目前批次庫存量 (${available} ${product.unit})！`);
           setIsSubmitting(false);
           return;
       }
    }

    let actionName: any;

    if (type === 'stock_in') {
      actionName = 'stockIn';
      payload.cost_price = Number(costPrice);
      payload.vendor_id = actualVendorId;
      
      if (product && targetPid === product.product_id) {
          let updatedProduct = { ...product };
          let needsUpdate = false;
          
          if (product.cost_price !== Number(costPrice) || product.vendor_id !== actualVendorId) {
              updatedProduct.cost_price = Number(costPrice) || 0;
              updatedProduct.vendor_id = actualVendorId;
              needsUpdate = true;
          }

          if (needsUpdate) {
              await useStore.getState().editProduct(updatedProduct);
          }
      }
    } else if (type === 'stock_out') {
      actionName = 'stockOut';
    } else {
      actionName = 'adjustStock';
      payload.note = note;
    }

    try {
      await enqueueAction(actionName, payload);
      let successMsg = type === 'stock_in' ? '✅ 進貨成功！(離線緩存中)' : type === 'stock_out' ? '✅ 出貨成功！(離線緩存中)' : '✅ 庫存調整成功！(離線緩存中)';
      if (navigator.onLine) {
        successMsg = successMsg.replace(/(\(離線緩存中\))/g, '');
      }
      showToast(successMsg);

      if (isNewVendorEntered) {
          showToast('⚠️ 偵測到新供應商，請完成資料建立');
          navigate(`/vendors?newVendorName=${encodeURIComponent(vendorId.trim())}`);
      } else {
          navigate('/products');
      }
    } catch (e: any) {
      showToast('❌ 儲存失敗: ' + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center p-4 glass-panel border-x-0 border-t-0">
        <button onClick={() => navigate(-1)} className="p-2 -ml-2 text-[var(--color-text-dim)] rounded-full hover:bg-white/10">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="ml-2 text-xl font-bold text-[var(--color-text-main)]">庫存管理</h1>
      </header>

      <div className="p-4 glass-panel border-x-0 border-t-0 flex gap-2 overflow-x-auto">
        {['stock_in', 'stock_out', 'adjust'].map((t) => (
          <button
            key={t}
            onClick={() => setType(t as any)}
            className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${
              type === t ? 'bg-[var(--color-accent-blue)] text-[#0f172a]' : 'glass-panel text-[var(--color-text-dim)] hover:text-white'
            }`}
          >
            {t === 'stock_in' ? '進貨' : t === 'stock_out' ? '出貨' : '調整'}
          </button>
        ))}
      </div>

      {type === 'stock_out' ? (
        <OutboundCart />
      ) : (
      <form onSubmit={handleSubmit} className="p-4 flex-1 overflow-y-auto space-y-4">
        
        <div>
          <label className="block text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider text-[10px] mb-1">搜尋商品</label>
          <div className="flex gap-2">
            <div 
              onClick={() => setIsSearchModalOpen(true)}
              className="flex-1 flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] cursor-pointer hover:bg-white/10 transition-colors"
            >
              <Search className="w-4 h-4 text-[var(--color-text-dim)]" />
              {product ? (
                <span className="text-white font-medium">{product.name} ({product.product_id})</span>
              ) : (
                <span className="text-[var(--color-text-dim)]">點擊搜尋商品、條碼、ID...</span>
              )}
            </div>
            <button 
              type="button" 
              onClick={() => navigate(`/scan?returnTo=${encodeURIComponent('/manage?type=' + type)}`)}
              className="w-12 flex items-center justify-center glass-panel text-[var(--color-accent-blue)] rounded-xl hover:bg-white/10"
            >
              <ScanBarcode className="w-5 h-5" />
            </button>
          </div>
          {product && (
            <div className="mt-2 text-xs flex flex-col gap-1">
               <p className="text-[var(--color-accent-green)] font-medium">已找到: {product.name} {product.brand ? `(${product.brand})` : ''}</p>
               {product?.has_expiry && (
                 <p className="text-orange-400 font-bold bg-orange-400/10 inline-block px-2 py-1 rounded w-fit">
                   商品需要記錄有效日期
                 </p>
               )}
               {type === 'stock_out' && product.cost_price > 0 && (
                 <p className="text-[var(--color-text-dim)] font-medium">
                   預設進價/成本: ${product.cost_price}
                 </p>
               )}
            </div>
          )}
        </div>

        {(type === 'stock_out' || type === 'adjust') && availableStockEntries.length > 0 && (
          <div className="animate-in fade-in slide-in-from-top-2 p-3 border border-[var(--color-accent-blue)]/30 bg-[var(--color-accent-blue)]/10 rounded-xl">
             <label className="block text-sm font-bold text-[var(--color-accent-blue)] uppercase tracking-wider text-[10px] mb-1">
               選擇庫存批次 (多個儲位或效期)
             </label>
             <select
               value={selectedStockId}
               onChange={(e) => setSelectedStockId(e.target.value)}
               className="block w-full rounded-xl border border-white/10 bg-black/20 py-3 px-3 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)]"
             >
               {availableStockEntries.map(s => (
                 <option key={s.stock_id} value={s.stock_id}>
                   {s.location}-{s.floor}-{s.area} {s.specification ? `[${s.specification}]` : ''} {s.expiry_date ? `(效: ${s.expiry_date})` : ''} [量: {s.quantity}]
                 </option>
               ))}
             </select>
          </div>
        )}

        {type === 'stock_in' && getSpecOptions.length > 0 && (
          <div className="animate-in fade-in slide-in-from-top-2 p-3 border border-[var(--color-accent-blue)]/30 bg-[var(--color-accent-blue)]/5 rounded-xl">
            <label className="block text-sm font-bold text-[var(--color-accent-blue)] uppercase tracking-wider text-[10px] mb-1">
              商品規格 (請選擇)
            </label>
            <select
              value={currentSpecification}
              onChange={(e) => setCurrentSpecification(e.target.value)}
              className="block w-full rounded-xl border border-white/10 bg-black/20 py-3 px-3 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)] transition-all"
            >
              {getSpecOptions.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        )}

        {(type === 'stock_in' || type === 'adjust') && (product?.has_expiry || type === 'adjust') && (
          <div className={`animate-in fade-in slide-in-from-top-2 p-3 border rounded-xl ${type === 'adjust' ? 'border-[var(--color-accent-blue)]/30 bg-[var(--color-accent-blue)]/10' : 'border border-[var(--color-accent-orange)]/30 bg-[var(--color-accent-orange)]/10'}`}>
            <label className={`block text-sm font-bold uppercase tracking-wider text-[10px] mb-1 ${type === 'adjust' ? 'text-[var(--color-accent-blue)]' : 'text-orange-200'}`}>
              有效日期 {type === 'adjust' ? '(選填/修改)' : '(必填)'}
            </label>
            <input
              type="date"
              required={type === 'stock_in' && product?.has_expiry}
              value={currentExpiry}
              onChange={(e) => setCurrentExpiry(e.target.value)}
              className={`block w-full rounded-xl border border-white/10 bg-black/20 py-3 px-3 text-sm text-[var(--color-text-main)] outline-none focus:ring-1 ${type === 'adjust' ? 'focus:border-[var(--color-accent-blue)] focus:ring-[var(--color-accent-blue)]' : 'focus:border-[var(--color-accent-orange)] focus:ring-[var(--color-accent-orange)]'}`}
            />
            {type === 'stock_in' && (
              <p className="text-[10px] text-orange-300/70 mt-1.5 flex items-center gap-1">
                <span className="bg-orange-500/20 px-1 py-0.5 rounded">提示</span> 
                相同商品若輸入不同有效時間，系統會自動分流為新商品批次。
              </p>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider text-[10px] mb-1">數量</label>
          <input
            type="number"
            required
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)]"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider text-[10px] mb-1">儲位</label>
            <input list="locations" type="text" required value={location} onChange={(e) => setLocation(e.target.value)} className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)]" />
            <datalist id="locations">
               {uniqueLocations.map(l => <option key={l} value={l} />)}
            </datalist>
          </div>
          <div>
            <label className="block text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider text-[10px] mb-1">樓層</label>
            <input list="floors" type="text" required value={floor} onChange={(e) => setFloor(e.target.value)} className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)]" />
            <datalist id="floors">
               {uniqueFloors.map(f => <option key={f} value={f} />)}
            </datalist>
          </div>
          <div>
            <label className="block text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider text-[10px] mb-1">區域</label>
            <input list="areas" type="text" required value={area} onChange={(e) => setArea(e.target.value)} className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)]" />
            <datalist id="areas">
               {uniqueAreas.map(a => <option key={a} value={a} />)}
            </datalist>
          </div>
        </div>

        {type === 'stock_in' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider text-[10px] mb-1">進貨成本</label>
              <input type="number" step="0.01" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)]" />
            </div>
            <div className="relative">
              <label className="block text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider text-[10px] mb-1">供應商</label>
              <input 
                list="vendor-list"
                type="text" 
                value={vendorId} 
                onChange={(e) => setVendorId(e.target.value)} 
                placeholder="選取或輸入新供應商"
                className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)]" 
              />
              <datalist id="vendor-list">
                 {useStore.getState().vendors.map(v => (
                    <option key={v.vendor_id} value={v.vendor_name} />
                 ))}
              </datalist>
            </div>
          </div>
        )}

        {type === 'adjust' && (
          <div>
            <label className="block text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider text-[10px] mb-1">備註 / 原因 (選填)</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)]" />
          </div>
        )}

        <div className="pt-4 pb-12">
          {type === 'adjust' && operator !== 'admin' ? (
             <p className="text-[#f87171] text-sm font-bold text-center">僅管理員能進行庫存盤點與調整。</p>
          ) : (
            <button
              type="submit"
              className="w-full flex items-center justify-center py-4 px-4 border border-transparent rounded-2xl shadow-sm text-base font-bold text-[#0f172a] bg-[var(--color-accent-blue)] hover:opacity-90 transition-opacity outline-none"
            >
              <Save className="w-5 h-5 mr-2" />
              儲存{type === 'stock_in' ? '進貨' : type === 'stock_out' ? '出貨' : '調整'}
            </button>
          )}
        </div>

      </form>
      )}

      {/* Product Search Modal */}
      {isSearchModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-200">
           <div className="w-full max-w-lg bg-[#0f172a] border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh] mb-20 sm:mb-0">
              <div className="flex justify-between items-center p-4 border-b border-white/5 bg-white/5">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Search className="w-5 h-5 text-[var(--color-accent-blue)]" /> 
                  搜尋商品
                </h2>
                <button onClick={() => setIsSearchModalOpen(false)} className="p-2 text-white/50 hover:text-white rounded-full transition-colors bg-white/5 hover:bg-white/10">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto w-full">
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="w-5 h-5 absolute left-3 top-3 text-white/40" />
                      <input 
                        type="text"
                        autoFocus
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="搜尋商品名稱、條碼、ID..."
                        className="w-full pl-10 pr-4 py-3 bg-black/40 border border-white/10 rounded-xl text-white outline-none focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)]"
                      />
                    </div>
                    <button 
                      onClick={() => setShowFilters(!showFilters)}
                      className={`px-3 py-3 rounded-xl border transition-colors flex items-center justify-center ${showFilters ? 'bg-[var(--color-accent-blue)] border-[var(--color-accent-blue)] text-[#0f172a]' : 'bg-black/40 border-white/10 text-white/60 hover:bg-white/5'}`}
                    >
                      <Filter className="w-5 h-5" />
                    </button>
                  </div>

                  {showFilters && (
                    <div className="flex flex-wrap gap-2 animate-in fade-in slide-in-from-top-2 p-3 bg-black/20 rounded-xl border border-white/5">
                      <select 
                        value={filterCategory} 
                        onChange={e => setFilterCategory(e.target.value)}
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] appearance-none min-w-[100px]"
                      >
                        <option value="" className="bg-[#0f172a]">所有分類</option>
                        {categories.map(c => <option key={c as string} value={c as string} className="bg-[#0f172a]">{c as string}</option>)}
                      </select>
                      
                      <select 
                        value={filterBrand} 
                        onChange={e => setFilterBrand(e.target.value)}
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] appearance-none min-w-[100px]"
                      >
                        <option value="" className="bg-[#0f172a]">所有品牌</option>
                        {brands.map(b => <option key={b as string} value={b as string} className="bg-[#0f172a]">{b as string}</option>)}
                      </select>

                      <select 
                        value={filterVendor} 
                        onChange={e => setFilterVendor(e.target.value)}
                        className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] appearance-none min-w-[120px]"
                      >
                        <option value="" className="bg-[#0f172a]">所有廠商</option>
                        {uniqueVendors.map(v => <option key={v as string} value={v as string} className="bg-[#0f172a]">{getVendorName(v as string)}</option>)}
                      </select>
                    </div>
                  )}
                  
                  <div className="space-y-2 mt-4 max-h-[40vh] overflow-y-auto w-full pr-2">
                    {searchResults.length === 0 ? (
                      <div className="text-center py-8 text-white/40 text-sm">找不到相關商品</div>
                    ) : (
                      searchResults.map(p => (
                        <div 
                          key={p.product_id}
                          onClick={() => {
                            setPid(p.product_id);
                            setIsSearchModalOpen(false);
                            setSearchTerm('');
                          }}
                          className="glass-panel p-3 rounded-xl border border-white/5 hover:border-[var(--color-accent-blue)]/50 cursor-pointer active:scale-[0.98] transition-all flex items-center justify-between w-full"
                        >
                           <div className="overflow-hidden pr-2">
                             <div className="font-bold text-white text-sm truncate">{p.name}</div>
                             <div className="text-xs text-white/40 tracking-wider truncate mt-1">{p.product_id}</div>
                           </div>
                           <Plus className="w-5 h-5 text-[var(--color-accent-blue)] shrink-0" />
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
}
