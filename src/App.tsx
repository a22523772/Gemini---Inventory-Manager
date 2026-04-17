import { useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Products from './pages/Products';
import StockManage from './pages/StockManage';
import ScannerPage from './pages/ScannerPage';
import SetupGuide from './pages/SetupGuide';
import AddProduct from './pages/AddProduct';
import { useStore } from './store/useStore';

export default function App() {
  const { loadInitialData, fetchRemoteData } = useStore();

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
    <HashRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="products" element={<Products />} />
          <Route path="manage" element={<StockManage />} />
          <Route path="setup" element={<SetupGuide />} />
          <Route path="add-product" element={<AddProduct />} />
        </Route>
        <Route path="/scan" element={<ScannerPage />} />
      </Routes>
    </HashRouter>
  );
}
