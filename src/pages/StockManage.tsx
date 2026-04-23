import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { ArrowLeft, Save } from 'lucide-react';

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
      product_id: targetPid,
      quantity: Number(quantity),
      location,
      floor,
      area,
      expiry_date: currentExpiry || '',
      specification: currentSpecification,
      operator
    };

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

      <form onSubmit={handleSubmit} className="p-4 flex-1 overflow-y-auto space-y-4">
        
        <div>
          <label className="block text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider text-[10px] mb-1">商品 ID 或 條碼</label>
          <div className="flex gap-2">
            <input
              type="text"
              required
              value={pid}
              onChange={(e) => setPid(e.target.value)}
              className="flex-1 block w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] placeholder-[var(--color-text-dim)] focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)] outline-none"
              placeholder="例如：P001"
            />
            <button 
              type="button" 
              onClick={() => navigate(`/scan?returnTo=${encodeURIComponent('/manage?type=' + type)}`)}
              className="px-4 py-2 glass-panel text-[var(--color-accent-blue)] rounded-xl font-bold text-sm hover:bg-white/10"
            >
              掃描
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

        {type === 'stock_in' && product?.has_expiry && (
          <div className="animate-in fade-in slide-in-from-top-2 p-3 border border-[var(--color-accent-orange)]/30 bg-[var(--color-accent-orange)]/10 rounded-xl">
            <label className="block text-sm font-bold text-orange-200 uppercase tracking-wider text-[10px] mb-1">
              操作有效日期 (必填)
            </label>
            <input
              type="date"
              required={product?.has_expiry}
              value={currentExpiry}
              onChange={(e) => setCurrentExpiry(e.target.value)}
              className="block w-full rounded-xl border border-white/10 bg-black/20 py-3 px-3 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-orange)] focus:ring-1 focus:ring-[var(--color-accent-orange)]"
            />
            <p className="text-[10px] text-orange-300/70 mt-1.5 flex items-center gap-1">
              <span className="bg-orange-500/20 px-1 py-0.5 rounded">提示</span> 
              相同商品若輸入不同有效時間，系統會自動分流為新商品批次。
            </p>
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
            <label className="block text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider text-[10px] mb-1">備註 / 原因</label>
            <input type="text" required value={note} onChange={(e) => setNote(e.target.value)} className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)]" />
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
    </div>
  );
}
