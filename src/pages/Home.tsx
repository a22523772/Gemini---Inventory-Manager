import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Package, ArrowDownToLine, ArrowUpFromLine, RefreshCcw, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Home() {
  const { products, stock, syncQueue, isLoading, fetchRemoteData, error } = useStore();

  const totalStock = stock.reduce((acc, curr) => acc + curr.quantity, 0);

  return (
    <div className="p-4 space-y-6">
      <header className="flex items-center justify-between pt-4 pb-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-main)]">Dashboard</h1>
          <p className="text-sm text-[var(--color-text-dim)]">Inventory Overview</p>
        </div>
        <button 
          onClick={fetchRemoteData} 
          disabled={isLoading}
          className="p-2 glass-panel rounded-full shadow-sm text-[var(--color-text-main)] hover:text-[var(--color-accent-blue)] transition-colors"
        >
          <RefreshCcw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {error && (
        <div className="p-3 bg-red-900/40 border border-red-500/30 rounded-xl flex items-start space-x-3 text-red-100 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0 text-red-400" />
          <p>{error}</p>
        </div>
      )}

      {syncQueue.length > 0 && (
        <div className="p-3 bg-opacity-40 border border-[var(--color-accent-orange)]/30 rounded-xl flex items-start space-x-3 text-orange-100 text-sm" style={{ backgroundColor: 'rgba(251, 146, 60, 0.15)' }}>
          <RefreshCcw className="w-5 h-5 shrink-0 animate-pulse text-[var(--color-accent-orange)]" />
          <p>您有 <strong>{syncQueue.length}</strong> 筆離線操作待同步，連線後將自動同步。</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="glass-panel p-4 rounded-2xl flex flex-col justify-between">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center mb-3">
            <Package className="w-5 h-5 text-[var(--color-accent-blue)]" />
          </div>
          <h2 className="text-3xl font-bold text-[var(--color-accent-blue)]">{products.length}</h2>
          <p className="text-sm font-medium text-[var(--color-text-dim)] uppercase tracking-wider mt-1 text-[10px]">總商品數</p>
        </div>
        
        <div className="glass-panel p-4 rounded-2xl flex flex-col justify-between">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center mb-3">
            <Package className="w-5 h-5 text-[var(--color-accent-green)]" />
          </div>
          <h2 className="text-3xl font-bold text-[var(--color-accent-green)]">{totalStock}</h2>
          <p className="text-sm font-medium text-[var(--color-text-dim)] uppercase tracking-wider mt-1 text-[10px]">庫存總量</p>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider mb-3">快速操作</h3>
        <div className="grid grid-cols-3 gap-3">
          <Link to="/manage?type=stock_in" className="flex flex-col items-center justify-center glass-panel p-4 rounded-2xl active:scale-95 transition-all hover:bg-white/10 hover:border-white/20">
            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-2">
              <ArrowDownToLine className="w-5 h-5 text-[var(--color-accent-blue)]" />
            </div>
            <span className="text-xs font-semibold text-[var(--color-text-main)]">進貨</span>
          </Link>
          <Link to="/manage?type=stock_out" className="flex flex-col items-center justify-center glass-panel p-4 rounded-2xl active:scale-95 transition-all hover:bg-white/10 hover:border-white/20">
            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-2">
              <ArrowUpFromLine className="w-5 h-5 text-[#f87171]" />
            </div>
            <span className="text-xs font-semibold text-[var(--color-text-main)]">出貨</span>
          </Link>
          <Link to="/manage?type=adjust" className="flex flex-col items-center justify-center glass-panel p-4 rounded-2xl active:scale-95 transition-all hover:bg-white/10 hover:border-white/20">
            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-2">
              <RefreshCcw className="w-5 h-5 text-[var(--color-accent-orange)]" />
            </div>
            <span className="text-xs font-semibold text-[var(--color-text-main)]">盤點</span>
          </Link>
        </div>
      </div>
      
    </div>
  );
}
