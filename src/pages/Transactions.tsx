import { useState } from 'react';
import { useStore } from '../store/useStore';
import { PackageOpen, ArrowDownToLine, ArrowUpFromLine, RefreshCcw } from 'lucide-react';

export default function Transactions() {
  const { transactions, products, vendors } = useStore();
  const [filterType, setFilterType] = useState('');

  const filteredTransactions = transactions.filter(t => 
    filterType ? t.type === filterType : true
  );

  const getProductName = (pid: string) => {
    const p = products.find(prod => prod.product_id === pid);
    return p ? p.name : pid;
  };

  const getVendorName = (vid?: string) => {
    if (!vid) return '';
    const v = vendors.find(ven => ven.vendor_id === vid);
    return v ? v.vendor_name : vid;
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'stock_in': return <ArrowDownToLine className="w-5 h-5 text-[var(--color-accent-blue)]" />;
      case 'stock_out': return <ArrowUpFromLine className="w-5 h-5 text-[#f87171]" />;
      case 'adjust': return <RefreshCcw className="w-5 h-5 text-[var(--color-accent-orange)]" />;
      default: return <PackageOpen className="w-5 h-5 text-gray-400" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'stock_in': return '進貨';
      case 'stock_out': return '出貨';
      case 'adjust': return '盤點調整';
      default: return type;
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="glass-panel border-x-0 border-t-0 px-4 pt-6 pb-4 sticky top-0 z-10">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-main)]">進出貨紀錄</h1>
        </div>
        <select 
          value={filterType} 
          onChange={e => setFilterType(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] appearance-none"
        >
          <option value="" className="bg-[#0f172a]">所有操作記錄</option>
          <option value="stock_in" className="bg-[#0f172a]">只看進貨</option>
          <option value="stock_out" className="bg-[#0f172a]">只看出貨</option>
          <option value="adjust" className="bg-[#0f172a]">只看盤點調整</option>
        </select>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredTransactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-[var(--color-text-dim)] py-12">
            <RefreshCcw className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm font-medium">尚未有操作紀錄</p>
          </div>
        ) : (
          filteredTransactions.map(t => (
            <div key={t.id || t.transaction_id} className="glass-panel border border-[var(--color-glass-border)] rounded-xl p-4 transition-all">
              <div className="flex items-start mb-2 gap-3">
                <div className="mt-1 w-10 h-10 shrink-0 rounded-xl bg-white/5 flex items-center justify-center">
                  {getIcon(t.type)}
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start">
                    <h3 className="font-bold text-[var(--color-text-main)] text-base">{getProductName(t.product_id)}</h3>
                    <div className="text-right">
                      <span className="text-xs text-[var(--color-text-dim)] font-mono">
                        {t.date.includes('T') ? new Date(t.date).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(/\//g, '-') : t.date}
                      </span>
                      <p className="text-xs font-bold text-[var(--color-text-main)]">{getTypeLabel(t.type)}</p>
                    </div>
                  </div>
                  <p className="text-xs text-[var(--color-text-dim)] font-mono mt-1">PID: {t.product_id}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-white/5 text-sm">
                <div>
                  <p className="text-[10px] text-[var(--color-text-dim)] uppercase">異動數量</p>
                  <p className="font-bold text-[var(--color-accent-blue)]">{t.quantity}</p>
                </div>
                {t.type === 'stock_in' && t.cost_price ? (
                  <div>
                    <p className="text-[10px] text-[var(--color-text-dim)] uppercase">進價/成本</p>
                    <p className="font-bold text-[var(--color-accent-green)]">${t.cost_price}</p>
                  </div>
                ) : null}
                {t.type === 'stock_in' && t.vendor_id && (
                  <div className="col-span-2">
                    <p className="text-[10px] text-[var(--color-text-dim)] uppercase">供應商</p>
                    <p className="font-medium text-[var(--color-text-main)]">{getVendorName(t.vendor_id)}</p>
                  </div>
                )}
                {t.type === 'adjust' && t.note && (
                  <div className="col-span-2">
                    <p className="text-[10px] text-[var(--color-text-dim)] uppercase">盤點備註</p>
                    <p className="font-medium text-[var(--color-text-main)] bg-white/5 p-2 rounded-lg mt-1">{t.note}</p>
                  </div>
                )}
                <div className="col-span-2 flex gap-2 text-xs">
                    <span className="bg-white/5 px-2 py-1 rounded text-[var(--color-text-dim)]">{t.location}</span>
                    <span className="bg-white/5 px-2 py-1 rounded text-[var(--color-text-dim)]">{t.floor}</span>
                    <span className="bg-white/5 px-2 py-1 rounded text-[var(--color-text-dim)]">{t.area}</span>
                    <span className="bg-white/5 px-2 py-1 rounded text-[var(--color-text-dim)] ml-auto border border-white/10 opacity-60">人員: {t.operator}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
