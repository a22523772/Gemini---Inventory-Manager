import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  useStore,
  isSpecificationMatch,
  getProductStatusInfo,
  parseSpecifications,
  formatConsistentTxDate,
  getDominantDateSeparator
} from '../store/useStore';
import {
  Save,
  Plus,
  Minus,
  Trash2,
  Search,
  X,
  ScanBarcode,
  ShoppingCart,
  Filter,
  AlertTriangle,
  Package,
  Tag,
  MapPin,
  ArrowRight,
  CheckCircle2
} from 'lucide-react';
import QuantityInput from './QuantityInput';
import ProductSpecStockBadges, { computeProductSpecBreakdown } from './ProductSpecStockBadges';

interface CartItem {
  id: string; // unique item id for the cart
  product: any;
  stockEntry: any;
  quantity: number;
}

export default function OutboundCart() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { products, stock, vendors, transactions, enqueueAction, operator, showToast } = useStore();

  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('outbound_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Catalog filter & search state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [showFilters, setShowFilters] = useState(false);
  const [filterBrand, setFilterBrand] = useState('');
  const [filterVendor, setFilterVendor] = useState('');
  const [sortOrder, setSortOrder] = useState<'stock_high' | 'name_asc' | 'name_desc' | 'newest' | 'stock_low'>('stock_high');
  const [onlyInStock, setOnlyInStock] = useState<boolean>(true);

  // Mobile view switcher ('catalog' | 'cart')
  const [mobileView, setMobileView] = useState<'catalog' | 'cart'>('catalog');
  const cartPanelRef = useRef<HTMLDivElement | null>(null);

  // Sync cart state to localStorage on modification
  useEffect(() => {
    try {
      localStorage.setItem('outbound_cart', JSON.stringify(cart));
    } catch (e) {
      console.error('Error saving cart to localStorage:', e);
    }
  }, [cart]);

  // Dynamically reconcile cache items with the latest products and stock data
  useEffect(() => {
    if (products.length === 0 || stock.length === 0) return;

    setCart(prevCart => {
      let updated = false;
      const reconciled = prevCart
        .map(item => {
          const freshProd = products.find(p => p.product_id === item.product.product_id);
          const freshST = stock.find(s => s.stock_id === item.stockEntry.stock_id);

          if (!freshST || Number(freshST.quantity) <= 0) {
            updated = true;
            return null;
          }

          const newQty = Math.min(item.quantity, Number(freshST.quantity));
          const productChanged = freshProd && JSON.stringify(freshProd) !== JSON.stringify(item.product);
          const stockChanged = freshST && JSON.stringify(freshST) !== JSON.stringify(item.stockEntry);
          const qtyChanged = newQty !== item.quantity;

          if (productChanged || stockChanged || qtyChanged) {
            updated = true;
            return {
              ...item,
              product: freshProd || item.product,
              stockEntry: freshST,
              quantity: newQty
            };
          }
          return item;
        })
        .filter((item): item is CartItem => item !== null && item.quantity > 0);

      if (updated || reconciled.length !== prevCart.length) {
        return reconciled;
      }
      return prevCart;
    });
  }, [products, stock]);

  // Helper: Check if expired
  const isExpired = (dateStr?: string) => {
    if (!dateStr) return false;
    const exp = new Date(dateStr);
    if (isNaN(exp.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    exp.setHours(0, 0, 0, 0);
    return exp < today;
  };

  // Vendor map lookup
  const vendorMap = useMemo(() => {
    const map = new Map<string, string>();
    vendors.forEach(v => map.set(v.vendor_id, v.vendor_name || v.name || v.vendor_id));
    return map;
  }, [vendors]);

  // Total & valid stock maps per product_id
  const { totalStockMap, validStockMap } = useMemo(() => {
    const totalMap = new Map<string, number>();
    const validMap = new Map<string, number>();
    stock.forEach(s => {
      const pid = s.product_id;
      if (!pid) return;
      const qty = Number(s.quantity) || 0;
      totalMap.set(pid, (totalMap.get(pid) || 0) + qty);
      if (!isExpired(s.expiry_date) && qty > 0) {
        validMap.set(pid, (validMap.get(pid) || 0) + qty);
      }
    });
    return { totalStockMap: totalMap, validStockMap: validMap };
  }, [stock]);

  // Categories, brands, vendors for filters
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach(p => {
      if (p.category && p.category.trim()) set.add(p.category.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  }, [products]);

  const brands = useMemo(() => Array.from(new Set(products.map(p => p.brand).filter(Boolean))), [products]);
  const uniqueVendors = useMemo(() => Array.from(new Set(products.map(p => p.vendor_id).filter(Boolean))), [products]);

  // Map how many units of each stock_id are currently in cart
  const cartQtyByStockId = useMemo(() => {
    const map = new Map<string, number>();
    cart.forEach(item => {
      const sid = item.stockEntry?.stock_id;
      if (sid) {
        map.set(sid, (map.get(sid) || 0) + Number(item.quantity || 0));
      }
    });
    return map;
  }, [cart]);

  // Get FIFO sorted non-expired batches with quantity > 0 for product (+ optional spec)
  const getMatchingStockBatches = (product: any, spec?: string) => {
    const cleanPid = String(product.product_id || '').trim().toLowerCase();
    const allProdBatches = stock.filter(
      s =>
        String(s.product_id || '').trim().toLowerCase() === cleanPid &&
        Number(s.quantity) > 0 &&
        !isExpired(s.expiry_date)
    );

    const trimmedSpec = (spec || '').trim();
    const isDefaultSpec =
      !trimmedSpec ||
      ['單一規格', '單一', '預設', 'default', 'single'].includes(trimmedSpec.toLowerCase());

    let matched = allProdBatches;
    if (!isDefaultSpec) {
      if (trimmedSpec === '其他/未歸類') {
        const declaredSpecs = parseSpecifications(product.specification);
        matched = allProdBatches.filter(s => {
          const sSpec = String(s.specification || '').trim();
          if (!sSpec) return true;
          return !declaredSpecs.some(ds => isSpecificationMatch(sSpec, ds));
        });
      } else {
        matched = allProdBatches.filter(s => isSpecificationMatch(s.specification, trimmedSpec));
        // Fallback if stock has no spec but product name/single-spec matches
        if (matched.length === 0) {
          const unspecified = allProdBatches.filter(
            s => !s.specification || ['-', '無', '預設', '單一規格', '標準'].includes(String(s.specification).trim())
          );
          if (unspecified.length === allProdBatches.length) {
            matched = unspecified;
          }
        }
      }
    }

    // Sort FIFO: earliest expiry first (undated after dated), then higher quantity
    return [...matched].sort((a, b) => {
      const hasExpA = Boolean(a.expiry_date && String(a.expiry_date).trim());
      const hasExpB = Boolean(b.expiry_date && String(b.expiry_date).trim());
      if (hasExpA && hasExpB) {
        const cmp = String(a.expiry_date).localeCompare(String(b.expiry_date));
        if (cmp !== 0) return cmp;
      } else if (hasExpA !== hasExpB) {
        return hasExpA ? -1 : 1;
      }
      return (Number(b.quantity) || 0) - (Number(a.quantity) || 0);
    });
  };

  // Compute remaining shippable stock (excluding already-expired & subtracting cart allocation)
  const getAvailableQtyForSpec = (product: any, spec?: string) => {
    const batches = getMatchingStockBatches(product, spec);
    return batches.reduce((sum, b) => sum + Number(b.quantity || 0), 0);
  };

  // Get current cart quantity for a product (+ optional spec)
  const getInCartQty = (productId: string, spec?: string) => {
    const cleanPid = String(productId || '').trim().toLowerCase();
    return cart
      .filter(it => {
        if (String(it.product.product_id || '').trim().toLowerCase() !== cleanPid) return false;
        if (!spec) return true;
        const itSpec = it.stockEntry ? (it.stockEntry.specification || '') : (it.product?.specification || '');
        if (spec === '其他/未歸類') return !String(itSpec).trim();
        return isSpecificationMatch(itSpec, spec);
      })
      .reduce((sum, it) => sum + Number(it.quantity || 0), 0);
  };

  // Quick-add 1 unit of product (+ optional spec) using FIFO batch selection
  const handleAddSpecToCart = (product: any, spec?: string) => {
    const statusInfo = getProductStatusInfo(product);
    if (statusInfo.isPaused) {
      if (statusInfo.isDiscontinued) {
        showToast(`❌ 【${product.name}】為「停產」商品，禁止出貨！`);
      } else {
        showToast(
          `❌ 【${product.name}】目前為「暫時缺貨」狀態${statusInfo.expectedDate ? ` (預計 ${statusInfo.expectedDate} 到貨)` : ''}，禁止出貨！`
        );
      }
      return;
    }

    const batches = getMatchingStockBatches(product, spec);
    if (batches.length === 0) {
      const cleanPid = String(product.product_id || '').trim().toLowerCase();
      const hasExpiredOnly = stock.some(
        s =>
          String(s.product_id || '').trim().toLowerCase() === cleanPid &&
          Number(s.quantity) > 0 &&
          isExpired(s.expiry_date) &&
          (!spec || isSpecificationMatch(s.specification, spec))
      );
      if (hasExpiredOnly) {
        showToast(`⚠️ 【${product.name}】${spec ? `(${spec}) ` : ''}現存批次已過期，禁止出貨！`);
      } else {
        showToast(`⚠️ 【${product.name}】${spec ? `(${spec}) ` : ''}目前無可用庫存！`);
      }
      return;
    }

    // Find first FIFO batch that still has unallocated quantity left
    const availableBatch = batches.find(b => {
      const inCartForBatch = cartQtyByStockId.get(b.stock_id) || 0;
      return Number(b.quantity) - inCartForBatch > 0;
    });

    if (!availableBatch) {
      showToast(`⚠️ 【${product.name}】${spec ? `(${spec}) ` : ''}已達所有可用庫存上限！`);
      return;
    }

    setCart(prev => {
      const existingIdx = prev.findIndex(it => it.stockEntry.stock_id === availableBatch.stock_id);
      if (existingIdx >= 0) {
        const next = [...prev];
        next[existingIdx] = {
          ...next[existingIdx],
          quantity: next[existingIdx].quantity + 1
        };
        return next;
      }
      return [
        ...prev,
        {
          id: `${availableBatch.stock_id}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          product,
          stockEntry: availableBatch,
          quantity: 1
        }
      ];
    });

    showToast(`✅ 已加入出貨：${product.name}${spec && spec !== '單一規格' ? ` (${spec})` : ''}`);
  };

  // Adjust cart quantity (+/- 1) directly from catalog card
  const handleAdjustProductSpecQty = (product: any, delta: number, spec?: string) => {
    if (delta > 0) {
      handleAddSpecToCart(product, spec);
      return;
    }

    const cleanPid = String(product.product_id || '').trim().toLowerCase();
    setCart(prev => {
      // Find last matching cart row to decrement
      for (let i = prev.length - 1; i >= 0; i--) {
        const it = prev[i];
        if (String(it.product.product_id || '').trim().toLowerCase() !== cleanPid) continue;
        if (spec && spec !== '單一規格') {
          const itSpec = it.stockEntry ? (it.stockEntry.specification || '') : (it.product?.specification || '');
          const matched =
            spec === '其他/未歸類'
              ? !String(itSpec).trim()
              : isSpecificationMatch(itSpec, spec);
          if (!matched) continue;
        }

        if (it.quantity <= 1) {
          return prev.filter((_, idx) => idx !== i);
        }
        const next = [...prev];
        next[i] = { ...it, quantity: it.quantity - 1 };
        return next;
      }
      return prev;
    });
  };

  // Handle scanned barcode / ?pid= URL param
  useEffect(() => {
    const pid = searchParams.get('pid');
    if (!pid || products.length === 0) return;

    const term = pid.trim().toLowerCase();
    const p = products.find(
      prod =>
        String(prod.product_id || '').toLowerCase() === term ||
        (prod.barcode && String(prod.barcode).toLowerCase() === term)
    );

    if (p) {
      const breakdown = computeProductSpecBreakdown(p, stock);
      const isMulti = breakdown.length > 1;
      if (isMulti) {
        setOnlyInStock(false);
        setSearchTerm(p.name);
        setMobileView('catalog');
        showToast(`🔍 已定位多規格商品【${p.name}】，請點選欲出貨的規格！`);
      } else {
        handleAddSpecToCart(p);
      }
      setSearchParams(
        prev => {
          prev.delete('pid');
          return prev;
        },
        { replace: true }
      );
    } else {
      showToast(`❌ 找不到商品: ${pid}`);
    }
  }, [searchParams, products, stock]);

  // Filtered & sorted catalog products
  const catalogProducts = useMemo(() => {
    let result = products.filter(p => {
      if (selectedCategory !== 'ALL' && (p.category || '').trim() !== selectedCategory) return false;
      if (filterBrand && p.brand !== filterBrand) return false;
      if (filterVendor && p.vendor_id !== filterVendor) return false;

      if (onlyInStock && !searchTerm.trim()) {
        const validQty = validStockMap.get(p.product_id) || 0;
        const statusInfo = getProductStatusInfo(p);
        if (validQty <= 0 || statusInfo.isPaused) return false;
      } else if (onlyInStock && searchTerm.trim()) {
        const validQty = validStockMap.get(p.product_id) || 0;
        if (validQty <= 0) return false;
      }

      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const vName = (vendorMap.get(p.vendor_id) || '').toLowerCase();
        const matches =
          (p.name || '').toLowerCase().includes(term) ||
          (p.product_id || '').toLowerCase().includes(term) ||
          (p.specification && p.specification.toLowerCase().includes(term)) ||
          (p.barcode && String(p.barcode).toLowerCase().includes(term)) ||
          (p.category && p.category.toLowerCase().includes(term)) ||
          vName.includes(term);
        if (!matches) return false;
      }

      return true;
    });

    const sorted = [...result];
    if (sortOrder === 'name_asc') {
      sorted.sort((a, b) => a.name.localeCompare(b.name, 'zh-HK'));
    } else if (sortOrder === 'name_desc') {
      sorted.sort((a, b) => b.name.localeCompare(a.name, 'zh-HK'));
    } else if (sortOrder === 'newest') {
      sorted.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    } else if (sortOrder === 'stock_low') {
      sorted.sort((a, b) => (validStockMap.get(a.product_id) || 0) - (validStockMap.get(b.product_id) || 0));
    } else if (sortOrder === 'stock_high') {
      sorted.sort((a, b) => (validStockMap.get(b.product_id) || 0) - (validStockMap.get(a.product_id) || 0));
    }
    return sorted;
  }, [
    products,
    selectedCategory,
    filterBrand,
    filterVendor,
    onlyInStock,
    searchTerm,
    sortOrder,
    validStockMap,
    vendorMap
  ]);

  const handleRemoveFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const updateCartItemQuantity = (id: string, newQty: number) => {
    setCart(prev =>
      prev.map(item => {
        if (item.id !== id) return item;
        if (isNaN(newQty) || newQty <= 0) return item;
        // Account for any other cart item referencing the exact same stock_id
        const otherQtySameBatch = prev
          .filter(o => o.id !== id && o.stockEntry.stock_id === item.stockEntry.stock_id)
          .reduce((sum, o) => sum + Number(o.quantity || 0), 0);
        const maxAvailable = Math.max(0, Number(item.stockEntry.quantity || 0) - otherQtySameBatch);
        if (newQty > maxAvailable) {
          showToast(`❌ 此儲位批次最多僅剩 ${maxAvailable} 件可出貨`);
          return { ...item, quantity: Math.max(1, maxAvailable) };
        }
        return { ...item, quantity: newQty };
      })
    );
  };

  const changeCartItemBatch = (cartItemId: string, newStockId: string) => {
    const newBatch = stock.find(s => s.stock_id === newStockId);
    if (!newBatch) return;
    if (isExpired(newBatch.expiry_date)) {
      showToast('❌ 該批次已過期，無法選用！');
      return;
    }

    setCart(prev => {
      const target = prev.find(it => it.id === cartItemId);
      if (!target) return prev;

      const existingSameBatch = prev.find(it => it.id !== cartItemId && it.stockEntry.stock_id === newStockId);
      if (existingSameBatch) {
        // Merge into existing cart row cleanly up to batch stock
        const combinedQty = Math.min(Number(newBatch.quantity || 0), existingSameBatch.quantity + target.quantity);
        return prev
          .filter(it => it.id !== cartItemId)
          .map(it =>
            it.id === existingSameBatch.id
              ? { ...it, stockEntry: newBatch, quantity: combinedQty }
              : it
          );
      }

      const clampedQty = Math.min(target.quantity, Math.max(1, Number(newBatch.quantity || 1)));
      return prev.map(it =>
        it.id === cartItemId ? { ...it, stockEntry: newBatch, quantity: clampedQty } : it
      );
    });
  };

  const handleSubmit = async () => {
    if (cart.length === 0 || isSubmitting) return;

    // Validate constraints before submission
    for (const item of cart) {
      const statusInfo = getProductStatusInfo(item.product);
      if (statusInfo.isPaused) {
        showToast(
          `❌ 商品【${item.product.name}】目前為「${statusInfo.isDiscontinued ? '停產' : '暫時缺貨'}」狀態，禁止出貨！請先移除。`
        );
        return;
      }
      if (isExpired(item.stockEntry.expiry_date)) {
        showToast(`❌ 商品【${item.product.name}】所選批次已過期，禁止出貨！`);
        return;
      }
      if (item.quantity > Number(item.stockEntry.quantity || 0)) {
        showToast(`❌ 【${item.product.name}】出貨數量超過批次剩餘庫存 (${item.stockEntry.quantity})！`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const batchTxId = `TX_${Date.now()}`;
      const dominantSep = getDominantDateSeparator(transactions);
      const txDate = formatConsistentTxDate(new Date(), dominantSep);

      for (let i = 0; i < cart.length; i++) {
        const item = cart[i];
        const payload = {
          id: `${batchTxId}_${item.stockEntry.stock_id || item.product.product_id}_${i}_${Math.random().toString(36).substring(2, 6)}`,
          transaction_id: batchTxId,
          batch_id: batchTxId,
          batch_tx_id: batchTxId,
          stock_id: item.stockEntry.stock_id,
          product_id: item.product.product_id,
          quantity: item.quantity,
          price: item.product.price || item.product.cost_price || 0,
          location: item.stockEntry.location,
          floor: item.stockEntry.floor,
          area: item.stockEntry.area,
          expiry_date: item.stockEntry.expiry_date || '',
          specification: item.stockEntry.specification || '',
          date: txDate,
          note: `[批次出貨 ${batchTxId}]`,
          operator
        };
        await enqueueAction('stockOut', payload);
      }

      showToast('✅ 全部出貨成功！');
      setCart([]);
      navigate('/products');
    } catch (e: any) {
      showToast('❌ 出貨失敗: ' + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalCost = cart.reduce((sum, item) => sum + (Number(item.product.cost_price) || 0) * item.quantity, 0);
  const totalPieces = cart.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  return (
    <div className="flex-1 flex flex-col pt-3 sm:pt-4">
      {/* Mobile Sub-View Toggle Bar (< lg) */}
      <div className="lg:hidden px-1 mb-3">
        <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-900/90 border border-white/10 rounded-xl">
          <button
            type="button"
            onClick={() => setMobileView('catalog')}
            className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              mobileView === 'catalog'
                ? 'bg-sky-500 text-slate-950 shadow-sm'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>商品目錄挑選</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileView('cart')}
            className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
              mobileView === 'cart'
                ? 'bg-sky-500 text-slate-950 shadow-sm'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            <span>待出貨清單</span>
            {cart.length > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono tabular-nums font-black ${
                mobileView === 'cart' ? 'bg-slate-950 text-sky-300' : 'bg-sky-500 text-slate-950'
              }`}>
                {totalPieces}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Main Split Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT COLUMN: Embedded Product Catalog Directory */}
        <div className={`lg:col-span-7 xl:col-span-8 space-y-3 ${mobileView === 'cart' ? 'hidden lg:block' : 'block'}`}>
          {/* Search + Scan + Filters Bar */}
          <div className="glass-panel rounded-2xl border border-white/10 bg-slate-900/75 p-3 sm:p-4 space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="搜尋品名、貨號、條碼、規格..."
                  className="w-full pl-10 pr-9 py-2.5 bg-black/40 border border-white/10 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 outline-none focus:border-sky-500 transition-all"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowFilters(!showFilters)}
                className={`px-3 py-2.5 rounded-xl border transition-colors flex items-center gap-1.5 text-xs font-bold shrink-0 cursor-pointer ${
                  showFilters || filterBrand || filterVendor
                    ? 'bg-sky-500 border-sky-400 text-slate-950'
                    : 'bg-black/40 border-white/10 text-slate-300 hover:bg-white/5'
                }`}
                title="展開進階篩選與排序"
              >
                <Filter className="w-4 h-4" />
                <span className="hidden sm:inline">篩選</span>
              </button>

              <button
                type="button"
                onClick={() => navigate('/scan?returnTo=/manage?type=stock_out')}
                className="px-3 py-2.5 bg-white/10 hover:bg-white/15 border border-white/10 text-sky-400 rounded-xl active:scale-95 transition-all flex items-center gap-1.5 text-xs font-bold shrink-0 cursor-pointer"
                title="開啟相機掃描條碼快速加入"
              >
                <ScanBarcode className="w-4 h-4" />
                <span className="hidden sm:inline">掃碼</span>
              </button>
            </div>

            {/* Collapsible Advanced Filters */}
            {showFilters && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-white/10 animate-in fade-in slide-in-from-top-1">
                <select
                  value={filterVendor}
                  onChange={e => setFilterVendor(e.target.value)}
                  className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-sky-500 cursor-pointer"
                >
                  <option value="">所有供應商</option>
                  {uniqueVendors.map(v => (
                    <option key={v as string} value={v as string}>
                      {vendorMap.get(v as string) || (v as string)}
                    </option>
                  ))}
                </select>

                <select
                  value={filterBrand}
                  onChange={e => setFilterBrand(e.target.value)}
                  className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-sky-500 cursor-pointer"
                >
                  <option value="">所有品牌</option>
                  {brands.map(b => (
                    <option key={b as string} value={b as string}>
                      {b as string}
                    </option>
                  ))}
                </select>

                <select
                  value={sortOrder}
                  onChange={e => setSortOrder(e.target.value as any)}
                  className="bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-sky-500 cursor-pointer"
                >
                  <option value="stock_high">排序：庫存高 ➔ 低</option>
                  <option value="stock_low">排序：庫存低 ➔ 高</option>
                  <option value="name_asc">排序：品名 A ➔ Z</option>
                  <option value="name_desc">排序：品名 Z ➔ A</option>
                  <option value="newest">排序：最新建檔</option>
                </select>
              </div>
            )}

            {/* Category Pills + In-Stock Toggle */}
            <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar text-xs flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => setSelectedCategory('ALL')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold shrink-0 transition-all cursor-pointer ${
                    selectedCategory === 'ALL'
                      ? 'bg-sky-500 text-slate-950 shadow-sm'
                      : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/5'
                  }`}
                >
                  全部 ({products.length})
                </button>
                {categories.map(cat => {
                  const count = products.filter(p => (p.category || '').trim() === cat).length;
                  return (
                    <button
                      type="button"
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium shrink-0 transition-all cursor-pointer ${
                        selectedCategory === cat
                          ? 'bg-sky-500 text-slate-950 shadow-sm font-bold'
                          : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/5'
                      }`}
                    >
                      {cat} ({count})
                    </button>
                  );
                })}
              </div>

              <label className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-slate-200 cursor-pointer select-none shrink-0">
                <input
                  type="checkbox"
                  checked={onlyInStock}
                  onChange={(e) => setOnlyInStock(e.target.checked)}
                  className="w-3.5 h-3.5 accent-sky-500 rounded"
                />
                <span>僅顯示有可用庫存</span>
              </label>
            </div>
          </div>

          {/* Product Catalog Cards Grid */}
          <div className={cart.length > 0 ? 'pb-28 lg:pb-6' : 'pb-20 lg:pb-6'}>
            {catalogProducts.length === 0 ? (
              <div className="glass-panel rounded-2xl border border-white/10 p-10 text-center space-y-3">
                <Package className="w-10 h-10 text-slate-500 mx-auto" />
                <p className="text-sm font-bold text-slate-300">找不到符合條件的可出貨商品</p>
                {onlyInStock && (
                  <button
                    type="button"
                    onClick={() => setOnlyInStock(false)}
                    className="px-4 py-2 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    顯示全部商品（含無庫存／已停產）
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {catalogProducts.map(p => {
                  const statusInfo = getProductStatusInfo(p);
                  const isBlocked = statusInfo.isPaused;
                  const breakdown = computeProductSpecBreakdown(p, stock);
                  const isDefaultSingle =
                    breakdown.length === 1 &&
                    ['單一規格', '單一', '預設', '', 'default', 'single'].includes(
                      (breakdown[0].spec || '').trim().toLowerCase()
                    );
                  const hasMultipleSpecs = breakdown.length > 1;
                  const totalValid = validStockMap.get(p.product_id) || 0;
                  const totalAll = totalStockMap.get(p.product_id) || 0;
                  const totalInCart = getInCartQty(p.product_id);
                  const vName = vendorMap.get(p.vendor_id) || '';

                  return (
                    <div
                      key={p.product_id}
                      className={`p-3 rounded-xl border transition-all flex flex-col justify-between gap-2.5 ${
                        isBlocked
                          ? 'bg-rose-950/20 border-rose-500/30 opacity-75'
                          : totalInCart > 0
                            ? 'bg-sky-950/30 border-sky-500/50 shadow-sm shadow-sky-500/10'
                            : 'bg-slate-900/75 hover:bg-slate-900 border-white/10'
                      }`}
                    >
                      {/* Top Info */}
                      <div className="space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-bold text-xs sm:text-sm text-white break-words leading-snug">
                            {p.name}
                          </span>
                          {isBlocked ? (
                            <span className="shrink-0 text-[10px] px-2 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-full font-bold flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 text-rose-400" />
                              {statusInfo.isDiscontinued ? '停產' : `缺貨 (${statusInfo.expectedDate || '未定'})`}
                            </span>
                          ) : totalInCart > 0 ? (
                            <span className="shrink-0 text-[10px] px-2 py-0.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full font-bold font-mono tabular-nums">
                              待出貨 x{totalInCart}
                            </span>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-400">
                          <span className="font-mono text-slate-500 text-[10px]">{p.product_id}</span>
                          {p.specification && !hasMultipleSpecs && (
                            <span className="bg-white/5 px-1.5 py-0.5 rounded text-slate-300 border border-white/5">
                              {p.specification}
                            </span>
                          )}
                          {p.category && <span>• {p.category}</span>}
                          {vName && <span>• {vName}</span>}
                        </div>

                        {!hasMultipleSpecs && (
                          <div className="pt-0.5">
                            <ProductSpecStockBadges product={p} size="xs" />
                          </div>
                        )}
                      </div>

                      {/* Stock & Action Footer (Single Spec / Default) */}
                      <div className="flex items-center justify-between pt-2 border-t border-white/5 text-xs flex-wrap gap-2">
                        <div className="flex items-center gap-2.5 flex-wrap font-mono tabular-nums">
                          <span className="text-[11px] text-slate-400">
                            可出貨:{' '}
                            <strong className={totalValid > 0 ? 'text-sky-300' : 'text-rose-400'}>
                              {totalValid}
                            </strong>
                            {totalAll > totalValid && (
                              <span className="text-[10px] text-rose-400 ml-1">
                                (含過期 {totalAll - totalValid})
                              </span>
                            )}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            進價: <strong className="text-amber-300">${p.cost_price || 0}</strong>
                          </span>
                        </div>

                        {!hasMultipleSpecs && (
                          <div>
                            {isBlocked ? (
                              <span className="text-[11px] px-2.5 py-1 bg-rose-950/40 text-rose-400 border border-rose-500/30 rounded-lg font-bold">
                                禁止出貨
                              </span>
                            ) : totalValid <= 0 ? (
                              <span className="text-[11px] px-2.5 py-1 bg-white/5 text-slate-500 border border-white/10 rounded-lg font-bold">
                                無可用庫存
                              </span>
                            ) : totalInCart > 0 ? (
                              <div className="flex items-center gap-1.5 bg-slate-950 border border-sky-500/40 rounded-lg p-0.5">
                                <button
                                  type="button"
                                  onClick={() => handleAdjustProductSpecQty(p, -1, isDefaultSingle ? undefined : breakdown[0]?.spec)}
                                  className="p-1.5 hover:bg-white/10 text-slate-300 hover:text-white rounded transition-colors cursor-pointer"
                                  title="減少 1"
                                >
                                  <Minus className="w-3.5 h-3.5" />
                                </button>
                                <span className="px-2 font-mono tabular-nums font-bold text-xs text-sky-300">
                                  {totalInCart}
                                </span>
                                <button
                                  type="button"
                                  disabled={totalInCart >= totalValid}
                                  onClick={() => handleAdjustProductSpecQty(p, 1, isDefaultSingle ? undefined : breakdown[0]?.spec)}
                                  className="p-1.5 hover:bg-white/10 text-sky-300 hover:text-white rounded transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                  title="增加 1"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleAddSpecToCart(p, isDefaultSingle ? undefined : breakdown[0]?.spec)}
                                className="flex items-center gap-1 px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-lg text-xs font-extrabold shadow-sm transition-all cursor-pointer active:scale-95"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>加入出貨</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Multi-Specification Selector Grid */}
                      {hasMultipleSpecs && (
                        <div className="space-y-1.5 pt-2 border-t border-white/5 bg-white/[0.02] -mx-3 -mb-3 p-3 rounded-b-xl">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-slate-400 flex items-center gap-1 font-medium">
                              <Tag className="w-3 h-3 text-sky-400" />
                              <span>選擇出貨規格 ({breakdown.length} 款)：</span>
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {breakdown.map((sb, sIdx) => {
                              const specAvailable = getAvailableQtyForSpec(p, sb.spec);
                              const specInCart = getInCartQty(p.product_id, sb.spec);

                              return (
                                <div
                                  key={`${sb.spec}_${sIdx}`}
                                  className={`flex items-center justify-between border rounded-lg px-2 py-1.5 gap-1.5 ${
                                    specInCart > 0
                                      ? 'bg-sky-500/10 border-sky-500/40'
                                      : 'bg-white/[0.04] border-white/5'
                                  }`}
                                >
                                  <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                    <span className="text-xs text-slate-200 font-medium break-words leading-tight">
                                      {sb.spec}
                                    </span>
                                    <span
                                      className={`text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded shrink-0 ${
                                        specAvailable > 0
                                          ? 'text-sky-300 bg-sky-500/10 border border-sky-500/20 font-bold'
                                          : 'text-slate-500 bg-white/5 border border-white/5'
                                      }`}
                                      title={`可出貨未過期庫存: ${specAvailable}`}
                                    >
                                      {specAvailable}
                                    </span>
                                  </div>

                                  {isBlocked ? (
                                    <span className="text-[10px] text-rose-400 font-bold shrink-0">禁出</span>
                                  ) : specAvailable <= 0 ? (
                                    <span className="text-[10px] text-slate-500 shrink-0">無庫存</span>
                                  ) : specInCart > 0 ? (
                                    <div className="flex items-center gap-1 bg-slate-950 border border-sky-500/40 rounded p-0.5 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => handleAdjustProductSpecQty(p, -1, sb.spec)}
                                        className="p-1 hover:bg-white/10 text-slate-300 hover:text-white rounded cursor-pointer"
                                      >
                                        <Minus className="w-3 h-3" />
                                      </button>
                                      <span className="px-1 font-mono tabular-nums font-bold text-[11px] text-sky-300">
                                        {specInCart}
                                      </span>
                                      <button
                                        type="button"
                                        disabled={specInCart >= specAvailable}
                                        onClick={() => handleAdjustProductSpecQty(p, 1, sb.spec)}
                                        className="p-1 hover:bg-white/10 text-sky-300 hover:text-white rounded cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                      >
                                        <Plus className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleAddSpecToCart(p, sb.spec)}
                                      className="text-[11px] px-2.5 py-1 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-md font-extrabold transition-colors shrink-0 cursor-pointer active:scale-95"
                                    >
                                      + 加入
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Live Outbound Cart (Sticky on Desktop) */}
        <div
          ref={cartPanelRef}
          className={`lg:col-span-5 xl:col-span-4 lg:sticky lg:top-20 ${
            mobileView === 'catalog' ? 'hidden lg:block' : 'block pb-24 lg:pb-0'
          }`}
        >
          <div className="glass-panel rounded-2xl border border-white/15 bg-slate-900/90 shadow-2xl overflow-hidden flex flex-col lg:max-h-[calc(100vh-7.5rem)]">
            {/* Cart Header */}
            <div className="p-4 border-b border-white/10 bg-gradient-to-r from-slate-900 via-sky-950/30 to-slate-900 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-2 bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded-xl shrink-0">
                  <ShoppingCart className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                    <span>待出貨清單</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30 font-mono tabular-nums">
                      {cart.length} 筆 / {totalPieces} 件
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400 truncate">
                    點選左側商品自動 FIFO 配對批次，可於下方切換儲位
                  </p>
                </div>
              </div>

              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="text-[11px] text-slate-400 hover:text-rose-400 px-2 py-1 rounded-lg hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all shrink-0 cursor-pointer"
                >
                  清空
                </button>
              )}
            </div>

            {/* Cart Items Scroll Area */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5 custom-scrollbar min-h-[220px]">
              {cart.length === 0 ? (
                <div className="py-12 px-4 flex flex-col items-center justify-center text-center space-y-3 text-slate-400">
                  <div className="w-14 h-14 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center">
                    <ShoppingCart className="w-7 h-7 opacity-40 text-sky-400" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-sm text-slate-300">出貨清單目前是空的</p>
                    <p className="text-xs text-slate-500">
                      在商品目錄點選「+ 加入出貨」或掃描條碼即可新增
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMobileView('catalog')}
                    className="lg:hidden px-4 py-2 bg-sky-500/20 text-sky-300 border border-sky-500/30 rounded-xl text-xs font-bold cursor-pointer"
                  >
                    返回挑選商品
                  </button>
                </div>
              ) : (
                cart.map(item => {
                  const cleanPid = String(item.product.product_id || '').trim().toLowerCase();
                  const specLabel = item.stockEntry?.specification || item.product?.specification || '';
                  const validBatchesForProd = stock.filter(
                    s =>
                      String(s.product_id || '').trim().toLowerCase() === cleanPid &&
                      Number(s.quantity) > 0 &&
                      !isExpired(s.expiry_date)
                  );
                  const otherCartQtySameBatch = cart
                    .filter(o => o.id !== item.id && o.stockEntry.stock_id === item.stockEntry.stock_id)
                    .reduce((sum, o) => sum + Number(o.quantity || 0), 0);
                  const maxAllowedQty = Math.max(1, Number(item.stockEntry.quantity || 0) - otherCartQtySameBatch);
                  const unitCost = Number(item.product.cost_price) || 0;

                  return (
                    <div
                      key={item.id}
                      className="bg-white/[0.04] border border-white/10 rounded-xl p-3 space-y-2.5 animate-in fade-in duration-150"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 space-y-1">
                          <h4 className="text-white font-bold text-xs sm:text-sm break-words leading-snug">
                            {item.product.name}
                          </h4>
                          <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                            <span className="font-mono text-slate-400">{item.product.product_id}</span>
                            {specLabel && (
                              <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-bold">
                                規格: {specLabel}
                              </span>
                            )}
                            <span className="font-mono tabular-nums text-amber-300">
                              單價 ${unitCost.toLocaleString()}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveFromCart(item.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors shrink-0 cursor-pointer"
                          title="移出清單"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Batch / Location Switcher */}
                      <div>
                        <label className="text-[10px] text-slate-400 flex items-center gap-1 mb-1">
                          <MapPin className="w-3 h-3 text-sky-400" />
                          <span>出庫儲位批次 (餘 {item.stockEntry.quantity} 件)</span>
                        </label>
                        {validBatchesForProd.length > 0 ? (
                          <select
                            value={item.stockEntry.stock_id}
                            onChange={(e) => changeCartItemBatch(item.id, e.target.value)}
                            className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-200 outline-none focus:border-sky-500 cursor-pointer"
                          >
                            {validBatchesForProd.map(s => (
                              <option key={s.stock_id} value={s.stock_id} className="bg-slate-900">
                                {s.location}-{s.floor}-{s.area}
                                {s.specification ? ` [${s.specification}]` : ''}
                                {` · 餘 ${s.quantity}`}
                                {s.expiry_date ? ` (效期 ${s.expiry_date})` : ''}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-2.5 py-1.5">
                            {item.stockEntry.location}-{item.stockEntry.floor}-{item.stockEntry.area} (無可用替代批次)
                          </div>
                        )}
                      </div>

                      {/* Quantity & Subtotal */}
                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5">
                        <div className="text-xs font-bold text-slate-300 font-mono tabular-nums">
                          成本小計:{' '}
                          <span className="text-sky-400">
                            ${(unitCost * item.quantity).toLocaleString()}
                          </span>
                        </div>
                        <div className="w-28 sm:w-32 shrink-0">
                          <QuantityInput
                            min={1}
                            max={maxAllowedQty}
                            value={item.quantity}
                            onChange={(val) => updateCartItemQuantity(item.id, Number(val))}
                            className="!bg-black/40 !py-0 !h-8"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Cart Submit Footer */}
            {cart.length > 0 && (
              <div className="p-4 bg-black/60 backdrop-blur-xl border-t border-white/10 space-y-3 shrink-0">
                <div className="flex items-end justify-between gap-2">
                  <div className="text-xs text-slate-400">
                    共 <strong className="text-white font-mono tabular-nums">{cart.length}</strong> 筆批次 /{' '}
                    <strong className="text-sky-300 font-mono tabular-nums">{totalPieces}</strong> 件
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block">總進價成本</span>
                    <span className="text-xl font-black text-sky-400 font-mono tabular-nums">
                      ${totalCost.toLocaleString()}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl shadow-lg shadow-sky-500/20 font-extrabold text-sm text-slate-950 bg-sky-400 hover:bg-sky-300 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <span className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>批次出貨處理中...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>確認批次出貨 ({totalPieces} 件)</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Floating Checkout Summary Bar (above BottomNav) */}
      {cart.length > 0 && mobileView === 'catalog' && (
        <div className="fixed bottom-[68px] left-3 right-3 z-40 lg:hidden animate-in slide-in-from-bottom-4 duration-150">
          <div className="bg-slate-900/95 backdrop-blur-xl border border-sky-500/40 rounded-2xl p-3 shadow-2xl shadow-black/70 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-extrabold text-white font-mono tabular-nums">
                  已選 {cart.length} 筆 · {totalPieces} 件
                </div>
                <div className="text-[11px] text-sky-300 font-mono tabular-nums truncate">
                  總進價成本 ${totalCost.toLocaleString()}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setMobileView('cart')}
              className="px-4 py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold text-xs rounded-xl flex items-center gap-1.5 shadow-md shadow-sky-500/20 shrink-0 active:scale-95 cursor-pointer"
            >
              <span>檢視並出貨</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
