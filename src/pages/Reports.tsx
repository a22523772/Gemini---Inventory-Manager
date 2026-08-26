import { useState, useMemo, useEffect } from 'react';
import { useStore, getProductStatusInfo, ProductStatusInfo } from '../store/useStore';
import { Link } from 'react-router-dom';
import { 
  BarChart2, List, AlertTriangle, Clock, 
  TrendingUp, TrendingDown, DollarSign, PackageX, 
  PieChart as PieChartIcon, Ban, Search, Download,
  CheckCircle2, RefreshCw, Layers, Edit3, ArrowRight
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend, LabelList
} from 'recharts';
import { format, differenceInDays, subDays } from 'date-fns';
import { normalizeDateToYMD } from './Transactions';

// Suppress Recharts defaultProps deprecation warning in React 18
const originalWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('defaultProps')) return;
  originalWarn(...args);
};

const originalError = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && (args[0].includes('defaultProps') || args[0].includes('ResponsiveContainer'))) return;
  originalError(...args);
};

type TabType = 'dashboard' | 'list' | 'paused';
type PausedFilterStatus = 'all';

export default function Reports() {
  const { 
    products, 
    stock, 
    transactions, 
    vendors, 
    expiryThreshold, 
    reportsPageState, 
    setReportsPageState,
    setProductAvailability
  } = useStore();

  const [activeTab, setActiveTab] = useState<TabType>(reportsPageState.activeTab || 'dashboard');
  const [pausedFilterStatus, setPausedFilterStatus] = useState<PausedFilterStatus>('all');
  const [pausedSearchTerm, setPausedSearchTerm] = useState<string>(reportsPageState.pausedSearchTerm || '');
  const [pausedVendorFilter, setPausedVendorFilter] = useState<string>('all');

  const now = new Date();

  useEffect(() => {
    setReportsPageState({ 
      activeTab, 
      pausedFilterStatus: 'all', 
      pausedSearchTerm 
    });
  }, [activeTab, pausedSearchTerm, setReportsPageState]);

  // 1. Data Processing
  const reportData = useMemo(() => {
    // Pre-build O(1) maps
    const productMap = new Map(products.map(p => [p.product_id, p]));
    const vendorMap = new Map(vendors.map(v => [v.vendor_id, v.vendor_name]));

    const productTotalStock: Record<string, number> = {};
    stock.forEach(s => {
      productTotalStock[s.product_id] = (productTotalStock[s.product_id] || 0) + s.quantity;
    });

    // Separate active products vs paused (temporarily out of stock / discontinued) products
    const activeProducts: any[] = [];
    const pausedProductsList: any[] = [];

    products.forEach(p => {
      const statusInfo = getProductStatusInfo(p);
      const totalQty = productTotalStock[p.product_id] || 0;
      if (statusInfo.isPaused) {
        pausedProductsList.push({
          product: p,
          statusInfo,
          totalStock: totalQty,
          stockValue: (Number(p.cost_price) || 0) * totalQty,
          vendorName: (p.vendor_id && vendorMap.get(p.vendor_id)) || '未指定供應商'
        });
      } else {
        activeProducts.push(p);
      }
    });

    const activeProductMap = new Map(activeProducts.map(p => [p.product_id, p]));

    // --- Active Products Calculations (For Dashboard & List Views) ---
    let totalInventoryValue = 0;
    let totalExpiredLoss = 0;
    const expiredList: any[] = [];
    const soonToExpireList: any[] = [];
    const lowStockByVendor: Record<string, any[]> = {};

    // Process Stock Details for ACTIVE products only
    stock.forEach(s => {
      const product = activeProductMap.get(s.product_id);
      if (!product) return; // Skip paused/discontinued products from active calculations

      const value = (product.cost_price || 0) * s.quantity;
      totalInventoryValue += value;

      // Expiry Checks
      if (s.expiry_date) {
        const expiryDate = new Date(s.expiry_date);
        const diffDays = differenceInDays(expiryDate, now);
        
        if (diffDays < 0 && s.quantity > 0) {
          totalExpiredLoss += value;
          expiredList.push({ ...s, product, diffDays });
        } else if (diffDays >= 0 && diffDays <= expiryThreshold && s.quantity > 0) {
          soonToExpireList.push({ ...s, product, diffDays });
        }
      }
    });

    // Low Stock Check (evaluate ACTIVE products only)
    activeProducts.forEach(product => {
      const totalQty = productTotalStock[product.product_id] || 0;

      const rawMin = product.min_stock;
      const safeStock = (typeof rawMin === 'number' && !isNaN(rawMin)) 
        ? rawMin 
        : (rawMin !== undefined && rawMin !== null && (rawMin as any) !== '' && !isNaN(Number(rawMin)))
          ? Number(rawMin)
          : 5;

      if (totalQty <= safeStock) {
        const vendorId = product.vendor_id || 'unknown';
        if (!lowStockByVendor[vendorId]) lowStockByVendor[vendorId] = [];
        lowStockByVendor[vendorId].push({ 
          product, 
          quantity: totalQty,
          safeStock 
        });
      }
    });

    // Group Low Stock by Vendor names
    const lowStockGrouped = Object.keys(lowStockByVendor).map(vid => {
      const vendorName = vendorMap.get(vid) || '未指定供應商';
      return {
        vendorName,
        items: lowStockByVendor[vid]
      };
    });

    // Analyze Transactions for Hot/Stagnant Items (last 30 days) on ACTIVE products
    const thirtyDaysAgoStr = format(subDays(now, 30), 'yyyy-MM-dd');
    const recentOuts = transactions.filter(t => {
      const isOut = t.type === 'stock_out' || (t.type && t.type.startsWith('stock_out'));
      if (!isOut) return false;
      const txYMD = normalizeDateToYMD(t.date);
      return txYMD && txYMD >= thirtyDaysAgoStr;
    });

    const productSales: Record<string, number> = {};
    recentOuts.forEach(t => {
      productSales[t.product_id] = (productSales[t.product_id] || 0) + t.quantity;
    });

    const hotItems = Object.keys(productSales)
      .map(pid => ({
        product: activeProductMap.get(pid),
        sales: productSales[pid]
      }))
      .filter((item): item is { product: any; sales: number } => Boolean(item.product))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 10);

    // Stagnant: Active Items in stock that have NO sales in last 30 days
    const stagnantItems = activeProducts
      .filter(p => (productTotalStock[p.product_id] || 0) > 0 && !productSales[p.product_id])
      .map(p => ({
        product: p,
        stock: productTotalStock[p.product_id] || 0
      }))
      .sort((a, b) => b.stock - a.stock)
      .slice(0, 10);

    // --- Paused Products Report Statistics ---
    let pausedTotalStock = 0;
    let pausedTotalValue = 0;
    let pausedOutOfStockCount = 0;
    let pausedDiscontinuedCount = 0;
    const pausedVendorSet = new Set<string>();

    pausedProductsList.forEach(item => {
      pausedTotalStock += item.totalStock;
      pausedTotalValue += item.stockValue;
      if (item.statusInfo.status === 'out_of_stock') {
        pausedOutOfStockCount++;
      } else if (item.statusInfo.status === 'discontinued') {
        pausedDiscontinuedCount++;
      }
      if (item.product.vendor_id) {
        pausedVendorSet.add(item.product.vendor_id);
      }
    });

    // Attach recent 30-day sales count to paused products list
    pausedProductsList.forEach(item => {
      item.recentSales = productSales[item.product.product_id] || 0;
    });

    return {
      activeProductsCount: activeProducts.length,
      pausedProductsCount: pausedProductsList.length,
      pausedProductsList,
      pausedTotalStock,
      pausedTotalValue,
      pausedOutOfStockCount,
      pausedDiscontinuedCount,
      pausedVendorsCount: pausedVendorSet.size,
      totalInventoryValue,
      totalExpiredLoss,
      expiredList,
      soonToExpireList,
      lowStockGrouped,
      hotItems,
      stagnantItems,
      stockValueDistribution: [
        { name: '正常庫存價值', value: totalInventoryValue - totalExpiredLoss, fill: '#10b981' },
        { name: '過期損失金額', value: totalExpiredLoss, fill: '#ef4444' }
      ]
    };
  }, [stock, products, transactions, vendors, expiryThreshold]);

  // Filtered list for the Dedicated Paused Report
  const filteredPausedList = useMemo(() => {
    return reportData.pausedProductsList.filter(item => {
      // 1. Status Filter
      if (pausedFilterStatus !== 'all' && item.statusInfo.status !== pausedFilterStatus) {
        return false;
      }
      // 2. Vendor Filter
      if (pausedVendorFilter !== 'all' && item.product.vendor_id !== pausedVendorFilter) {
        return false;
      }
      // 3. Search Term
      if (pausedSearchTerm.trim()) {
        const query = pausedSearchTerm.trim().toLowerCase();
        const p = item.product;
        const matchName = (p.name || '').toLowerCase().includes(query);
        const matchId = (p.product_id || '').toLowerCase().includes(query);
        const matchBarcode = (p.barcode || '').toLowerCase().includes(query);
        const matchSpec = (p.specification || '').toLowerCase().includes(query);
        const matchBrand = (p.brand || '').toLowerCase().includes(query);
        const matchCategory = (p.category || '').toLowerCase().includes(query);
        if (!matchName && !matchId && !matchBarcode && !matchSpec && !matchBrand && !matchCategory) {
          return false;
        }
      }
      return true;
    });
  }, [reportData.pausedProductsList, pausedFilterStatus, pausedVendorFilter, pausedSearchTerm]);

  // Export CSV for Paused Products Report
  const handleExportPausedCsv = () => {
    const headers = ['商品編號', '商品名稱', '狀態', '品牌', '分類', '規格', '單位', '庫存數量', '成本單價', '庫存殘值', '供應商', '近30天出貨量'];
    const rows = filteredPausedList.map(item => [
      `"${item.product.product_id || ''}"`,
      `"${(item.product.name || '').replace(/"/g, '""')}"`,
      `"${item.statusInfo.label}"`,
      `"${item.product.brand || ''}"`,
      `"${item.product.category || ''}"`,
      `"${item.product.specification || ''}"`,
      `"${item.product.unit || ''}"`,
      item.totalStock,
      item.product.cost_price || 0,
      item.stockValue,
      `"${item.vendorName || ''}"`,
      item.recentSales || 0
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `暫時缺貨專報_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // --- Render Chart View (Standard Active Products) ---
  const renderDashboard = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="glass-panel p-4 rounded-xl border border-[var(--color-accent-blue)]/30">
          <div className="flex items-center space-x-2 mb-2 text-[var(--color-text-dim)]">
            <DollarSign className="w-5 h-5 text-emerald-400" />
            <span className="text-xs uppercase font-bold tracking-wider">在庫正常總價值</span>
          </div>
          <div className="text-2xl font-bold text-white">${reportData.totalInventoryValue.toLocaleString()}</div>
          <div className="text-[11px] text-zinc-400 mt-1">有效品項共 {reportData.activeProductsCount} 件</div>
        </div>
        <div className="glass-panel p-4 rounded-xl border border-red-500/30">
          <div className="flex items-center space-x-2 mb-2 text-[var(--color-text-dim)]">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <span className="text-xs uppercase font-bold tracking-wider">過期損失估計</span>
          </div>
          <div className="text-2xl font-bold text-red-400">${reportData.totalExpiredLoss.toLocaleString()}</div>
          <div className="text-[11px] text-red-400/80 mt-1">共 {reportData.expiredList.length} 批次過期</div>
        </div>
      </div>

      {reportData.totalInventoryValue > 0 && (
        <div className="glass-panel p-4 rounded-xl flex flex-col items-start justify-start w-full overflow-hidden">
          <h3 className="text-sm font-bold text-[var(--color-text-main)] mb-4 flex items-center w-full">
            <PieChartIcon className="w-4 h-4 mr-2 text-[var(--color-accent-blue)]"/> 資金健康度比例 (正常商品)
          </h3>
          <div className="w-full h-[200px]">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={reportData.stockValueDistribution}
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {reportData.stockValueDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip 
                  formatter={(value: number) => `$${value.toLocaleString()}`}
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', color: '#fff' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="glass-panel p-4 rounded-xl flex flex-col items-start justify-start w-full overflow-hidden">
        <h3 className="text-sm font-bold text-[var(--color-text-main)] mb-4 flex items-center w-full">
          <TrendingUp className="w-4 h-4 mr-2 text-emerald-400"/> 近 30 天熱銷排行 (出貨量)
        </h3>
        <div className="w-full h-[280px]">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={reportData.hotItems} layout="vertical" margin={{ top: 15, right: 30, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
              <XAxis type="number" stroke="#64748b" hide />
              <YAxis dataKey="product.name" type="category" hide />
              <Tooltip 
                cursor={{fill: 'rgba(255,255,255,0.1)'}}
                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', color: '#fff' }}
                formatter={(value: number) => [`${value} 件`, '出貨量']}
              />
              <Bar dataKey="sales" fill="#10b981" radius={[0, 4, 4, 0]} barSize={16}>
                <LabelList dataKey="product.name" position="top" fill="#ffffff" fontSize={11} offset={4} style={{fontWeight: '500'}} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );

  // --- Render List View (Standard Active Products) ---
  const renderList = () => (
    <div className="space-y-6">
      {/* Expiry Alerts */}
      <section>
        <h3 className="text-lg font-bold text-white mb-3 flex items-center">
          <Clock className="w-5 h-5 mr-2 text-red-400" />
          過期與即將到期警示 (正常供應商品)
        </h3>
        <div className="space-y-3">
          {reportData.expiredList.length === 0 && reportData.soonToExpireList.length === 0 && (
            <div className="text-[var(--color-text-dim)] text-sm italic p-4 glass-panel rounded-xl text-center">
              目前無過期或即將到期商品。
            </div>
          )}
          
          {reportData.expiredList.map((item, idx) => (
            <div key={`exp-${idx}`} className="glass-panel p-3 rounded-xl border border-red-500/50 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-red-500"></div>
              <div className="pl-2">
                <div className="flex justify-between items-start">
                  <h4 className="font-bold text-red-400 text-sm">{item.product?.name || '未知商品'}</h4>
                  <span className="bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded-full border border-red-500/30">已過期</span>
                </div>
                <div className="mt-1 text-xs text-[var(--color-text-dim)] space-y-0.5">
                  <p>數量: <span className="text-white">{item.quantity} {item.product?.unit}</span> | 批號: {item.stock_id?.split('_').pop() || '-'}</p>
                  <p>到期日: <span className="text-red-400 font-bold">{item.expiry_date}</span></p>
                  <p>損失估計: <span className="text-white">${((item.product?.cost_price||0) * item.quantity).toLocaleString()}</span></p>
                </div>
              </div>
            </div>
          ))}

          {reportData.soonToExpireList.map((item, idx) => (
            <div key={`soon-${idx}`} className="glass-panel p-3 rounded-xl border border-[var(--color-accent-orange)]/50 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-1 h-full bg-[var(--color-accent-orange)]"></div>
              <div className="pl-2">
                <div className="flex justify-between items-start">
                  <h4 className="font-bold text-[var(--color-accent-orange)] text-sm">{item.product?.name || '未知商品'}</h4>
                  <span className="bg-[var(--color-accent-orange)]/20 text-[var(--color-accent-orange)] text-xs px-2 py-0.5 rounded-full border border-[var(--color-accent-orange)]/30">剩 {item.diffDays} 天</span>
                </div>
                <div className="mt-1 text-xs text-[var(--color-text-dim)] space-y-0.5">
                  <p>數量: <span className="text-white">{item.quantity} {item.product?.unit}</span> | 批號: {item.stock_id?.split('_').pop() || '-'}</p>
                  <p>到期日: {item.expiry_date}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Low Stock (Grouped by Vendor) */}
      <section>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-bold text-white flex items-center">
            <PackageX className="w-5 h-5 mr-2 text-[var(--color-accent-blue)]" />
            低庫存待採購清單 (依供應商)
          </h3>
          <span className="text-xs text-zinc-400">已自動排除暫時缺貨/停產</span>
        </div>
        
        {reportData.lowStockGrouped.length === 0 ? (
          <div className="text-[var(--color-text-dim)] text-sm italic p-4 glass-panel rounded-xl text-center">所有在庫商品庫存安全，無需緊急採購。</div>
        ) : (
          <div className="space-y-4">
            {reportData.lowStockGrouped.map((group, gIdx) => (
              <div key={gIdx} className="glass-panel rounded-xl overflow-hidden border border-white/10">
                <div className="bg-white/5 px-3 py-2 border-b border-white/10 font-bold text-sm text-[var(--color-accent-blue)] flex justify-between items-center">
                  <span>供應商：{group.vendorName}</span>
                  <span className="text-xs text-zinc-400 font-normal">{group.items.length} 項待補</span>
                </div>
                <div className="divide-y divide-white/5">
                  {group.items.map((item, iDx) => (
                    <div key={iDx} className="p-3">
                      <div className="flex justify-between items-start gap-2">
                        <span className="font-medium text-sm text-white break-words flex-1 min-w-0">{item.product?.name || '未知商品'}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 font-bold ${
                          item.quantity === 0
                            ? 'bg-red-500/30 text-red-300 border border-red-500/50 font-black'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}>
                          {item.quantity === 0 ? '目前缺貨 (0' : `目前庫存 ${item.quantity}`} {item.product?.unit || '個'})
                        </span>
                      </div>
                      <div className="text-xs text-[var(--color-text-dim)] mt-1 flex items-center justify-between">
                        <span>安全庫存: <strong className="text-white font-mono font-bold">{item.safeStock}</strong> {item.product?.unit || '個'}</span>
                        {item.product?.product_id && (
                          <Link 
                            to={`/manage?type=stock_in&pid=${item.product.product_id}`}
                            className="text-[11px] bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 px-2.5 py-1 rounded transition-all font-bold"
                          >
                            去補貨
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Stagnant Goods */}
      <section>
        <h3 className="text-lg font-bold text-white mb-3 flex items-center">
          <TrendingDown className="w-5 h-5 mr-2 text-zinc-400" />
          呆滯品分析 (正常商品 近 30 天零出貨)
        </h3>
        <div className="glass-panel rounded-xl overflow-hidden border border-white/10">
          {reportData.stagnantItems.length === 0 ? (
            <div className="text-[var(--color-text-dim)] text-sm italic p-4 text-center">近期商品流動良好。</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-white/5 text-[var(--color-text-dim)] text-xs uppercase">
                  <tr>
                    <th className="px-4 py-2 font-medium">商品名稱</th>
                    <th className="px-4 py-2 font-medium">積壓數量</th>
                    <th className="px-4 py-2 font-medium">資金估計</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {reportData.stagnantItems.map((item, idx) => {
                    const value = (item.product?.cost_price || 0) * item.stock;
                    return (
                      <tr key={idx} className="hover:bg-white/5">
                        <td className="px-4 py-3 text-white text-xs whitespace-normal break-words min-w-[120px]">{item.product?.name || '未知商品'}</td>
                        <td className="px-4 py-3 text-zinc-400">{item.stock} {item.product?.unit}</td>
                        <td className="px-4 py-3 text-red-400">${value.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );

  // --- Render Dedicated Paused Report (暫時缺貨專屬報表) ---
  const renderPausedReport = () => (
    <div className="space-y-6">
      {/* 1. Header Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-panel p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center space-x-1.5 mb-1 text-amber-300">
            <Ban className="w-4 h-4" />
            <span className="text-[11px] font-bold uppercase tracking-wider">專報品項數</span>
          </div>
          <div className="text-xl font-bold text-white">{reportData.pausedProductsCount} <span className="text-xs font-normal text-zinc-400">項</span></div>
          <div className="text-[10px] text-zinc-400 mt-1">暫時缺貨獨立存檔</div>
        </div>

        <div className="glass-panel p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center space-x-1.5 mb-1 text-amber-300">
            <Layers className="w-4 h-4" />
            <span className="text-[11px] font-bold uppercase tracking-wider">殘留在庫件數</span>
          </div>
          <div className="text-xl font-bold text-white">{reportData.pausedTotalStock} <span className="text-xs font-normal text-zinc-400">件</span></div>
          <div className="text-[10px] text-zinc-400 mt-1">倉庫剩餘實體件數</div>
        </div>

        <div className="glass-panel p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
          <div className="flex items-center space-x-1.5 mb-1 text-emerald-300">
            <DollarSign className="w-4 h-4" />
            <span className="text-[11px] font-bold uppercase tracking-wider">殘值佔用金額</span>
          </div>
          <div className="text-xl font-bold text-white">${reportData.pausedTotalValue.toLocaleString()}</div>
          <div className="text-[10px] text-zinc-400 mt-1">積壓成本價值</div>
        </div>

        <div className="glass-panel p-3.5 rounded-xl border border-sky-500/30 bg-sky-500/5">
          <div className="flex items-center space-x-1.5 mb-1 text-sky-300">
            <RefreshCw className="w-4 h-4" />
            <span className="text-[11px] font-bold uppercase tracking-wider">涉及供應商</span>
          </div>
          <div className="text-xl font-bold text-white">{reportData.pausedVendorsCount} <span className="text-xs font-normal text-zinc-400">家</span></div>
          <div className="text-[10px] text-zinc-400 mt-1">廠商追蹤與協調</div>
        </div>
      </div>

      {/* 2. Controls & Search Bar */}
      <div className="glass-panel p-3.5 rounded-xl border border-white/10 space-y-3">
        {/* Status Filter Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-1.5 text-xs text-amber-300 font-bold">
            <span className="px-2.5 py-1 bg-amber-500/20 border border-amber-500/30 rounded-lg">
              🟡 暫時缺貨商品清單 ({reportData.pausedProductsCount})
            </span>
          </div>

          <button
            onClick={handleExportPausedCsv}
            disabled={filteredPausedList.length === 0}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 rounded-lg text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>匯出專報 CSV</span>
          </button>
        </div>

        {/* Search and Vendor Filter */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="搜尋品名、貨號、條碼、規格..."
              value={pausedSearchTerm}
              onChange={(e) => setPausedSearchTerm(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-sky-500"
            />
            {pausedSearchTerm && (
              <button
                onClick={() => setPausedSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white text-xs"
              >
                ✕
              </button>
            )}
          </div>

          <div>
            <select
              value={pausedVendorFilter}
              onChange={(e) => setPausedVendorFilter(e.target.value)}
              className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
            >
              <option value="all">所有供應商 ({vendors.length})</option>
              {vendors.map(v => (
                <option key={v.vendor_id} value={v.vendor_id}>
                  {v.vendor_name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 3. Paused Products List */}
      <div className="space-y-3">
        {filteredPausedList.length === 0 ? (
          <div className="glass-panel p-8 rounded-xl text-center border border-white/10 space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto opacity-80" />
            <p className="text-white font-bold text-sm">目前專屬報表無符合條件之商品</p>
            <p className="text-zinc-400 text-xs">所有暫時缺貨之商品狀態已由系統獨立歸檔。</p>
          </div>
        ) : (
          filteredPausedList.map((item, idx) => {
            const p = item.product;
            return (
              <div 
                key={p.product_id || idx}
                className="glass-panel p-4 rounded-xl border border-amber-500/40 bg-amber-950/10 hover:border-amber-400/60 transition-all"
              >
                {/* Header row */}
                <div className="flex justify-between items-start gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${item.statusInfo.badgeClass}`}>
                        {item.statusInfo.label}
                      </span>
                      <h4 className="font-bold text-white text-base truncate">{p.name || '未命名商品'}</h4>
                    </div>
                    <div className="text-xs text-zinc-400 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                      {p.product_id && <span>編號: <strong className="text-zinc-200">{p.product_id}</strong></span>}
                      {p.barcode && <span>條碼: <strong className="text-zinc-200">{p.barcode}</strong></span>}
                      {p.specification && <span>規格: <strong className="text-zinc-200">{p.specification}</strong></span>}
                      <span>廠商: <strong className="text-sky-300">{item.vendorName}</strong></span>
                    </div>
                  </div>

                  {/* Stock counter */}
                  <div className="text-right shrink-0">
                    <div className="text-xs text-zinc-400">倉庫庫存</div>
                    <div className={`text-lg font-black font-mono ${item.totalStock > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {item.totalStock} <span className="text-xs font-normal text-zinc-300">{p.unit || '件'}</span>
                    </div>
                  </div>
                </div>

                {/* Meta details & financial value */}
                <div className="bg-white/5 rounded-lg p-2.5 my-2.5 text-xs grid grid-cols-3 gap-2 border border-white/5">
                  <div>
                    <span className="text-zinc-400 block text-[10px]">成本單價</span>
                    <span className="font-mono text-zinc-200 font-bold">${(p.cost_price || 0).toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block text-[10px]">庫存殘值</span>
                    <span className="font-mono text-amber-300 font-bold">${item.stockValue.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block text-[10px]">近 30 天出貨</span>
                    <span className="font-mono text-zinc-200 font-bold">{item.recentSales} 件</span>
                  </div>
                </div>

                {/* Action Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/5">
                  {/* Status switcher controls */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setProductAvailability(p.product_id, 'normal')}
                      className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                      title="恢復為正常供應，並重新納入常規報表計算"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>恢復供應</span>
                    </button>
                  </div>

                  {/* Navigation shortcut links */}
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/manage?type=stock_in&pid=${p.product_id}`}
                      className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-xs font-bold transition-all flex items-center gap-1"
                    >
                      <span>調庫存</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                    <Link
                      to={`/add-product?editId=${p.product_id}`}
                      className="p-1 text-zinc-400 hover:text-white rounded hover:bg-white/10 transition-all"
                      title="編輯商品資料"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div className="p-4 pb-20 max-w-2xl mx-auto space-y-6">
      <header className="flex flex-wrap justify-between items-end gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-main)] mb-1">洞察報表</h1>
          <p className="text-sm text-[var(--color-text-dim)]">財務估算、庫存健康度與暫時缺貨專區</p>
        </div>
      </header>

      {/* Tabs */}
      <div className="flex p-1 bg-white/5 rounded-xl border border-white/10">
        <button 
          onClick={() => setActiveTab('dashboard')}
          className={`flex-1 flex items-center justify-center py-2 text-xs sm:text-sm font-bold rounded-lg transition-all ${
            activeTab === 'dashboard' 
              ? 'bg-[var(--color-accent-blue)] text-black shadow-lg shadow-sky-500/20' 
              : 'text-[var(--color-text-dim)] hover:text-white'
          }`}
        >
          <BarChart2 className="w-4 h-4 mr-1.5" /> 指標圖表
        </button>
        <button 
          onClick={() => setActiveTab('list')}
          className={`flex-1 flex items-center justify-center py-2 text-xs sm:text-sm font-bold rounded-lg transition-all ${
            activeTab === 'list' 
              ? 'bg-[var(--color-accent-blue)] text-black shadow-lg shadow-sky-500/20' 
              : 'text-[var(--color-text-dim)] hover:text-white'
          }`}
        >
          <List className="w-4 h-4 mr-1.5" /> 詳細清單
        </button>
        <button 
          onClick={() => setActiveTab('paused')}
          className={`flex-1 flex items-center justify-center py-2 text-xs sm:text-sm font-bold rounded-lg transition-all relative ${
            activeTab === 'paused' 
              ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/30 font-black' 
              : 'text-amber-300 hover:text-white'
          }`}
        >
          <Ban className="w-4 h-4 mr-1.5" /> 
          <span>暫時缺貨專報</span>
          {reportData.pausedProductsCount > 0 && (
            <span className={`ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
              activeTab === 'paused' ? 'bg-black/30 text-black' : 'bg-amber-500/30 text-amber-200'
            }`}>
              {reportData.pausedProductsCount}
            </span>
          )}
        </button>
      </div>

      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'list' && renderList()}
        {activeTab === 'paused' && renderPausedReport()}
      </div>
    </div>
  );
}
