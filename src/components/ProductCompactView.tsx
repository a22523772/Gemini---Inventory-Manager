import React, { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { 
  Search, 
  Copy, 
  Check, 
  SlidersHorizontal, 
  Building2, 
  Package, 
  AlertTriangle, 
  FileSpreadsheet, 
  PauseCircle, 
  PlayCircle, 
  Sliders, 
  TrendingDown, 
  DollarSign, 
  Layers, 
  ArrowUpDown,
  ExternalLink,
  Pencil,
  X
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface ProductCompactViewProps {
  onOpenAdjustModal: (group: any, stockEntry?: any) => void;
}

export default function ProductCompactView({ onOpenAdjustModal }: ProductCompactViewProps) {
  const { 
    products, 
    stock, 
    vendors, 
    toggleOutOfStock, 
    showToast 
  } = useStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedVendor, setSelectedVendor] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [onlyLowStock, setOnlyLowStock] = useState(false);
  const [hideOutOfStock, setHideOutOfStock] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'stock_asc' | 'stock_desc' | 'cost_desc' | 'replenish_desc'>('stock_asc');
  const [copiedLine, setCopiedLine] = useState(false);
  const [copiedTsv, setCopiedTsv] = useState(false);

  // Vendor lookup map
  const vendorMap = useMemo(() => new Map(vendors.map(v => [v.vendor_id, v.vendor_name])), [vendors]);

  // Aggregate stock by product_id
  const stockMap = useMemo(() => {
    const map = new Map<string, { total: number; entries: any[] }>();
    stock.forEach(s => {
      const pid = s.product_id;
      if (!pid) return;
      if (!map.has(pid)) {
        map.set(pid, { total: 0, entries: [] });
      }
      const entry = map.get(pid)!;
      entry.total += Number(s.quantity) || 0;
      entry.entries.push(s);
    });
    return map;
  }, [stock]);

  // Unique list of vendors and categories for dropdowns
  const vendorOptions = useMemo(() => {
    const vIds = Array.from(new Set(products.map(p => p.vendor_id).filter(Boolean)));
    return vIds.map(vid => ({
      id: vid,
      name: vendorMap.get(vid) || vid
    })).sort((a, b) => a.name.localeCompare(b.name, 'zh-HK'));
  }, [products, vendorMap]);

  const categoryOptions = useMemo(() => {
    return Array.from(new Set(products.map(p => p.category).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'zh-HK'));
  }, [products]);

  // Prepared items with computed metrics
  const items = useMemo(() => {
    return products.map(p => {
      const stockData = stockMap.get(p.product_id) || { total: 0, entries: [] };
      const currentStock = stockData.total;
      
      const rawMin = p.min_stock;
      const minStock = (typeof rawMin === 'number' && !isNaN(rawMin)) 
        ? rawMin 
        : (rawMin !== undefined && rawMin !== null && (rawMin as any) !== '' && !isNaN(Number(rawMin))) 
          ? Number(rawMin) 
          : 5;

      const isOutOfStock = Boolean(p.is_out_of_stock || p.is_discontinued);
      const isOut = currentStock <= 0;
      const isLow = !isOut && currentStock <= minStock;
      
      // Suggested order quantity (if stock is below alert threshold)
      const suggestedOrderQty = (isOut || isLow) && !isOutOfStock
        ? Math.max(minStock * 2 - currentStock, minStock > 0 ? minStock : 10)
        : 0;

      const costPrice = Number(p.cost_price) || 0;
      const totalCostValue = costPrice * currentStock;
      const vendorName = p.vendor_id ? (vendorMap.get(p.vendor_id) || p.vendor_id) : '未指定廠商';

      return {
        product: p,
        product_id: p.product_id,
        name: p.name,
        brand: p.brand || '',
        specification: p.specification || '預設規格',
        barcode: p.barcode || '',
        category: p.category || '',
        unit: p.unit || '個',
        cost_price: costPrice,
        vendor_id: p.vendor_id || '',
        vendor_name: vendorName,
        current_stock: currentStock,
        min_stock: minStock,
        stock_entries: stockData.entries,
        is_out_of_stock: isOutOfStock,
        is_out: isOut,
        is_low: isLow,
        suggested_order_qty: suggestedOrderQty,
        total_cost_value: totalCostValue
      };
    });
  }, [products, stockMap, vendorMap]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (selectedVendor !== 'ALL' && item.vendor_id !== selectedVendor) return false;
      if (selectedCategory !== 'ALL' && item.category !== selectedCategory) return false;
      if (hideOutOfStock && item.is_out_of_stock) return false;
      if (onlyLowStock && (item.current_stock > item.min_stock || item.is_out_of_stock)) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const matchName = item.name.toLowerCase().includes(q);
        const matchSpec = item.specification.toLowerCase().includes(q);
        const matchBrand = item.brand.toLowerCase().includes(q);
        const matchBarcode = item.barcode.toLowerCase().includes(q);
        const matchPid = item.product_id.toLowerCase().includes(q);
        const matchVendor = item.vendor_name.toLowerCase().includes(q);
        if (!matchName && !matchSpec && !matchBrand && !matchBarcode && !matchPid && !matchVendor) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name, 'zh-HK');
        case 'stock_asc':
          return a.current_stock - b.current_stock;
        case 'stock_desc':
          return b.current_stock - a.current_stock;
        case 'cost_desc':
          return b.cost_price - a.cost_price;
        case 'replenish_desc':
          return b.suggested_order_qty - a.suggested_order_qty;
        default:
          return 0;
      }
    });
  }, [items, selectedVendor, selectedCategory, hideOutOfStock, onlyLowStock, searchTerm, sortBy]);

  // Summary statistics for current filter
  const stats = useMemo(() => {
    let totalUnits = 0;
    let totalVal = 0;
    let lowCount = 0;
    let outCount = 0;
    let outOfStockStatusCount = 0;

    filteredItems.forEach(i => {
      totalUnits += i.current_stock;
      totalVal += i.total_cost_value;
      if (i.is_out_of_stock) outOfStockStatusCount++;
      else if (i.is_out) outCount++;
      else if (i.is_low) lowCount++;
    });

    return {
      itemCount: filteredItems.length,
      totalUnits,
      totalVal,
      lowCount,
      outCount,
      outOfStockStatusCount,
      needReplenishCount: lowCount + outCount
    };
  }, [filteredItems]);

  // Export to TSV / Excel copy
  const copyTsvTable = () => {
    if (filteredItems.length === 0) {
      showToast('⚠️ 目前沒有符合條件的商品');
      return;
    }
    const headers = ['商品編號', '商品名稱', '品牌', '規格', '供應商', '現有庫存', '單位', '安全水位', '進價成本', '建議訂購量', '狀態'];
    const rows = filteredItems.map(i => [
      i.product_id,
      i.name,
      i.brand,
      i.specification,
      i.vendor_name,
      i.current_stock,
      i.unit,
      i.min_stock,
      i.cost_price,
      i.suggested_order_qty,
      i.is_out_of_stock ? '暫時缺貨' : i.is_out ? '缺貨' : i.is_low ? '庫存偏低' : '充裕'
    ]);
    const content = [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');
    navigator.clipboard.writeText(content).then(() => {
      setCopiedTsv(true);
      showToast('📋 已複製表格（TSV格式），可直接貼上至 Excel 或 Google Sheets！');
      setTimeout(() => setCopiedTsv(false), 2000);
    });
  };

  // Export Line Order Message formatted specifically for vendor ordering
  const copyLineOrderFormat = () => {
    if (filteredItems.length === 0) {
      showToast('⚠️ 目前沒有符合條件的商品');
      return;
    }

    const vendorLabel = selectedVendor !== 'ALL' 
      ? (vendorMap.get(selectedVendor) || selectedVendor)
      : '全部廠商';

    const orderCandidates = filteredItems.filter(i => !i.is_out_of_stock && (onlyLowStock ? true : i.suggested_order_qty > 0 || i.current_stock <= i.min_stock));
    const targetList = orderCandidates.length > 0 ? orderCandidates : filteredItems;

    let text = `【${vendorLabel} 訂貨清單 (${new Date().toLocaleDateString('zh-TW')})】\n`;
    text += `---------------------------------\n`;

    targetList.forEach((item, idx) => {
      const specStr = item.specification ? ` (${item.specification})` : '';
      const orderQty = item.suggested_order_qty > 0 ? item.suggested_order_qty : (item.min_stock > 0 ? item.min_stock : 10);
      text += `${idx + 1}. ${item.name}${specStr}\n`;
      text += `   目前庫存: ${item.current_stock} ${item.unit} ➔ 欲訂購: ${orderQty} ${item.unit}`;
      if (item.cost_price > 0) {
        text += ` (進價: $${item.cost_price})`;
      }
      text += `\n`;
    });

    text += `---------------------------------\n`;
    text += `共計 ${targetList.length} 項品項，請協助確認排單出貨，謝謝！`;

    navigator.clipboard.writeText(text).then(() => {
      setCopiedLine(true);
      showToast('📲 已複製廠商訂貨清單！格式已美化，可直接貼至 LINE 給廠商。');
      setTimeout(() => setCopiedLine(false), 2000);
    });
  };

  // CSV file download
  const exportCsv = () => {
    if (filteredItems.length === 0) {
      showToast('⚠️ 目前沒有可匯出的商品資料');
      return;
    }

    const headers = ['商品編號', '商品名稱', '品牌', '規格', '條碼', '供應商', '現有庫存', '單位', '安全警示庫存', '進價成本', '庫存總成本', '建議訂購量', '是否缺貨'];
    const rows = filteredItems.map(i => [
      `"${i.product_id}"`,
      `"${i.name.replace(/"/g, '""')}"`,
      `"${i.brand.replace(/"/g, '""')}"`,
      `"${i.specification.replace(/"/g, '""')}"`,
      `"${i.barcode}"`,
      `"${i.vendor_name.replace(/"/g, '""')}"`,
      i.current_stock,
      `"${i.unit}"`,
      i.min_stock,
      i.cost_price,
      i.total_cost_value,
      i.suggested_order_qty,
      i.is_out_of_stock ? '是(暫時缺貨)' : '否'
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const vendorSuffix = selectedVendor !== 'ALL' ? `_${(vendorMap.get(selectedVendor) || selectedVendor)}` : '';
    link.setAttribute('download', `商品庫存簡覽_訂貨明細表${vendorSuffix}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('✅ 已成功匯出 CSV 訂貨清單！');
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0b1120] text-slate-100">
      {/* Top Header & Vendor Selector Toolbar */}
      <div className="p-4 bg-[#0f172a]/95 border-b border-white/10 space-y-3 shrink-0">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg sm:text-xl font-black text-white tracking-tight flex items-center gap-2">
                📋 商品庫存簡覽 (廠商訂貨模式)
                <span className="text-xs font-mono font-normal text-slate-400 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
                  {filteredItems.length} 款商品
                </span>
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              專為向廠商叫貨訂購打造：簡單、清晰看懂全部商品即時庫存，支援一鍵複製 LINE 訂貨清單
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={copyLineOrderFormat}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-emerald-600/20 active:scale-95 transition-all cursor-pointer"
              title="將當前清單轉為 LINE 訂貨格式"
            >
              {copiedLine ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copiedLine ? '已複製訂貨單！' : '複製 LINE 訂貨單'}</span>
            </button>

            <button
              onClick={copyTsvTable}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-white/10 font-bold rounded-xl text-xs flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
              title="複製為 Excel 表格"
            >
              {copiedTsv ? <Check className="w-4 h-4" /> : <FileSpreadsheet className="w-4 h-4 text-emerald-400" />}
              <span>複製 Excel 表格</span>
            </button>

            <button
              onClick={exportCsv}
              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 font-bold rounded-xl text-xs flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>匯出 CSV</span>
            </button>
          </div>
        </div>

        {/* Metric mini statistics strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          <div className="bg-black/30 border border-white/5 rounded-xl px-3 py-2">
            <span className="text-[11px] text-slate-400 block font-medium">在庫總件數</span>
            <span className="text-lg font-black font-mono text-emerald-400">
              {stats.totalUnits.toLocaleString()} <span className="text-xs font-normal text-slate-400">件</span>
            </span>
          </div>

          <div className="bg-black/30 border border-white/5 rounded-xl px-3 py-2">
            <span className="text-[11px] text-slate-400 block font-medium">總庫存進價價值</span>
            <span className="text-lg font-black font-mono text-sky-400">
              ${stats.totalVal.toLocaleString()}
            </span>
          </div>

          <div 
            onClick={() => setOnlyLowStock(!onlyLowStock)}
            className={`border rounded-xl px-3 py-2 cursor-pointer transition-all ${
              onlyLowStock 
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-200' 
                : 'bg-black/30 border-white/5 hover:border-amber-500/30'
            }`}
          >
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-slate-400 block font-medium">需補貨品項 (缺貨/低庫存)</span>
              {onlyLowStock && <span className="text-[9px] font-bold bg-amber-500 text-black px-1.5 rounded">篩選中</span>}
            </div>
            <span className={`text-lg font-black font-mono ${stats.needReplenishCount > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
              {stats.needReplenishCount} <span className="text-xs font-normal text-slate-400">款 (缺貨: {stats.outCount})</span>
            </span>
          </div>

          <div 
            onClick={() => setHideOutOfStock(!hideOutOfStock)}
            className={`border rounded-xl px-3 py-2 cursor-pointer transition-all ${
              hideOutOfStock 
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-200' 
                : 'bg-black/30 border-white/5 hover:border-amber-500/30'
            }`}
          >
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-slate-400 block font-medium">暫時缺貨 (待補貨)</span>
              {hideOutOfStock && <span className="text-[9px] font-bold bg-amber-500 text-black px-1.5 rounded">已隱藏</span>}
            </div>
            <span className="text-lg font-black font-mono text-amber-300">
              {stats.outOfStockStatusCount} <span className="text-xs font-normal text-slate-400">款</span>
            </span>
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="flex flex-col md:flex-row gap-2.5 items-stretch md:items-center justify-between pt-1">
          {/* Vendor Quick Dropdown & Category */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Vendor Filter */}
            <div className="flex items-center gap-1.5 bg-black/40 border border-white/10 rounded-xl px-2.5 py-1.5">
              <Building2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="text-xs text-slate-400 font-bold shrink-0">供應商:</span>
              <select
                value={selectedVendor}
                onChange={(e) => setSelectedVendor(e.target.value)}
                className="bg-transparent text-xs font-bold text-sky-300 outline-none cursor-pointer max-w-[160px] truncate"
              >
                <option value="ALL" className="bg-slate-900 text-white">全部供應商 ({products.length})</option>
                {vendorOptions.map(v => (
                  <option key={v.id} value={v.id} className="bg-slate-900 text-white">
                    {v.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Category Filter */}
            {categoryOptions.length > 0 && (
              <div className="flex items-center gap-1.5 bg-black/40 border border-white/10 rounded-xl px-2.5 py-1.5">
                <Layers className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                <span className="text-xs text-slate-400 font-bold shrink-0">分類:</span>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="bg-transparent text-xs font-bold text-indigo-300 outline-none cursor-pointer max-w-[130px] truncate"
                >
                  <option value="ALL" className="bg-slate-900 text-white">全部分類</option>
                  {categoryOptions.map(c => (
                    <option key={c} value={c} className="bg-slate-900 text-white">
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Toggle Toggles */}
            <button
              onClick={() => setOnlyLowStock(!onlyLowStock)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 border transition-all cursor-pointer ${
                onlyLowStock
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                  : 'bg-black/40 border-white/10 text-slate-400 hover:text-slate-200'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>僅看需補貨</span>
            </button>

            <button
              onClick={() => setHideOutOfStock(!hideOutOfStock)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 border transition-all cursor-pointer ${
                hideOutOfStock
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                  : 'bg-black/40 border-white/10 text-slate-400 hover:text-slate-200'
              }`}
            >
              <PauseCircle className="w-3.5 h-3.5 text-amber-400" />
              <span>隱藏缺貨</span>
            </button>
          </div>

          {/* Search and Sort */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 md:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="搜尋商品、規格、品牌、條碼..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-black/40 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500 focus:border-sky-500/50"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-black/40 border border-white/10 rounded-xl text-xs font-medium text-slate-300 px-2.5 py-1.5 outline-none cursor-pointer shrink-0"
            >
              <option value="stock_asc" className="bg-slate-900 text-white">庫存：少 ➔ 多 (優先叫貨)</option>
              <option value="stock_desc" className="bg-slate-900 text-white">庫存：多 ➔ 少</option>
              <option value="replenish_desc" className="bg-slate-900 text-white">建議補貨量：高 ➔ 低</option>
              <option value="cost_desc" className="bg-slate-900 text-white">進價成本：高 ➔ 低</option>
              <option value="name" className="bg-slate-900 text-white">商品名稱排序</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Table Content */}
      <div className="flex-1 overflow-auto p-4">
        {filteredItems.length === 0 ? (
          <div className="text-center py-20 bg-black/20 rounded-2xl border border-white/5 space-y-3">
            <Package className="w-12 h-12 text-slate-600 mx-auto" />
            <p className="text-sm font-bold text-slate-400">沒有找到符合條件的商品</p>
            {(selectedVendor !== 'ALL' || onlyLowStock || searchTerm) && (
              <button
                onClick={() => {
                  setSelectedVendor('ALL');
                  setSelectedCategory('ALL');
                  setOnlyLowStock(false);
                  setSearchTerm('');
                }}
                className="px-4 py-2 bg-white/10 hover:bg-white/15 text-xs text-sky-300 font-bold rounded-xl"
              >
                重設所有篩選條件
              </button>
            )}
          </div>
        ) : (
          <div className="bg-slate-900/90 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-black/50 border-b border-white/10 text-slate-400 font-bold">
                  <th className="p-3 text-center w-12">#</th>
                  <th className="p-3 min-w-[200px]">商品名稱 / 品牌</th>
                  <th className="p-3 min-w-[120px]">規格 / 型號</th>
                  <th className="p-3 min-w-[110px]">供應商</th>
                  <th className="p-3 text-right min-w-[120px]">現有總庫存</th>
                  <th className="p-3 text-right min-w-[90px]">安全水位</th>
                  <th className="p-3 text-right min-w-[100px]">進價成本</th>
                  <th className="p-3 text-center min-w-[110px]">建議叫貨量</th>
                  <th className="p-3 text-center min-w-[120px]">狀態標記</th>
                  <th className="p-3 text-center min-w-[110px]">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredItems.map((item, idx) => {
                  const isOutOfStock = item.is_out_of_stock;
                  const isOut = item.is_out;
                  const isLow = item.is_low;

                  let stockBadgeColor = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
                  let stockText = `${item.current_stock} ${item.unit}`;

                  if (isOutOfStock) {
                    stockBadgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/30';
                  } else if (isOut) {
                    stockBadgeColor = 'bg-red-500/20 text-red-300 border-red-500/40 font-black animate-pulse';
                    stockText = `⚠️ 缺貨 (0 ${item.unit})`;
                  } else if (isLow) {
                    stockBadgeColor = 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold';
                    stockText = `⚡ 偏低 (${item.current_stock} ${item.unit})`;
                  }

                  return (
                    <tr 
                      key={item.product_id}
                      className={`hover:bg-white/[0.04] transition-colors ${
                        isOutOfStock ? 'opacity-65 bg-amber-950/10' :
                        isOut ? 'bg-red-950/15' :
                        isLow ? 'bg-amber-950/10' : ''
                      }`}
                    >
                      {/* Row Index */}
                      <td className="p-3 text-center font-mono text-slate-500 font-bold">
                        {idx + 1}
                      </td>

                      {/* Product Name & Brand */}
                      <td className="p-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-white text-sm hover:text-sky-300 transition-colors">
                              {item.name}
                            </span>
                            {item.brand && (
                              <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.2 rounded border border-white/10 shrink-0 font-medium">
                                {item.brand}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                            <span className="bg-white/5 px-1.5 py-0.2 rounded border border-white/5">
                              ID: {item.product_id}
                            </span>
                            {item.barcode && (
                              <span className="text-slate-400">
                                條碼: {item.barcode}
                              </span>
                            )}
                            {item.category && (
                              <span className="text-indigo-400">
                                [{item.category}]
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Specification */}
                      <td className="p-3">
                        <span className="inline-block bg-indigo-500/10 text-indigo-300 text-xs px-2 py-0.5 rounded-lg border border-indigo-500/20 font-medium">
                          {item.specification}
                        </span>
                      </td>

                      {/* Vendor */}
                      <td className="p-3">
                        <span className="text-slate-300 font-medium flex items-center gap-1">
                          <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span className="truncate max-w-[120px]" title={item.vendor_name}>
                            {item.vendor_name}
                          </span>
                        </span>
                      </td>

                      {/* Current Stock */}
                      <td className="p-3 text-right font-mono">
                        <button
                          onClick={() => onOpenAdjustModal({ product: item.product, stockEntries: item.stock_entries })}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs border font-mono transition-all hover:scale-105 active:scale-95 cursor-pointer ${stockBadgeColor}`}
                          title="點擊直接快速調整庫存"
                        >
                          <span className="text-sm font-black">{stockText}</span>
                          <Pencil className="w-3 h-3 opacity-60 ml-0.5" />
                        </button>
                      </td>

                      {/* Min Stock */}
                      <td className="p-3 text-right font-mono text-slate-400">
                        {item.min_stock} {item.unit}
                      </td>

                      {/* Cost Price */}
                      <td className="p-3 text-right font-mono font-bold text-slate-200">
                        ${item.cost_price.toLocaleString()}
                      </td>

                      {/* Suggested Order Qty */}
                      <td className="p-3 text-center">
                        {isOutOfStock ? (
                          <span className="text-[11px] text-amber-300/80 font-medium">
                            🟡 待補貨
                          </span>
                        ) : item.suggested_order_qty > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-sky-500/20 text-sky-300 border border-sky-500/40 rounded-full font-mono text-xs font-black animate-pulse">
                            + {item.suggested_order_qty} {item.unit}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500 font-mono">
                            庫存充足
                          </span>
                        )}
                      </td>

                      {/* Out of Stock / Active Toggle */}
                      <td className="p-3 text-center">
                        <button
                          onClick={() => toggleOutOfStock(item.product_id)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold transition-all border cursor-pointer ${
                            isOutOfStock 
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30' 
                              : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20 hover:bg-emerald-500/20'
                          }`}
                          title={isOutOfStock ? '點擊恢復正常供應' : '點擊標記為暫時缺貨'}
                        >
                          {isOutOfStock ? (
                            <>
                              <PauseCircle className="w-3.5 h-3.5 text-amber-400" />
                              <span>暫時缺貨</span>
                            </>
                          ) : (
                            <>
                              <PlayCircle className="w-3.5 h-3.5 text-emerald-400" />
                              <span>正常供應</span>
                            </>
                          )}
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => onOpenAdjustModal({ product: item.product, stockEntries: item.stock_entries })}
                            className="px-2 py-1 bg-white/5 hover:bg-white/15 text-sky-300 border border-white/10 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
                            title="快速盤點庫存"
                          >
                            <Sliders className="w-3 h-3" />
                            <span>盤點</span>
                          </button>

                          <Link
                            to={`/edit-product/${item.product_id}`}
                            className="p-1 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg border border-white/5 transition-colors"
                            title="編輯商品完整資料"
                          >
                            <Pencil className="w-3 h-3" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
