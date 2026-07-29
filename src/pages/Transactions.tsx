import { useState, useMemo, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { PackageOpen, ArrowDownToLine, ArrowUpFromLine, RefreshCcw, Calendar, Search, Filter, X, ChevronDown, ChevronUp, Eye, Edit, Trash2, ScanBarcode, ArrowLeft } from 'lucide-react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { useSearchParams, Link } from 'react-router-dom';
import QuantityInput from '../components/QuantityInput';

export default function Transactions() {
  const { transactions, products, vendors, transactionsPageState, setTransactionsPageState, deleteTransaction, editTransaction } = useStore();
  const [searchParams] = useSearchParams();
  const [filterType, setFilterType] = useState(transactionsPageState.filterType);
  const [searchTerm, setSearchTerm] = useState(transactionsPageState.searchTerm || searchParams.get('pid') || '');
  const [startDate, setStartDate] = useState(transactionsPageState.startDate !== undefined ? transactionsPageState.startDate : '');
  const [endDate, setEndDate] = useState(transactionsPageState.endDate !== undefined ? transactionsPageState.endDate : '');
  const [showFilters, setShowFilters] = useState(transactionsPageState.showFilters);
  const [filterLocation, setFilterLocation] = useState(transactionsPageState.filterLocation);
  const [filterVendor, setFilterVendor] = useState(transactionsPageState.filterVendor);
  const { fetchRemoteData, gasApiUrl, isLoading: storeIsLoading } = useStore();

  // Detail / Edit / Delete Modal States
  const [selectedTxForView, setSelectedTxForView] = useState<any | null>(null);
  const [selectedTxForEdit, setSelectedTxForEdit] = useState<any | null>(null);
  const [txToDelete, setTxToDelete] = useState<any | null>(null);

  // Edit form states
  const [editQty, setEditQty] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editFloor, setEditFloor] = useState('');
  const [editArea, setEditArea] = useState('');
  const [editSpec, setEditSpec] = useState('');
  const [editCost, setEditCost] = useState('');
  const [editVendor, setEditVendor] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editOperator, setEditOperator] = useState('');

  useEffect(() => {
    if (selectedTxForEdit) {
      setEditQty(selectedTxForEdit.quantity?.toString() || '');
      setEditLocation(selectedTxForEdit.location || '');
      setEditFloor(selectedTxForEdit.floor || '');
      setEditArea(selectedTxForEdit.area || '');
      setEditSpec(selectedTxForEdit.specification || '');
      setEditCost(selectedTxForEdit.cost_price?.toString() || '');
      setEditVendor(selectedTxForEdit.vendor_id || '');
      setEditDate(selectedTxForEdit.date || '');
      setEditNote(selectedTxForEdit.note || '');
      setEditOperator(selectedTxForEdit.operator || '');
    }
  }, [selectedTxForEdit]);

  useEffect(() => {
    const pid = searchParams.get('pid');
    if (pid) {
      setSearchTerm(pid);
    }
  }, [searchParams]);

  useEffect(() => {
    setTransactionsPageState({
      filterType,
      searchTerm,
      startDate,
      endDate,
      filterLocation,
      filterVendor,
      showFilters
    });
  }, [filterType, searchTerm, startDate, endDate, filterLocation, filterVendor, showFilters, setTransactionsPageState]);
  
  useEffect(() => {
    // Always consider fetching remote data on mount to ensure we have the latest from the sheet,
    // not just the optimistic local ones.
    if (gasApiUrl && !storeIsLoading) {
       fetchRemoteData();
    }
  }, [gasApiUrl]); // Fetch on mount or when API URL changes

  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 30;

  useEffect(() => {
    setCurrentPage(1);
  }, [filterType, searchTerm, startDate, endDate, filterLocation, filterVendor]);

  const productMap = useMemo(() => new Map(products.map(p => [p.product_id, p])), [products]);
  const vendorMap = useMemo(() => new Map(vendors.map(v => [v.vendor_id, v.vendor_name])), [vendors]);

  const locations = useMemo(() => Array.from(new Set(transactions.map(t => t.location).filter(Boolean))), [transactions]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      // Type Filter
      if (filterType && t.type !== filterType) return false;

      // Date Range Filter
      if (startDate && endDate) {
        try {
          if (!t.date) return true; // Default to showing records without date
          
          let dStr = String(t.date);
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
        }
      }

      // Search Filter (Product Name, ID, or Operator)
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        const product = productMap.get(t.product_id);
        const productName = product?.name.toLowerCase() || '';
        const pid = String(t.product_id || '').toLowerCase();
        const op = String(t.operator || '').toLowerCase();
        
        if (!productName.includes(s) && !pid.includes(s) && !op.includes(s)) {
          return false;
        }
      }

      // Location Filter
      if (filterLocation && t.location !== filterLocation) return false;

      // Vendor Filter
      if (filterVendor && t.vendor_id !== filterVendor) return false;

      return true;
    });
  }, [transactions, filterType, startDate, endDate, searchTerm, filterLocation, filterVendor, productMap]);

  const groupedTransactions = useMemo(() => {
    const result: (typeof filteredTransactions)[] = [];
    const txGroupMap = new Map<string, typeof filteredTransactions>();
    
    filteredTransactions.forEach(t => {
      if (t.type === 'stock_out') {
        let matchedGroup: typeof filteredTransactions | undefined;
        
        if (t.transaction_id) {
          matchedGroup = txGroupMap.get(`txid_${t.transaction_id}`);
        }

        if (!matchedGroup && t.operator && t.date) {
          const roundedTime = Math.floor(new Date(t.date).getTime() / 12000);
          matchedGroup = txGroupMap.get(`key_${t.operator}_${t.note || ''}_${roundedTime}`);
        }

        if (matchedGroup) {
          matchedGroup.push(t);
        } else {
          const newGroup = [t];
          result.push(newGroup);
          if (t.transaction_id) {
            txGroupMap.set(`txid_${t.transaction_id}`, newGroup);
          }
          if (t.operator && t.date) {
            const roundedTime = Math.floor(new Date(t.date).getTime() / 12000);
            txGroupMap.set(`key_${t.operator}_${t.note || ''}_${roundedTime}`, newGroup);
          }
        }
      } else {
        result.push([t]);
      }
    });
    return result;
  }, [filteredTransactions]);

  const totalPages = Math.ceil(groupedTransactions.length / PAGE_SIZE) || 1;
  const paginatedGroupedTransactions = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return groupedTransactions.slice(start, start + PAGE_SIZE);
  }, [groupedTransactions, currentPage]);

  const getProductName = (pid: string) => {
    const p = productMap.get(pid);
    return p ? p.name : pid;
  };

  const getProductCostPrice = (pid: string) => {
    const p = productMap.get(pid);
    return p ? p.cost_price : 0;
  };

  const getProductSpecification = (pid: string) => {
    const p = productMap.get(pid);
    return p ? p.specification : '';
  };

  const getVendorName = (vid?: string) => {
    if (!vid) return '';
    return vendorMap.get(vid) || vid;
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
          <div className="flex items-center gap-2.5">
            <Link 
              to="/manage" 
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition-all active:scale-95 flex items-center justify-center"
              title="返回管理頁面"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--color-text-main)]">進出貨紀錄</h1>
          </div>
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
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-10 py-2.5 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)]"
            />
            <Link to="/scan?returnTo=/transactions" className="absolute inset-y-0 right-0 pr-3 flex items-center">
              <ScanBarcode className="h-5 w-5 text-[var(--color-accent-blue)]" />
            </Link>
          </div>

          {showFilters && (
            <div className="space-y-3 pt-3 border-t border-white/5 animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center gap-1.5 pb-1 overflow-x-auto">
                <span className="text-[10px] text-slate-400 font-bold shrink-0">快選:</span>
                <button
                  type="button"
                  onClick={() => { setStartDate(''); setEndDate(''); }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border shrink-0 ${!startDate && !endDate ? 'bg-sky-500 text-slate-950 border-sky-400' : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'}`}
                >
                  全部時間
                </button>
                <button
                  type="button"
                  onClick={() => { setStartDate(format(subDays(new Date(), 7), 'yyyy-MM-dd')); setEndDate(format(new Date(), 'yyyy-MM-dd')); }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border shrink-0 ${startDate === format(subDays(new Date(), 7), 'yyyy-MM-dd') ? 'bg-sky-500 text-slate-950 border-sky-400' : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'}`}
                >
                  近 7 天
                </button>
                <button
                  type="button"
                  onClick={() => { setStartDate(format(subDays(new Date(), 30), 'yyyy-MM-dd')); setEndDate(format(new Date(), 'yyyy-MM-dd')); }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border shrink-0 ${startDate === format(subDays(new Date(), 30), 'yyyy-MM-dd') ? 'bg-sky-500 text-slate-950 border-sky-400' : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'}`}
                >
                  近 30 天
                </button>
              </div>

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

              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[var(--color-text-dim)] uppercase px-1">類別</label>
                  <select 
                    value={filterType} 
                    onChange={e => setFilterType(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-2 py-2 text-xs text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] appearance-none"
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
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-2 py-2 text-xs text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] appearance-none"
                  >
                    <option value="" className="bg-[#0f172a]">所有地點</option>
                    {locations.map(loc => (
                      <option key={loc} value={loc} className="bg-[#0f172a]">{loc}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[var(--color-text-dim)] uppercase px-1">供應商</label>
                  <select 
                    value={filterVendor} 
                    onChange={e => setFilterVendor(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-2 py-2 text-xs text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] appearance-none"
                  >
                    <option value="" className="bg-[#0f172a]">所有廠商</option>
                    {vendors.map(v => (
                      <option key={v.vendor_id} value={v.vendor_id} className="bg-[#0f172a]">{v.vendor_name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 md:grid md:grid-cols-2 xl:grid-cols-3 md:gap-4 md:space-y-0">
        <div className="flex justify-between items-center px-1 mb-1">
          <p className="text-xs text-[var(--color-text-dim)] font-medium">
            {transactions.length > 0 && transactions.length !== filteredTransactions.length ? (
              <span>共找到 {transactions.length} 筆總紀錄，目前篩選條件下顯示 <span className="text-[var(--color-accent-blue)] font-bold">{filteredTransactions.length}</span> 筆</span>
            ) : (
              <>系統共載入 <span className="text-[var(--color-accent-blue)] font-bold">{transactions.length}</span> 筆紀錄</>
            )}
          </p>
          {(filterType || searchTerm || filterLocation || filterVendor || startDate || endDate) && (
            <button 
              onClick={() => {
                setFilterType('');
                setSearchTerm('');
                setFilterLocation('');
                setFilterVendor('');
                setStartDate('');
                setEndDate('');
              }}
              className="text-[10px] text-sky-400 font-bold flex items-center gap-1 hover:underline"
            >
              清除所有篩選
            </button>
          )}
        </div>
        {filteredTransactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-[var(--color-text-dim)] py-12 md:col-span-2 xl:col-span-3">
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
          paginatedGroupedTransactions.map((group, idx) => {
            if (group.length === 1) {
              const t = group[0];
              return (
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
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="text-xs text-[var(--color-text-dim)] font-mono">PID: {t.product_id}</span>
                        {(t.specification || getProductSpecification(t.product_id)) && (
                          <span className="bg-white/5 px-1.5 py-0.5 rounded text-[10px] text-white/60">
                            規格: {t.specification || getProductSpecification(t.product_id)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-white/5 text-sm">
                    <div>
                      <p className="text-[10px] text-[var(--color-text-dim)] uppercase">異動數量</p>
                      <p className="font-bold text-[var(--color-accent-blue)]">{t.quantity}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--color-text-dim)] uppercase">進價</p>
                      <p className="font-bold text-[var(--color-accent-green)]">
                        ${t.cost_price || getProductCostPrice(t.product_id) || 0}
                      </p>
                    </div>
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
                    
                    <div className="col-span-2 flex justify-end gap-2 mt-2 pt-2 border-t border-white/5">
                      <button
                        onClick={() => setSelectedTxForView(t)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/5 text-[10px] font-bold text-[var(--color-text-dim)] hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
                      >
                        <Eye className="w-3 h-3" />
                        詳情
                      </button>
                      <button
                        onClick={() => setSelectedTxForEdit(t)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/5 text-[10px] font-bold text-[var(--color-text-dim)] hover:text-[var(--color-accent-blue)] hover:bg-[var(--color-accent-blue)]/5 active:scale-95 transition-all cursor-pointer"
                      >
                        <Edit className="w-3 h-3" />
                        編輯
                      </button>
                      <button
                        onClick={() => setTxToDelete(t)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/5 text-[10px] font-bold text-[var(--color-text-dim)] hover:text-red-400 hover:bg-red-500/5 active:scale-95 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                        刪除
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            // Batched Transaction Group
            const first = group[0];
            const totalQuantity = group.reduce((sum, item) => sum + item.quantity, 0);

            return (
              <div key={first.transaction_id || `tx-group-${idx}`} className="glass-panel border border-[var(--color-glass-border)] rounded-xl p-4 transition-all">
                <div className="flex items-start mb-2 gap-3">
                  <div className="mt-1 w-10 h-10 shrink-0 rounded-xl bg-white/5 flex items-center justify-center">
                    {getIcon('stock_out')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <h3 className="font-bold text-[var(--color-text-main)] text-base break-words flex-1 min-w-0">批次出貨</h3>
                      <div className="text-right shrink-0">
                        <span className="text-xs text-[var(--color-text-dim)] font-mono">
                          {first.date.includes('T') ? new Date(first.date).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(/\//g, '-') : first.date}
                        </span>
                        <p className="text-xs font-bold text-[var(--color-text-main)]">出貨</p>
                      </div>
                    </div>
                    <p className="text-xs text-[var(--color-text-dim)] font-mono mt-1">包含 {group.length} 項商品</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-white/5 text-sm">
                  <div>
                    <p className="text-[10px] text-[var(--color-text-dim)] uppercase">總數量</p>
                    <p className="font-bold text-[var(--color-accent-blue)]">{totalQuantity}</p>
                  </div>
                  <div className="col-span-2 flex flex-col gap-2 text-xs mt-2 bg-white/5 rounded-lg p-2">
                    {group.map((t, i) => {
                      const costVal = t.cost_price || getProductCostPrice(t.product_id) || 0;
                      return (
                        <div key={i} className="flex flex-col border-b border-white/5 pb-2 mb-2 last:border-0 last:mb-0 last:pb-0">
                          <div className="flex justify-between items-start">
                            <div className="min-w-0 flex-1">
                              <span className="block truncate mr-2 text-white/80 font-bold">{getProductName(t.product_id)}</span>
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-[10px] text-[var(--color-text-dim)]">
                                <span className="bg-white/5 px-1.5 py-0.5 rounded font-mono">
                                  PID: {t.product_id}
                                </span>
                                <span className="bg-white/5 px-1.5 py-0.5 rounded">
                                  進價: <span className="text-[var(--color-accent-green)] font-bold">${costVal}</span>
                                </span>
                                {t.specification && (
                                  <span className="bg-white/5 px-1.5 py-0.5 rounded max-w-[120px] truncate" title={t.specification}>
                                    規格: <span className="text-white/60">{t.specification}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className="text-[var(--color-accent-blue)] font-bold shrink-0 text-sm">x{t.quantity}</span>
                          </div>
                          <div className="flex justify-end gap-2 mt-2">
                            <button
                              onClick={() => setSelectedTxForView(t)}
                              className="p-1.5 rounded bg-white/5 text-[var(--color-text-dim)] hover:text-white transition-colors cursor-pointer"
                              title="詳情"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setSelectedTxForEdit(t)}
                              className="p-1.5 rounded bg-white/5 text-[var(--color-text-dim)] hover:text-[var(--color-accent-blue)] transition-colors cursor-pointer"
                              title="編輯"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setTxToDelete(t)}
                              className="p-1.5 rounded bg-white/5 text-[var(--color-text-dim)] hover:text-red-400 transition-colors cursor-pointer"
                              title="刪除"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <span className="bg-white/5 px-2 py-1 rounded text-[var(--color-text-dim)] text-xs border border-white/10 opacity-60">人員: {first.operator}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Footer */}
      {groupedTransactions.length > 0 && (
        <div className="glass-panel border-x-0 border-b-0 px-4 py-3 flex items-center justify-between text-xs text-[var(--color-text-dim)] shrink-0 sticky bottom-0 z-10 bg-[#0f172a]/90 backdrop-blur-md">
          <div className="font-mono">
            共 <span className="text-white font-bold">{groupedTransactions.length}</span> 組紀錄 ({filteredTransactions.length} 筆)
            {totalPages > 1 && ` (第 ${currentPage} / ${totalPages} 頁)`}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded-lg glass-panel hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent text-white font-medium transition-all"
              >
                上一頁
              </button>
              <span className="font-mono font-bold text-white px-1">
                {currentPage}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded-lg glass-panel hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent text-white font-medium transition-all"
              >
                下一頁
              </button>
            </div>
          )}
        </div>
      )}

      {/* 查看詳情 Modal */}
      {selectedTxForView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="glass-panel border border-white/10 rounded-2xl w-full max-w-sm p-5 max-h-[85vh] overflow-y-auto space-y-4 shadow-2xl relative">
            <div className="flex justify-between items-center pb-2 border-b border-white/10">
              <h2 className="text-sm font-bold text-[var(--color-text-main)] flex items-center gap-1.5">
                {getIcon(selectedTxForView.type)}
                紀錄詳細資訊
              </h2>
              <button 
                onClick={() => setSelectedTxForView(null)}
                className="p-1 px-[7px] rounded-lg bg-white/5 hover:bg-white/10 text-[var(--color-text-dim)] hover:text-white transition-all cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="grid grid-cols-3 gap-1 py-1 border-b border-white/5">
                <span className="text-[var(--color-text-dim)]">異動編號</span>
                <span className="col-span-2 font-mono text-white select-all">{selectedTxForView.transaction_id}</span>
              </div>
              <div className="grid grid-cols-3 gap-1 py-1 border-b border-white/5">
                <span className="text-[var(--color-text-dim)]">商品 PID</span>
                <span className="col-span-2 font-mono text-white select-all">{selectedTxForView.product_id}</span>
              </div>
              <div className="grid grid-cols-3 gap-1 py-1 border-b border-white/5">
                <span className="text-[var(--color-text-dim)]">商品名稱</span>
                <span className="col-span-2 text-white font-bold">{getProductName(selectedTxForView.product_id)}</span>
              </div>
              <div className="grid grid-cols-3 gap-1 py-1 border-b border-white/5">
                <span className="text-[var(--color-text-dim)]">異動類型</span>
                <span className="col-span-2 text-white">{getTypeLabel(selectedTxForView.type)}</span>
              </div>
              <div className="grid grid-cols-3 gap-1 py-1 border-b border-white/5">
                <span className="text-[var(--color-text-dim)]">異動數量</span>
                <span className="col-span-2 text-[var(--color-accent-blue)] font-bold">{selectedTxForView.quantity}</span>
              </div>
              {selectedTxForView.type === 'stock_in' && (
                <>
                  <div className="grid grid-cols-3 gap-1 py-1 border-b border-white/5">
                    <span className="text-[var(--color-text-dim)]">進價成本</span>
                    <span className="col-span-2 text-[var(--color-accent-green)] font-bold">${selectedTxForView.cost_price || 0}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 py-1 border-b border-white/5">
                    <span className="text-[var(--color-text-dim)]">供應商</span>
                    <span className="col-span-2 text-white">{getVendorName(selectedTxForView.vendor_id)}</span>
                  </div>
                </>
              )}
              <div className="grid grid-cols-3 gap-1 py-1 border-b border-white/5">
                <span className="text-[var(--color-text-dim)]">批次規格</span>
                <span className="col-span-2 text-white">{selectedTxForView.specification || '無'}</span>
              </div>
              <div className="grid grid-cols-3 gap-1 py-1 border-b border-white/5">
                <span className="text-[var(--color-text-dim)]">存儲位置</span>
                <span className="col-span-2 text-white">
                  {selectedTxForView.location} - {selectedTxForView.floor} - {selectedTxForView.area}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1 py-1 border-b border-white/5">
                <span className="text-[var(--color-text-dim)]">異動時間</span>
                <span className="col-span-2 text-white font-mono">{selectedTxForView.date}</span>
              </div>
              <div className="grid grid-cols-3 gap-1 py-1 border-b border-white/5">
                <span className="text-[var(--color-text-dim)]">經辦人員</span>
                <span className="col-span-2 text-white">{selectedTxForView.operator}</span>
              </div>
              {selectedTxForView.note && (
                <div className="pt-1.5">
                  <p className="text-[var(--color-text-dim)] mb-1">備註說明</p>
                  <p className="bg-white/5 p-2 rounded-lg text-white text-[11px] whitespace-pre-wrap leading-relaxed border border-white/5">{selectedTxForView.note}</p>
                </div>
              )}
            </div>

            <div className="pt-3 flex justify-end">
              <button
                onClick={() => setSelectedTxForView(null)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-[var(--color-text-main)] rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 編輯 Modal */}
      {selectedTxForEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <form 
            onSubmit={async (e) => {
              e.preventDefault();
              const fields: any = {
                quantity: Number(editQty),
                location: editLocation,
                floor: editFloor,
                area: editArea,
                specification: editSpec,
                date: editDate,
                note: editNote,
                operator: editOperator,
              };
              if (selectedTxForEdit.type === 'stock_in') {
                fields.cost_price = Number(editCost);
                fields.vendor_id = editVendor;
              }
              await editTransaction(selectedTxForEdit.transaction_id, fields);
              setSelectedTxForEdit(null);
            }}
            className="glass-panel border border-white/10 rounded-2xl w-full max-w-sm p-5 max-h-[85vh] overflow-y-auto space-y-3.5 shadow-2xl"
          >
            <div className="flex justify-between items-center pb-2 border-b border-white/10">
              <h2 className="text-sm font-bold text-[var(--color-text-main)]">
                編輯 {getTypeLabel(selectedTxForEdit.type)} 紀錄
              </h2>
              <button 
                type="button"
                onClick={() => setSelectedTxForEdit(null)}
                className="p-1 px-[7px] rounded-lg bg-white/5 hover:bg-white/10 text-[var(--color-text-dim)] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-[var(--color-text-main)]">
              <div>
                <label className="block text-[10px] font-bold text-[var(--color-text-dim)] uppercase mb-1">商品名稱 (唯讀)</label>
                <div className="p-2 bg-white/5 rounded-xl text-white/50 border border-white/5 font-bold">
                  {getProductName(selectedTxForEdit.product_id)}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-[var(--color-text-dim)] uppercase mb-0.5">異動數量</label>
                  <QuantityInput
                    min={1}
                    value={editQty}
                    onChange={(val) => setEditQty(val)}
                    className="!bg-[#1e293b]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[var(--color-text-dim)] uppercase mb-0.5">規格說明</label>
                  <input
                    type="text"
                    value={editSpec}
                    onChange={(e) => setEditSpec(e.target.value)}
                    className="w-full bg-[#1e293b] border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)]"
                  />
                </div>
              </div>

              {selectedTxForEdit.type === 'stock_in' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-[var(--color-text-dim)] uppercase mb-0.5">進價成本</label>
                    <input
                      type="number"
                      value={editCost}
                      onChange={(e) => setEditCost(e.target.value)}
                      className="w-full bg-[#1e293b] border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[var(--color-text-dim)] uppercase mb-0.5">供應商</label>
                    <select
                      value={editVendor}
                      onChange={(e) => setEditVendor(e.target.value)}
                      className="w-full bg-[#1e293b] border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)]"
                    >
                      <option value="">無</option>
                      {vendors.map(v => (
                        <option key={v.vendor_id} value={v.vendor_id}>{v.vendor_name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-1.5">
                <div>
                  <label className="block text-[10px] font-bold text-[var(--color-text-dim)] uppercase mb-0.5">地點</label>
                  <input
                    type="text"
                    required
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    className="w-full bg-[#1e293b] border border-white/10 rounded-xl px-2 py-1.5 text-xs text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[var(--color-text-dim)] uppercase mb-0.5">樓層</label>
                  <input
                    type="text"
                    required
                    value={editFloor}
                    onChange={(e) => setEditFloor(e.target.value)}
                    className="w-full bg-[#1e293b] border border-white/10 rounded-xl px-2 py-1.5 text-xs text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[var(--color-text-dim)] uppercase mb-0.5">區域</label>
                  <input
                    type="text"
                    required
                    value={editArea}
                    onChange={(e) => setEditArea(e.target.value)}
                    className="w-full bg-[#1e293b] border border-white/10 rounded-xl px-2 py-1.5 text-xs text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-[var(--color-text-dim)] uppercase mb-0.5">日期與時間</label>
                  <input
                    type="text"
                    required
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full bg-[#1e293b] border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[var(--color-text-dim)] uppercase mb-0.5">經辦人員</label>
                  <input
                    type="text"
                    required
                    value={editOperator}
                    onChange={(e) => setEditOperator(e.target.value)}
                    className="w-full bg-[#1e293b] border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[var(--color-text-dim)] uppercase mb-0.5">備註說明</label>
                <textarea
                  rows={2}
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  className="w-full bg-[#1e293b] border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] resize-none"
                />
              </div>
            </div>

            <div className="pt-3 flex justify-end gap-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setSelectedTxForEdit(null)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-[var(--color-accent-blue)] hover:bg-[var(--color-accent-blue)]/80 text-[#0f172a] rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                儲存更新
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 刪除確認 Modal */}
      {txToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="glass-panel border border-red-500/25 rounded-2xl w-full max-w-xs p-5 space-y-4 shadow-2xl">
            <h2 className="text-md font-bold text-red-400 flex items-center gap-1.5">🚨 刪除確認</h2>
            <div className="space-y-2 text-xs leading-relaxed text-white/85">
              <p>確定要刪除此筆 <strong>{getTypeLabel(txToDelete.type)}</strong> 紀錄嗎？</p>
              <div className="p-2.5 bg-red-950/20 border border-red-500/10 rounded-xl mt-1 space-y-1 text-red-200">
                <p><strong>商品：</strong>{getProductName(txToDelete.product_id)}</p>
                <p><strong>數量：</strong>{txToDelete.quantity}</p>
                <p><strong>位置：</strong>{txToDelete.location}-{txToDelete.floor}-{txToDelete.area}</p>
              </div>
              <p className="text-amber-400 font-bold mt-2 leading-snug">
                ⚠️ 注意：此操作將會自動還原或扣除對應的本地庫存，並自動覆蓋同步雲端試算表工作表。請認真核對！
              </p>
            </div>

            <div className="pt-1.5 flex justify-end gap-2">
              <button
                onClick={() => setTxToDelete(null)}
                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  await deleteTransaction(txToDelete.transaction_id);
                  setTxToDelete(null);
                }}
                className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                確定刪除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
