import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { 
  Package, ArrowDownToLine, ArrowUpFromLine, RefreshCcw, 
  AlertTriangle, BarChart2, Globe, Truck, Trash2, X, PlusCircle, User, Calendar, CheckCircle, Flame, Search
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
    <div className="p-4 space-y-6">
      <header className="flex items-center justify-between pt-4 pb-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-main)]">Dashboard</h1>
          <p className="text-sm text-[var(--color-text-dim)]">Inventory Overview</p>
        </div>
        <button 
          onClick={fetchRemoteData} 
          disabled={isLoading}
          className="p-2 bg-white/5 border border-white/10 rounded-full shadow-sm text-[var(--color-text-main)] hover:text-[var(--color-accent-blue)] transition-colors"
        >
          <RefreshCcw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {error && (
        <div className="p-3 bg-red-900/40 border border-red-500/30 rounded-xl flex items-start space-x-3 text-red-100 text-sm animate-in fade-in">
          <AlertTriangle className="w-5 h-5 shrink-0 text-red-400" />
          <p>{error}</p>
        </div>
      )}

      {syncQueue.length > 0 && (
        <div className="p-3 bg-opacity-40 border border-[var(--color-accent-orange)]/30 rounded-xl flex items-start space-x-3 text-orange-100 text-sm animate-in fade-in" style={{ backgroundColor: 'rgba(251, 146, 60, 0.15)' }}>
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
          <Link to="/reports" className="col-span-3 flex items-center justify-between glass-panel p-4 rounded-2xl active:scale-95 transition-all hover:bg-white/10 hover:border-white/20">
            <div className="flex items-center">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center mr-3">
                <BarChart2 className="w-5 h-5 text-[#38bdf8]" />
              </div>
              <div className="text-left">
                <span className="block text-sm font-bold text-[var(--color-text-main)]">洞察報表</span>
                <span className="block text-xs text-[var(--color-text-dim)]">財務估算與庫存健康分析</span>
              </div>
            </div>
            <div className="bg-white/10 px-3 py-1 rounded-full text-xs font-bold text-white">查看</div>
          </Link>
          <Link to="/vendors" className="flex flex-col items-center justify-center glass-panel p-4 rounded-2xl active:scale-95 transition-all hover:bg-white/10 hover:border-white/20">
            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-2">
              <Package className="w-5 h-5 text-[var(--color-accent-blue)]" />
            </div>
            <span className="text-xs font-semibold text-[var(--color-text-main)]">供應商</span>
          </Link>
          <Link to="/transactions" className="flex flex-col items-center justify-center glass-panel p-4 rounded-2xl active:scale-95 transition-all hover:bg-white/10 hover:border-white/20">
            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center mb-2">
              <RefreshCcw className="w-5 h-5 text-[var(--color-accent-green)]" />
            </div>
            <span className="text-xs font-semibold text-[var(--color-text-main)]">進出貨紀錄</span>
          </Link>
        </div>
      </div>

      {/* Online Order Board Integration Block */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider">整合功能</h3>
          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-400/20 px-2 py-0.5 rounded-full animate-pulse">運作中</span>
        </div>
        <div 
          onClick={() => setIsOrderDashboardOpen(true)}
          className="glass-panel border-indigo-500/30 p-4 rounded-2xl cursor-pointer hover:bg-white/10 hover:border-indigo-500/50 transition-all shadow-md group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="w-12 h-12 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center mr-3 relative">
                {overdueOrdersCount > 0 && (
                  <>
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping opacity-75"></div>
                    <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-[#111827]"></div>
                  </>
                )}
                <Globe className="w-6 h-6 text-indigo-400 group-hover:rotate-12 transition-transform" />
              </div>
              <div className="text-left">
                <span className="block text-sm font-bold text-[var(--color-text-main)]">網路訂單整合</span>
                <span className="block text-xs text-[var(--color-text-dim)] mt-0.5">即時管理各大電商訂單，一鍵出貨自動扣除庫存</span>
              </div>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <div className="flex-1 bg-white/5 rounded-lg p-2.5 flex flex-col items-center justify-center border border-white/5">
              <span className="text-[10px] text-zinc-400 mb-1">待處理訂單</span>
              <span className="text-lg font-bold text-indigo-400">{pendingOrdersCount} 筆</span>
            </div>
            <div className="flex-1 bg-white/5 rounded-lg p-2.5 flex flex-col items-center justify-center border border-white/5">
              <span className="text-[10px] text-zinc-400 mb-1">已逾期提醒</span>
              <span className={`text-lg font-bold ${overdueOrdersCount > 0 ? 'text-red-400 animate-pulse' : 'text-zinc-500'}`}>{overdueOrdersCount} 筆</span>
            </div>
          </div>
        </div>
      </div>

      {/* Dynamic Order Dashboard Modal View */}
      {isOrderDashboardOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[60] flex flex-col justify-end h-screen animate-in fade-in duration-200">
          <div className="w-full max-w-xl mx-auto bg-[#0b101d] border-t border-white/10 rounded-t-3xl flex flex-col max-h-[92vh] shadow-2xl overflow-hidden pb-4">
            
            {/* Modal Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-indigo-400" />
                <h2 className="text-base font-bold text-white">網路訂單管理看板</h2>
              </div>
              <button 
                onClick={() => setIsOrderDashboardOpen(false)}
                className="p-1 px-2.5 rounded-full text-zinc-400 hover:text-white bg-white/5 border border-white/5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Actions & Metrics */}
            <div className="p-4 bg-white/5 border-b border-zinc-900 flex justify-between items-center gap-4">
              <div className="flex items-center gap-4">
                <div>
                  <div className="text-xs text-zinc-400">電商待處理</div>
                  <div className="text-base font-black text-indigo-400">{pendingOrdersCount} 筆</div>
                </div>
                <div className="h-6 w-[1px] bg-white/10"></div>
                <div>
                  <div className="text-xs text-zinc-400">逾期提醒</div>
                  <div className={`text-base font-black ${overdueOrdersCount > 0 ? 'text-red-400' : 'text-zinc-500'}`}>{overdueOrdersCount} 筆</div>
                </div>
              </div>
              <button 
                onClick={fetchOnlineOrders}
                disabled={isLoading}
                className="px-3 py-1.5 text-xs bg-indigo-500 hover:bg-indigo-600 rounded-lg text-white font-bold flex items-center gap-1.5 transition-colors shadow-lg shadow-indigo-500/20 active:scale-95 disabled:opacity-50"
              >
                <RefreshCcw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> 讀取最新訂單
              </button>
            </div>

            {/* Shipments error alert */}
            {orderErrors.length > 0 && (
              <div className="mx-4 mt-4 p-3 bg-red-950/40 border border-red-500/30 rounded-xl text-xs text-red-200 space-y-1">
                <p className="font-bold flex items-center gap-1 text-red-400">⚠️ 發現出貨異常：</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  {orderErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Search Input Bar */}
            <div className="px-4 py-2.5 bg-white/5 border-b border-zinc-900/60 flex items-center relative">
              <div className="absolute left-7 text-zinc-400">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                placeholder="搜尋訂單編號、收件人、商品名稱、規格、物流..."
                value={orderSearchQuery}
                onChange={(e) => setOrderSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-1.5 text-xs bg-black/40 border border-white/10 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500/50"
              />
              {orderSearchQuery && (
                <button
                  onClick={() => setOrderSearchQuery('')}
                  className="absolute right-7 text-zinc-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Orders list scroll area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {groupedOrders.length === 0 ? (
                <div className="text-center py-10 space-y-2">
                  <Flame className="w-10 h-10 text-zinc-600 mx-auto" />
                  <p className="text-sm text-zinc-500">目前沒有任何網路平台的訂單</p>
                </div>
              ) : filteredGroupedOrders.length === 0 ? (
                <div className="text-center py-10 space-y-2">
                  <Search className="w-10 h-10 text-zinc-500 mx-auto animate-pulse" />
                  <p className="text-sm text-zinc-400">找不到符合「{orderSearchQuery}」的訂單</p>
                </div>
              ) : (
                filteredGroupedOrders.map((order) => {
                  const isShopee = order.platform === '蝦皮購物';
                  const isMomo = order.platform === 'MOMO購物網';
                  const deadlineInfo = getDeadlineStatus(order.status);
                  const orderPrice = order.items[0]?.price || 0; // price 是指 訂單總金額，不是商品單價，商品單價不顯示

                  return (
                    <div 
                      key={order.order_id} 
                      className="glass-panel p-4 rounded-xl flex flex-col space-y-3 relative overflow-hidden transition-all duration-300 hover:border-indigo-500/25 border-white/10"
                    >
                      {/* Top Header line of Order Card */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className={`text-[10px] uppercase font-extrabold px-2 py-0.5 rounded-full ${
                            isShopee ? 'bg-orange-500/20 text-orange-400' :
                            isMomo ? 'bg-pink-500/20 text-pink-400' :
                            'bg-green-500/20 text-green-400'
                          }`}>
                            {order.platform}
                          </span>
                          <span className="text-xs font-mono font-bold text-white">{order.order_id}</span>
                        </div>
                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg ${deadlineInfo.color}`}>
                          {deadlineInfo.text}
                        </span>
                      </div>

                      {/* Products overview inside this order - SPECIFICATION displayed, product ID removed */}
                      <div className="space-y-2 cursor-pointer" onClick={() => setSelectedOrder(order)}>
                        {order.items.map((item: any, idx: number) => {
                          const spec = item.specification || getProductSpecification(item.product_id);
                          const shipMethod = item.shipping_method || order.shipping_method;
                          return (
                            <div key={idx} className="bg-white/5 rounded-lg p-2.5 flex items-start justify-between text-xs hover:bg-white/10 transition-colors">
                              <div className="flex-1 min-w-0 mr-2 space-y-1">
                                <p className="font-semibold text-white truncate">{item.product_name}</p>
                                <div className="flex flex-wrap gap-1.5">
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
                                <p className="text-zinc-400 text-xs">數量: <strong className="text-white font-black">{item.quantity}</strong></p>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Footer: Date and Action Buttons */}
                      <div className="flex items-center justify-between pt-1">
                        <div className="flex flex-col text-[10px] text-zinc-500 space-y-0.5">
                          <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> 收件人: {order.customer_name}</span>
                          <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> 下單: {order.created_at}</span>
                        </div>
                        
                        <div className="flex items-center gap-2 ml-auto">
                          <div className="mr-2 text-right">
                            <span className="block text-[10px] text-zinc-500">訂單總金額</span>
                            <span className="text-sm font-bold text-indigo-400 font-mono">
                              {orderPrice > 0 ? `$${orderPrice}` : '無'}
                            </span>
                          </div>
                          <button 
                            onClick={() => setSelectedOrder(order)}
                            className="px-2.5 py-1.5 text-xs text-zinc-300 hover:text-white bg-white/5 border border-white/5 hover:bg-white/10 rounded-lg transition-colors"
                          >
                            詳情
                          </button>
                          <button 
                            onClick={() => handleShipOrder(order)}
                            className="px-3 py-1.5 text-xs font-bold bg-indigo-500/20 border border-indigo-500/40 hover:bg-indigo-500 hover:text-white text-indigo-300 rounded-lg flex items-center gap-1 transition-all shadow-md shadow-indigo-500/5"
                          >
                            <Truck className="w-3.5 h-3.5" /> 出貨
                          </button>
                          <button 
                            onClick={() => handleDeleteOrder(order.order_id)}
                            className="p-1.5 text-zinc-400 hover:text-red-400 bg-white/5 hover:bg-red-500/10 rounded-lg border border-white/5 hover:border-red-500/20 transition-all"
                            title="刪除單筆訂單"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                    </div>
                  );
                })
              )}
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
