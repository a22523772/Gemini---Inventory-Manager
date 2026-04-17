import { useState, useMemo, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Search, ScanBarcode, PackageOpen, Pencil, Trash2, MoreHorizontal } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

export default function Products() {
  const { products, stock, deleteProduct, showToast } = useStore();
  const [searchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(searchParams.get('pid') || '');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const pid = searchParams.get('pid');
    if (pid) {
      setSearchTerm(pid);
    }
  }, [searchParams]);

  // 模糊搜尋，本地快取中查找 (支援 < 100ms 要求)
  const filteredProducts = useMemo(() => {
    if (!searchTerm) return products.slice(0, 50); // limit empty view
    const q = searchTerm.toLowerCase();
    return products.filter(
      p => p.name.toLowerCase().includes(q) || 
           (p.barcode && p.barcode.includes(q)) || 
           p.product_id.toLowerCase().includes(q)
    ).slice(0, 100);
  }, [searchTerm, products]);

  // 取的某商品的總庫存
  const getProductStock = (pid: string) => {
    return stock.filter(s => s.product_id === pid).reduce((a, b) => a + b.quantity, 0);
  };

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
          <Link to="/add-product" className="p-2 bg-[var(--color-accent-blue)] text-[#0f172a] rounded-full hover:opacity-90 transition-opacity active:scale-95 shadow-lg shadow-sky-400/20">
            <PackageOpen className="w-5 h-5 relative hidden" />
            <span className="flex items-center text-sm font-bold px-2">
              + 新增
            </span>
          </Link>
        </div>
        
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
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-[var(--color-text-dim)] py-12">
            <PackageOpen className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm font-medium">找不到符合的商品</p>
          </div>
        ) : (
          filteredProducts.map(p => (
            <div key={p.product_id} className="glass-panel border border-[var(--color-glass-border)] rounded-xl p-4 transition-all">
              <div className="flex justify-between items-start mb-2">
                <div className="flex-1 pr-2">
                  <h3 className="font-bold text-[var(--color-text-main)] text-base">{p.name}</h3>
                  <p className="text-xs text-[var(--color-text-dim)] font-mono mt-0.5">{p.product_id} {p.barcode ? `| ${p.barcode}` : ''}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="bg-[var(--color-glass-bg)] text-[var(--color-accent-blue)] px-2.5 py-1 rounded-lg text-sm font-bold border border-[var(--color-glass-border)]">
                    {getProductStock(p.product_id)} {p.unit}
                  </div>
                  <button 
                    onClick={() => setExpandedId(expandedId === p.product_id ? null : p.product_id)}
                    className="p-1 -mr-1 text-[var(--color-text-dim)] hover:text-white"
                  >
                    <MoreHorizontal className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              {expandedId === p.product_id && (
                <div className="mb-3 pt-2 border-t border-white/5 flex gap-2 animate-in fade-in slide-in-from-top-2">
                  {confirmDeleteId === p.product_id ? (
                    <div className="flex-1 flex gap-2 w-full animate-in slide-in-from-right-2">
                       <div className="flex-1 py-1.5 flex items-center justify-center text-sm font-bold text-red-400">確定刪除？</div>
                       <button onClick={() => executeDelete(p.product_id)} className="flex-1 py-1.5 glass-panel hover:bg-red-500/20 text-red-400 text-xs font-bold rounded-lg flex items-center justify-center transition-colors border-red-500/30">
                         確認
                       </button>
                       <button onClick={() => setConfirmDeleteId(null)} className="flex-1 py-1.5 glass-panel hover:bg-white/10 text-white text-xs font-bold rounded-lg flex items-center justify-center transition-colors">
                         取消
                       </button>
                    </div>
                  ) : (
                    <>
                      <button onClick={() => navigate(`/add-product?editId=${p.product_id}`)} className="flex-1 py-1.5 glass-panel hover:bg-white/10 text-[var(--color-accent-blue)] text-xs font-bold rounded-lg flex items-center justify-center transition-colors">
                        <Pencil className="w-3.5 h-3.5 mr-1.5" /> 編輯
                      </button>
                      <button onClick={() => setConfirmDeleteId(p.product_id)} className="flex-1 py-1.5 glass-panel hover:bg-red-500/20 text-red-400 text-xs font-bold rounded-lg flex items-center justify-center transition-colors">
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" /> 刪除
                      </button>
                    </>
                  )}
                </div>
              )}

              <div className="mt-3 flex gap-2">
                <Link to={`/manage?type=stock_in&pid=${p.product_id}`} className="flex-1 py-2 glass-panel hover:bg-white/10 text-[var(--color-text-main)] text-xs font-semibold rounded-lg text-center transition-colors">
                  進貨
                </Link>
                <Link to={`/manage?type=stock_out&pid=${p.product_id}`} className="flex-1 py-2 glass-panel hover:bg-white/10 text-[var(--color-text-main)] text-xs font-semibold rounded-lg text-center transition-colors">
                  出貨
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
