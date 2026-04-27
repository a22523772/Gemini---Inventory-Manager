import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { Save, Plus, Trash2, Search, X, ScanBarcode, Minus, ShoppingCart, Filter } from 'lucide-react';

interface CartItem {
  id: string; // unique item id for the cart
  product: any;
  stockEntry: any;
  quantity: number;
}

export default function OutboundCart() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { products, stock, vendors, enqueueAction, operator, showToast } = useStore();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [selectedStockId, setSelectedStockId] = useState<string>('');
  const [quantityToAdd, setQuantityToAdd] = useState<string>('1');
  
  // Filter State
  const [showFilters, setShowFilters] = useState(false);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterBrand, setFilterBrand] = useState('');
  const [filterVendor, setFilterVendor] = useState('');

  // Load product if passed via URL (e.g. from Scanner)
  useEffect(() => {
    const pid = searchParams.get('pid');
    if (pid) {
      const term = pid.trim().toLowerCase();
      const p = products.find(p => p.product_id.toLowerCase() === term || p.barcode?.toLowerCase() === term);
      if (p) {
        setSelectedProduct(p);
        setIsModalOpen(true);
        // Clear param so it doesn't reopen on reload
        setSearchParams(prev => {
          prev.delete('pid');
          return prev;
        }, { replace: true });
      } else {
        showToast(`❌ 找不到商品: ${pid}`);
      }
    }
  }, [searchParams, products, setSearchParams, showToast]);

  const availableStocks = useMemo(() => {
    if (!selectedProduct) return [];
    return stock.filter(s => s.product_id === selectedProduct.product_id);
  }, [selectedProduct, stock]);

  useEffect(() => {
    if (availableStocks.length > 0 && !selectedStockId) {
      setSelectedStockId(availableStocks[0].stock_id);
    }
  }, [availableStocks, selectedStockId]);

  const searchResults = useMemo(() => {
    let result = products;
    
    // Search
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(p => 
        p.name.toLowerCase().includes(term) || 
        p.product_id.toLowerCase().includes(term) || 
        (p.barcode && p.barcode.toLowerCase().includes(term))
      );
    }
    
    // Filters
    if (filterCategory) result = result.filter(p => p.category === filterCategory);
    if (filterBrand) result = result.filter(p => p.brand === filterBrand);
    if (filterVendor) result = result.filter(p => p.vendor_id === filterVendor);

    return result;
  }, [searchTerm, products, filterCategory, filterBrand, filterVendor]);

  // Extract unique brands and categories for dropdowns
  const brands = useMemo(() => Array.from(new Set(products.map(p => p.brand).filter(Boolean))), [products]);
  const categories = useMemo(() => Array.from(new Set(products.map(p => p.category).filter(Boolean))), [products]);
  const uniqueVendors = useMemo(() => Array.from(new Set(products.map(p => p.vendor_id).filter(Boolean))), [products]);

  const getVendorName = (vid: string) => {
    const v = vendors.find(v => v.vendor_id === vid);
    return v ? v.vendor_name : vid;
  };

  const handleAddToCart = () => {
    if (!selectedProduct) return;
    const qty = parseInt(quantityToAdd);
    if (!qty || qty <= 0) {
      showToast('❌ 數量無效');
      return;
    }
    const st = availableStocks.find(s => s.stock_id === selectedStockId);
    if (!st) {
      showToast('❌ 請選擇有效庫存批次');
      return;
    }
    if (qty > st.quantity) {
      showToast(`❌ 數量大於剩餘庫存 (${st.quantity})`);
      return;
    }

    const newItem: CartItem = {
      id: Math.random().toString(36).substring(7),
      product: selectedProduct,
      stockEntry: st,
      quantity: qty
    };
    setCart([...cart, newItem]);
    
    // Reset modal state
    setIsModalOpen(false);
    setSelectedProduct(null);
    setSearchTerm('');
    setQuantityToAdd('1');
    setSelectedStockId('');
    showToast(`✅ 已加入: ${selectedProduct.name}`);
  };

  const handleRemoveFromCart = (id: string) => {
    setCart(cart.filter(item => item.id !== id));
  };

  const updateQuantity = (id: string, newQty: number) => {
    setCart(cart.map(item => {
      if (item.id === id) {
        if (newQty <= 0) return item;
        if (newQty > item.stockEntry.quantity) {
          showToast(`❌ 數量不能超過庫存 (${item.stockEntry.quantity})`);
          return item;
        }
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  // Helper: Check if expired
  const isExpired = (dateStr?: string) => {
    if (!dateStr) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const exp = new Date(dateStr);
    exp.setHours(0, 0, 0, 0);
    return exp < today;
  };

  const handleSubmit = async () => {
    if (cart.length === 0 || isSubmitting) return;
    
    // Check constraints
    for (const item of cart) {
      if (isExpired(item.stockEntry.expiry_date)) {
        showToast(`❌ 商品 ${item.product.name} 已過期，禁止出貨！`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      // Process items array serially
      for (const item of cart) {
        let payload = {
          stock_id: item.stockEntry.stock_id,
          product_id: item.product.product_id,
          quantity: item.quantity,
          location: item.stockEntry.location,
          floor: item.stockEntry.floor,
          area: item.stockEntry.area,
          expiry_date: item.stockEntry.expiry_date || '',
          specification: item.stockEntry.specification || '',
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

  const totalCost = cart.reduce((sum, item) => sum + (item.product.cost_price * item.quantity), 0);

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-150px)]">
      {/* Top Actions */}
      <div className="p-4 flex gap-3">
        <button 
          onClick={() => {
             setSelectedProduct(null);
             setSearchTerm('');
             setQuantityToAdd('1');
             setIsModalOpen(true);
          }}
          className="flex-1 flex items-center justify-center gap-2 py-3 bg-[var(--color-accent-blue)] text-[#0f172a] font-bold rounded-xl active:scale-95 transition-transform"
        >
          <Plus className="w-5 h-5" /> 手動選擇商品
        </button>
        <button 
          onClick={() => navigate('/scan?returnTo=/manage?type=stock_out')}
          className="w-14 flex items-center justify-center bg-white/10 text-white rounded-xl active:scale-95 transition-transform"
        >
          <ScanBarcode className="w-6 h-6 text-[var(--color-accent-blue)]" />
        </button>
      </div>

      {/* Cart Items */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
        {cart.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-[var(--color-text-dim)]">
             <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
                <ScanBarcode className="w-8 h-8 opacity-50" />
             </div>
             <p className="font-semibold text-white/50">請新增商品到出貨單</p>
          </div>
        ) : (
          cart.map((item, idx) => (
            <div key={item.id} className="glass-panel p-3 rounded-xl border border-white/5 relative flex flex-col animate-in slide-in-from-bottom-2" style={{ animationDelay: `${idx * 50}ms` }}>
               <div className="flex items-start justify-between mb-2 padding-r-8">
                  <div>
                    <h3 className="text-white font-bold text-sm">{item.product.name}</h3>
                    <p className="text-xs text-[var(--color-text-dim)] mt-1 tracking-wider uppercase">{item.product.product_id}</p>
                    <p className="text-xs text-white/40 mt-1">
                      儲位: {item.stockEntry.location}-{item.stockEntry.floor}-{item.stockEntry.area} <br/>
                      {item.stockEntry.expiry_date && <span className={isExpired(item.stockEntry.expiry_date) ? "text-red-400" : "text-orange-400"}>效期: {item.stockEntry.expiry_date}</span>}
                    </p>
                    {/* User requested cost price displayed */}
                    <p className="text-xs font-semibold text-[var(--color-text-dim)] mt-2 bg-white/5 inline-block px-2 py-0.5 rounded">
                      進價: <span className="text-[var(--color-accent-blue)]">${item.product.cost_price}</span> / {item.product.unit || '件'}
                    </p>
                  </div>
                  <button onClick={() => handleRemoveFromCart(item.id)} className="absolute top-3 right-3 p-1.5 text-white/20 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors">
                    <Trash2 className="w-5 h-5" />
                  </button>
               </div>
               
               <div className="flex items-center justify-between mt-2 pt-3 border-t border-white/5">
                 <div className="text-sm font-bold text-white">
                    小計: <span className="text-[var(--color-accent-blue)]">${(item.product.cost_price * item.quantity).toFixed(2)}</span>
                 </div>
                 <div className="flex items-center gap-3 bg-black/30 rounded-lg p-1 border border-white/10">
                   <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="p-1 active:bg-white/10 rounded">
                     <Minus className="w-4 h-4 text-white/70" />
                   </button>
                   <span className="w-8 text-center text-sm font-bold text-white">{item.quantity}</span>
                   <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="p-1 active:bg-white/10 rounded">
                     <Plus className="w-4 h-4 text-white/70" />
                   </button>
                 </div>
               </div>
            </div>
          ))
        )}
      </div>

      {/* Bottom Summary */}
      {cart.length > 0 && (
        <div className="p-4 bg-black/60 backdrop-blur-xl border-t border-white/10 shrink-0">
          <div className="flex justify-between items-end mb-4">
            <span className="text-sm text-white/60">共 {cart.length} 項商品</span>
            <div className="text-right">
              <span className="text-xs text-white/40 block mb-1">總進價</span>
              <span className="text-2xl font-black text-[var(--color-accent-blue)]">${totalCost.toFixed(2)}</span>
            </div>
          </div>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="w-full flex items-center justify-center py-4 px-4 rounded-xl shadow-sm font-bold text-[#0f172a] bg-[var(--color-accent-blue)] active:scale-95 transition-transform disabled:opacity-50"
          >
            <Save className="w-5 h-5 mr-2" />
            確認出貨 ({cart.length})
          </button>
        </div>
      )}

      {/* Add Item Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-200">
           <div className="w-full max-w-lg bg-[#0f172a] border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
              <div className="flex justify-between items-center p-4 border-b border-white/5 bg-white/5">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-[var(--color-accent-blue)]" /> 
                  加入出貨清單
                </h2>
                <button onClick={() => setIsModalOpen(false)} className="p-2 text-white/50 hover:text-white rounded-full transition-colors bg-white/5 hover:bg-white/10">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto w-full">
                {!selectedProduct ? (
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Search className="w-5 h-5 absolute left-3 top-3 text-white/40" />
                        <input 
                          type="text"
                          autoFocus
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          placeholder="搜尋商品名稱、條碼、ID..."
                          className="w-full pl-10 pr-4 py-3 bg-black/40 border border-white/10 rounded-xl text-white outline-none focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)]"
                        />
                      </div>
                      <button 
                        onClick={() => setShowFilters(!showFilters)}
                        className={`px-3 py-3 rounded-xl border transition-colors flex items-center justify-center ${showFilters ? 'bg-[var(--color-accent-blue)] border-[var(--color-accent-blue)] text-[#0f172a]' : 'bg-black/40 border-white/10 text-white/60 hover:bg-white/5'}`}
                      >
                        <Filter className="w-5 h-5" />
                      </button>
                    </div>

                    {showFilters && (
                      <div className="flex flex-wrap gap-2 animate-in fade-in slide-in-from-top-2 p-3 bg-black/20 rounded-xl border border-white/5">
                        <select 
                          value={filterCategory} 
                          onChange={e => setFilterCategory(e.target.value)}
                          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] appearance-none min-w-[100px]"
                        >
                          <option value="" className="bg-[#0f172a]">所有分類</option>
                          {categories.map(c => <option key={c as string} value={c as string} className="bg-[#0f172a]">{c as string}</option>)}
                        </select>
                        
                        <select 
                          value={filterBrand} 
                          onChange={e => setFilterBrand(e.target.value)}
                          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] appearance-none min-w-[100px]"
                        >
                          <option value="" className="bg-[#0f172a]">所有品牌</option>
                          {brands.map(b => <option key={b as string} value={b as string} className="bg-[#0f172a]">{b as string}</option>)}
                        </select>

                        <select 
                          value={filterVendor} 
                          onChange={e => setFilterVendor(e.target.value)}
                          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] appearance-none min-w-[120px]"
                        >
                          <option value="" className="bg-[#0f172a]">所有廠商</option>
                          {uniqueVendors.map(v => <option key={v as string} value={v as string} className="bg-[#0f172a]">{getVendorName(v as string)}</option>)}
                        </select>
                      </div>
                    )}
                    
                    <div className="space-y-2 mt-4 max-h-[40vh] overflow-y-auto w-full pr-2">
                      {searchResults.length === 0 ? (
                        <div className="text-center py-8 text-white/40 text-sm">找不到相關商品</div>
                      ) : (
                        searchResults.map(p => (
                          <div 
                            key={p.product_id}
                            onClick={() => {
                              setSelectedProduct(p);
                              setSearchTerm('');
                            }}
                            className="glass-panel p-3 rounded-xl border border-white/5 hover:border-[var(--color-accent-blue)]/50 cursor-pointer active:scale-[0.98] transition-all flex items-center justify-between w-full"
                          >
                             <div className="overflow-hidden pr-2">
                               <div className="font-bold text-white text-sm truncate">{p.name}</div>
                               <div className="text-xs text-white/40 tracking-wider truncate mt-1">{p.product_id}</div>
                             </div>
                             <Plus className="w-5 h-5 text-[var(--color-accent-blue)] shrink-0" />
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {/* Selected Product Summary */}
                    <div className="bg-white/5 rounded-xl p-3 border border-[var(--color-accent-blue)]/30 flex items-center justify-between">
                       <div>
                         <div className="text-xs text-[var(--color-accent-blue)] font-bold uppercase mb-1">已選商品</div>
                         <div className="text-white font-bold text-sm">{selectedProduct.name}</div>
                         <div className="text-xs text-white/40">{selectedProduct.product_id}</div>
                       </div>
                       <button onClick={() => setSelectedProduct(null)} className="text-xs text-white/40 underline py-1 px-2 border border-white/10 rounded hover:bg-white/5">
                         重新選擇
                       </button>
                    </div>

                    {/* Stock Batch Select */}
                    {availableStocks.length === 0 ? (
                      <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm font-semibold text-center mt-4">
                        此商品目前無庫存
                      </div>
                    ) : (
                      <>
                        <div className="w-full">
                          <label className="block text-xs font-bold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">選擇出貨批次</label>
                          <div className="w-full flex">
                             <select
                               value={selectedStockId}
                               onChange={(e) => setSelectedStockId(e.target.value)}
                               className="block w-full max-w-[calc(100vw-3rem)] rounded-xl border border-white/10 bg-black/30 py-3 px-3 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)]"
                             >
                               {availableStocks.map(s => (
                                 <option key={s.stock_id} value={s.stock_id}>
                                   {s.location}-{s.floor}-{s.area} [剩餘: {s.quantity}] {s.expiry_date ? `(效: ${s.expiry_date})` : ''}
                                 </option>
                               ))}
                             </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-[var(--color-text-dim)] uppercase tracking-wider mb-2">出貨數量</label>
                          <input 
                            type="number"
                            min="1"
                            value={quantityToAdd}
                            onChange={(e) => setQuantityToAdd(e.target.value)}
                            onFocus={(e) => e.target.select()}
                            className="block w-full rounded-xl border border-white/10 bg-black/30 py-3 px-3 text-sm text-[var(--color-text-main)] outline-none focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)]"
                          />
                        </div>

                        <button 
                          onClick={handleAddToCart}
                          disabled={!selectedStockId}
                          className="w-full mt-4 flex items-center justify-center py-4 bg-[var(--color-accent-blue)] text-[#0f172a] font-bold rounded-xl active:scale-95 transition-transform disabled:opacity-50"
                        >
                          <Plus className="w-5 h-5 mr-1" /> 加入清單
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
           </div>
        </div>
      )}

    </div>
  );
}
