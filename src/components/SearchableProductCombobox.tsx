import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Product } from '../lib/db';
import { Search, X, Check, ChevronDown, Sparkles, Package } from 'lucide-react';
import { cn } from '../lib/utils';

interface SearchableProductComboboxProps {
  value: string;
  products: Product[];
  onSelect: (product: Product) => void;
  onClear: () => void;
  placeholder?: string;
  className?: string;
}

export default function SearchableProductCombobox({
  value,
  products,
  onSelect,
  onClear,
  placeholder = '輸入品名/代號搜尋系統商品...',
  className
}: SearchableProductComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const matchedProduct = useMemo(() => {
    return products.find(p => p.product_id === value);
  }, [products, value]);

  // Filter products based on search query (name, product_id, barcode, specification, category)
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return products.slice(0, 30);
    }
    return products
      .filter(p => 
        p.name.toLowerCase().includes(q) ||
        p.product_id.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        (p.specification && p.specification.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q))
      )
      .slice(0, 40);
  }, [products, searchQuery]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      {/* If already matched with a system product */}
      {matchedProduct ? (
        <div className="flex items-center justify-between gap-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-2 py-1 text-xs text-emerald-300">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className="font-mono text-[10px] bg-emerald-500/20 text-emerald-300 px-1 py-0.5 rounded font-bold shrink-0">
              {matchedProduct.product_id}
            </span>
            <span className="font-bold text-white truncate text-[11px]" title={matchedProduct.name}>
              {matchedProduct.name}
            </span>
            {matchedProduct.specification && (
              <span className="text-[10px] text-emerald-400/80 truncate shrink-0">
                ({matchedProduct.specification})
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setIsOpen(true);
                setTimeout(() => inputRef.current?.focus(), 50);
              }}
              className="text-[10px] text-sky-400 hover:text-sky-300 hover:underline px-1 py-0.5 cursor-pointer"
              title="更換綁定的商品"
            >
              更換
            </button>
            <button
              type="button"
              onClick={onClear}
              className="text-slate-400 hover:text-red-400 p-0.5 rounded hover:bg-white/10 transition-colors cursor-pointer"
              title="取消系統商品綁定"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        /* Search Input Box */
        <div className="relative">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (!isOpen) setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              placeholder={placeholder}
              className="w-full bg-[#1e293b] border border-white/10 hover:border-sky-500/50 focus:border-sky-500 rounded-lg pl-7 pr-7 py-1 text-xs text-white placeholder-slate-500 focus:outline-none transition-colors"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 text-slate-400 hover:text-white p-0.5 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="absolute right-2 text-slate-400 hover:text-white p-0.5 cursor-pointer"
              >
                <ChevronDown className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Dropdown Popover */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-[#0f172a] border border-white/15 rounded-xl shadow-2xl z-50 max-h-60 overflow-y-auto custom-scrollbar divide-y divide-white/5">
          <div className="p-1.5 bg-white/[0.03] text-[10px] text-slate-400 flex items-center justify-between font-bold">
            <span>找到 {filteredProducts.length} 個相符商品</span>
            {searchQuery && (
              <span className="text-sky-400">關鍵字: "{searchQuery}"</span>
            )}
          </div>

          {filteredProducts.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400 space-y-1">
              <Package className="w-5 h-5 mx-auto text-slate-500 opacity-50" />
              <p>查無相符商品</p>
              <p className="text-[10px] text-slate-500">可直接保留原本單據品名入庫，或嘗試其他關鍵字</p>
            </div>
          ) : (
            filteredProducts.map(p => (
              <div
                key={p.product_id}
                onClick={() => {
                  onSelect(p);
                  setIsOpen(false);
                  setSearchQuery('');
                }}
                className={cn(
                  "p-2 hover:bg-sky-500/10 cursor-pointer transition-colors flex items-center justify-between gap-2 text-left",
                  p.product_id === value && "bg-emerald-500/15"
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono text-[10px] font-bold text-sky-400 bg-sky-500/10 px-1 py-0.2 rounded border border-sky-500/20">
                      {p.product_id}
                    </span>
                    <span className="font-bold text-xs text-white truncate">
                      {p.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                    {p.specification && <span>規格: {p.specification}</span>}
                    {p.category && <span>類別: {p.category}</span>}
                    {p.barcode && <span className="font-mono">條碼: {p.barcode}</span>}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="font-mono font-bold text-xs text-amber-300">
                    ${p.cost_price || 0}
                  </div>
                  {p.product_id === value && (
                    <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-0.5 justify-end mt-0.5">
                      <Check className="w-3 h-3" /> 已選
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
