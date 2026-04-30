import { useState, useMemo, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { PackageOpen, ArrowDownToLine, ArrowUpFromLine, RefreshCcw, Calendar, Search, Filter, X, ChevronDown, ChevronUp } from 'lucide-react';
import { format, subDays, isWithinInterval, startOfDay, endOfDay, parseISO } from 'date-fns';

export default function Transactions() {
  const { transactions, products, vendors } = useStore();
  const [filterType, setFilterType] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [showFilters, setShowFilters] = useState(false);
  const [filterLocation, setFilterLocation] = useState('');
  const { fetchRemoteData, gasApiUrl, isLoading: storeIsLoading } = useStore();
  
  useEffect(() => {
    // Always consider fetching remote data on mount to ensure we have the latest from the sheet,
    // not just the optimistic local ones.
    if (gasApiUrl && !storeIsLoading) {
       fetchRemoteData();
    }
  }, [gasApiUrl]); // Fetch on mount or when API URL changes

  const locations = useMemo(() => Array.from(new Set(transactions.map(t => t.location).filter(Boolean))), [transactions]);

  const filteredTransactions = transactions.filter(t => {
    // Type Filter
    if (filterType && t.type !== filterType) return false;

    // Date Range Filter
    if (startDate && endDate) {
      try {
        if (!t.date) return true; // Default to showing records without date
        
        // Handle common formats like "2026/04/30 17:10:36", "2026-04-30", etc.
        let dStr = String(t.date);
        // Replace dashes with slashes for Safari compatibility if it doesn't have T
        if (!dStr.includes('T')) {
           dStr = dStr.replace(/-/g, '/');
        }
        let tDate = new Date(dStr);
        
        if (!isNaN(tDate.getTime())) {
          const start = startOfDay(new Date(startDate.replace(/-/g, '/')));
          const end = endOfDay(new Date(endDate.replace(/-/g, '/')));
          if (tDate < start || tDate > end) return false;
        }
      } catch (e) {
        console.warn("Date parsing error for record:", t, e);
        // In case of error, show it anyway to be safe
      }
    }

    // Search Filter (Product Name, ID, or Operator)
    if (searchTerm) {
      const s = searchTerm.toLowerCase();
      const product = products.find(p => p.product_id === t.product_id);
      const productName = product?.name.toLowerCase() || '';
      const pid = String(t.product_id || '').toLowerCase();
      const op = String(t.operator || '').toLowerCase();
      
      if (!productName.includes(s) && !pid.includes(s) && !op.includes(s)) {
        return false;
      }
    }

    // Location Filter
    if (filterLocation && t.location !== filterLocation) return false;

    return true;
  });

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
      <div className="glass-panel border-x-0 border-t-0 px-4 pt-6 pb-4 sticky top-0 z-20">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-main)]">進出貨紀錄</h1>
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2 rounded-xl transition-all ${showFilters ? 'bg-[var(--color-accent-blue)] text-[#0f172a]' : 'bg-white/5 text-[var(--color-text-dim)] hover:text-white'}`}
          >
            {showFilters ? <X className="w-5 h-5" /> : <Filter className="w-5 h-5" />}
          </button>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)]" />
            <input 
              type="text"
              placeholder="搜尋商品、PID 或人員..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)]"
            />
          </div>

          {showFilters && (
            <div className="space-y-3 pt-3 border-t border-white/5 animate-in fade-in slide-in-from-top-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[var(--color-text-dim)] uppercase px-1">開始日期</label>
                  <div className="relative">
                    <Calendar className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)] pointer-events-none" />
                    <input 
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)]"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[var(--color-text-dim)] uppercase px-1">結束日期</label>
                  <div className="relative">
                    <Calendar className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)] pointer-events-none" />
                    <input 
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)]"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[var(--color-text-dim)] uppercase px-1">類別</label>
                  <select 
                    value={filterType} 
                    onChange={e => setFilterType(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] appearance-none"
                  >
                    <option value="" className="bg-[#0f172a]">所有類型</option>
                    <option value="stock_in" className="bg-[#0f172a]">進貨</option>
                    <option value="stock_out" className="bg-[#0f172a]">出貨</option>
                    <option value="adjust" className="bg-[#0f172a]">盤點調整</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[var(--color-text-dim)] uppercase px-1">地點</label>
                  <select 
                    value={filterLocation} 
                    onChange={e => setFilterLocation(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] appearance-none"
                  >
                    <option value="" className="bg-[#0f172a]">所有地點</option>
                    {locations.map(loc => (
                      <option key={loc} value={loc} className="bg-[#0f172a]">{loc}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div className="flex justify-between items-center px-1 mb-1">
          <p className="text-xs text-[var(--color-text-dim)] font-medium">
            {transactions.length > 0 && transactions.length !== filteredTransactions.length ? (
              <span>共找到 {transactions.length} 筆總紀錄，目前篩選條件下顯示 <span className="text-[var(--color-accent-blue)] font-bold">{filteredTransactions.length}</span> 筆</span>
            ) : (
              <>系統共載入 <span className="text-[var(--color-accent-blue)] font-bold">{transactions.length}</span> 筆紀錄</>
            )}
          </p>
          {(filterType || searchTerm || filterLocation) && (
            <button 
              onClick={() => {
                setFilterType('');
                setSearchTerm('');
                setFilterLocation('');
                setStartDate(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
                setEndDate(format(new Date(), 'yyyy-MM-dd'));
              }}
              className="text-[10px] text-[var(--color-accent-blue)] font-bold flex items-center gap-1 hover:underline"
            >
              清除所有篩選
            </button>
          )}
        </div>
        {filteredTransactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-[var(--color-text-dim)] py-12">
            <RefreshCcw className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm font-medium">
              {transactions.length > 0 ? '目前的篩選條件下找不到紀錄' : '試算表中尚未有操作紀錄'}
            </p>
            {transactions.length === 0 && (
              <button 
                onClick={() => useStore.getState().fetchRemoteData()}
                className="mt-4 text-xs bg-white/5 px-4 py-2 rounded-lg border border-white/10 text-[var(--color-accent-blue)] font-bold active:scale-95 transition-all"
              >
                立即從試算表讀取
              </button>
            )}
          </div>
        ) : (
          filteredTransactions.map((t, idx) => (
            <div key={t.id || t.transaction_id || `tx-${idx}`} className="glass-panel border border-[var(--color-glass-border)] rounded-xl p-4 transition-all">
              <div className="flex items-start mb-2 gap-3">
                <div className="mt-1 w-10 h-10 shrink-0 rounded-xl bg-white/5 flex items-center justify-center">
                  {getIcon(t.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start gap-2">
                    <h3 className="font-bold text-[var(--color-text-main)] text-base break-words flex-1 min-w-0">{getProductName(t.product_id)}</h3>
                    <div className="text-right shrink-0">
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
