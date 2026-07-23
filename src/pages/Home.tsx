import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { 
  Package, ArrowDownToLine, ArrowUpFromLine, RefreshCcw, 
  AlertTriangle, BarChart2, Globe, Truck, Trash2, X, PlusCircle, User, Calendar, CheckCircle, Flame, Search, ArrowRight, FileText
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Home() {
  const { 
    products, 
    stock, 
    syncQueue, 
    isLoading, 
    fetchRemoteData, 
    error, 
    enqueueAction, 
    showToast,
    onlineOrders,
    fetchOnlineOrders,
    updateOnlineOrderStatus,
    deleteOnlineOrder
  } = useStore();

  const [isOrderDashboardOpen, setIsOrderDashboardOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [orderErrors, setOrderErrors] = useState<string[]>([]);
  const [orderSearchQuery, setOrderSearchQuery] = useState('');

  // status 是指 訂單的最晚出貨時間。
  // 訂單狀態 要讀取 status 欄位，重新檢查每一筆訂單的狀態，修正狀態並顯示提醒。
  const getDeadlineStatus = (statusStr: string) => {
    if (!statusStr) return { type: 'normal', text: '正常', color: 'text-zinc-300 border border-zinc-700 bg-zinc-800/60 px-3 py-1 font-bold rounded-lg' };
    
    // Check if statusStr is a date or just text like "待處理"
    const deadline = new Date(statusStr);
    if (isNaN(deadline.getTime())) {
      return { type: 'normal', text: statusStr, color: 'text-zinc-300 border border-zinc-700 bg-zinc-800/60 px-3 py-1 font-bold rounded-lg' };
    }

    const now = new Date();
    const diffMs = deadline.getTime() - now.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours < 0) {
      return { 
        type: 'overdue', 
        text: `⚠️ 已逾期 (最晚出貨: ${statusStr})`, 
        color: 'text-white border-2 border-red-500 bg-gradient-to-r from-red-600 to-red-500 font-extrabold px-3 py-1.5 rounded-lg shadow-[0_0_12px_rgba(239,68,68,0.55)] scale-105 transition-all' 
      };
    } else if (diffHours <= 24) {
      return { 
        type: 'duesoon', 
        text: `⏰ 即將到期 (最晚出貨: ${statusStr})`, 
        color: 'text-white border-2 border-amber-500 bg-gradient-to-r from-amber-600 to-amber-500 font-extrabold px-3 py-1.5 rounded-lg shadow-[0_0_12px_rgba(245,158,11,0.55)] animate-pulse scale-105 transition-all' 
      };
    } else {
      return { 
        type: 'normal', 
        text: `📅 最晚出貨: ${statusStr}`, 
        color: 'text-emerald-100 border border-emerald-500 bg-gradient-to-r from-emerald-600/40 to-teal-600/40 font-bold px-3 py-1 rounded-lg shadow-sm' 
      };
    }
  };

  // Helper for specs and price checking
  const getProductSpecification = (pid: string) => {
    const p = products.find(prod => prod.product_id === pid);
    return p ? p.specification : '';
  };

  // If onlineOrders is empty, fallback to mock orders so testing is easy immediately
  const displayOrders = onlineOrders.length > 0 ? onlineOrders.filter(o => o.status !== '已刪除') : [
    { order_id: 'SHP-992381', platform: '蝦皮購物', product_id: 'P1001', product_name: '陶瓷馬克杯 (350ml)', quantity: 2, price: 300, customer_name: '陳大同', status: '2026-07-08 12:00:00', created_at: '2026-07-07 10:00:00', specification: '白色款', shipping_method: '7-11 夾寄' },
    { order_id: 'MOMO-183921', platform: 'MOMO購物網', product_id: 'P1002', product_name: '不鏽鋼保溫瓶 (500ml)', quantity: 1, price: 450, customer_name: '林智慧', status: '2026-07-15 15:30:00', created_at: '2026-07-08 14:20:00', specification: '磨砂黑', shipping_method: '黑貓宅急便' },
    { order_id: 'LINE-772910', platform: 'LINE口袋商店', product_id: 'P1003', product_name: '環保玻璃吸管組', quantity: 5, price: 150, customer_name: '張小玲', status: '2026-07-09 20:00:00', created_at: '2026-07-08 16:50:00', specification: '粉色粗吸管', shipping_method: '全家超取' }
  ];

  // Group displayOrders by order_id
  const groupedOrdersMap: Record<string, any> = {};
  displayOrders.forEach(o => {
    const oid = o.order_id;
    if (!groupedOrdersMap[oid]) {
      groupedOrdersMap[oid] = {
        order_id: oid,
        platform: o.platform || '蝦皮購物',
        customer_name: o.customer_name || '顧客',
        status: o.status || '待處理',
        created_at: o.created_at || '',
        shipping_method: o.shipping_method || '',
        items: []
      };
    }
    groupedOrdersMap[oid].items.push(o);
  });
  
  const groupedOrders = Object.values(groupedOrdersMap);

  // Calculate counts based on deadline status
  const pendingOrdersCount = groupedOrders.length;
  const overdueOrdersCount = groupedOrders.filter(o => getDeadlineStatus(o.status).type === 'overdue').length;
  const shippedOrdersCount = overdueOrdersCount; // Replaced mock indicator with overdue highlight for warning

  // Filter groupedOrders based on orderSearchQuery
  const filteredGroupedOrders = groupedOrders.filter(order => {
    if (!orderSearchQuery.trim()) return true;
    const q = orderSearchQuery.toLowerCase();
    
    // Search in order id, customer name, platform, shipping method
    if (order.order_id.toLowerCase().includes(q)) return true;
    if (order.customer_name.toLowerCase().includes(q)) return true;
    if (order.platform.toLowerCase().includes(q)) return true;
    if (order.shipping_method && order.shipping_method.toLowerCase().includes(q)) return true;

    // Search in items (product_name, specification)
    const matchesItem = order.items.some((item: any) => {
      const pName = (item.product_name || '').toLowerCase();
      const spec = (item.specification || '').toLowerCase();
      return pName.includes(q) || spec.includes(q);
    });
    
    return matchesItem;
  });

  const totalStock = stock.reduce((acc, curr) => acc + curr.quantity, 0);

  // Helper to validate single item health status (stock checks only)
  const checkItemHealth = (item: any) => {
    const product = products.find(p => p.product_id === item.product_id);
    if (!product) return { ok: false, message: '系統找不到此商品的資料，請先新增商品。' };

    const productStock = stock.filter(s => s.product_id === item.product_id);
    const totalQty = productStock.reduce((acc, curr) => acc + curr.quantity, 0);
    if (totalQty < item.quantity) {
      return { ok: false, message: `庫存量不足！需要 ${item.quantity}，但目前在席庫存僅剩 ${totalQty}。` };
    }

    const isExpired = (expiryStr?: string) => {
      if (!expiryStr) return false;
      const exp = new Date(expiryStr);
      if (isNaN(exp.getTime())) return false;
      const today = new Date();
      today.setHours(0,0,0,0);
      return exp < today;
    };
    const validStock = productStock.filter(s => !isExpired(s.expiry_date));
    const totalValid = validStock.reduce((acc, curr) => acc + curr.quantity, 0);
    if (totalValid < item.quantity) {
      return { ok: false, message: `出貨安全阻擋！雖有庫存 ${totalQty}，但皆已過期！可用健康庫存僅剩 ${totalValid}。` };
    }

    return { ok: true, message: '正常' };
  };

  // Helper to validate entire order health (including total cost vs order total price)
  const checkOrderHealth = (order: any) => {
    const errors: string[] = [];
    
    // Compare total cost vs order price
    const totalOrderCost = order.items.reduce((sum: number, item: any) => {
      const p = products.find(prod => prod.product_id === item.product_id);
      const cp = p ? (Number(p.cost_price) || 0) : 0;
      return sum + cp * item.quantity;
    }, 0);

    const orderTotalAmount = Number(order.items[0]?.price) || 0;
    if (totalOrderCost > orderTotalAmount) {
      errors.push(`整單商品進價成本 $${totalOrderCost} 大於訂單總金額 $${orderTotalAmount}（虧本出貨被安全阻擋）！`);
    }

    for (const item of order.items) {
      const itemHealth = checkItemHealth(item);
      if (!itemHealth.ok) {
        errors.push(`【${item.product_name}】 ${itemHealth.message}`);
      }
    }

    return { ok: errors.length === 0, errors };
  };

  const handleShipOrder = async (order: any) => {
    const health = checkOrderHealth(order);

    if (!health.ok) {
      setOrderErrors(health.errors);
      showToast("❌ 訂單出貨阻擋：請檢查異常原因！");
      return;
    }

    try {
      for (const item of order.items) {
        let remainingNeeded = item.quantity;
        const productStock = stock.filter(s => s.product_id === item.product_id);
        
        const isExpired = (expiryStr?: string) => {
          if (!expiryStr) return false;
          const exp = new Date(expiryStr);
          if (isNaN(exp.getTime())) return false;
          const today = new Date();
          today.setHours(0,0,0,0);
          return exp < today;
        };
        const activeStock = productStock.filter(s => !isExpired(s.expiry_date));
        
        const sortedStock = [...activeStock].sort((a, b) => {
          if (!a.expiry_date) return 1;
          if (!b.expiry_date) return -1;
          return a.expiry_date.localeCompare(b.expiry_date);
        });

        for (const entry of sortedStock) {
          if (remainingNeeded <= 0) break;
          const deductQty = Math.min(entry.quantity, remainingNeeded);

          await enqueueAction('stockOut', {
            stock_id: entry.stock_id,
            product_id: item.product_id,
            quantity: deductQty,
            location: entry.location,
            floor: entry.floor,
            area: entry.area,
            expiry_date: entry.expiry_date,
            specification: entry.specification,
            note: `網路訂單出貨: ${order.order_id}`,
          });

          remainingNeeded -= deductQty;
        }
      }

      // 當使用者按出貨後，自動刪除 網路訂單管理看板的紀錄、試算表的紀錄；然後自動執行app的出貨功能。
      await deleteOnlineOrder(order.order_id);
      showToast(`✅ 訂單 ${order.order_id} 出貨成功！已刪除網路訂單與試算表紀錄，並自動扣除庫存。`);
      setOrderErrors([]);
      setSelectedOrder(null);
    } catch (e: any) {
      showToast(`❌ 出貨失敗: ${e.message}`);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    await deleteOnlineOrder(orderId);
    showToast(`🗑️ 訂單 ${orderId} 記錄已刪除。`);
    if (selectedOrder && selectedOrder.order_id === orderId) {
      setSelectedOrder(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Title bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900/90 via-sky-950/40 to-slate-900/90 border border-white/10 p-4 sm:p-6 rounded-2xl shadow-xl backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">營運概覽 & 出貨儀表板</h1>
            <span className="text-[10px] font-extrabold px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              雲端整合中
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">智慧掌控實體與網路通路庫存，確保訂單準時出貨。</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button 
            onClick={fetchRemoteData} 
            disabled={isLoading}
            className="flex items-center gap-2 px-3.5 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-white transition-all active:scale-95 disabled:opacity-50"
          >
            <RefreshCcw className={`w-4 h-4 text-sky-400 ${isLoading ? 'animate-spin' : ''}`} />
            <span>重新整理資料</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-950/50 border border-red-500/40 rounded-2xl flex items-start space-x-3 text-red-200 text-xs sm:text-sm shadow-lg animate-in fade-in">
          <AlertTriangle className="w-5 h-5 shrink-0 text-red-400" />
          <div>
            <p className="font-bold">連線或資料提示：</p>
            <p className="text-red-300 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {syncQueue.length > 0 && (
        <div className="p-4 bg-amber-950/40 border border-amber-500/40 rounded-2xl flex items-center justify-between text-amber-200 text-xs sm:text-sm shadow-lg animate-in fade-in">
          <div className="flex items-center space-x-3">
            <RefreshCcw className="w-5 h-5 shrink-0 animate-pulse text-amber-400" />
            <p>您有 <strong className="text-white underline">{syncQueue.length}</strong> 筆離線操作待同步至雲端試算表。</p>
          </div>
          <button
            onClick={() => useStore.getState().syncData()}
            className="px-3 py-1.5 bg-amber-500 text-slate-950 font-black rounded-lg text-xs hover:bg-amber-400 transition-colors"
          >
            立即同步
          </button>
        </div>
      )}

      {/* Top 4 KPI Metrics Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Link to="/products" className="glass-panel p-4 rounded-2xl border border-white/10 hover:border-sky-500/40 transition-all group flex items-center justify-between">
          <div>
            <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider block">總商品建檔數</span>
            <div className="text-2xl sm:text-3xl font-black text-sky-400 mt-1 font-mono">{products.length} <span className="text-xs text-slate-400 font-normal">品項</span></div>
          </div>
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 group-hover:scale-110 transition-transform">
            <Package className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        </Link>

        <Link to="/products" className="glass-panel p-4 rounded-2xl border border-white/10 hover:border-emerald-500/40 transition-all group flex items-center justify-between">
          <div>
            <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider block">在席總庫存量</span>
            <div className="text-2xl sm:text-3xl font-black text-emerald-400 mt-1 font-mono">{totalStock} <span className="text-xs text-slate-400 font-normal">件</span></div>
          </div>
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
            <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        </Link>

        <div onClick={() => setIsOrderDashboardOpen(true)} className="glass-panel p-4 rounded-2xl border border-indigo-500/30 hover:border-indigo-500/60 transition-all group flex items-center justify-between cursor-pointer">
          <div>
            <span className="text-[10px] sm:text-xs font-bold text-indigo-300 uppercase tracking-wider block">網路待處理訂單</span>
            <div className="text-2xl sm:text-3xl font-black text-indigo-400 mt-1 font-mono">{pendingOrdersCount} <span className="text-xs text-slate-400 font-normal">筆</span></div>
          </div>
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
            <Globe className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        </div>

        <div onClick={() => setIsOrderDashboardOpen(true)} className="glass-panel p-4 rounded-2xl border border-red-500/30 hover:border-red-500/60 transition-all group flex items-center justify-between cursor-pointer">
          <div>
            <span className="text-[10px] sm:text-xs font-bold text-red-300 uppercase tracking-wider block">逾期出貨警示</span>
            <div className={`text-2xl sm:text-3xl font-black mt-1 font-mono ${overdueOrdersCount > 0 ? 'text-red-400 animate-pulse' : 'text-slate-400'}`}>
              {overdueOrdersCount} <span className="text-xs text-slate-400 font-normal">筆</span>
            </div>
          </div>
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 group-hover:scale-110 transition-transform">
            <Flame className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        </div>
      </div>

      {/* Main Grid Section (Desktop Split: Left Order Banner 8 cols, Right Quick Tools 4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Main Column: E-commerce Orders Entry Board */}
        <div className="lg:col-span-8 space-y-4">
          <div className="glass-panel border-indigo-500/30 bg-gradient-to-br from-indigo-950/40 via-slate-900/80 to-slate-950/90 rounded-2xl p-5 sm:p-6 space-y-5 shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

            {/* Banner Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-lg shadow-indigo-500/10 group-hover:scale-105 transition-transform">
                  <Globe className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    網路訂單管理看板
                    <span className="text-[10px] font-extrabold px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded-full border border-indigo-500/30">
                      即時連線
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">跨平台（蝦皮、MOMO等）訂單整合，支援一鍵出貨與自動扣存</p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button 
                  onClick={fetchOnlineOrders}
                  disabled={isLoading}
                  className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 text-indigo-300 border border-indigo-500/30 font-bold rounded-xl flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                  title="重新連線雲端擷取最新訂單"
                >
                  <RefreshCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>整理訂單</span>
                </button>
              </div>
            </div>

            {/* Summary Statistics inside Card */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div 
                onClick={() => setIsOrderDashboardOpen(true)}
                className="bg-black/30 border border-white/5 rounded-xl p-3.5 hover:border-indigo-500/40 transition-all cursor-pointer group/stat"
              >
                <span className="text-[11px] text-slate-400 font-medium block">待處理電商訂單</span>
                <span className="text-2xl font-black text-indigo-400 font-mono mt-1 block group-hover/stat:scale-105 transition-transform">
                  {pendingOrdersCount} <span className="text-xs font-normal text-slate-500">筆</span>
                </span>
              </div>

              <div 
                onClick={() => setIsOrderDashboardOpen(true)}
                className="bg-black/30 border border-white/5 rounded-xl p-3.5 hover:border-red-500/40 transition-all cursor-pointer group/stat"
              >
                <span className="text-[11px] text-slate-400 font-medium block">逾期出貨提醒</span>
                <span className={`text-2xl font-black font-mono mt-1 block group-hover/stat:scale-105 transition-transform ${overdueOrdersCount > 0 ? 'text-red-400 animate-pulse' : 'text-slate-400'}`}>
                  {overdueOrdersCount} <span className="text-xs font-normal text-slate-500">筆</span>
                </span>
              </div>

              <div 
                onClick={() => setIsOrderDashboardOpen(true)}
                className="col-span-2 sm:col-span-1 bg-black/30 border border-white/5 rounded-xl p-3.5 hover:border-emerald-500/40 transition-all cursor-pointer group/stat"
              >
                <span className="text-[11px] text-slate-400 font-medium block">平台涵蓋率</span>
                <span className="text-2xl font-black text-emerald-400 font-mono mt-1 block group-hover/stat:scale-105 transition-transform">
                  100% <span className="text-xs font-normal text-slate-500">同步中</span>
                </span>
              </div>
            </div>

            {/* Big Action Entry Button */}
            <div className="pt-1">
              <button
                onClick={() => setIsOrderDashboardOpen(true)}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-slate-950 font-black rounded-xl text-sm transition-all shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 active:scale-[0.99]"
              >
                <Globe className="w-4 h-4" />
                <span>點擊開啟網路訂單管理看板 ({groupedOrders.length} 筆訂單)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Side Column: Quick Actions & Low Stock Alerts */}
        <div className="lg:col-span-4 space-y-6">
          {/* Quick Actions Card */}
          <div className="glass-panel border-white/10 rounded-2xl p-4 sm:p-5 space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>捷徑與常用操作</span>
              <span className="text-[10px] text-sky-400">單擊即可前往</span>
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <Link 
                to="/manage?type=stock_in" 
                className="flex flex-col items-center justify-center p-3.5 bg-gradient-to-br from-sky-500/10 to-sky-600/5 hover:from-sky-500/20 hover:to-sky-600/10 border border-sky-500/20 rounded-xl transition-all active:scale-95 group"
              >
                <div className="w-10 h-10 rounded-xl bg-sky-500/20 flex items-center justify-center mb-2 text-sky-400 group-hover:scale-110 transition-transform">
                  <ArrowDownToLine className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-white">快速進貨</span>
              </Link>

              <Link 
                to="/manage?type=stock_out" 
                className="flex flex-col items-center justify-center p-3.5 bg-gradient-to-br from-amber-500/10 to-amber-600/5 hover:from-amber-500/20 hover:to-amber-600/10 border border-amber-500/20 rounded-xl transition-all active:scale-95 group"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center mb-2 text-amber-400 group-hover:scale-110 transition-transform">
                  <ArrowUpFromLine className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-white">快速出貨</span>
              </Link>

              <Link 
                to="/transactions" 
                className="flex flex-col items-center justify-center p-3.5 bg-gradient-to-br from-indigo-500/10 to-indigo-600/5 hover:from-indigo-500/20 hover:to-indigo-600/10 border border-indigo-500/20 rounded-xl transition-all active:scale-95 group"
              >
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center mb-2 text-indigo-400 group-hover:scale-110 transition-transform">
                  <FileText className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-white">交易紀錄</span>
              </Link>

              <Link 
                to="/manage?type=adjust" 
                className="flex flex-col items-center justify-center p-3.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all active:scale-95 group"
              >
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center mb-2 text-purple-400 group-hover:scale-110 transition-transform">
                  <RefreshCcw className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-white">盤點校正</span>
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/5">
              <Link to="/reports" className="flex items-center gap-2 p-2.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-xs font-medium text-slate-300">
                <BarChart2 className="w-4 h-4 text-sky-400" />
                <span>洞察報表</span>
              </Link>
              <Link to="/vendors" className="flex items-center gap-2 p-2.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-xs font-medium text-slate-300">
                <User className="w-4 h-4 text-emerald-400" />
                <span>供應商資料</span>
              </Link>
            </div>
          </div>

          {/* Low Stock Warning List */}
          <div className="glass-panel border-white/10 rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                <span>補貨警示專區</span>
              </h3>
              <Link to="/products" className="text-[10px] text-slate-400 hover:text-white underline">
                商品列表
              </Link>
            </div>

            {(() => {
              const lowStockProducts = products.filter(p => {
                const pStock = stock.filter(s => s.product_id === p.product_id).reduce((acc, curr) => acc + curr.quantity, 0);
                const alertThreshold = p.min_stock !== undefined ? p.min_stock : 5;
                return pStock <= alertThreshold;
              });

              if (lowStockProducts.length === 0) {
                return (
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center text-xs text-emerald-300">
                    👍 太棒了！目前沒有存量過低的商品。
                  </div>
                );
              }

              return (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
                  {lowStockProducts.slice(0, 6).map(p => {
                    const currentQty = stock.filter(s => s.product_id === p.product_id).reduce((acc, curr) => acc + curr.quantity, 0);
                    return (
                      <div key={p.product_id} className="p-2.5 bg-black/30 border border-amber-500/20 rounded-xl flex items-center justify-between text-xs">
                        <div className="min-w-0 pr-2">
                          <p className="font-bold text-white truncate">{p.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">ID: {p.product_id}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-black text-amber-400 font-mono px-2 py-0.5 bg-amber-500/10 rounded border border-amber-500/30">
                            剩 {currentQty} {p.unit || '個'}
                          </span>
                          <Link 
                            to={`/manage?type=stock_in&pid=${p.product_id}`}
                            className="px-2 py-1 bg-sky-500 text-slate-950 font-extrabold rounded text-[10px] hover:bg-sky-400"
                          >
                            補貨
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>

      </div>

      {/* Order Management Dashboard Fullscreen View Modal */}
      {isOrderDashboardOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[60] flex items-center justify-center p-2 sm:p-6 animate-in fade-in duration-200">
          <div className="w-full max-w-5xl bg-[#0a1128] border border-indigo-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[92vh]">
            
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-white/10 bg-slate-900/80 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2">
                    網路訂單管理看板
                    <span className="text-[10px] font-black px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded-full border border-indigo-500/30">
                      共 {groupedOrders.length} 筆
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 hidden sm:block">各平台訂單即時看板，支援一鍵出貨自動扣庫存與同步作業</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={fetchOnlineOrders}
                  disabled={isLoading}
                  className="px-3 py-1.5 text-xs bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-extrabold rounded-xl flex items-center gap-1.5 transition-all active:scale-95 shadow-md shadow-indigo-500/20 disabled:opacity-50"
                >
                  <RefreshCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">抓取最新訂單</span>
                </button>
                <button 
                  onClick={() => setIsOrderDashboardOpen(false)}
                  className="p-2 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors"
                  title="關閉看板"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Content Area */}
            <div className="p-4 sm:p-6 space-y-4 flex-1 overflow-y-auto custom-scrollbar">
              
              {/* Shipments error alert */}
              {orderErrors.length > 0 && (
                <div className="p-3 bg-red-950/50 border border-red-500/40 rounded-xl text-xs text-red-200 space-y-1">
                  <p className="font-bold flex items-center gap-1 text-red-400">⚠️ 發現出貨異常：</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {orderErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Search Input Bar */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="搜尋訂單編號、收件人、商品名稱、規格、物流方式..."
                  value={orderSearchQuery}
                  onChange={(e) => setOrderSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-9 py-2.5 text-xs sm:text-sm bg-black/40 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500/50"
                />
                {orderSearchQuery && (
                  <button
                    onClick={() => setOrderSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Orders Cards Grid */}
              <div>
                {groupedOrders.length === 0 ? (
                  <div className="text-center py-16 space-y-3 bg-black/20 rounded-2xl border border-white/5">
                    <Flame className="w-12 h-12 text-slate-600 mx-auto" />
                    <p className="text-sm font-medium text-slate-400">目前尚無任何待處理的網路訂單</p>
                  </div>
                ) : filteredGroupedOrders.length === 0 ? (
                  <div className="text-center py-16 space-y-2 bg-black/20 rounded-2xl border border-white/5">
                    <Search className="w-12 h-12 text-slate-500 mx-auto animate-pulse" />
                    <p className="text-sm text-slate-400">找不到符合「{orderSearchQuery}」的訂單</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredGroupedOrders.map((order) => {
                      const isShopee = order.platform === '蝦皮購物';
                      const isMomo = order.platform === 'MOMO購物網';
                      const deadlineInfo = getDeadlineStatus(order.status);
                      const orderPrice = order.items[0]?.price || 0;

                      return (
                        <div 
                          key={order.order_id} 
                          className="glass-panel p-4 rounded-xl flex flex-col justify-between space-y-3 relative overflow-hidden transition-all duration-200 hover:border-indigo-500/50 border-white/10 bg-slate-900/80"
                        >
                          {/* Top Header */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center space-x-2 min-w-0">
                              <span className={`text-[10px] uppercase font-black px-2 py-0.5 rounded-full shrink-0 ${
                                isShopee ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
                                isMomo ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30' :
                                'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              }`}>
                                {order.platform}
                              </span>
                              <span className="text-xs font-mono font-bold text-white truncate">{order.order_id}</span>
                            </div>
                            <span className={`text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-lg shrink-0 ${deadlineInfo.color}`}>
                              {deadlineInfo.text}
                            </span>
                          </div>

                          {/* Items list */}
                          <div className="space-y-2 cursor-pointer" onClick={() => setSelectedOrder(order)}>
                            {order.items.map((item: any, idx: number) => {
                              const spec = item.specification || getProductSpecification(item.product_id);
                              const shipMethod = item.shipping_method || order.shipping_method;
                              return (
                                <div key={idx} className="bg-white/5 rounded-lg p-2.5 flex items-start justify-between text-xs hover:bg-white/10 transition-colors">
                                  <div className="flex-1 min-w-0 mr-2 space-y-1">
                                    <p className="font-semibold text-white truncate">{item.product_name}</p>
                                    <div className="flex flex-wrap gap-1">
                                      {spec && (
                                        <span className="inline-block bg-indigo-500/10 text-indigo-300 text-[10px] px-1.5 py-0.5 rounded border border-indigo-500/20 font-medium">
                                          規格: {spec}
                                        </span>
                                      )}
                                      {shipMethod && (
                                        <span className="inline-block bg-teal-500/10 text-teal-300 text-[10px] px-1.5 py-0.5 rounded border border-teal-500/20 font-medium">
                                          物流: {shipMethod}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <p className="text-slate-400 text-xs">數量: <strong className="text-white font-black">{item.quantity}</strong></p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Footer Controls */}
                          <div className="flex items-center justify-between pt-2 border-t border-white/5">
                            <div className="flex flex-col text-[10px] text-slate-400 space-y-0.5">
                              <span className="flex items-center gap-1"><User className="w-3 h-3" /> {order.customer_name}</span>
                              <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {order.created_at}</span>
                            </div>

                            <div className="flex items-center gap-2">
                              <div className="mr-1 text-right">
                                <span className="block text-[9px] text-slate-400">總金額</span>
                                <span className="text-xs font-bold text-indigo-400 font-mono">
                                  {orderPrice > 0 ? `$${orderPrice}` : '無'}
                                </span>
                              </div>
                              <button 
                                onClick={() => setSelectedOrder(order)}
                                className="px-2 py-1 text-xs text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors border border-white/5"
                              >
                                詳情
                              </button>
                              <button 
                                onClick={() => handleShipOrder(order)}
                                className="px-2.5 py-1 text-xs font-bold bg-indigo-500 hover:bg-indigo-400 text-slate-950 rounded-lg flex items-center gap-1 transition-all shadow-md shadow-indigo-500/20"
                              >
                                <Truck className="w-3.5 h-3.5" /> 出貨
                              </button>
                              <button 
                                onClick={() => handleDeleteOrder(order.order_id)}
                                className="p-1 text-slate-400 hover:text-red-400 bg-white/5 hover:bg-red-500/10 rounded-lg border border-white/5 transition-all"
                                title="刪除單筆訂單"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/10 bg-slate-900/90 flex justify-end">
              <button
                onClick={() => setIsOrderDashboardOpen(false)}
                className="px-5 py-2 bg-white/10 hover:bg-white/15 text-white font-bold rounded-xl text-xs transition-colors"
              >
                關閉看板
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Detailed Order Content Modal View */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[70] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-[#0e1628] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-bold text-white">訂單詳情：{selectedOrder.order_id}</h3>
              </div>
              <button 
                onClick={() => setSelectedOrder(null)}
                className="p-1 text-zinc-400 hover:text-white bg-white/5 border border-white/5 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4 flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3 text-xs bg-white/5 p-3 rounded-xl border border-white/5">
                <div>
                  <span className="text-zinc-400 block mb-0.5">來源平台</span>
                  <span className="font-bold text-white">{selectedOrder.platform}</span>
                </div>
                <div>
                  <span className="text-zinc-400 block mb-0.5">最晚出貨期限</span>
                  <span className={`inline-block px-2 py-0.5 rounded font-bold ${getDeadlineStatus(selectedOrder.status).color}`}>
                    {getDeadlineStatus(selectedOrder.status).text}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 block mb-0.5">收件人</span>
                  <span className="font-bold text-white">{selectedOrder.customer_name}</span>
                </div>
                <div>
                  <span className="text-zinc-400 block mb-0.5">下單日期</span>
                  <span className="font-mono text-white">{selectedOrder.created_at}</span>
                </div>
                {selectedOrder.shipping_method && (
                  <div className="col-span-2">
                    <span className="text-zinc-400 block mb-0.5">物流方式</span>
                    <span className="font-bold text-teal-300">{selectedOrder.shipping_method}</span>
                  </div>
                )}
              </div>

              {/* Items Table */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">訂購商品品項 ({selectedOrder.items.length})</h4>
                <div className="space-y-2.5">
                  {selectedOrder.items.map((item: any, idx: number) => {
                    const health = checkItemHealth(item);
                    const spec = item.specification || getProductSpecification(item.product_id);
                    return (
                      <div key={idx} className="bg-zinc-900/60 border border-white/5 rounded-xl p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-bold text-white">{item.product_name}</p>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              <span className="text-[10px] font-mono bg-white/10 text-zinc-300 px-1.5 py-0.5 rounded">商品ID: {item.product_id}</span>
                              {spec && <span className="text-[10px] bg-indigo-500/10 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/20">規格: {spec}</span>}
                            </div>
                          </div>
                          <div className="text-right text-xs shrink-0 font-mono">
                            <span className="text-zinc-400">數量: <strong className="text-white text-sm">{item.quantity}</strong></span>
                          </div>
                        </div>

                        {/* Safety Checks for each item */}
                        <div className={`mt-2 p-2 rounded-lg text-[11px] flex items-center gap-1.5 border ${
                          health.ok 
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' 
                            : 'bg-red-500/10 border-red-500/20 text-red-300'
                        }`}>
                          <span className="shrink-0">{health.ok ? '🟢' : '🔴'}</span>
                          <span>{health.ok ? '庫存安全檢測正常，符合出貨規定' : health.message}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Order total */}
              <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5 text-sm">
                <span className="font-medium text-zinc-300">訂單總金額 (不顯示商品單價)</span>
                <span className="font-mono font-black text-indigo-400 text-lg">
                  {selectedOrder.items[0]?.price > 0 ? `$${selectedOrder.items[0].price}` : '無'}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="p-4 border-t border-white/10 bg-zinc-900/40 flex justify-end gap-3">
              <button 
                onClick={() => setSelectedOrder(null)}
                className="px-4 py-2 text-xs font-semibold bg-white/5 hover:bg-white/10 text-zinc-300 rounded-lg transition-colors"
              >
                關閉
              </button>
              <button 
                onClick={() => handleShipOrder(selectedOrder)}
                className="px-4 py-2 text-xs font-black bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-colors flex items-center gap-1.5 shadow-lg shadow-indigo-500/20"
              >
                <Truck className="w-4 h-4" /> 執行整單出貨 (扣減庫存 & 刪除記錄)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

}
