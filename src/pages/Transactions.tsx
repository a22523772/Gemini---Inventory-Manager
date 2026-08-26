import { useState, useMemo, useEffect } from 'react';
import { useStore, parseToDate, getTxTimestamp, normalizeDateToYMD, formatTxDate, formatAdjustQuantity } from '../store/useStore';
import { 
  PackageOpen, ArrowDownToLine, ArrowUpFromLine, RefreshCcw, Calendar, 
  Search, Filter, X, Eye, Edit, Trash2, 
  ScanBarcode, ArrowLeft, Download, Layers, TrendingUp, TrendingDown,
  List, CheckCircle2, Clock
} from 'lucide-react';
import { format, subDays, startOfMonth } from 'date-fns';
import { useSearchParams, Link } from 'react-router-dom';
import QuantityInput from '../components/QuantityInput';

export { parseToDate, getTxTimestamp, normalizeDateToYMD, formatTxDate };

export default function Transactions() {
  const { 
    transactions, products, vendors, transactionsPageState, 
    setTransactionsPageState, deleteTransaction, deleteTransactionGroup, 
    editTransaction, fetchRemoteData, gasApiUrl, isLoading: storeIsLoading 
  } = useStore();
  
  const [searchParams] = useSearchParams();
  const [filterType, setFilterType] = useState(transactionsPageState.filterType || '');
  const [filterPlatform, setFilterPlatform] = useState(transactionsPageState.filterPlatform || '');
  const [searchTerm, setSearchTerm] = useState(transactionsPageState.searchTerm || searchParams.get('pid') || '');
  const [startDate, setStartDate] = useState(transactionsPageState.startDate || '');
  const [endDate, setEndDate] = useState(transactionsPageState.endDate || '');
  const [showFilters, setShowFilters] = useState(transactionsPageState.showFilters || false);
  const [filterLocation, setFilterLocation] = useState(transactionsPageState.filterLocation || '');
  const [filterVendor, setFilterVendor] = useState(transactionsPageState.filterVendor || '');
  const [viewMode, setViewMode] = useState<'detailed' | 'grouped_by_order'>(
    (transactionsPageState as any).viewMode || 'detailed'
  );

  // Detail / Edit / Delete Modal States
  const [selectedTxForView, setSelectedTxForView] = useState<any | null>(null);
  const [selectedTxForEdit, setSelectedTxForEdit] = useState<any | null>(null);
  const [txToDelete, setTxToDelete] = useState<any | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<{ groupId: string; group: any[] } | null>(null);

  // Edit form states
  const [editQty, setEditQty] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editFloor, setEditFloor] = useState('');
  const [editArea, setEditArea] = useState('');
  const [editSpec, setEditSpec] = useState('');
  const [editCost, setEditCost] = useState('');
  const [editPrice, setEditPrice] = useState('');
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
      setEditCost(selectedTxForEdit.cost_price !== undefined && selectedTxForEdit.cost_price !== null ? selectedTxForEdit.cost_price.toString() : '');
      setEditPrice(selectedTxForEdit.price !== undefined && selectedTxForEdit.price !== null ? selectedTxForEdit.price.toString() : '');
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
      filterPlatform,
      searchTerm,
      startDate,
      endDate,
      filterLocation,
      filterVendor,
      showFilters,
      viewMode
    });
  }, [filterType, filterPlatform, searchTerm, startDate, endDate, filterLocation, filterVendor, showFilters, viewMode, setTransactionsPageState]);
  
  useEffect(() => {
    if (gasApiUrl && !storeIsLoading) {
      fetchRemoteData();
    }
  }, [gasApiUrl]);

  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 30;

  useEffect(() => {
    setCurrentPage(1);
  }, [filterType, filterPlatform, searchTerm, startDate, endDate, filterLocation, filterVendor, viewMode]);

  const productMap = useMemo(() => new Map(products.map(p => [p.product_id, p])), [products]);
  const vendorMap = useMemo(() => new Map(vendors.map(v => [v.vendor_id, v.vendor_name])), [vendors]);

  const locations = useMemo(() => Array.from(new Set(transactions.map(t => t.location).filter(Boolean))), [transactions]);

  const platforms = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach(t => {
      if (t.platform && String(t.platform).trim()) {
        set.add(String(t.platform).trim());
      } else if (t.type && t.type.startsWith('stock_out ') && t.type !== 'stock_out') {
        set.add(t.type.replace(/^stock_out\s*/, '').trim());
      } else if (t.note) {
        const match = t.note.match(/平台:\s*([^\s|]+)/);
        if (match) set.add(match[1].trim());
      }
    });
    return Array.from(set).filter(Boolean);
  }, [transactions]);

  const customTypes = useMemo(() => {
    const set = new Set(transactions.map(t => t.type).filter(Boolean));
    return Array.from(set).filter(t => t !== 'stock_in' && t !== 'stock_out' && t !== 'adjust');
  }, [transactions]);

  const getTxPlatform = (t: any) => {
    if (t.platform && String(t.platform).trim()) {
      return String(t.platform).trim();
    }
    if (t.type && t.type.startsWith('stock_out ')) {
      return t.type.replace(/^stock_out\s*/, '');
    }
    if (t.type && t.type !== 'stock_in' && t.type !== 'stock_out' && t.type !== 'adjust') {
      return t.type;
    }
    if (t.note) {
      const match = t.note.match(/平台:\s*([^\s|]+)/);
      if (match) return match[1];
    }
    return '';
  };

  const getTypeLabel = (type: string) => {
    if (type === 'stock_in') return '進貨';
    if (type === 'stock_out') return '一般出貨';
    if (type === 'adjust') return '盤點調整';
    if (type && type.startsWith('stock_out ')) {
      return `${type.replace(/^stock_out\s*/, '')}出貨`;
    }
    return type;
  };

  const getTxProductName = (t: any) => {
    if (t.product_name && String(t.product_name).trim()) return String(t.product_name).trim();
    const p = productMap.get(t.product_id);
    if (p && p.name) return p.name;
    return t.product_id ? t.product_id : '非系統商品/未命名';
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

  const isForcedTx = (t: any) => {
    if (t.note && (t.note.includes('強行出貨') || t.note.includes('[強行出貨]'))) return true;
    if (!t.product_id) return true;
    if (products.length > 0 && !products.some(p => p.product_id === t.product_id)) return true;
    return false;
  };

  // Filter Transactions with 100% strict date-range and multi-attribute safety
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      // Type Filter
      if (filterType && t.type !== filterType) return false;

      // Platform Filter
      if (filterPlatform) {
        const p = getTxPlatform(t);
        if (!p || p.toLowerCase() !== filterPlatform.toLowerCase()) return false;
      }

      // Strict Date Range Filter (YYYY-MM-DD comparison)
      if (startDate || endDate) {
        const txYMD = normalizeDateToYMD(t.date);
        // Exclude records that have no valid date format when a date filter is active
        if (!txYMD) return false;

        if (startDate && txYMD < startDate) return false;
        if (endDate && txYMD > endDate) return false;
      }

      // Universal Multi-Field Search
      if (searchTerm) {
        const s = searchTerm.toLowerCase().trim();
        const product = productMap.get(t.product_id);
        const productName = (t.product_name || product?.name || '').toLowerCase();
        const onlineOrderId = String(t.online_order_id || '').toLowerCase();
        const platformStr = getTxPlatform(t).toLowerCase();
        const typeStr = (getTypeLabel(t.type) + ' ' + String(t.type || '')).toLowerCase();
        const pid = String(t.product_id || '').toLowerCase();
        const op = String(t.operator || '').toLowerCase();
        const note = String(t.note || '').toLowerCase();
        const txid = String(t.transaction_id || '').toLowerCase();
        const batchId = String(t.batch_id || t.batch_tx_id || '').toLowerCase();
        const spec = String(t.specification || product?.specification || '').toLowerCase();
        const loc = `${t.location || ''} ${t.floor || ''} ${t.area || ''}`.toLowerCase();
        const vendor = (vendorMap.get(t.vendor_id) || t.vendor_id || '').toLowerCase();

        const matched = productName.includes(s) ||
          pid.includes(s) ||
          onlineOrderId.includes(s) ||
          platformStr.includes(s) ||
          typeStr.includes(s) ||
          op.includes(s) ||
          note.includes(s) ||
          txid.includes(s) ||
          batchId.includes(s) ||
          spec.includes(s) ||
          loc.includes(s) ||
          vendor.includes(s);

        if (!matched) return false;
      }

      // Location Filter
      if (filterLocation && t.location !== filterLocation) return false;

      // Vendor Filter
      if (filterVendor && t.vendor_id !== filterVendor) return false;

      return true;
    }).sort((a, b) => getTxTimestamp(b.date) - getTxTimestamp(a.date));
  }, [transactions, filterType, filterPlatform, startDate, endDate, searchTerm, filterLocation, filterVendor, productMap, vendorMap]);

  // Helper to extract grouping key for order/batch bundling
  const getTxGroupKey = (t: any): string => {
    // 1. Explicit online_order_id
    if (t.online_order_id && String(t.online_order_id).trim()) {
      return `ORDER_${String(t.online_order_id).trim()}`;
    }
    // 2. Explicit batch_id or batch_tx_id
    if (t.batch_id && String(t.batch_id).trim()) {
      return `BATCH_${String(t.batch_id).trim()}`;
    }
    if (t.batch_tx_id && String(t.batch_tx_id).trim()) {
      return `BATCH_${String(t.batch_tx_id).trim()}`;
    }
    // 3. Structured Note Matching (order number / batch number)
    if (t.note) {
      const noteStr = String(t.note);
      const orderMatch = noteStr.match(/訂單(?:號|編號)?\s*[:：]\s*([^\s|]+)/) || 
                         noteStr.match(/\[(?:訂單|網路訂單)\s*[:：]?\s*([^\]]+)\]/);
      if (orderMatch && orderMatch[1].trim()) {
        return `ORDER_${orderMatch[1].trim()}`;
      }
      const batchMatch = noteStr.match(/\[(?:批次出貨|批次)\s*[:：]?\s*([^\]]+)\]/) || 
                         noteStr.match(/批次(?:號|編號)?\s*[:：]\s*([^\s|]+)/);
      if (batchMatch && batchMatch[1].trim()) {
        return `BATCH_${batchMatch[1].trim()}`;
      }
    }
    // 4. Transaction ID Prefix or Exact Matching
    const txid = String(t.transaction_id || '').trim();
    if (txid) {
      if (txid.startsWith('TX_ORD_')) {
        const match = txid.match(/^TX_ORD_([^_]+)/);
        if (match) return `ORDER_${match[1]}`;
      }
      if (txid.startsWith('TX_BATCH_')) {
        const match = txid.match(/^TX_BATCH_([^_]+)/);
        if (match) return `BATCH_${match[1]}`;
      }
      // If transaction_id contains timestamp root like TX_1787543146515 or TX_1787543146515_0
      const tsMatch = txid.match(/^(TX_\d{10,})/);
      if (tsMatch) {
        return `TXID_${tsMatch[1]}`;
      }
      // If transaction_id is in format TX_xxx_yyy or TX_xxx-yyy
      const baseMatch = txid.match(/^([A-Za-z0-9_-]+?)[_\-#](?:\d+|[a-z0-9]{2,8})$/i);
      if (baseMatch) {
        return `TXID_${baseMatch[1]}`;
      }
      // Direct transaction_id
      return `TXID_${txid}`;
    }

    return '';
  };

  // Robust Presentation Grouping (Zero-guesswork, NO fuzzy accidental merging)
  const groupedTransactions = useMemo(() => {
    if (viewMode === 'detailed') {
      // Detailed View: Every single transaction is strictly an independent record!
      return filteredTransactions.map(t => [t]);
    }

    // Grouped by Online Order / Batch View: Combine items that share order ID, batch ID, or transaction ID
    const result: (typeof filteredTransactions)[] = [];
    const groupMap = new Map<string, typeof filteredTransactions>();

    filteredTransactions.forEach(t => {
      const groupKey = getTxGroupKey(t);

      if (groupKey) {
        const existing = groupMap.get(groupKey);
        if (existing) {
          existing.push(t);
        } else {
          const newGroup = [t];
          groupMap.set(groupKey, newGroup);
          result.push(newGroup);
        }
      } else {
        // Individual records without any group identifier are kept independent!
        result.push([t]);
      }
    });

    return result;
  }, [filteredTransactions, viewMode]);

  // Statistics Summary
  const summaryStats = useMemo(() => {
    let totalInQty = 0;
    let totalOutQty = 0;
    let totalInCost = 0;
    let totalOutAmount = 0;

    filteredTransactions.forEach(t => {
      const qty = Number(t.quantity) || 0;
      if (t.type === 'stock_in') {
        totalInQty += qty;
        totalInCost += (Number(t.cost_price) || getProductCostPrice(t.product_id) || 0) * qty;
      } else if (t.type === 'stock_out' || t.type.startsWith('stock_out')) {
        totalOutQty += qty;
        const val = Number(t.price) || Number(t.cost_price) || getProductCostPrice(t.product_id) || 0;
        totalOutAmount += val * qty;
      }
    });

    return { totalInQty, totalOutQty, totalInCost, totalOutAmount };
  }, [filteredTransactions, productMap]);

  const totalPages = Math.ceil(groupedTransactions.length / PAGE_SIZE) || 1;
  const paginatedGroupedTransactions = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return groupedTransactions.slice(start, start + PAGE_SIZE);
  }, [groupedTransactions, currentPage]);

  const getIcon = (type: string) => {
    switch (type) {
      case 'stock_in': return <ArrowDownToLine className="w-5 h-5 text-[var(--color-accent-blue)]" />;
      case 'stock_out': return <ArrowUpFromLine className="w-5 h-5 text-[#f87171]" />;
      case 'adjust': return <RefreshCcw className="w-5 h-5 text-[var(--color-accent-orange)]" />;
      default: return <ArrowUpFromLine className="w-5 h-5 text-sky-400" />;
    }
  };

  // Export to Excel / CSV
  const handleExportCSV = () => {
    if (filteredTransactions.length === 0) {
      useStore.getState().showToast('⚠️ 目前篩選條件下無任何紀錄可供匯出');
      return;
    }

    const headers = [
      '異動編號',
      '網路訂單編號',
      '出貨平台',
      '異動類型',
      '商品編號(PID)',
      '商品名稱',
      '規格說明',
      '異動數量',
      '進價/成本',
      '售價/金額',
      '供應商',
      '存儲位置(地點-樓層-區域)',
      '異動時間',
      '經辦人員',
      '強行出貨註記',
      '備註說明'
    ];

    const rows = filteredTransactions.map(t => {
      const pName = getTxProductName(t);
      const loc = `${t.location || ''}-${t.floor || ''}-${t.area || ''}`.replace(/^-|-$/g, '');
      const vendorName = getVendorName(t.vendor_id);
      const cost = t.cost_price || getProductCostPrice(t.product_id) || 0;
      const price = t.price || 0;
      const plat = getTxPlatform(t);
      const typeLbl = getTypeLabel(t.type);
      const forced = isForcedTx(t) ? '是' : '否';

      const formattedQty = t.type === 'adjust' 
        ? formatAdjustQuantity(t).display 
        : t.type === 'stock_in' 
          ? `+${t.quantity}` 
          : `-${t.quantity}`;

      return [
        `"${String(t.transaction_id || '').replace(/"/g, '""')}"`,
        `"${String(t.online_order_id || '').replace(/"/g, '""')}"`,
        `"${String(plat || '').replace(/"/g, '""')}"`,
        `"${String(typeLbl || '').replace(/"/g, '""')}"`,
        `"${String(t.product_id || '').replace(/"/g, '""')}"`,
        `"${String(pName || '').replace(/"/g, '""')}"`,
        `"${String(t.specification || '').replace(/"/g, '""')}"`,
        `"${formattedQty}"`,
        cost,
        price,
        `"${String(vendorName || '').replace(/"/g, '""')}"`,
        `"${String(loc || '').replace(/"/g, '""')}"`,
        `"${String(formatTxDate(t.date)).replace(/"/g, '""')}"`,
        `"${String(t.operator || '').replace(/"/g, '""')}"`,
        `"${forced}"`,
        `"${String(t.note || '').replace(/"/g, '""')}"`
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `進出貨紀錄_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    useStore.getState().showToast(`✅ 已成功匯出 ${filteredTransactions.length} 筆進出貨紀錄！`);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Top Header */}
      <div className="glass-panel border-x-0 border-t-0 px-4 pt-6 pb-4 sticky top-0 z-20 shadow-md">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <Link 
              to="/manage" 
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition-all active:scale-95 flex items-center justify-center"
              title="返回庫存管理"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-[var(--color-text-main)] flex items-center gap-2">
                進出貨紀錄
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
                  {filteredTransactions.length} 筆
                </span>
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="bg-slate-900/80 border border-white/10 rounded-xl p-0.5 flex items-center shadow-inner">
              <button
                onClick={() => setViewMode('detailed')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'detailed'
                    ? 'bg-sky-500 text-slate-950 shadow-md font-black'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="每一筆進出貨獨立顯示（絕不合併）"
              >
                <List className="w-3.5 h-3.5" />
                <span>逐筆明細</span>
              </button>
              <button
                onClick={() => setViewMode('grouped_by_order')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'grouped_by_order'
                    ? 'bg-purple-500 text-white shadow-md font-black'
                    : 'text-slate-400 hover:text-white'
                }`}
                title="僅將相同網路訂單號之品項整合展示"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>依訂單分組</span>
              </button>
            </div>

            <button
              onClick={handleExportCSV}
              className="px-3 py-2 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer shadow-sm"
              title="匯出篩選結果為 Excel CSV"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">匯出 CSV</span>
            </button>

            <button 
              onClick={() => setShowFilters(!showFilters)}
              className={`p-2 rounded-xl transition-all flex items-center gap-1.5 text-xs font-bold cursor-pointer ${
                showFilters ? 'bg-[var(--color-accent-blue)] text-[#0f172a]' : 'bg-white/5 text-[var(--color-text-dim)] hover:text-white border border-white/10'
              }`}
            >
              {showFilters ? <X className="w-4 h-4" /> : <Filter className="w-4 h-4" />}
              <span className="hidden sm:inline">{showFilters ? '收合篩選' : '篩選器'}</span>
            </button>
          </div>
        </div>

        {/* Universal Search Bar */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-dim)]" />
            <input 
              type="text"
              placeholder="搜尋商品名稱、PID、訂單號、平台、規格、人員、地點或備註..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-10 py-2.5 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] transition-all shadow-inner"
            />
            {searchTerm ? (
              <button 
                onClick={() => setSearchTerm('')} 
                className="absolute inset-y-0 right-10 pr-1 flex items-center text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            ) : null}
            <Link to="/scan?returnTo=/transactions" className="absolute inset-y-0 right-0 pr-3 flex items-center" title="條碼掃描查找">
              <ScanBarcode className="h-5 w-5 text-[var(--color-accent-blue)] hover:scale-110 transition-transform" />
            </Link>
          </div>

          {/* Active Date Tag Indicator if applied */}
          {(startDate || endDate) && (
            <div className="flex items-center gap-2 bg-sky-950/40 border border-sky-500/30 rounded-xl px-3 py-1.5 text-xs text-sky-200">
              <Calendar className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="font-bold">日期區間:</span>
              <span className="font-mono text-sky-300">
                {startDate || '不限'} ~ {endDate || '不限'}
              </span>
              <button
                onClick={() => { setStartDate(''); setEndDate(''); }}
                className="ml-auto p-1 text-slate-400 hover:text-white rounded hover:bg-white/10 cursor-pointer flex items-center gap-1 text-[11px]"
                title="清除日期範圍"
              >
                <X className="w-3 h-3" />
                <span>清除日期限制</span>
              </button>
            </div>
          )}

          {/* Quick Stats Summary Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
            <div className="bg-slate-900/60 border border-white/5 rounded-xl p-2 sm:p-2.5 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">總進貨量</span>
                <span className="text-sm sm:text-base font-black text-sky-400 font-mono">+{summaryStats.totalInQty} <span className="text-[10px] font-normal text-slate-400">件</span></span>
              </div>
              <ArrowDownToLine className="w-4 h-4 text-sky-400/60 shrink-0" />
            </div>

            <div className="bg-slate-900/60 border border-white/5 rounded-xl p-2 sm:p-2.5 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">總出貨量</span>
                <span className="text-sm sm:text-base font-black text-rose-400 font-mono">-{summaryStats.totalOutQty} <span className="text-[10px] font-normal text-slate-400">件</span></span>
              </div>
              <ArrowUpFromLine className="w-4 h-4 text-rose-400/60 shrink-0" />
            </div>

            <div className="bg-slate-900/60 border border-white/5 rounded-xl p-2 sm:p-2.5 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">進貨總成本</span>
                <span className="text-sm sm:text-base font-black text-emerald-400 font-mono">${summaryStats.totalInCost.toLocaleString()}</span>
              </div>
              <TrendingUp className="w-4 h-4 text-emerald-400/60 shrink-0" />
            </div>

            <div className="bg-slate-900/60 border border-white/5 rounded-xl p-2 sm:p-2.5 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">出貨總金額</span>
                <span className="text-sm sm:text-base font-black text-purple-400 font-mono">${summaryStats.totalOutAmount.toLocaleString()}</span>
              </div>
              <TrendingDown className="w-4 h-4 text-purple-400/60 shrink-0" />
            </div>
          </div>

          {/* Expanded Filter Panel */}
          {showFilters && (
            <div className="space-y-3 pt-3 border-t border-white/10 animate-in fade-in slide-in-from-top-2">
              {/* Date Quick Filters */}
              <div className="flex items-center gap-1.5 pb-1 overflow-x-auto">
                <span className="text-[10px] text-slate-400 font-bold shrink-0">日期快選:</span>
                <button
                  type="button"
                  onClick={() => { setStartDate(''); setEndDate(''); }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border shrink-0 cursor-pointer ${
                    !startDate && !endDate ? 'bg-sky-500 text-slate-950 border-sky-400 font-black' : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                  }`}
                >
                  全部時間
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const todayStr = format(new Date(), 'yyyy-MM-dd');
                    setStartDate(todayStr);
                    setEndDate(todayStr);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border shrink-0 cursor-pointer ${
                    startDate === format(new Date(), 'yyyy-MM-dd') && endDate === format(new Date(), 'yyyy-MM-dd') 
                      ? 'bg-sky-500 text-slate-950 border-sky-400 font-black' 
                      : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                  }`}
                >
                  今日
                </button>
                <button
                  type="button"
                  onClick={() => { 
                    setStartDate(format(subDays(new Date(), 7), 'yyyy-MM-dd')); 
                    setEndDate(format(new Date(), 'yyyy-MM-dd')); 
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border shrink-0 cursor-pointer ${
                    startDate === format(subDays(new Date(), 7), 'yyyy-MM-dd') ? 'bg-sky-500 text-slate-950 border-sky-400 font-black' : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                  }`}
                >
                  近 7 天
                </button>
                <button
                  type="button"
                  onClick={() => { 
                    setStartDate(format(subDays(new Date(), 30), 'yyyy-MM-dd')); 
                    setEndDate(format(new Date(), 'yyyy-MM-dd')); 
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border shrink-0 cursor-pointer ${
                    startDate === format(subDays(new Date(), 30), 'yyyy-MM-dd') ? 'bg-sky-500 text-slate-950 border-sky-400 font-black' : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                  }`}
                >
                  近 30 天
                </button>
                <button
                  type="button"
                  onClick={() => { 
                    setStartDate(format(startOfMonth(new Date()), 'yyyy-MM-dd')); 
                    setEndDate(format(new Date(), 'yyyy-MM-dd')); 
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border shrink-0 cursor-pointer ${
                    startDate === format(startOfMonth(new Date()), 'yyyy-MM-dd') ? 'bg-sky-500 text-slate-950 border-sky-400 font-black' : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                  }`}
                >
                  本月
                </button>
              </div>

              {/* Exact Date Inputs */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[var(--color-text-dim)] uppercase px-1">開始日期 (含)</label>
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
                  <label className="text-[10px] font-bold text-[var(--color-text-dim)] uppercase px-1">結束日期 (含)</label>
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

              {/* Multi-category Dropdowns */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[var(--color-text-dim)] uppercase px-1">類型</label>
                  <select 
                    value={filterType} 
                    onChange={e => setFilterType(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-2 py-2 text-xs text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)]"
                  >
                    <option value="" className="bg-[#0f172a]">所有類型</option>
                    <option value="stock_in" className="bg-[#0f172a]">進貨</option>
                    <option value="stock_out" className="bg-[#0f172a]">一般出貨</option>
                    <option value="adjust" className="bg-[#0f172a]">盤點調整</option>
                    {customTypes.map(ct => (
                      <option key={ct} value={ct} className="bg-[#0f172a]">{ct}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[var(--color-text-dim)] uppercase px-1">出貨平台</label>
                  <select 
                    value={filterPlatform} 
                    onChange={e => setFilterPlatform(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-2 py-2 text-xs text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)]"
                  >
                    <option value="" className="bg-[#0f172a]">所有平台</option>
                    {platforms.map(plat => (
                      <option key={plat} value={plat} className="bg-[#0f172a]">{plat}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-[var(--color-text-dim)] uppercase px-1">地點</label>
                  <select 
                    value={filterLocation} 
                    onChange={e => setFilterLocation(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-2 py-2 text-xs text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)]"
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
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-2 py-2 text-xs text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)]"
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

      {/* Main List Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 md:grid md:grid-cols-2 xl:grid-cols-3 md:gap-4 md:space-y-0">
        <div className="flex flex-wrap justify-between items-center gap-2 px-1 mb-1 md:col-span-2 xl:col-span-3">
          <p className="text-xs text-[var(--color-text-dim)] font-medium">
            {transactions.length > 0 && transactions.length !== filteredTransactions.length ? (
              <span>共找到 {transactions.length} 筆總紀錄，目前篩選條件下顯示 <span className="text-[var(--color-accent-blue)] font-bold">{filteredTransactions.length}</span> 筆</span>
            ) : (
              <>系統共載入 <span className="text-[var(--color-accent-blue)] font-bold">{transactions.length}</span> 筆紀錄</>
            )}
          </p>
          {(filterType || filterPlatform || searchTerm || filterLocation || filterVendor || startDate || endDate) && (
            <button 
              onClick={() => {
                setFilterType('');
                setFilterPlatform('');
                setSearchTerm('');
                setFilterLocation('');
                setFilterVendor('');
                setStartDate('');
                setEndDate('');
              }}
              className="text-xs text-sky-400 font-bold flex items-center gap-1 hover:underline cursor-pointer bg-sky-500/10 px-2.5 py-1 rounded-lg border border-sky-500/20"
            >
              <X className="w-3.5 h-3.5" />
              清除所有篩選
            </button>
          )}
        </div>

        {filteredTransactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-[var(--color-text-dim)] py-16 md:col-span-2 xl:col-span-3 glass-panel rounded-2xl border border-white/5">
            <RefreshCcw className="w-12 h-12 mb-3 opacity-40 text-sky-400" />
            <p className="text-sm font-bold text-white/80">
              {transactions.length > 0 ? '目前的篩選條件下找不到相符的紀錄' : '尚無進出貨操作紀錄'}
            </p>
            <p className="text-xs text-slate-500 mt-1">您可以調整上方日期、類型或關鍵字篩選條件。</p>
            {transactions.length === 0 && (
              <button 
                onClick={() => useStore.getState().fetchRemoteData()}
                className="mt-4 text-xs bg-sky-500/20 hover:bg-sky-500/30 px-4 py-2 rounded-xl border border-sky-500/40 text-sky-300 font-bold active:scale-95 transition-all cursor-pointer"
              >
                立即從雲端試算表讀取
              </button>
            )}
          </div>
        ) : (
          paginatedGroupedTransactions.map((group, idx) => {
            if (group.length === 1) {
              const t = group[0];
              return (
                <div key={t.id || t.transaction_id || `tx-${idx}`} className="glass-panel border border-[var(--color-glass-border)] rounded-2xl p-4 transition-all hover:border-white/20 shadow-md">
                  <div className="flex items-start mb-2 gap-3">
                    <div className="mt-1 w-10 h-10 shrink-0 rounded-xl bg-white/5 flex items-center justify-center shadow-inner">
                      {getIcon(t.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start gap-2">
                        <h3 className="font-bold text-[var(--color-text-main)] text-base break-words flex-1 min-w-0 leading-tight">
                          {getTxProductName(t)}
                        </h3>
                        <div className="text-right shrink-0">
                          <span className="text-[11px] text-[var(--color-text-dim)] font-mono block">
                            {formatTxDate(t.date)}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-0.5 ${
                            t.type === 'stock_in' ? 'bg-sky-500/20 text-sky-300' : t.type === 'adjust' ? 'bg-amber-500/20 text-amber-300' : 'bg-rose-500/20 text-rose-300'
                          }`}>
                            {getTypeLabel(t.type)}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        {isForcedTx(t) && (
                          <span className="bg-red-500/20 text-red-300 border border-red-500/40 px-1.5 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
                            ⚡ 強行出貨
                          </span>
                        )}
                        {getTxPlatform(t) && (
                          <span className="bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded text-[10px] font-bold">
                            平台: {getTxPlatform(t)}
                          </span>
                        )}
                        {t.online_order_id && (
                          <span 
                            onClick={() => setSearchTerm(t.online_order_id)}
                            className="bg-sky-500/15 text-sky-300 border border-sky-500/30 px-1.5 py-0.5 rounded text-[10px] font-bold font-mono hover:bg-sky-500/30 cursor-pointer transition-colors"
                            title="點擊篩選此訂單的所有品項"
                          >
                            訂單: #{t.online_order_id}
                          </span>
                        )}
                        <span className="text-[11px] text-[var(--color-text-dim)] font-mono bg-white/5 px-1.5 py-0.5 rounded">
                          PID: {t.product_id || '(非系統商品)'}
                        </span>
                        {(t.specification || getProductSpecification(t.product_id)) && (
                          <span className="bg-white/5 px-1.5 py-0.5 rounded text-[10px] text-white/70">
                            規格: {t.specification || getProductSpecification(t.product_id)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-white/5 text-sm">
                    <div>
                      <p className="text-[10px] text-[var(--color-text-dim)] uppercase font-bold">異動數量</p>
                      {t.type === 'adjust' ? (
                        <div className="flex items-center gap-1">
                          <p className="font-mono font-black text-base text-amber-400">
                            {formatAdjustQuantity(t).display}
                          </p>
                          <span className="text-[10px] text-amber-300/80 bg-amber-500/10 px-1 rounded border border-amber-500/20 font-sans font-normal">
                            (變化量=最終)
                          </span>
                        </div>
                      ) : (
                        <p className={`font-mono font-black text-base ${t.type === 'stock_in' ? 'text-sky-400' : 'text-rose-400'}`}>
                          {t.type === 'stock_in' ? `+${t.quantity}` : `-${t.quantity}`}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] text-[var(--color-text-dim)] uppercase font-bold">
                        {t.online_order_id || t.type.startsWith('stock_out') ? '售價 / 金額' : '進價成本'}
                      </p>
                      <p className="font-mono font-black text-base text-[var(--color-accent-green)]">
                        ${t.price || t.cost_price || getProductCostPrice(t.product_id) || 0}
                      </p>
                    </div>
                    {t.type === 'stock_in' && t.vendor_id && (
                      <div className="col-span-2">
                        <p className="text-[10px] text-[var(--color-text-dim)] uppercase font-bold">供應商</p>
                        <p className="font-medium text-[var(--color-text-main)] text-xs">{getVendorName(t.vendor_id)}</p>
                      </div>
                    )}
                    {t.note && (
                      <div className="col-span-2">
                        <p className="text-[10px] text-[var(--color-text-dim)] uppercase font-bold">備註</p>
                        <p className="font-medium text-[var(--color-text-main)] text-xs bg-white/5 p-2 rounded-xl mt-0.5 border border-white/5 whitespace-pre-wrap">{t.note}</p>
                      </div>
                    )}
                    <div className="col-span-2 flex flex-wrap items-center gap-1.5 text-xs pt-1">
                      <span className="bg-white/5 px-2 py-0.5 rounded-lg text-[var(--color-text-dim)]">{t.location || '倉庫'}</span>
                      <span className="bg-white/5 px-2 py-0.5 rounded-lg text-[var(--color-text-dim)]">{t.floor || '1F'}</span>
                      <span className="bg-white/5 px-2 py-0.5 rounded-lg text-[var(--color-text-dim)]">{t.area || 'A區'}</span>
                      <span className="bg-white/5 px-2 py-0.5 rounded-lg text-[var(--color-text-dim)] ml-auto border border-white/10 opacity-70">
                        經辦: {t.operator || 'staff'}
                      </span>
                    </div>
                    
                    <div className="col-span-2 flex justify-end gap-2 mt-2 pt-2 border-t border-white/5">
                      <button
                        onClick={() => setSelectedTxForView(t)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-[var(--color-text-dim)] hover:text-white hover:bg-white/10 active:scale-95 transition-all cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        詳情
                      </button>
                      <button
                        onClick={() => setSelectedTxForEdit(t)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-xs font-bold text-sky-300 hover:bg-sky-500/20 active:scale-95 transition-all cursor-pointer"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        編輯
                      </button>
                      <button
                        onClick={() => setTxToDelete(t)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs font-bold text-rose-400 hover:bg-rose-500/20 active:scale-95 transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        刪除
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            // Batched Transaction Group (When multiple items share an order ID, batch ID, or transaction ID)
            const first = group[0];
            const isOnlineOrder = !!(first.online_order_id && String(first.online_order_id).trim());
            const rawTxId = String(first.transaction_id || '').trim();
            const cleanBatchId = first.batch_id || first.batch_tx_id || (rawTxId.startsWith('TX_') ? rawTxId.replace(/_\d+$/, '') : rawTxId);
            const titleText = isOnlineOrder 
              ? `🌐 網路訂單 #${first.online_order_id}` 
              : cleanBatchId 
                ? `📦 批次出貨 #${cleanBatchId}` 
                : '📦 多品項出貨群組';

            const totalQuantity = group.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
            const totalAmount = group.reduce((sum, item) => {
              const price = Number(item.price) || Number(item.cost_price) || getProductCostPrice(item.product_id) || 0;
              return sum + (price * (Number(item.quantity) || 0));
            }, 0);

            return (
              <div key={first.online_order_id || cleanBatchId || first.transaction_id || `tx-group-${idx}`} className="glass-panel border border-[var(--color-glass-border)] rounded-2xl p-4 transition-all hover:border-white/20 shadow-md">
                <div className="flex items-start mb-2 gap-3">
                  <div className="mt-1 w-10 h-10 shrink-0 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shadow-inner">
                    <Layers className="w-5 h-5 text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-black text-[var(--color-text-main)] text-base break-words flex items-center gap-2">
                          {titleText}
                        </h3>
                        {first.note && (
                          <p className="text-xs text-sky-300 font-medium mt-1 break-words bg-white/5 p-2 rounded-xl border border-white/5">
                            {first.note}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[11px] text-[var(--color-text-dim)] font-mono block">
                          {formatTxDate(first.date)}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-0.5 bg-purple-500/20 text-purple-300">
                          {group.length} 款商品
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mt-2 pt-2 border-t border-white/5">
                      <div className="flex items-center gap-3">
                        <p className="text-xs text-rose-400 font-mono font-bold">總出貨件數: -{totalQuantity} 件</p>
                        <p className="text-xs text-[var(--color-accent-green)] font-mono font-bold">總金額: ${totalAmount.toLocaleString()}</p>
                      </div>
                      {group.length > 1 && (
                        <button
                          onClick={() => setGroupToDelete({ groupId: first.online_order_id || cleanBatchId || first.transaction_id, group })}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-rose-500/10 border border-rose-500/20 text-[11px] font-bold text-rose-400 hover:bg-rose-500/20 active:scale-95 transition-all cursor-pointer shadow-sm ml-auto"
                          title="刪除整批出貨紀錄"
                        >
                          <Trash2 className="w-3 h-3" />
                          刪除整張訂單紀錄
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-white/5 text-sm space-y-2">
                  <div className="flex flex-col gap-2 text-xs bg-black/20 rounded-xl p-2.5 border border-white/5">
                    {group.map((t, i) => {
                      const costVal = t.price || t.cost_price || getProductCostPrice(t.product_id) || 0;
                      return (
                        <div key={t.id || t.transaction_id || i} className="flex flex-col border-b border-white/5 pb-2.5 mb-2 last:border-0 last:mb-0 last:pb-0">
                          <div className="flex justify-between items-start gap-2">
                            <div className="min-w-0 flex-1">
                              <span className="block truncate text-white font-bold text-sm">{getTxProductName(t)}</span>
                              <div className="flex flex-wrap items-center gap-1 mt-1 text-[10px] text-[var(--color-text-dim)]">
                                {isForcedTx(t) && (
                                  <span className="bg-red-500/20 text-red-300 px-1.5 py-0.5 rounded font-bold border border-red-500/30">
                                    ⚡ 強行出貨
                                  </span>
                                )}
                                {getTxPlatform(t) && (
                                  <span className="bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-bold border border-purple-500/30">
                                    平台: {getTxPlatform(t)}
                                  </span>
                                )}
                                <span className="bg-white/5 px-1.5 py-0.5 rounded font-mono">
                                  PID: {t.product_id || '(非系統商品)'}
                                </span>
                                <span className="bg-white/5 px-1.5 py-0.5 rounded">
                                  金額: <span className="text-[var(--color-accent-green)] font-bold">${costVal}</span>
                                </span>
                                {t.specification && (
                                  <span className="bg-white/5 px-1.5 py-0.5 rounded max-w-[120px] truncate" title={t.specification}>
                                    規格: {t.specification}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className={`font-mono font-black shrink-0 text-base ${t.type === 'adjust' ? 'text-amber-400' : 'text-rose-400'}`}>
                              {t.type === 'adjust' ? formatAdjustQuantity(t).display : `x${t.quantity}`}
                            </span>
                          </div>
                          <div className="flex justify-end gap-1.5 mt-2">
                            <button
                              onClick={() => setSelectedTxForView(t)}
                              className="p-1.5 rounded-lg bg-white/5 text-[var(--color-text-dim)] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                              title="詳情"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setSelectedTxForEdit(t)}
                              className="p-1.5 rounded-lg bg-sky-500/10 text-sky-300 hover:bg-sky-500/20 transition-colors cursor-pointer"
                              title="編輯"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setTxToDelete(t)}
                              className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors cursor-pointer"
                              title="單獨刪除此品項"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-3 py-6 md:col-span-2 xl:col-span-3">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold disabled:opacity-40 disabled:pointer-events-none transition-all"
            >
              上一頁
            </button>
            <span className="text-xs text-slate-400 font-mono font-bold">
              第 {currentPage} / {totalPages} 頁
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold disabled:opacity-40 disabled:pointer-events-none transition-all"
            >
              下一頁
            </button>
          </div>
        )}
      </div>

      {/* 詳情 Modal */}
      {selectedTxForView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="glass-panel border border-white/10 rounded-2xl w-full max-w-sm p-5 space-y-3.5 shadow-2xl">
            <div className="flex justify-between items-center pb-2 border-b border-white/10">
              <h2 className="text-sm font-bold text-[var(--color-text-main)] flex items-center gap-2">
                {getIcon(selectedTxForView.type)}
                <span>{getTypeLabel(selectedTxForView.type)} 交易詳情</span>
              </h2>
              <button 
                onClick={() => setSelectedTxForView(null)}
                className="p-1 px-[7px] rounded-lg bg-white/5 hover:bg-white/10 text-[var(--color-text-dim)] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="grid grid-cols-3 gap-1 py-1 border-b border-white/5">
                <span className="text-[var(--color-text-dim)]">交易編號</span>
                <span className="col-span-2 text-white font-mono break-all">{selectedTxForView.transaction_id || '-'}</span>
              </div>
              {selectedTxForView.online_order_id && (
                <div className="grid grid-cols-3 gap-1 py-1 border-b border-white/5">
                  <span className="text-[var(--color-text-dim)]">網路訂單號</span>
                  <span className="col-span-2 text-sky-400 font-mono font-bold break-all">#{selectedTxForView.online_order_id}</span>
                </div>
              )}
              {getTxPlatform(selectedTxForView) && (
                <div className="grid grid-cols-3 gap-1 py-1 border-b border-white/5">
                  <span className="text-[var(--color-text-dim)]">平台通路</span>
                  <span className="col-span-2 text-purple-300 font-bold">{getTxPlatform(selectedTxForView)}</span>
                </div>
              )}
              <div className="grid grid-cols-3 gap-1 py-1 border-b border-white/5">
                <span className="text-[var(--color-text-dim)]">商品名稱</span>
                <span className="col-span-2 text-white font-bold">{getTxProductName(selectedTxForView)}</span>
              </div>
              <div className="grid grid-cols-3 gap-1 py-1 border-b border-white/5">
                <span className="text-[var(--color-text-dim)]">商品編號(PID)</span>
                <span className="col-span-2 text-white font-mono">{selectedTxForView.product_id || '(非系統商品)'}</span>
              </div>
              <div className="grid grid-cols-3 gap-1 py-1 border-b border-white/5">
                <span className="text-[var(--color-text-dim)]">異動數量</span>
                <span className="col-span-2 font-bold font-mono">
                  {selectedTxForView.type === 'adjust' ? (
                    <span className="text-amber-400">
                      {formatAdjustQuantity(selectedTxForView).display} <span className="text-xs text-amber-300/80 font-normal font-sans">(變化量=最終數量)</span>
                    </span>
                  ) : (
                    <span className={selectedTxForView.type === 'stock_in' ? 'text-sky-400' : 'text-rose-400'}>
                      {selectedTxForView.type === 'stock_in' ? `+${selectedTxForView.quantity}` : `-${selectedTxForView.quantity}`}
                    </span>
                  )}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1 py-1 border-b border-white/5">
                <span className="text-[var(--color-text-dim)]">金額 / 價格</span>
                <span className="col-span-2 text-[var(--color-accent-green)] font-bold font-mono">
                  ${selectedTxForView.price || selectedTxForView.cost_price || getProductCostPrice(selectedTxForView.product_id) || 0}
                </span>
              </div>
              {selectedTxForView.vendor_id && (
                <div className="grid grid-cols-3 gap-1 py-1 border-b border-white/5">
                  <span className="text-[var(--color-text-dim)]">供應商</span>
                  <span className="col-span-2 text-white">{getVendorName(selectedTxForView.vendor_id)}</span>
                </div>
              )}
              <div className="grid grid-cols-3 gap-1 py-1 border-b border-white/5">
                <span className="text-[var(--color-text-dim)]">批次規格</span>
                <span className="col-span-2 text-white">{selectedTxForView.specification || '無'}</span>
              </div>
              <div className="grid grid-cols-3 gap-1 py-1 border-b border-white/5">
                <span className="text-[var(--color-text-dim)]">存儲位置</span>
                <span className="col-span-2 text-white">
                  {selectedTxForView.location || '倉庫'} - {selectedTxForView.floor || '1F'} - {selectedTxForView.area || 'A區'}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1 py-1 border-b border-white/5">
                <span className="text-[var(--color-text-dim)]">異動時間</span>
                <span className="col-span-2 text-white font-mono">{formatTxDate(selectedTxForView.date)}</span>
              </div>
              <div className="grid grid-cols-3 gap-1 py-1 border-b border-white/5">
                <span className="text-[var(--color-text-dim)]">經辦人員</span>
                <span className="col-span-2 text-white">{selectedTxForView.operator || 'staff'}</span>
              </div>
              {selectedTxForView.note && (
                <div className="pt-1.5">
                  <p className="text-[var(--color-text-dim)] mb-1 font-bold">備註說明</p>
                  <p className="bg-white/5 p-2.5 rounded-xl text-white text-[11px] whitespace-pre-wrap leading-relaxed border border-white/5">
                    {selectedTxForView.note}
                  </p>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
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
              if (editCost !== '') {
                fields.cost_price = Number(editCost);
              }
              if (editPrice !== '') {
                fields.price = Number(editPrice);
              }
              if (editVendor) {
                fields.vendor_id = editVendor;
              }
              await editTransaction(selectedTxForEdit.id || selectedTxForEdit.transaction_id, fields);
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
                <div className="p-2 bg-white/5 rounded-xl text-white/70 border border-white/5 font-bold">
                  {getTxProductName(selectedTxForEdit)}
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
                    placeholder="如: 紅色 / 500ml"
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-2 text-xs text-white outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              {selectedTxForEdit.type === 'stock_in' ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-[var(--color-text-dim)] uppercase mb-0.5">進價成本 ($)</label>
                    <input 
                      type="number"
                      step="any"
                      value={editCost}
                      onChange={(e) => setEditCost(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-2 text-xs text-white outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[var(--color-text-dim)] uppercase mb-0.5">供應商</label>
                    <select
                      value={editVendor}
                      onChange={(e) => setEditVendor(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-2 text-xs text-white outline-none focus:border-sky-500"
                    >
                      <option value="" className="bg-[#0f172a]">未指定</option>
                      {vendors.map(v => (
                        <option key={v.vendor_id} value={v.vendor_id} className="bg-[#0f172a]">{v.vendor_name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-[10px] font-bold text-[var(--color-text-dim)] uppercase mb-0.5">售價/出貨金額 ($)</label>
                  <input 
                    type="number"
                    step="any"
                    value={editPrice}
                    onChange={(e) => setEditPrice(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-2 text-xs text-white outline-none focus:border-sky-500"
                  />
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-[var(--color-text-dim)] uppercase mb-0.5">地點</label>
                  <input 
                    type="text"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-2 text-xs text-white outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[var(--color-text-dim)] uppercase mb-0.5">樓層</label>
                  <input 
                    type="text"
                    value={editFloor}
                    onChange={(e) => setEditFloor(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-2 text-xs text-white outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[var(--color-text-dim)] uppercase mb-0.5">區域</label>
                  <input 
                    type="text"
                    value={editArea}
                    onChange={(e) => setEditArea(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-2 text-xs text-white outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-[var(--color-text-dim)] uppercase mb-0.5">異動時間</label>
                  <input 
                    type="text"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    placeholder="YYYY-MM-DD HH:mm:ss"
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-2 text-xs text-white outline-none focus:border-sky-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-[var(--color-text-dim)] uppercase mb-0.5">經辦人員</label>
                  <input 
                    type="text"
                    value={editOperator}
                    onChange={(e) => setEditOperator(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-2 text-xs text-white outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-[var(--color-text-dim)] uppercase mb-0.5">備註說明</label>
                <textarea 
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-xl p-2 text-xs text-white outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setSelectedTxForEdit(null)}
                className="px-3 py-2 bg-white/5 hover:bg-white/10 text-[var(--color-text-dim)] rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-[var(--color-accent-blue)] text-[#0f172a] rounded-xl text-xs font-black transition-all hover:brightness-110 active:scale-95 cursor-pointer"
              >
                儲存變更
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 單筆刪除確認 Modal */}
      {txToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="glass-panel border border-red-500/30 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <Trash2 className="w-6 h-6 shrink-0" />
              <h2 className="text-base font-bold text-white">確認刪除此筆交易紀錄？</h2>
            </div>
            
            <div className="text-xs text-slate-300 bg-white/5 p-3 rounded-xl border border-white/5 space-y-1.5">
              <p><span className="text-slate-400">商品名稱：</span><span className="text-white font-bold">{getTxProductName(txToDelete)}</span></p>
              <p><span className="text-slate-400">異動類型：</span><span className="text-white">{getTypeLabel(txToDelete.type)} ({txToDelete.quantity} 件)</span></p>
              <p><span className="text-slate-400">異動時間：</span><span className="text-white font-mono">{formatTxDate(txToDelete.date)}</span></p>
              {txToDelete.online_order_id && (
                <p><span className="text-slate-400">網路訂單：</span><span className="text-sky-300 font-mono">#{txToDelete.online_order_id}</span></p>
              )}
            </div>

            <p className="text-[11px] text-amber-300/90 leading-relaxed bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20">
              ⚠️ 提示：刪除此筆紀錄將會自動反向校正目前庫存量（進貨紀錄刪除會扣減庫存，出貨紀錄刪除會回補庫存）。
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setTxToDelete(null)}
                className="px-3 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  await deleteTransaction(txToDelete.id || txToDelete.transaction_id);
                  setTxToDelete(null);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer shadow-lg shadow-red-600/30"
              >
                確認刪除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 整批/整張訂單刪除確認 Modal */}
      {groupToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="glass-panel border border-red-500/30 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <Trash2 className="w-6 h-6 shrink-0" />
              <h2 className="text-base font-bold text-white">確認刪除整張訂單紀錄？</h2>
            </div>
            
            <div className="text-xs text-slate-300 bg-white/5 p-3 rounded-xl border border-white/5 space-y-2 max-h-48 overflow-y-auto">
              <p className="text-sky-300 font-bold">訂單/群組編號: #{groupToDelete.groupId}</p>
              <p className="text-slate-400">包含以下 {groupToDelete.group.length} 個品項出貨明細：</p>
              <div className="space-y-1 pt-1 border-t border-white/5">
                {groupToDelete.group.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-[11px] text-white/90">
                    <span className="truncate max-w-[180px]">{getTxProductName(item)}</span>
                    <span className="font-mono font-bold text-rose-400">x{item.quantity}</span>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-amber-300/90 leading-relaxed bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20">
              ⚠️ 提示：刪除整批出貨紀錄將會自動回補所有品項的庫存量。
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setGroupToDelete(null)}
                className="px-3 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  const targetIds = groupToDelete.group.map(t => t.id || t.transaction_id).filter(Boolean);
                  await deleteTransactionGroup(targetIds.length > 0 ? targetIds : groupToDelete.groupId);
                  setGroupToDelete(null);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-black transition-all active:scale-95 cursor-pointer shadow-lg shadow-red-600/30"
              >
                確認刪除整張訂單
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
