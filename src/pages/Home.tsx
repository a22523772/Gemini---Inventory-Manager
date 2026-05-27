import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { 
  Package, ArrowDownToLine, ArrowUpFromLine, RefreshCcw, 
  AlertTriangle, BarChart2, Globe, Truck, Trash2, X, PlusCircle, User, Calendar, CheckCircle, Flame
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Home() {
  const { products, stock, syncQueue, isLoading, fetchRemoteData, error, enqueueAction, showToast } = useStore();
  const [isOrderDashboardOpen, setIsOrderDashboardOpen] = useState(false);

  // Load / Initialize dynamic online orders lists
  const [orders, setOrders] = useState<any[]>(() => {
    const saved = localStorage.getItem('online_orders_list');
    if (saved) return JSON.parse(saved);
    return [
      { order_id: 'SHP-992381', platform: '蝦皮購物', product_id: 'P1001', product_name: '陶瓷馬克杯 (350ml)', quantity: 2, customer_name: '陳大同', status: '待處理', created_at: '2026-05-25' },
      { order_id: 'MOMO-183921', platform: 'MOMO購物網', product_id: 'P1002', product_name: '不鏽鋼保溫瓶 (500ml)', quantity: 1, customer_name: '林智慧', status: '待處理', created_at: '2026-05-26' },
      { order_id: 'LINE-772910', platform: 'LINE口袋商店', product_id: 'P1003', product_name: '環保玻璃吸管組', quantity: 5, customer_name: '張小玲', status: '待處理', created_at: '2026-05-27' },
      { order_id: 'SHP-384912', platform: '蝦皮購物', product_id: 'P1001', product_name: '陶瓷馬克杯 (350ml)', quantity: 1, customer_name: '王小明', status: '已出貨', created_at: '2026-05-24' }
    ];
  });

  useEffect(() => {
    localStorage.setItem('online_orders_list', JSON.stringify(orders));
  }, [orders]);

  const totalStock = stock.reduce((acc, curr) => acc + curr.quantity, 0);

  // Ship single order action: deducts available stock from matched stock entries and registers transactions
  const handleShipOrder = async (order: any) => {
    // 1. Find product stock entries
    const productStock = stock.filter(s => s.product_id === order.product_id);
    const availableQty = productStock.reduce((acc, curr) => acc + curr.quantity, 0);

    // 2. Prevent shipment if inventory is insufficient
    if (availableQty < order.quantity) {
      showToast(`❌ 庫存量不足！該商品在庫總數僅為 ${availableQty}，無法出貨此訂單。`);
      return;
    }

    // 3. Deduct stock entries using FIFO or simple iteration, triggering enqueueAction for standard updates
    let remainingNeeded = order.quantity;
    try {
      for (const entry of productStock) {
        if (remainingNeeded <= 0) break;
        const deductQty = Math.min(entry.quantity, remainingNeeded);

        await enqueueAction('stockOut', {
          stock_id: entry.stock_id,
          product_id: order.product_id,
          quantity: deductQty,
          location: entry.location,
          floor: entry.floor,
          area: entry.area,
          expiry_date: entry.expiry_date,
          specification: entry.specification,
          note: `網路訂單自動出貨: ${order.order_id}`,
        });

        remainingNeeded -= deductQty;
      }

      // Mark order as shipped
      setOrders(prev => prev.map(o => o.order_id === order.order_id ? { ...o, status: '已出貨' } : o));
      showToast(`✅ 訂單 ${order.order_id} 出貨成功！已扣除庫存並自動記錄銷量。`);
    } catch (e: any) {
      showToast(`❌ 出貨失敗: ${e.message}`);
    }
  };

  // Delete single order
  const handleDeleteOrder = (orderId: string) => {
    setOrders(prev => prev.filter(o => o.order_id !== orderId));
    showToast(`🗑️ 訂單 ${orderId} 記錄已刪除。`);
  };

  // Simulate a newly importing order with a random product from store
  const handleSimulateNewOrder = () => {
    if (products.length === 0) {
      showToast("❌ 目前產品庫存目錄為空，請先新增商品再行模擬！");
      return;
    }
    const randProd = products[Math.floor(Math.random() * products.length)];
    const platforms = ['蝦皮購物', 'MOMO購物網', 'LINE口袋商店'];
    const buyers = ['張大千', '李阿美', '林先生', '趙小姐', '陳經理'];
    const randId = `SIM-${Math.floor(100000 + Math.random() * 900000)}`;

    const newOrder = {
      order_id: randId,
      platform: platforms[Math.floor(Math.random() * platforms.length)],
      product_id: randProd.product_id,
      product_name: randProd.name,
      quantity: Math.floor(1 + Math.random() * 3), // 1-3 pcs
      customer_name: buyers[Math.floor(Math.random() * buyers.length)],
      status: '待處理',
      created_at: new Date().toISOString().split('T')[0]
    };

    setOrders(prev => [newOrder, ...prev]);
    showToast(`✨ 加載成功！收到來自 ${newOrder.platform} 的新訂單 ${newOrder.order_id}！`);
  };

  const pendingOrdersCount = orders.filter(o => o.status === '待處理').length;
  const shippedOrdersCount = orders.filter(o => o.status === '已出貨').length;

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
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping opacity-75"></div>
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-[#111827]"></div>
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
              <span className="text-lg font-bold text-indigo-400">{pendingOrdersCount}</span>
            </div>
            <div className="flex-1 bg-white/5 rounded-lg p-2.5 flex flex-col items-center justify-center border border-white/5">
              <span className="text-[10px] text-zinc-400 mb-1">今日已出貨</span>
              <span className="text-lg font-bold text-emerald-400">{shippedOrdersCount}</span>
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
                  <div className="text-xs text-zinc-400">待處理訂單</div>
                  <div className="text-base font-black text-indigo-400">{pendingOrdersCount} 筆</div>
                </div>
                <div className="h-6 w-[1px] bg-white/10"></div>
                <div>
                  <div className="text-xs text-zinc-400">已出貨訂單</div>
                  <div className="text-base font-black text-emerald-400">{shippedOrdersCount} 筆</div>
                </div>
              </div>
              <button 
                onClick={handleSimulateNewOrder}
                className="px-3 py-1.5 text-xs bg-indigo-500 hover:bg-indigo-600 rounded-lg text-white font-bold flex items-center gap-1.5 transition-colors shadow-lg shadow-indigo-500/20 active:scale-95"
              >
                <PlusCircle className="w-4 h-4" /> 模擬訂單匯入
              </button>
            </div>

            {/* Orders list scroll area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {orders.length === 0 ? (
                <div className="text-center py-10 space-y-2">
                  <Flame className="w-10 h-10 text-zinc-600 mx-auto" />
                  <p className="text-sm text-zinc-500">目前沒有任何網路平台的訂單</p>
                </div>
              ) : (
                orders.map((order) => {
                  const isPending = order.status === '待處理';
                  const isShopee = order.platform === '蝦皮購物';
                  const isMomo = order.platform === 'MOMO購物網';

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
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                          isPending ? 'bg-amber-400/10 text-amber-400 border border-amber-400/20' : 'bg-emerald-400/10 text-emerald-400 border border-emerald-400/20'
                        }`}>
                          {order.status}
                        </span>
                      </div>

                      {/* Product details */}
                      <div className="bg-white/5 rounded-lg p-2.5 flex items-start gap-3">
                        <div className="w-10 h-10 rounded-md bg-white/10 flex items-center justify-center text-xs text-zinc-400 uppercase font-black">
                          {order.platform.slice(0, 1)}
                        </div>
                        <div className="flex-1 flex flex-col">
                          <span className="text-xs text-white font-semibold">{order.product_name}</span>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] font-mono text-zinc-400 bg-white/10 px-1.5 py-0.5 rounded">ID: {order.product_id}</span>
                            <span className="text-[10px] text-zinc-400">數量: <strong className="text-white">{order.quantity}</strong> 件</span>
                          </div>
                        </div>
                      </div>

                      {/* Footer: Date and Action Buttons */}
                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center space-x-3 text-[10px] text-zinc-500">
                          <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" /> {order.customer_name}</span>
                          <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" /> {order.created_at}</span>
                        </div>
                        
                        <div className="flex items-center gap-2 ml-auto">
                          {isPending && (
                            <button 
                              onClick={() => handleShipOrder(order)}
                              className="px-3 py-1.5 text-xs font-bold bg-indigo-500/20 border border-indigo-500/40 hover:bg-indigo-500 hover:text-white text-indigo-300 rounded-lg flex items-center gap-1 transition-all"
                            >
                              <Truck className="w-3.5 h-3.5" /> 出貨
                            </button>
                          )}
                          {!isPending && (
                            <div className="px-3 py-1.5 text-xs font-bold text-zinc-400 bg-zinc-800/40 border border-zinc-800 rounded-lg flex items-center gap-1 cursor-default">
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> 已出貨
                            </div>
                          )}
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

    </div>
  );
}
