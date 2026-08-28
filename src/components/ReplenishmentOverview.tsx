import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { 
  Search, 
  ArrowUpDown, 
  Copy, 
  Check, 
  SlidersHorizontal, 
  PlusCircle, 
  AlertTriangle, 
  TrendingUp, 
  Filter, 
  RefreshCw,
  PauseCircle,
  PlayCircle
} from 'lucide-react';
import { subDays } from 'date-fns';

export default function ReplenishmentOverview() {
  const { products, stock, transactions, vendors, toggleDiscontinued, showToast } = useStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterVendor, setFilterVendor] = useState('');
  const [hideDiscontinued, setHideDiscontinued] = useState(false);
  const [onlyNeedReplenish, setOnlyNeedReplenish] = useState(false);
  const [copied, setCopied] = useState(false);

  // Vendor map for lookup
  const vendorMap = useMemo(() => {
    const map = new Map<string, string>();
    vendors.forEach(v => map.set(v.vendor_id, v.vendor_name || v.name || v.vendor_id));
    return map;
  }, [vendors]);

  const vendorList = useMemo(() => {
    const map = new Map<string, string>();
    vendors.forEach(v => {
      if (v.vendor_id) map.set(v.vendor_id, v.vendor_name || v.name || v.vendor_id);
    });
    products.forEach(p => {
      if (p.vendor_id && !map.has(p.vendor_id)) {
        map.set(p.vendor_id, vendorMap.get(p.vendor_id) || p.vendor_id);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'zh-HK'));
  }, [vendors, products, vendorMap]);

  // Current stock per product_id
  const stockMap = useMemo(() => {
    const map = new Map<string, number>();
    stock.forEach(s => {
      const pid = s.product_id;
      if (pid) {
        map.set(pid, (map.get(pid) || 0) + (Number(s.quantity) || 0));
      }
    });
    return map;
  }, [stock]);

  // Transaction sales velocity analysis
  const salesStats = useMemo(() => {
    const thirtyDaysAgo = subDays(new Date(), 30).getTime();
    const sixtyDaysAgo = subDays(new Date(), 60).getTime();

    const stats = new Map<string, {
      totalSold: number;
      sold30d: number;
      sold60d: number;
      txCount: number;
      lastSoldDate?: string;
    }>();

    transactions.forEach(t => {
      // Outbound transactions
      const isOutbound = t.type === 'stock_out' || (t.type && t.type.startsWith('stock_out ')) || t.online_order_id || (t.platform && t.platform.trim() !== '');
      if (!isOutbound && t.type !== 'adjust') return;
      if (t.type === 'stock_in') return;

      const pid = t.product_id;
      if (!pid) return;

      const qty = Math.abs(Number(t.quantity) || 0);
      const stat = stats.get(pid) || { totalSold: 0, sold30d: 0, sold60d: 0, txCount: 0 };

      stat.totalSold += qty;
      stat.txCount += 1;

      if (t.date) {
        let dStr = String(t.date);
        if (!dStr.includes('T')) dStr = dStr.replace(/-/g, '/');
        const tTime = new Date(dStr).getTime();
        if (!isNaN(tTime)) {
          if (tTime >= thirtyDaysAgo) {
            stat.sold30d += qty;
          }
          if (tTime >= sixtyDaysAgo) {
            stat.sold60d += qty;
          }
        }
      }

      stats.set(pid, stat);
    });

    return stats;
  }, [transactions]);

  // Calculate replenishment urgency and ranking for each product
  const rankedItems = useMemo(() => {
    // Filter out products that are marked as out-of-stock or discontinued
    const activeProducts = products.filter(p => !p.is_out_of_stock && !p.is_discontinued && p.status !== '暫時缺貨' && p.status !== '暫時停產' && p.status !== 'out_of_stock' && p.status !== 'discontinued');

    const items = activeProducts.map(p => {
      const currentStock = stockMap.get(p.product_id) || 0;
      const stat = salesStats.get(p.product_id) || { totalSold: 0, sold30d: 0, sold60d: 0, txCount: 0 };
      
      const rawMin = p.min_stock;
      const alertThreshold = (typeof rawMin === 'number' && !isNaN(rawMin)) 
        ? rawMin 
        : (rawMin !== undefined && rawMin !== null && (rawMin as any) !== '' && !isNaN(Number(rawMin))) 
          ? Number(rawMin) 
          : 5;

      const isOutOfStock = currentStock <= 0;
      const isLowStock = currentStock <= alertThreshold;

      // Replenishment Urgency Score based on transaction sales frequency
      let score = 0;
      if (isOutOfStock) {
        score = 10000 + (stat.sold30d * 50) + (stat.totalSold * 10) + (stat.txCount * 5);
      } else if (isLowStock) {
        const gap = alertThreshold - currentStock;
        score = 5000 + (gap * 100) + (stat.sold30d * 30) + (stat.totalSold * 5);
      } else {
        // Healthy stock, rank by sales velocity relative to stock
        score = (stat.sold30d * 10) + stat.totalSold - (currentStock * 0.5);
      }

      const rankScore = score;

      let urgencyLevel: 'critical' | 'warning' | 'normal' = 'normal';
      if (isOutOfStock && (stat.totalSold > 0 || stat.sold30d > 0)) {
        urgencyLevel = 'critical';
      } else if (isLowStock) {
        urgencyLevel = 'warning';
      }

      return {
        product: p,
        currentStock,
        costPrice: Number(p.cost_price) || 0,
        sold30d: stat.sold30d,
        totalSold: stat.totalSold,
        txCount: stat.txCount,
        alertThreshold,
        isOutOfStock,
        isLowStock,
        urgencyLevel,
        score,
        rankScore
      };
    });

    // Sort descending by rankScore
    return items.sort((a, b) => b.rankScore - a.rankScore);
  }, [products, stockMap, salesStats]);

  // Filter the ranked items
  const filteredItems = useMemo(() => {
    return rankedItems.filter(item => {
      const p = item.product;
      
      // Search
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matches = 
          p.name.toLowerCase().includes(q) ||
          (p.specification && p.specification.toLowerCase().includes(q)) ||
          p.product_id.toLowerCase().includes(q) ||
          (p.barcode && String(p.barcode).toLowerCase().includes(q));
        if (!matches) return false;
      }

      // Vendor
      if (filterVendor && p.vendor_id !== filterVendor) return false;

      // Discontinued Filter
      if (hideDiscontinued && item.isDiscontinued) return false;

      // Only items that need replenishment
      if (onlyNeedReplenish && !item.isOutOfStock && !item.isLowStock && item.sold30d === 0) return false;

      return true;
    });
  }, [rankedItems, searchTerm, filterVendor, hideDiscontinued, onlyNeedReplenish]);

  // Copy replenishment table to clipboard (TSV formatted for Excel/Sheets or Line)
  const handleCopyList = () => {
    if (filteredItems.length === 0) {
      showToast('⚠️ 目前清單無商品可複製');
      return;
    }

    const lines = [
      ['建議排名', '商品名稱', '規格', '目前庫存', '進價', '供應商', '30天銷量', '備註'].join('\t')
    ];

    filteredItems.forEach((item, idx) => {
      const p = item.product;
      const vendorName = vendorMap.get(p.vendor_id) || p.vendor_id || '未指定';
      const statusNote = item.isOutOfStock 
        ? '【缺貨急需補貨】' 
        : item.isLowStock 
          ? '【低於警示量】' 
          : '正常';

      lines.push([
        `#${idx + 1}`,
        p.name,
        p.specification || '無',
        `${item.currentStock} ${p.unit || ''}`,
        `$${item.costPrice}`,
        vendorName,
        `${item.sold30d}`,
        statusNote
      ].join('\t'));
    });

    const textToCopy = lines.join('\n');
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      showToast(`📋 已複製 ${filteredItems.length} 筆補貨商品清單（可直接貼入試算表或通訊軟體）！`);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {
      showToast('❌ 複製失敗，請手動選取');
    });
  };

  return (
    <div className="flex flex-col h-full bg-[#0b1120] text-slate-100">
      {/* Control Bar */}
      <div className="p-4 glass-panel border-x-0 border-t-0 bg-[#0f172a]/95 sticky top-0 z-10 space-y-3">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
          <div>
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              補貨概覽與建議排名
              <span className="text-xs font-normal text-slate-400 font-mono">
                (共 {filteredItems.length} 項)
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              依據歷史與近 30 天出貨交易紀錄智能計算補貨急迫度，方便訂單出貨時順便向廠商訂貨補庫存。
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleCopyList}
              className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-500/20 active:scale-95 flex items-center gap-1.5 cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? '已複製！' : '複製補貨清單'}</span>
            </button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 gap-2">
          <div className="relative sm:col-span-2">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="搜尋商品名稱、規格或條碼..."
              className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-slate-400 outline-none focus:border-emerald-400 transition-all"
            />
          </div>

          <div>
            <select
              value={filterVendor}
              onChange={(e) => setFilterVendor(e.target.value)}
              className="w-full py-2 px-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white outline-none focus:border-emerald-400 cursor-pointer appearance-none"
            >
              <option value="" className="bg-slate-900">所有供應商 (補貨對象)</option>
              {vendorList.map(v => (
                <option key={v.id} value={v.id} className="bg-slate-900">
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-slate-300 cursor-pointer hover:bg-white/10 transition-all flex-1 select-none">
              <input
                type="checkbox"
                checked={hideDiscontinued}
                onChange={(e) => setHideDiscontinued(e.target.checked)}
                className="w-4 h-4 rounded accent-emerald-500"
              />
              <span className="truncate">隱藏停產</span>
            </label>

            <label className="flex items-center gap-1.5 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-slate-300 cursor-pointer hover:bg-white/10 transition-all flex-1 select-none">
              <input
                type="checkbox"
                checked={onlyNeedReplenish}
                onChange={(e) => setOnlyNeedReplenish(e.target.checked)}
                className="w-4 h-4 rounded accent-emerald-500"
              />
              <span className="truncate">僅需補貨</span>
            </label>
          </div>
        </div>
      </div>

      {/* High-Legibility Pure Data Table */}
      <div className="flex-1 overflow-auto p-4">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <AlertTriangle className="w-10 h-10 mb-2 opacity-50 text-amber-400" />
            <p className="text-sm font-medium">沒有符合條件的補貨商品</p>
          </div>
        ) : (
          <div className="border border-white/10 rounded-2xl overflow-hidden shadow-xl bg-slate-900/60 backdrop-blur-md">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-800/80 text-slate-300 border-b border-white/10 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3.5 px-4 w-20 text-center">建議排名</th>
                    <th className="py-3.5 px-4">商品名稱</th>
                    <th className="py-3.5 px-4">規格</th>
                    <th className="py-3.5 px-4 text-center">目前數量</th>
                    <th className="py-3.5 px-4 text-right">進價 (成本)</th>
                    <th className="py-3.5 px-4 text-center">狀態</th>
                    <th className="py-3.5 px-4 text-center">近30天銷量 / 總銷量</th>
                    <th className="py-3.5 px-4 text-center">快速操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-medium">
                  {filteredItems.map((item, index) => {
                    const p = item.product;
                    const rank = index + 1;
                    const isTop3 = rank <= 3;
                    const isTop10 = rank <= 10;

                    return (
                      <tr 
                        key={p.product_id}
                        className={`hover:bg-white/[0.04] transition-colors ${
                          item.isDiscontinued 
                            ? 'bg-amber-950/20 text-slate-300' 
                            : item.isOutOfStock 
                              ? 'bg-red-950/30' 
                              : item.isLowStock 
                                ? 'bg-orange-950/20' 
                                : ''
                        }`}
                      >
                        {/* 建議排名 */}
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center">
                            <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-black font-mono shadow-sm ${
                              isTop3
                                ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-400/40'
                                : isTop10
                                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                                  : 'bg-white/5 text-slate-400 border border-white/10'
                            }`}>
                              {rank}
                            </span>
                          </div>
                        </td>

                        {/* 商品名稱 */}
                        <td className="py-3 px-4">
                          <div className="font-bold text-white text-sm flex items-center gap-1.5 flex-wrap">
                            <span>{p.name}</span>
                            {p.brand && (
                              <span className="text-[10px] font-normal px-1.5 py-0.5 bg-white/10 rounded text-slate-300">
                                {p.brand}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                            {p.barcode ? `條碼: ${p.barcode}` : `ID: ${p.product_id}`}
                            {p.vendor_id && ` | 廠商: ${vendorMap.get(p.vendor_id) || p.vendor_id}`}
                          </div>
                        </td>

                        {/* 規格 */}
                        <td className="py-3 px-4 text-slate-200">
                          {p.specification ? (
                            <span className="inline-block px-2 py-0.5 bg-white/10 rounded-md text-xs font-mono text-sky-200 border border-white/5">
                              {p.specification}
                            </span>
                          ) : (
                            <span className="text-slate-500 italic">-</span>
                          )}
                        </td>

                        {/* 目前數量 */}
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold font-mono text-xs border ${
                            item.isOutOfStock
                              ? 'bg-red-500/20 text-red-300 border-red-500/40 font-black'
                              : item.isLowStock
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                          }`}>
                            {item.currentStock} {p.unit || '個'}
                          </span>
                        </td>

                        {/* 進價 */}
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400 text-sm">
                          {item.costPrice > 0 ? (
                            `$${item.costPrice}`
                          ) : (
                            <span className="text-slate-500 text-xs font-normal">未設定</span>
                          )}
                        </td>

                        {/* 狀態 / 停產顯示 */}
                        <td className="py-3 px-4 text-center">
                          {item.isDiscontinued ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-md text-[11px] font-bold">
                              <PauseCircle className="w-3.5 h-3.5 text-amber-400" />
                              暫時停產
                            </span>
                          ) : item.isOutOfStock ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-500/20 text-red-300 border border-red-500/40 rounded-md text-[11px] font-bold">
                              缺貨
                            </span>
                          ) : item.isLowStock ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-500/20 text-orange-300 border border-orange-500/40 rounded-md text-[11px] font-bold">
                              庫存偏低
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-md text-[11px] font-bold">
                              正常供應
                            </span>
                          )}
                        </td>

                        {/* 銷量依據 (交易紀錄) */}
                        <td className="py-3 px-4 text-center">
                          <div className="font-mono text-xs text-white">
                            30天: <span className="font-bold text-sky-400">{item.sold30d}</span>
                            <span className="text-slate-500 mx-1">/</span>
                            總計: <span className="text-slate-300">{item.totalSold}</span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            出貨 {item.txCount} 次
                          </div>
                        </td>

                        {/* 快速操作 */}
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <Link
                              to={`/manage?type=stock_in&pid=${p.product_id}`}
                              className="px-2.5 py-1.5 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 rounded-lg text-xs font-bold transition-all hover:scale-105 active:scale-95 flex items-center gap-1"
                              title="為此商品進行進貨"
                            >
                              <PlusCircle className="w-3.5 h-3.5" />
                              進貨
                            </Link>

                            <button
                              onClick={() => toggleDiscontinued(p.product_id)}
                              className={`p-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                                item.isDiscontinued
                                  ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/30'
                                  : 'bg-white/5 hover:bg-white/10 text-slate-400 hover:text-amber-300 border-white/10'
                              }`}
                              title={item.isDiscontinued ? '點擊恢復正常供應' : '點擊標記為暫時停產（廠商生產中）'}
                            >
                              {item.isDiscontinued ? (
                                <PlayCircle className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <PauseCircle className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
