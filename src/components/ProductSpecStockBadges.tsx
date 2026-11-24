import { useState } from 'react';
import { Product, Stock } from '../lib/db';
import { useStore, parseSpecifications, isSpecificationMatch, normalizeSpecString } from '../store/useStore';
import { ChevronDown, ChevronUp } from 'lucide-react';

export interface SpecStockItem {
  spec: string;
  quantity: number;
  isOutOfStock: boolean;
}

/**
 * Computes individual stock quantities for all specifications of a product.
 * Returns both in-stock and out-of-stock specifications without double-counting batches.
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
      stockSpecs.push(sSpec);
    }
  });

  // 3. Build deduplicated list of distinct specifications (case/bracket normalized, preserving first canonical label)
  const uniqueSpecByNorm = new Map<string, string>();
  [...declaredSpecs, ...stockSpecs].forEach((raw) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const norm = normalizeSpecString(trimmed);
    if (!uniqueSpecByNorm.has(norm)) {
      uniqueSpecByNorm.set(norm, trimmed);
    }
  });

  // If no specifications found in either product or stock, treat as single default spec
  if (uniqueSpecByNorm.size === 0) {
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

  const specList = Array.from(uniqueSpecByNorm.values());

  // 4. Mutually-exclusive assignment: each stock row belongs to at most ONE best-matching specification.
  // Tier 1: exact normalized equality; Tier 2: strict spec match (no product-name substring fallback).
  const qtyBySpec = new Map<string, number>();
  specList.forEach((spec) => qtyBySpec.set(spec, 0));
  const assignedStockIndices = new Set<number>();

  // Tier 1: exact normalized match
  matchedStocks.forEach((s, idx) => {
    const normStockSpec = normalizeSpecString(s.specification);
    if (!normStockSpec) return;
    const exactSpec = uniqueSpecByNorm.get(normStockSpec);
    if (exactSpec !== undefined) {
      qtyBySpec.set(exactSpec, (qtyBySpec.get(exactSpec) || 0) + (Number(s.quantity) || 0));
      assignedStockIndices.add(idx);
    }
  });

  // Tier 2: strict promo/word-boundary match for any remaining named stock specs
  matchedStocks.forEach((s, idx) => {
    if (assignedStockIndices.has(idx)) return;
    const rawStockSpec = String(s.specification || '').trim();
    if (!rawStockSpec) return;
    const matchedSpec = specList.find((spec) => isSpecificationMatch(rawStockSpec, spec));
    if (matchedSpec) {
      qtyBySpec.set(matchedSpec, (qtyBySpec.get(matchedSpec) || 0) + (Number(s.quantity) || 0));
      assignedStockIndices.add(idx);
    }
  });

  const results: SpecStockItem[] = specList.map((spec) => {
    const specQty = qtyBySpec.get(spec) || 0;
    return {
      spec,
      quantity: specQty,
      isOutOfStock: specQty <= 0
    };
  });

  // 5. Catch any unallocated stock entries (e.g. blank-spec stock when product has multiple declared specs)
  const unallocatedQty = matchedStocks.reduce((sum, s, idx) => {
    if (assignedStockIndices.has(idx)) return sum;
    return sum + (Number(s.quantity) || 0);
  }, 0);

  if (unallocatedQty > 0) {
    results.push({
      spec: '其他/未歸類',
      quantity: unallocatedQty,
      isOutOfStock: false
    });
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
