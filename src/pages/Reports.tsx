import { useState, useMemo } from 'react';
import { useStore } from '../store/useStore';
import { 
  BarChart2, List, AlertTriangle, Clock, MapPin, 
  TrendingUp, TrendingDown, DollarSign, PackageX, PieChart as PieChartIcon
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend
} from 'recharts';
import { format, differenceInDays, subDays } from 'date-fns';

type TabType = 'dashboard' | 'list';

export default function Reports() {
  const { products, stock, transactions, vendors, expiryThreshold } = useStore();
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');

  const now = new Date();

  // 1. Data Processing
  const reportData = useMemo(() => {
    let totalInventoryValue = 0;
    let totalExpiredLoss = 0;
    const expiredList: any[] = [];
    const soonToExpireList: any[] = [];
    const lowStockByVendor: Record<string, any[]> = {};
    
    const productTotalStock: Record<string, number> = {};
    stock.forEach(s => {
      productTotalStock[s.product_id] = (productTotalStock[s.product_id] || 0) + s.quantity;
    });

    // Process Stock Details
    stock.forEach(s => {
      const product = products.find(p => p.product_id === s.product_id);
      if (!product) return;

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

    // Low Stock Check (using total stock for the product)
    Object.keys(productTotalStock).forEach(pid => {
      const product = products.find(p => p.product_id === pid);
      if (!product) return;
      const totalQty = productTotalStock[pid];
      if (totalQty > 0 && totalQty <= (product.min_stock || 5)) { // default safe stock 5 if not set
        const vendorId = product.vendor_id || 'unknown';
        if (!lowStockByVendor[vendorId]) lowStockByVendor[vendorId] = [];
        lowStockByVendor[vendorId].push({ product, quantity: totalQty });
      }
    });

    // Group Low Stock by Vendor names
    const lowStockGrouped = Object.keys(lowStockByVendor).map(vid => {
      const vendorName = vendors.find(v => v.vendor_id === vid)?.vendor_name || '未指定供應商';
      return {
        vendorName,
        items: lowStockByVendor[vid]
      };
    });

    // Analyze Transactions for Hot/Stagnant Items (last 30 days)
    const thirtyDaysAgo = subDays(now, 30);
    const recentOuts = transactions.filter(t => 
      t.type === 'stock_out' && new Date(t.date) >= thirtyDaysAgo
    );

    const productSales: Record<string, number> = {};
    recentOuts.forEach(t => {
      productSales[t.product_id] = (productSales[t.product_id] || 0) + t.quantity;
    });

    const hotItems = Object.keys(productSales)
      .map(pid => ({
        product: products.find(p => p.product_id === pid),
        sales: productSales[pid]
      }))
      .filter(item => item.product)
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 10);

    // Stagnant: Items in stock that have NO sales in last 30 days
    // We already computed productTotalStock above

    const stagnantItems = Object.keys(productTotalStock)
      .filter(pid => productTotalStock[pid] > 0 && !productSales[pid])
      .map(pid => ({
        product: products.find(p => p.product_id === pid),
        stock: productTotalStock[pid]
      }))
      .filter(item => item.product)
      .sort((a, b) => b.stock - a.stock)
      .slice(0, 10);

    return {
      totalInventoryValue,
      totalExpiredLoss,
      expiredList,
      soonToExpireList,
      lowStockGrouped,
      hotItems,
      stagnantItems,
      stockValueDistribution: [ // Simple distribution for chart
        { name: '正常庫存價值', value: totalInventoryValue - totalExpiredLoss, fill: '#10b981' },
        { name: '過期損失金額', value: totalExpiredLoss, fill: '#ef4444' }
      ]
    };
  }, [stock, products, transactions, vendors]);

  const COLORS = ['#38bdf8', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  // --- Render Chart View ---
  const renderDashboard = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="glass-panel p-4 rounded-xl border border-[var(--color-accent-blue)]/30">
          <div className="flex items-center space-x-2 mb-2 text-[var(--color-text-dim)]">
            <DollarSign className="w-5 h-5 text-emerald-400" />
            <span className="text-xs uppercase font-bold tracking-wider">庫存總價值</span>
          </div>
          <div className="text-2xl font-bold text-white">${reportData.totalInventoryValue.toLocaleString()}</div>
        </div>
        <div className="glass-panel p-4 rounded-xl border border-red-500/30">
          <div className="flex items-center space-x-2 mb-2 text-[var(--color-text-dim)]">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <span className="text-xs uppercase font-bold tracking-wider">過期品損失估計</span>
          </div>
          <div className="text-2xl font-bold text-red-400">${reportData.totalExpiredLoss.toLocaleString()}</div>
        </div>
      </div>

       {reportData.totalInventoryValue > 0 && (
        <div className="glass-panel p-4 rounded-xl flex flex-col items-start justify-start w-full overflow-hidden">
           <h3 className="text-sm font-bold text-[var(--color-text-main)] mb-4 flex items-center w-full"><PieChartIcon className="w-4 h-4 mr-2 text-[var(--color-accent-blue)]"/> 資金健康度比例</h3>
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
         <h3 className="text-sm font-bold text-[var(--color-text-main)] mb-4 flex items-center w-full"><TrendingUp className="w-4 h-4 mr-2 text-emerald-400"/> 近 30 天熱銷排行 (出貨量)</h3>
         <div className="w-full h-[220px]">
           <ResponsiveContainer width="100%" height={220}>
             <BarChart data={reportData.hotItems} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
               <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
               <XAxis type="number" stroke="#64748b" />
               <YAxis dataKey="product.name" type="category" width={110} stroke="#64748b" tick={{fontSize: 10, fill: '#cbd5e1'}} interval={0} />
               <Tooltip 
                 cursor={{fill: 'rgba(255,255,255,0.1)'}}
                 contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', color: '#fff' }}
                 formatter={(value: number) => [`${value} 件`, '出貨量']}
               />
               <Bar dataKey="sales" fill="#10b981" radius={[0, 4, 4, 0]} />
             </BarChart>
           </ResponsiveContainer>
         </div>
      </div>

    </div>
  );

  // --- Render List View ---
  const renderList = () => (
    <div className="space-y-6">
      
      {/* Expiry Alerts */}
      <section>
        <h3 className="text-lg font-bold text-white mb-3 flex items-center">
          <Clock className="w-5 h-5 mr-2 text-red-400" />
          過期與即將到期警示
        </h3>
        <div className="space-y-3">
          {reportData.expiredList.length === 0 && reportData.soonToExpireList.length === 0 && (
             <div className="text-[var(--color-text-dim)] text-sm italic p-4 glass-panel rounded-xl text-center">目前無過期或即將到期商品。</div>
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
        <h3 className="text-lg font-bold text-white mb-3 flex items-center">
          <PackageX className="w-5 h-5 mr-2 text-[var(--color-accent-blue)]" />
          低庫存待採購清單 (依供應商)
        </h3>
        
        {reportData.lowStockGrouped.length === 0 ? (
          <div className="text-[var(--color-text-dim)] text-sm italic p-4 glass-panel rounded-xl text-center">所有庫存皆安全，無需緊急採購。</div>
        ) : (
          <div className="space-y-4">
            {reportData.lowStockGrouped.map((group, gIdx) => (
              <div key={gIdx} className="glass-panel rounded-xl overflow-hidden">
                <div className="bg-white/5 px-3 py-2 border-b border-white/10 font-bold text-sm text-[var(--color-accent-blue)]">
                  供應商：{group.vendorName}
                </div>
                <div className="divide-y divide-white/5">
                  {group.items.map((item, iDx) => (
                    <div key={iDx} className="p-3">
                      <div className="flex justify-between items-start gap-2">
                         <span className="font-medium text-sm text-white break-words flex-1 min-w-0">{item.product?.name || '未知商品'}</span>
                         <span className="bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded-full shrink-0">總計 {item.quantity} {item.product?.unit}</span>
                      </div>
                      <div className="text-xs text-[var(--color-text-dim)] mt-1">
                        安全庫存: {item.product?.min_stock || 5}
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
          呆滯品分析 (近 30 天零出貨)
        </h3>
        <div className="glass-panel rounded-xl overflow-hidden">
          {reportData.stagnantItems.length === 0 ? (
             <div className="text-[var(--color-text-dim)] text-sm italic p-4 text-center">近期商品流動良好。</div>
          ) : (
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
                )})}
              </tbody>
            </table>
          )}
        </div>
      </section>

    </div>
  );

  return (
    <div className="p-4 pb-20 max-w-lg mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-main)] mb-1">洞察報表</h1>
        <p className="text-sm text-[var(--color-text-dim)]">財務估算與庫存健康分析</p>
      </header>

      {/* Tabs */}
      <div className="flex p-1 bg-white/5 rounded-xl border border-white/10">
        <button 
          onClick={() => setActiveTab('dashboard')}
          className={`flex-1 flex items-center justify-center py-2 text-sm font-bold rounded-lg transition-all ${
            activeTab === 'dashboard' 
              ? 'bg-[var(--color-accent-blue)] text-black shadow-lg shadow-sky-500/20' 
              : 'text-[var(--color-text-dim)] hover:text-white'
          }`}
        >
          <BarChart2 className="w-4 h-4 mr-2" /> 指標圖表
        </button>
        <button 
          onClick={() => setActiveTab('list')}
          className={`flex-1 flex items-center justify-center py-2 text-sm font-bold rounded-lg transition-all ${
            activeTab === 'list' 
              ? 'bg-[var(--color-accent-blue)] text-black shadow-lg shadow-sky-500/20' 
              : 'text-[var(--color-text-dim)] hover:text-white'
          }`}
        >
          <List className="w-4 h-4 mr-2" /> 詳細清單
        </button>
      </div>

      <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
        {activeTab === 'dashboard' ? renderDashboard() : renderList()}
      </div>

    </div>
  );
}
