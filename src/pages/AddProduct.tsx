import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { ArrowLeft, Save, ScanBarcode, PackagePlus, Pencil } from 'lucide-react';

export default function AddProduct() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { id: routeParamId } = useParams();
  const { addProduct, editProduct, products, vendors, showToast } = useStore();

  const editId = searchParams.get('editId') || routeParamId || null;
  const existingProduct = editId ? products.find(p => p.product_id === editId) : null;

  // Extract unique categories and brands for datalists
  const { uniqueCategories, uniqueBrands } = useMemo(() => {
    const cats = new Set<string>();
    const brds = new Set<string>();
    products.forEach(p => {
      if (p.category) cats.add(p.category);
      if (p.brand) brds.add(p.brand);
    });
    return { uniqueCategories: Array.from(cats), uniqueBrands: Array.from(brds) };
  }, [products]);

  // Form state
  const [productId, setProductId] = useState('');
  const [barcode, setBarcode] = useState(searchParams.get('pid') || '');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [specification, setSpecification] = useState('');
  const [unit, setUnit] = useState('個');
  const [costPrice, setCostPrice] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [hasExpiry, setHasExpiry] = useState(false);
  const [productStatus, setProductStatus] = useState<'normal' | 'out_of_stock'>('normal');
  const [minStock, setMinStock] = useState('');
  const [expiryDate, setExpiryDate] = useState('');

  useEffect(() => {
    const draftStr = sessionStorage.getItem('add_product_draft');
    if (draftStr) {
      try {
        const draft = JSON.parse(draftStr);
        setProductId(draft.productId || '');
        setBarcode(draft.barcode || '');
        setName(draft.name || '');
        setCategory(draft.category || '');
        setBrand(draft.brand || '');
        setSpecification(draft.specification || '');
        setUnit(draft.unit || '個');
        setCostPrice(draft.costPrice || '');
        setVendorId(draft.vendorId || '');
        setHasExpiry(draft.hasExpiry || false);
        const isDraftOut = draft.productStatus === 'out_of_stock' || draft.productStatus === 'discontinued' || draft.isDiscontinued || draft.isOutOfStock;
        setProductStatus(isDraftOut ? 'out_of_stock' : 'normal');
        setMinStock(draft.minStock || '');
        if (draft.expiryDate) setExpiryDate(draft.expiryDate);
      } catch (e) {
        console.error("Error restoring product draft:", e);
      }
      sessionStorage.removeItem('add_product_draft');
    } else if (existingProduct) {
      setProductId(existingProduct.product_id);
      setBarcode(existingProduct.barcode || '');
      setName(existingProduct.name);
      setCategory(existingProduct.category || '');
      setBrand(existingProduct.brand || '');
      
      // Merge any multiple specification rows for safety when displaying in editing mode
      const sameProducts = products.filter(p => p.product_id === existingProduct.product_id);
      const allSpecs: string[] = [];
      sameProducts.forEach(p => {
        if (p.specification) {
          p.specification.split(/[,\/，\s、]+/).forEach(s => {
            const trimmed = s.trim();
            if (trimmed && !allSpecs.includes(trimmed)) {
              allSpecs.push(trimmed);
            }
          });
        }
      });
      setSpecification(allSpecs.join('、'));

      setUnit(existingProduct.unit || '個');
      setCostPrice(existingProduct.cost_price?.toString() || '');
      setVendorId(existingProduct.vendor_id || '');
      setHasExpiry(existingProduct.has_expiry || false);
      
      const isOut = existingProduct.is_out_of_stock || existingProduct.is_discontinued || existingProduct.status === 'out_of_stock' || existingProduct.status === 'discontinued' || String(existingProduct.status).includes('缺貨') || String(existingProduct.status).includes('停產');
      setProductStatus(isOut ? 'out_of_stock' : 'normal');
      setMinStock(existingProduct.min_stock?.toString() || '');
    }
  }, [existingProduct]);

  useEffect(() => {
    const pid = searchParams.get('pid');
    const paramName = searchParams.get('name');
    const paramSpec = searchParams.get('spec');

    if (pid) setBarcode(pid);
    if (paramName) setName(paramName);
    if (paramSpec) setSpecification(paramSpec);
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let actualVendorId = vendorId;
    const isNewVendor = vendorId.trim() && !vendors.find(v => v.vendor_id === vendorId || v.vendor_name === vendorId);
    
    if (isNewVendor) {
       actualVendorId = `V${Date.now().toString().slice(-6)}`;
    } else {
       const existingVendor = vendors.find(v => v.vendor_id === vendorId || v.vendor_name === vendorId);
       if (existingVendor) actualVendorId = existingVendor.vendor_id;
    }

    const isOutOfStockVal = productStatus === 'out_of_stock';

    const productData = {
      product_id: productId,
      barcode,
      name,
      category,
      brand,
      specification,
      unit,
      cost_price: Number(costPrice) || 0,
      vendor_id: actualVendorId,
      has_expiry: hasExpiry,
      status: isOutOfStockVal ? '暫時缺貨' : '正常',
      is_discontinued: false,
      is_out_of_stock: isOutOfStockVal,
      min_stock: minStock !== '' ? Number(minStock) : undefined
    };

    if (existingProduct) {
      await editProduct({ ...existingProduct, ...productData });
      showToast('✅ 商品已更新！');
    } else {
      await addProduct(productData);
      showToast('✅ 新商品已建立！');
    }
    
    if (isNewVendor) {
       showToast('⚠️ 偵測到新供應商，請完成資料建立');
       // Pass both name and the temporary ID we just chose
       navigate(`/vendors?newVendorName=${encodeURIComponent(vendorId.trim())}&tempId=${actualVendorId}`);
    } else {
       // Navigate back to products listing
       navigate('/products', { replace: true });
    }
  };

  return (
    <div className="h-full flex flex-col">
      <header className="flex items-center p-4 glass-panel border-x-0 border-t-0">
        <button onClick={() => navigate('/products')} className="p-2 -ml-2 text-[var(--color-text-dim)] rounded-full hover:bg-white/10 transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="ml-2 text-xl font-bold text-[var(--color-text-main)] flex items-center">
          {existingProduct ? <Pencil className="w-5 h-5 mr-2 text-[var(--color-accent-blue)]" /> : <PackagePlus className="w-5 h-5 mr-2 text-[var(--color-accent-blue)]" />}
          {existingProduct ? '編輯商品' : '新增商品'}
        </h1>
      </header>

      <form onSubmit={handleSubmit} className="p-4 flex-1 overflow-y-auto space-y-4 pb-24">
        
        <div className="glass-panel p-4 rounded-2xl space-y-4">
          <div>
            <label className="block text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider text-[10px] mb-1">商品 ID (留空將由系統自動編號)</label>
            <input
              type="text"
              disabled={!!existingProduct}
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              placeholder="例如：P000001 (選填)"
              className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] placeholder-[var(--color-text-dim)] focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)] outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider text-[10px] mb-1">商品名稱 *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：馬克杯"
              className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] placeholder-[var(--color-text-dim)] focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)] outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider text-[10px] mb-1">條碼</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="手動輸入或掃描"
                className="flex-1 block w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] placeholder-[var(--color-text-dim)] focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)] outline-none transition-all"
              />
               <button 
                type="button" 
                onClick={() => {
                  sessionStorage.setItem('add_product_draft', JSON.stringify({
                    productId,
                    barcode,
                    name,
                    category,
                    brand,
                    specification,
                    unit,
                    costPrice,
                    vendorId,
                    hasExpiry,
                    minStock,
                    expiryDate
                  }));
                  navigate(`/scan?returnTo=${encodeURIComponent(`/add-product${existingProduct ? `?editId=${existingProduct.product_id}` : ''}`)}`);
                }}
                className="px-4 py-2 glass-panel text-[var(--color-accent-blue)] rounded-xl font-bold flex items-center justify-center hover:bg-white/10 transition-colors"
                title="掃描條碼"
              >
                <ScanBarcode className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="glass-panel p-4 rounded-2xl space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider text-[10px] mb-1">分類</label>
              <input list="categories-list" type="text" value={category} onChange={(e) => setCategory(e.target.value)} className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)] transition-all" />
              <datalist id="categories-list">
                {uniqueCategories.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div>
              <label className="block text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider text-[10px] mb-1">品牌</label>
              <input list="brands-list" type="text" value={brand} onChange={(e) => setBrand(e.target.value)} className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)] transition-all" />
              <datalist id="brands-list">
                {uniqueBrands.map(b => <option key={b} value={b} />)}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider text-[10px] mb-1">單位 *</label>
              <input type="text" required value={unit} onChange={(e) => setUnit(e.target.value)} className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)] transition-all" />
            </div>
            <div>
              <label className="block text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider text-[10px] mb-1">規格</label>
              <input type="text" value={specification} onChange={(e) => setSpecification(e.target.value)} placeholder="例如：紅色, 藍色, 黑色" className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)] transition-all" />
              <p className="mt-1 text-[10px] text-[var(--color-text-dim)] leading-normal">
                💡 可輸入多個規格，請用 <strong>全/半形逗號</strong>、<strong>斜線</strong> 或 <strong>頓號</strong> 隔開（例如：<code>大號, 中號, 小號</code> 或 <code>紅、黃、藍</code>）
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider text-[10px] mb-1">平均進價 / 成本</label>
            <input type="number" step="0.01" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)] transition-all" />
          </div>

          <div>
            <label className="block text-sm font-bold text-orange-400 uppercase tracking-wider text-[10px] mb-1">補貨警示數量 (留空則使用系統設 5)</label>
            <input type="number" step="1" min="0" value={minStock} onChange={(e) => setMinStock(e.target.value)} placeholder="例如：10" className="block w-full rounded-xl border border-orange-500/30 bg-orange-500/5 py-3 px-3 text-sm text-[var(--color-text-main)] outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all placeholder-white/30" />
          </div>

          <div>
            <label className="block text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider text-[10px] mb-1">供應商 (代號或名稱)</label>
            <input
              list="vendor-list"
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              placeholder="輸入或選擇供應商"
              className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)] transition-all"
            />
            <datalist id="vendor-list">
              {vendors.map(v => (
                <option key={v.vendor_id} value={v.vendor_id}>
                  {v.vendor_name}
                </option>
              ))}
            </datalist>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-center space-x-3">
              <input 
                type="checkbox" 
                id="has_expiry" 
                checked={hasExpiry} 
                onChange={(e) => setHasExpiry(e.target.checked)}
                className="w-5 h-5 rounded min-w-5 border-white/20 bg-white/5 accent-[var(--color-accent-blue)]"
              />
              <label htmlFor="has_expiry" className="text-sm font-bold text-[var(--color-text-main)] uppercase tracking-wider text-[12px] select-none">
                此商品包含有效期限 (例如：生鮮食品、藥品)
              </label>
            </div>

            {/* 供應與生產狀態選擇 */}
            <div className="pt-2 border-t border-white/5 space-y-2">
              <label className="block text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider text-[10px]">
                商品供應與生產狀態
              </label>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* 1. 正常供應 */}
                <div 
                  onClick={() => setProductStatus('normal')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    productStatus === 'normal'
                      ? 'border-emerald-500 bg-emerald-500/15 text-white shadow-sm'
                      : 'border-white/10 bg-white/5 text-zinc-400 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <span className="text-emerald-400">🟢</span>
                    <span className={productStatus === 'normal' ? 'text-emerald-300' : 'text-zinc-300'}>正常供應</span>
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-1 leading-tight">納入常規庫存與報表管理</div>
                </div>

                {/* 2. 暫時缺貨 */}
                <div 
                  onClick={() => setProductStatus('out_of_stock')}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    productStatus === 'out_of_stock'
                      ? 'border-amber-500 bg-amber-500/15 text-white shadow-sm'
                      : 'border-white/10 bg-white/5 text-zinc-400 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs">
                    <span className="text-amber-400">🟡</span>
                    <span className={productStatus === 'out_of_stock' ? 'text-amber-300' : 'text-zinc-300'}>暫時缺貨</span>
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-1 leading-tight">獨立於專報，不納入日常補貨警示</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            className="w-full flex items-center justify-center py-4 px-4 border border-transparent rounded-2xl shadow-sm text-base font-bold text-[#0f172a] bg-[var(--color-accent-blue)] hover:opacity-90 active:scale-95 transition-all outline-none"
          >
            <Save className="w-5 h-5 mr-2" />
            {existingProduct ? '儲存變更' : '建立商品'}
          </button>
        </div>
      </form>
    </div>
  );
}
