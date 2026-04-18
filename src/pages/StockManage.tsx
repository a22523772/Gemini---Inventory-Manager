import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { ArrowLeft, Save } from 'lucide-react';

export default function StockManage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { enqueueAction, products, operator } = useStore();
  
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

  useEffect(() => {
    const scannedPid = searchParams.get('pid');
    if (scannedPid) {
      setPid(scannedPid);
    }
  }, [searchParams]);

  const product = products.find(p => p.product_id === pid);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pid || !quantity) return;

    let payload: any = {
      product_id: pid,
      quantity: Number(quantity),
      location,
      floor,
      area
    };

    let actionName: any;

    if (type === 'stock_in') {
      actionName = 'stockIn';
      payload.cost_price = Number(costPrice);
      payload.vendor_id = vendorId;
    } else if (type === 'stock_out') {
      actionName = 'stockOut';
    } else {
      actionName = 'adjustStock';
      payload.note = note;
    }

    try {
      await enqueueAction(actionName, payload);
      alert('Operation saved locally! Will sync when online.');
      navigate('/');
    } catch (e: any) {
      alert('Error saving operation: ' + e.message);
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
               {type === 'stock_out' && product.has_expiry && product.expiry_date && (
                 <p className="text-orange-400 font-bold bg-orange-400/10 inline-block px-2 py-1 rounded w-fit">
                   ⚠ 注意有效期限: {product.expiry_date}
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
            <input type="text" required value={location} onChange={(e) => setLocation(e.target.value)} className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)]" />
          </div>
          <div>
            <label className="block text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider text-[10px] mb-1">樓層</label>
            <input type="text" required value={floor} onChange={(e) => setFloor(e.target.value)} className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)]" />
          </div>
          <div>
            <label className="block text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider text-[10px] mb-1">區域</label>
            <input type="text" required value={area} onChange={(e) => setArea(e.target.value)} className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)]" />
          </div>
        </div>

        {type === 'stock_in' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider text-[10px] mb-1">進貨成本</label>
              <input type="number" required value={costPrice} onChange={(e) => setCostPrice(e.target.value)} className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)]" />
            </div>
            <div>
              <label className="block text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider text-[10px] mb-1">供應商 ID</label>
              <input type="text" required value={vendorId} onChange={(e) => setVendorId(e.target.value)} className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)]" />
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
