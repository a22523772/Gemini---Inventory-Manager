import { Outlet } from 'react-router-dom';
import BottomNav from './BottomNav';

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col font-sans pb-16">
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
