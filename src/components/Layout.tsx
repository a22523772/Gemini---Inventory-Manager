import { Outlet, NavLink, useLocation } from 'react-router-dom';
import BottomNav from './BottomNav';
import { useStore } from '../store/useStore';
import { 
  Home, Package, ScanLine, ArrowRightLeft, Settings, 
  BarChart2, Users, FileText, RefreshCw, Layers, 
  CheckCircle2, CloudOff, UserCheck, ShieldCheck
} from 'lucide-react';
import { cn } from '../lib/utils';

export default function Layout() {
  const location = useLocation();
  const { 
    syncQueue, 
    lastPaths, 
    operator, 
    syncData, 
    isLoading, 
    gasApiUrl 
  } = useStore();

  const getPageTitle = (pathname: string) => {
    if (pathname === '/') return '首頁儀表板';
    if (pathname.startsWith('/products')) return '商品圖書管理';
    if (pathname.startsWith('/scan')) return '條碼快速掃描';
    if (pathname.startsWith('/manage')) return '庫存進出貨 / 盤點';
    if (pathname.startsWith('/transactions')) return '交易歷史紀錄';
    if (pathname.startsWith('/reports')) return '營運數據與報表';
    if (pathname.startsWith('/vendors')) return '供應商資料';
    if (pathname.startsWith('/setup')) return '系統設定與備份';
    if (pathname.startsWith('/add-product')) return '新增/編輯商品';
    return '進銷存管理系統';
  };

  const navItems = [
    { to: lastPaths.home || '/', activeBase: '/', icon: Home, label: '首頁儀表板', desc: '總覽、出貨與警示' },
    { to: lastPaths.products || '/products', activeBase: '/products', icon: Package, label: '商品圖書', desc: '商品規格與總庫存' },
    { to: lastPaths.manage || '/manage', activeBase: '/manage', icon: ArrowRightLeft, label: '進出貨盤點', desc: '快速進貨、出貨、盤點' },
    { to: '/transactions', activeBase: '/transactions', icon: FileText, label: '交易紀錄', desc: '查詢進出貨明細' },
    { to: '/reports', activeBase: '/reports', icon: BarChart2, label: '報表分析', desc: '效期、過期、供應商統計' },
    { to: '/vendors', activeBase: '/vendors', icon: Users, label: '供應商管理', desc: '聯絡人與廠商清單' },
    { to: '/scan', activeBase: '/scan', icon: ScanLine, label: '條碼掃描', desc: '相機/掃描槍快速尋找' },
    { to: lastPaths.setup || '/setup', activeBase: '/setup', icon: Settings, label: '系統設定', desc: 'Google Sheet 雲端同步', badge: syncQueue.length > 0 ? syncQueue.length : 0 },
  ];

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col md:flex-row font-sans">
      {/* Desktop Sidebar Navigation */}
      <aside className="hidden md:flex flex-col w-64 lg:w-72 bg-[#0d1322] border-r border-white/10 shrink-0 h-screen sticky top-0 z-30 select-none">
        {/* Brand Header */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-sky-950/40 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/20 font-black text-xl tracking-wider">
              <Layers className="w-6 h-6 stroke-[2.5]" />
            </div>
            <div>
              <h1 className="font-bold text-white text-base tracking-tight leading-none flex items-center gap-1.5">
                進銷存系統 <span className="text-[10px] font-extrabold px-1.5 py-0.5 bg-sky-500/20 text-sky-400 rounded border border-sky-500/30">PRO</span>
              </h1>
              <p className="text-[11px] text-slate-400 font-medium mt-1">智慧雙模式管理平台</p>
            </div>
          </div>
        </div>

        {/* Navigation List */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5 custom-scrollbar">
          <div className="px-3 pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            主功能選單
          </div>
          {navItems.map((item) => {
            const isActive = location.pathname === item.activeBase || 
                             (item.activeBase !== '/' && location.pathname.startsWith(item.activeBase));
            return (
              <NavLink
                key={item.activeBase}
                to={item.to}
                className={({ isActive: exactActive }) =>
                  cn(
                    'group flex items-center justify-between px-3.5 py-2.5 rounded-xl transition-all duration-200 text-sm font-medium',
                    isActive || exactActive
                      ? 'bg-gradient-to-r from-sky-500/20 to-indigo-500/10 text-sky-300 border border-sky-500/30 shadow-sm shadow-sky-500/10 font-bold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  )
                }
              >
                <div className="flex items-center gap-3 min-w-0">
                  <item.icon className={cn('w-5 h-5 shrink-0 transition-transform group-hover:scale-110', isActive ? 'text-sky-400' : 'text-slate-400')} />
                  <div className="truncate">
                    <span className="block leading-snug">{item.label}</span>
                    <span className="block text-[10px] font-normal text-slate-400 truncate">{item.desc}</span>
                  </div>
                </div>
                {item.badge ? (
                  <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-500 text-white animate-pulse">
                    {item.badge}
                  </span>
                ) : null}
              </NavLink>
            );
          })}
        </div>

        {/* Sidebar Footer Info & Sync */}
        <div className="p-3 border-t border-white/10 bg-[#0a0e19] space-y-3">
          {/* Operator badge */}
          <div className="flex items-center justify-between px-3 py-2 bg-white/5 rounded-lg border border-white/5 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-sky-400" />
              <span className="text-slate-400">操作員:</span>
              <span className="font-bold text-white">{operator || '預設人員'}</span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded border border-emerald-500/30">已連線</span>
          </div>

          {/* Sync status widget */}
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              {gasApiUrl ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>雲端試算表已對接</span>
                </>
              ) : (
                <>
                  <CloudOff className="w-3.5 h-3.5 text-amber-400" />
                  <span>僅離線 / 未連結</span>
                </>
              )}
            </div>
            <button
              onClick={() => syncData()}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 rounded-lg text-xs font-bold transition-all disabled:opacity-50"
              title="與雲端試算表手動同步"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
              <span>同步</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Layout Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* Desktop Top Header Bar */}
        <header className="hidden md:flex items-center justify-between h-16 px-6 bg-[#0d1322]/80 backdrop-blur-md border-b border-white/10 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-white tracking-tight">
              {getPageTitle(location.pathname)}
            </h2>
            {syncQueue.length > 0 && (
              <span className="px-2.5 py-0.5 text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                待對列同步: {syncQueue.length} 筆
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <NavLink 
              to="/scan" 
              className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 rounded-lg text-xs font-bold transition-colors"
            >
              <ScanLine className="w-4 h-4 text-sky-400" />
              <span>快速掃描</span>
            </NavLink>
            <NavLink 
              to="/manage?type=stock_in" 
              className="px-3 py-1.5 bg-sky-500 text-slate-950 font-extrabold rounded-lg text-xs shadow-md shadow-sky-500/20 hover:bg-sky-400 transition-colors"
            >
              + 快速進貨
            </NavLink>
            <NavLink 
              to="/manage?type=stock_out" 
              className="px-3 py-1.5 bg-amber-500 text-slate-950 font-extrabold rounded-lg text-xs shadow-md shadow-amber-500/20 hover:bg-amber-400 transition-colors"
            >
              - 快速出貨
            </NavLink>
          </div>
        </header>

        {/* Mobile Top App Header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-[#0d1322] border-b border-white/10 sticky top-0 z-20">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white font-black text-sm">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-white text-sm leading-tight">
                {getPageTitle(location.pathname)}
              </h1>
              <p className="text-[10px] text-slate-400">進銷存雙模管理</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => syncData()}
              disabled={isLoading}
              className="p-2 bg-white/5 text-sky-400 rounded-lg border border-white/10 active:scale-95"
            >
              <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
            </button>
          </div>
        </header>

        {/* Main Route Content */}
        <main className="flex-1 overflow-y-auto pb-20 md:pb-8">
          <div className="max-w-[1600px] mx-auto w-full p-3 sm:p-5 md:p-6 lg:p-8">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden">
        <BottomNav />
      </div>
    </div>
  );
}

