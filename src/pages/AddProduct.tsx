import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { ArrowLeft, Save, ScanBarcode, PackagePlus } from 'lucide-react';

export default function AddProduct() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const addProduct = useStore((state) => state.addProduct);

  // Form state
  const [productId, setProductId] = useState(`P${Date.now().toString().slice(-6)}`);
  const [barcode, setBarcode] = useState(searchParams.get('pid') || '');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [unit, setUnit] = useState('個');
  const [costPrice, setCostPrice] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [hasExpiry, setHasExpiry] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await addProduct({
      product_id: productId,
      barcode,
      name,
      category,
      unit,
      cost_price: Number(costPrice) || 0,
      vendor_id: vendorId,
      has_expiry: hasExpiry
    });
    
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
          <PackagePlus className="w-5 h-5 mr-2 text-[var(--color-accent-blue)]" />
          新增商品
        </h1>
      </header>

      <form onSubmit={handleSubmit} className="p-4 flex-1 overflow-y-auto space-y-4 pb-24">
        
        <div className="glass-panel p-4 rounded-2xl space-y-4">
          <div>
            <label className="block text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider text-[10px] mb-1">商品 ID (唯一)</label>
            <input
              type="text"
              required
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)] outline-none transition-all"
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
                onClick={() => navigate(`/scan?returnTo=/add-product`)}
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
              <label className="block text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider text-[10px] mb-1">單位 *</label>
              <input type="text" required value={unit} onChange={(e) => setUnit(e.target.value)} className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)] transition-all" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider text-[10px] mb-1">預設進價</label>
              <input type="number" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)] transition-all" />
            </div>
            <div>
              <label className="block text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider text-[10px] mb-1">供應商 ID</label>
              <input type="text" value={vendorId} onChange={(e) => setVendorId(e.target.value)} className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)] transition-all" />
            </div>
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
        </div>

        <div className="pt-2">
          <button
            type="submit"
            className="w-full flex items-center justify-center py-4 px-4 border border-transparent rounded-2xl shadow-sm text-base font-bold text-[#0f172a] bg-[var(--color-accent-blue)] hover:opacity-90 active:scale-95 transition-all outline-none"
          >
            <Save className="w-5 h-5 mr-2" />
            建立商品
          </button>
        </div>
      </form>
    </div>
  );
}
