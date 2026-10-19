import { useState } from 'react';
import { Product, Stock } from '../lib/db';
import { useStore, parseSpecifications, isSpecificationMatch } from '../store/useStore';
import { ChevronDown, ChevronUp } from 'lucide-react';

export interface SpecStockItem {
  spec: string;
  quantity: number;
  isOutOfStock: boolean;
}

/**
 * Computes individual stock quantities for all specifications of a product.
 * Returns both in-stock and out-of-stock specifications.
 */
export function computeProductSpecBreakdown(
  product: Product,
  allStock: Stock[]
): SpecStockItem[] {
  if (!product) return [];

  const cleanPid = String(product.product_id || '').trim().toLowerCase();
  const matchedStocks = (allStock || []).filter(
    (s) => String(s.product_id || '').trim().toLowerCase() === cleanPid
  );

  // 1. Extract all declared specifications from product definition
  const declaredSpecs = parseSpecifications(product.specification);

  // 2. Extract specifications from actual stock ledger entries
  const stockSpecs: string[] = [];
  matchedStocks.forEach((s) => {
    const sSpec = String(s.specification || '').trim();
    if (sSpec) {
      // If stock specification itself contains delimiters, break it down or use exact string
      stockSpecs.push(sSpec);
    }
  });

  // 3. Build unique list of distinct specifications
  const uniqueSpecSet = new Set<string>();
  declaredSpecs.forEach((s) => uniqueSpecSet.add(s.trim()));
  stockSpecs.forEach((s) => uniqueSpecSet.add(s.trim()));

  // If no specifications found in either product or stock, treat as single default spec
  if (uniqueSpecSet.size === 0) {
    const totalQty = matchedStocks.reduce(
      (sum, s) => sum + (Number(s.quantity) || 0),
      0
    );
    return [
      {
        spec: '單一規格',
        quantity: totalQty,
        isOutOfStock: totalQty <= 0
      }
    ];
  }

  // 4. Calculate quantity for each specification
  const results: SpecStockItem[] = [];
  const processedStockIds = new Set<string>();

  const specList = Array.from(uniqueSpecSet);
  for (const spec of specList) {
    let specQty = 0;
    matchedStocks.forEach((s) => {
      if (isSpecificationMatch(s.specification, spec, product.name)) {
        specQty += Number(s.quantity) || 0;
        processedStockIds.add(s.stock_id);
      }
    });

    results.push({
      spec,
      quantity: specQty,
      isOutOfStock: specQty <= 0
    });
  }

  // 5. Catch any unallocated stock entries (e.g. items with blank spec when others have specs)
  const unallocatedStocks = matchedStocks.filter(
    (s) => !processedStockIds.has(s.stock_id)
  );
  if (unallocatedStocks.length > 0) {
    const unallocatedQty = unallocatedStocks.reduce(
      (sum, s) => sum + (Number(s.quantity) || 0),
      0
    );
    if (unallocatedQty > 0) {
      results.push({
        spec: '其他/未歸類',
        quantity: unallocatedQty,
        isOutOfStock: false
      });
    }
  }

  return results;
}

interface ProductSpecStockBadgesProps {
  product?: Product;
  productId?: string;
  className?: string;
  maxDisplay?: number;
  size?: 'xs' | 'sm';
  showTotalSummary?: boolean;
}

export default function ProductSpecStockBadges({
  product: propProduct,
  productId,
  className = '',
  maxDisplay = 6,
  size = 'xs',
  showTotalSummary = false
}: ProductSpecStockBadgesProps) {
  const [expanded, setExpanded] = useState(false);
  const products = useStore((state) => state.products);
  const stock = useStore((state) => state.stock);

  const targetProduct =
    propProduct ||
    products.find(
      (p) =>
        String(p.product_id || '').toLowerCase() ===
        String(productId || '').toLowerCase()
    ) ||
    (productId ? ({
      product_id: productId,
      name: productId,
      specification: '',
      cost_price: 0,
      price: 0
    } as unknown as Product) : undefined);

  if (!targetProduct) return null;

  const breakdown = computeProductSpecBreakdown(targetProduct, stock);
  if (breakdown.length === 0) return null;

  // Requirement 3: 只有單一規格的商品，不用展開顯示規格。
  // 規則：僅有設定為「單一規格」、空白或「預設」時隱藏；其他自訂單規格仍顯示。
  const trimmedSpec = (breakdown[0].spec || '').trim().toLowerCase();
  const isDefaultSingleSpec =
    breakdown.length === 1 &&
    ['單一規格', '單一', '預設', '', 'default', 'single'].includes(trimmedSpec);

  if (isDefaultSingleSpec && !showTotalSummary) {
    return null;
  }

  const totalStock = breakdown.reduce((sum, item) => sum + item.quantity, 0);
  const visibleItems = isDefaultSingleSpec
    ? []
    : expanded
    ? breakdown
    : breakdown.slice(0, maxDisplay);
  const hasMore = !isDefaultSingleSpec && breakdown.length > maxDisplay;

  const isXs = size === 'xs';

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {showTotalSummary && (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono font-bold ${
            totalStock > 0
              ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
              : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
          } ${isXs ? 'text-[11px]' : 'text-xs'}`}
        >
          <span>總庫存:</span>
          <span>{totalStock}</span>
        </span>
      )}

      {visibleItems.map((item, idx) => {
        if (item.isOutOfStock) {
          return (
            <span
              key={`${item.spec}_${idx}`}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.02] border border-white/5 text-slate-500 transition-colors select-none ${
                isXs ? 'text-[11px]' : 'text-xs'
              }`}
              title={`${item.spec} 目前無庫存 (0)`}
            >
              <span className="truncate max-w-[120px]">{item.spec}</span>
              <span className="font-mono tabular-nums text-slate-500 font-bold">
                0
              </span>
            </span>
          );
        }

        return (
          <span
            key={`${item.spec}_${idx}`}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-slate-200 transition-colors ${
              isXs ? 'text-[11px]' : 'text-xs'
            }`}
            title={`${item.spec} 現有庫存: ${item.quantity}`}
          >
            <span className="truncate max-w-[120px] text-slate-300">
              {item.spec}
            </span>
            <span className="font-mono tabular-nums font-bold text-sky-400">
              {item.quantity}
            </span>
          </span>
        );
      })}

      {hasMore && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 text-[10px] font-bold border border-white/5 transition-colors cursor-pointer"
        >
          <span>{expanded ? '收合' : `+${breakdown.length - maxDisplay} 規格`}</span>
          {expanded ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>
      )}
    </div>
  );
}
