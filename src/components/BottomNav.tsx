import { useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Home, Package, ScanLine, ArrowRightLeft, Settings } from 'lucide-react';
import { cn } from '../lib/utils';
import { useStore } from '../store/useStore';

export default function BottomNav() {
  const syncQueue = useStore(state => state.syncQueue);
  const lastPaths = useStore(state => state.lastPaths);
  const setLastPath = useStore(state => state.setLastPath);
  const location = useLocation();

  const currentPath = location.pathname + location.search;

  // Track and remember route changes per main sector
  useEffect(() => {
    let sector: 'home' | 'products' | 'scan' | 'manage' | 'setup' | null = null;
    if (location.pathname === '/') {
      sector = 'home';
    } else if (location.pathname.startsWith('/products')) {
      sector = 'products';
    } else if (location.pathname.startsWith('/scan')) {
      sector = 'scan';
    } else if (location.pathname.startsWith('/manage')) {
      sector = 'manage';
    } else if (location.pathname.startsWith('/setup')) {
      sector = 'setup';
    }

    if (sector && lastPaths[sector] !== currentPath) {
      setLastPath(sector, currentPath);
    }
  }, [location.pathname, location.search, setLastPath, currentPath, lastPaths]);

  const navItems = [
    { to: lastPaths.home, activeBase: '/', icon: Home, label: '首頁' },
    { to: lastPaths.products, activeBase: '/products', icon: Package, label: '商品' },
    { to: lastPaths.scan, activeBase: '/scan', icon: ScanLine, label: '掃描' },
    { to: lastPaths.manage, activeBase: '/manage', icon: ArrowRightLeft, label: '管理' },
    { to: lastPaths.setup, activeBase: '/setup', icon: Settings, label: '設定', badge: syncQueue.length > 0 ? syncQueue.length : 0 },
  ];

  return (
    <div className="fixed bottom-0 left-0 w-full bg-[#0b101d] border-t border-white/10 pb-safe z-50 shadow-[0_-8px_30px_rgb(0,0,0,0.5)]">
      <div className="flex justify-around items-center h-16">
        {navItems.map((item) => {
          // Custom active state checking to support subpages and queries correctly
          const isActive = location.pathname === item.activeBase || 
                           (item.activeBase !== '/' && location.pathname.startsWith(item.activeBase));

          return (
            <NavLink
              key={item.activeBase}
              to={item.to}
              className={() =>
                cn(
                  'flex flex-col items-center justify-center w-full h-full space-y-1 relative transition-colors',
                  isActive ? 'text-[var(--color-accent-blue)] drop-shadow-[0_0_8px_rgba(56,189,248,0.3)]' : 'text-[var(--color-text-dim)] hover:text-white'
                )
              }
            >
              <item.icon className={cn('w-6 h-6', isActive ? 'stroke-current' : '')} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-medium">{item.label}</span>
              {item.badge ? (
                <span className="absolute top-1 right-3 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                  {item.badge}
                </span>
              ) : null}
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}
