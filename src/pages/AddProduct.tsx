import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { ArrowLeft, Save, ScanBarcode, PackagePlus, Pencil } from 'lucide-react';

export default function AddProduct() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { addProduct, editProduct, products, vendors, showToast } = useStore();

  const editId = searchParams.get('editId');
  const existingProduct = editId ? products.find(p => p.product_id === editId) : null;

  // Form state
  const [productId, setProductId] = useState(`P${Date.now().toString().slice(-6)}`);
  const [barcode, setBarcode] = useState(searchParams.get('pid') || '');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [unit, setUnit] = useState('個');
  const [costPrice, setCostPrice] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [hasExpiry, setHasExpiry] = useState(false);
  const [expiryDate, setExpiryDate] = useState('');

  useEffect(() => {
    if (existingProduct) {
      setProductId(existingProduct.product_id);
      setBarcode(existingProduct.barcode || '');
      setName(existingProduct.name);
      setCategory(existingProduct.category || '');
      setBrand(existingProduct.brand || '');
      setUnit(existingProduct.unit || '個');
      setCostPrice(existingProduct.cost_price?.toString() || '');
      setVendorId(existingProduct.vendor_id || '');
      setHasExpiry(existingProduct.has_expiry || false);
      setExpiryDate(existingProduct.expiry_date || '');
    }
  }, [existingProduct]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const productData = {
      product_id: productId,
      barcode,
      name,
      category,
      brand,
      unit,
      cost_price: Number(costPrice) || 0,
      vendor_id: vendorId,
      has_expiry: hasExpiry,
      expiry_date: expiryDate
    };

    if (existingProduct) {
      await editProduct({ ...existingProduct, ...productData });
      showToast('✅ 商品已更新！');
    } else {
      await addProduct(productData);
      showToast('✅ 新商品已建立！');
    }
    
    // Navigate back to products listing
    navigate('/products', { replace: true });
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
            <label className="block text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider text-[10px] mb-1">商品 ID (唯一)</label>
            <input
              type="text"
              required
              disabled={!!existingProduct}
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)] outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
                onClick={() => navigate(`/scan?returnTo=${encodeURIComponent(`/add-product${existingProduct ? `?editId=${existingProduct.product_id}` : ''}`)}`)}
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
              <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)] transition-all" />
            </div>
            <div>
              <label className="block text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider text-[10px] mb-1">品牌</label>
              <input type="text" value={brand} onChange={(e) => setBrand(e.target.value)} className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)] transition-all" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider text-[10px] mb-1">單位 *</label>
              <input type="text" required value={unit} onChange={(e) => setUnit(e.target.value)} className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)] transition-all" />
            </div>
            <div>
              <label className="block text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider text-[10px] mb-1">平均進價 / 成本</label>
              <input type="number" step="0.01" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)] transition-all" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider text-[10px] mb-1">供應商</label>
            <select
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)] transition-all appearance-none"
            >
              <option value="" className="bg-[#0f172a]">-- 尚未選擇 --</option>
              {vendors.map(v => (
                <option key={v.vendor_id} value={v.vendor_id} className="bg-[#0f172a]">
                  {v.vendor_name} ({v.vendor_id})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-3 pt-2">
            <input 
              type="checkbox" 
              id="has_expiry" 
              checked={hasExpiry} 
              onChange={(e) => setHasExpiry(e.target.checked)}
              className="w-5 h-5 rounded min-w-5 border-white/20 bg-white/5 accent-[var(--color-accent-blue)]"
            />
            <label htmlFor="has_expiry" className="text-sm font-bold text-[var(--color-text-main)] uppercase tracking-wider text-[12px] select-none">
              此商品包含有效期限 (例如：生鮮食品)
            </label>
          </div>
          
          {hasExpiry && (
            <div className="animate-in fade-in slide-in-from-top-2">
              <label className="block text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider text-[10px] mb-1">有效日期 (可選預設)</label>
              <input 
                type="date" 
                value={expiryDate} 
                onChange={(e) => setExpiryDate(e.target.value)} 
                className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)] transition-all" 
              />
            </div>
          )}
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
