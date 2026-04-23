import { NavLink } from 'react-router-dom';
import { Home, Package, ScanLine, ArrowRightLeft, Settings, BarChart2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { useStore } from '../store/useStore';

export default function BottomNav() {
  const syncQueue = useStore(state => state.syncQueue);
  
  const navItems = [
    { to: '/', icon: Home, label: '首頁' },
    { to: '/products', icon: Package, label: '商品' },
    { to: '/scan', icon: ScanLine, label: '掃描' },
    { to: '/manage', icon: ArrowRightLeft, label: '管理' },
    { to: '/setup', icon: Settings, label: '設定', badge: syncQueue.length > 0 ? syncQueue.length : 0 },
  ];

  return (
    <div className="fixed bottom-0 left-0 w-full glass-panel border-x-0 border-b-0 pb-safe z-50">
      <div className="flex justify-around items-center h-16">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center justify-center w-full h-full space-y-1 relative transition-colors',
                isActive ? 'text-[var(--color-accent-blue)] drop-shadow-[0_0_8px_rgba(56,189,248,0.3)]' : 'text-[var(--color-text-dim)] hover:text-white'
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon className={cn('w-6 h-6', isActive ? 'stroke-current' : '')} strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-[10px] font-medium">{item.label}</span>
                {item.badge ? (
                  <span className="absolute top-1 right-3 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                    {item.badge}
                  </span>
                ) : null}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </div>
  );
}
