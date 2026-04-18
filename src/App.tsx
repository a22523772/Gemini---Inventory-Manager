import { useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Products from './pages/Products';
import StockManage from './pages/StockManage';
import ScannerPage from './pages/ScannerPage';
import SetupGuide from './pages/SetupGuide';
import AddProduct from './pages/AddProduct';
import Vendors from './pages/Vendors';
import Transactions from './pages/Transactions';
import { useStore } from './store/useStore';

export default function App() {
  const { loadInitialData, fetchRemoteData, toastMessage } = useStore();

  useEffect(() => {
    const init = async () => {
      await loadInitialData();
      // Try fetching latest data automatically if online
      if (navigator.onLine) {
        fetchRemoteData();
      }
    };
    init();

    // Listen for online event to trigger sync
    const handleOnline = () => {
      useStore.getState().syncData();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [loadInitialData, fetchRemoteData]);

  return (
    <>
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-[#0f172a] border border-[var(--color-accent-blue)] text-white px-6 py-3 rounded-full shadow-2xl animate-in slide-in-from-top-4 fade-in font-bold flex items-center whitespace-nowrap">
          {toastMessage}
        </div>
      )}
      <HashRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="products" element={<Products />} />
          <Route path="manage" element={<StockManage />} />
          <Route path="setup" element={<SetupGuide />} />
          <Route path="add-product" element={<AddProduct />} />
          <Route path="vendors" element={<Vendors />} />
          <Route path="transactions" element={<Transactions />} />
        </Route>
        <Route path="/scan" element={<ScannerPage />} />
      </Routes>
    </HashRouter>
    </>
  );
}
