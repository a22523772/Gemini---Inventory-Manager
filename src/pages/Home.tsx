import { useState, useEffect, useMemo } from 'react';
import { useStore, calculateOrderStatus, getProductStatusInfo } from '../store/useStore';
import { 
  Package, ArrowDownToLine, ArrowUpFromLine, RefreshCcw, 
  AlertTriangle, BarChart2, Globe, Truck, Trash2, X, PlusCircle, User, Calendar, CheckCircle, Flame, Search, ArrowRight, FileText,
  ArrowUpDown, Edit2, Clock, Check, FileSpreadsheet, Download, Copy, Printer, ShoppingBag, Layers, Filter, Scan, Save, Settings,
  ChevronUp, ChevronDown, GripVertical
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

import { normalizePlatformName } from '../lib/platformUtils';

const SHORTCUT_OPTIONS = [
  { id: 'stock_in', label: '快速進貨', icon: ArrowDownToLine, to: '/manage?type=stock_in', colorClass: 'from-sky-500/10 to-sky-600/5 hover:from-sky-500/20 hover:to-sky-600/10 border-sky-500/20', iconBgClass: 'bg-sky-500/20 text-sky-400', smallTextClass: 'text-sky-400' },
  { id: 'stock_out', label: '快速出貨', icon: ArrowUpFromLine, to: '/manage?type=stock_out', colorClass: 'from-amber-500/10 to-amber-600/5 hover:from-amber-500/20 hover:to-amber-600/10 border-amber-500/20', iconBgClass: 'bg-amber-500/20 text-amber-400', smallTextClass: 'text-amber-400' },
  { id: 'scan', label: '智慧掃描', icon: Scan, to: '/scan', colorClass: 'from-indigo-500/10 to-indigo-600/5 hover:from-indigo-500/20 hover:to-indigo-600/10 border-indigo-500/20', iconBgClass: 'bg-indigo-500/20 text-indigo-400', smallTextClass: 'text-indigo-400' },
  { id: 'adjust', label: '盤點校正', icon: RefreshCcw, to: '/manage?type=adjust', colorClass: 'from-purple-500/10 to-purple-600/5 hover:from-purple-500/20 hover:to-purple-600/10 border-purple-500/20', iconBgClass: 'bg-purple-500/20 text-purple-400', smallTextClass: 'text-purple-400' },
  { id: 'purchases', label: '批次採購', icon: ShoppingBag, to: '/purchases', colorClass: 'from-emerald-500/10 to-emerald-600/5 hover:from-emerald-500/20 hover:to-emerald-600/10 border-emerald-500/20', iconBgClass: 'bg-emerald-500/20 text-emerald-400', smallTextClass: 'text-emerald-400' },
  { id: 'products', label: '商品管理', icon: Package, to: '/products', colorClass: 'from-blue-500/10 to-blue-600/5 hover:from-blue-500/20 hover:to-blue-600/10 border-blue-500/20', iconBgClass: 'bg-blue-500/20 text-blue-400', smallTextClass: 'text-blue-400' },
  { id: 'transactions', label: '交易紀錄', icon: FileText, to: '/transactions', colorClass: 'from-slate-500/10 to-slate-600/5 hover:from-slate-500/20 hover:to-slate-600/10 border-slate-500/20', iconBgClass: 'bg-slate-500/20 text-slate-400', smallTextClass: 'text-slate-400' },
  { id: 'reports', label: '洞察報表', icon: BarChart2, to: '/reports', colorClass: 'from-cyan-500/10 to-cyan-600/5 hover:from-cyan-500/20 hover:to-cyan-600/10 border-cyan-500/20', iconBgClass: 'bg-cyan-500/20 text-cyan-400', smallTextClass: 'text-cyan-400' },
  { id: 'vendors', label: '供應商', icon: User, to: '/vendors', colorClass: 'from-teal-500/10 to-teal-600/5 hover:from-teal-500/20 hover:to-teal-600/10 border-teal-500/20', iconBgClass: 'bg-teal-500/20 text-teal-400', smallTextClass: 'text-teal-400' },
];

export const getOrderPrice = (order: any): number => {
  if (!order) return 0;
  
  const parseNum = (v: any) => {
    if (typeof v === 'number' && !isNaN(v)) return v;
    if (typeof v === 'string') {
      const cleaned = v.replace(/[^0-9.]/g, '');
      const parsed = parseFloat(cleaned);
      return !isNaN(parsed) ? parsed : 0;
    }
    return 0;
  };

  const directPrice = parseNum(order.price) || parseNum(order.total_amount) || parseNum(order.order_amount) || parseNum(order.amount);
  if (directPrice > 0) return directPrice;

  if (Array.isArray(order.items) && order.items.length > 0) {
    const itemPrices = order.items
      .map((i: any) => parseNum(i?.price) || parseNum(i?.total_amount) || parseNum(i?.amount))
      .filter((p: number) => p > 0);

    if (itemPrices.length > 0) {
      if (itemPrices.every((p: number) => p === itemPrices[0]) && itemPrices.length > 1) {
        return itemPrices[0];
      }
      return itemPrices.reduce((sum: number, p: number) => sum + p, 0);
    }
  }
  return 0;
};

export default function Home() {
  const navigate = useNavigate();
  const { 
    products, 
    stock, 
    vendors,
    syncQueue, 
    isLoading, 
    fetchRemoteData, 
    error, 
    enqueueAction, 
    showToast,
    onlineOrders,
    fetchOnlineOrders,
    updateOnlineOrderStatus,
    deleteOnlineOrder
  } = useStore();

  const [activeShortcutIds, setActiveShortcutIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('dashboard_shortcuts');
      if (saved) return JSON.parse(saved);
    } catch {}
    return ['stock_in', 'stock_out', 'scan', 'adjust', 'transactions', 'reports', 'vendors'];
  });
  const [isShortcutModalOpen, setIsShortcutModalOpen] = useState(false);
  const [editingShortcuts, setEditingShortcuts] = useState<string[]>([]);
  const [draggedShortcutIndex, setDraggedShortcutIndex] = useState<number | null>(null);

  const [isOrderDashboardOpen, setIsOrderDashboardOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [orderErrors, setOrderErrors] = useState<string[]>([]);
  
  // Online Orders Dashboard Filtering & Sorting
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [orderPlatformFilter, setOrderPlatformFilter] = useState('ALL');
  const [orderStatusFilter, setOrderStatusFilter] = useState('ALL');
  const [orderStockFilter, setOrderStockFilter] = useState<'ALL' | 'READY' | 'SHORTFALL'>('ALL');
  const [orderShippingFilter, setOrderShippingFilter] = useState('ALL');
  const [orderQuickFilter, setOrderQuickFilter] = useState<'ALL' | 'OVERDUE' | 'DUE_SOON' | 'SHORTFALL' | 'READY'>('ALL');

  // Sorting state for online orders board
  const [orderSortType, setOrderSortType] = useState<
    'deadline_asc' | 'deadline_desc' | 'status' | 'amount_desc' | 'amount_asc' | 'created_desc' | 'created_asc'
  >('deadline_asc');

  // Manual status override state
  const [editingStatusOrder, setEditingStatusOrder] = useState<any | null>(null);
  const [customStatusInput, setCustomStatusInput] = useState('');

  // Stock issue force shipment confirmation modal
  const [confirmShipOrderModal, setConfirmShipOrderModal] = useState<{ order: any; errors: string[] } | null>(null);

  // Tab mode for online order dashboard
  const [orderDashboardTab, setOrderDashboardTab] = useState<'orders' | 'items_summary'>('orders');
  const [summarySearchQuery, setSummarySearchQuery] = useState('');
  const [summaryOnlyShortfall, setSummaryOnlyShortfall] = useState(false);
  const [summaryVendorFilter, setSummaryVendorFilter] = useState('ALL');

  // Anti-duplicate shipping in-flight state tracking
  const [shippingOrderIds, setShippingOrderIds] = useState<Set<string>>(new Set());

  const handleOpenShortcutModal = () => {
    setEditingShortcuts(activeShortcutIds);
    setIsShortcutModalOpen(true);
  };

  const handleSaveShortcuts = () => {
    setActiveShortcutIds(editingShortcuts);
    localStorage.setItem('dashboard_shortcuts', JSON.stringify(editingShortcuts));
    setIsShortcutModalOpen(false);
  };

  const toggleShortcut = (id: string) => {
    setEditingShortcuts(prev => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev; // prevent empty
        return prev.filter(x => x !== id);
      }
      return [...prev, id];
    });
  };

  const getStatusBadgeStyle = (statusText: string) => {
    if (!statusText) {
      return {
        text: '✅ 待出貨',
        color: 'text-emerald-100 border border-emerald-500/50 bg-emerald-600/30 font-bold'
      };
    }

    if (statusText.includes('逾期')) {
      return {
        text: statusText.startsWith('⚠️') ? statusText : `⚠️ ${statusText}`,
        color: 'text-white border-2 border-red-500 bg-gradient-to-r from-red-600 to-red-500 font-extrabold shadow-[0_0_12px_rgba(239,68,68,0.55)]'
      };
    }

    if (statusText.includes('即將到期')) {
      return {
        text: statusText.startsWith('⏰') ? statusText : `⏰ ${statusText}`,
        color: 'text-white border-2 border-amber-500 bg-gradient-to-r from-amber-600 to-amber-500 font-extrabold shadow-[0_0_12px_rgba(245,158,11,0.55)] animate-pulse'
      };
    }

    if (statusText.includes('待出貨') || statusText === '正常') {
      return {
        text: statusText.startsWith('✅') ? statusText : `✅ ${statusText}`,
        color: 'text-emerald-100 border border-emerald-500/50 bg-emerald-600/30 font-bold'
      };
    }

    if (statusText.includes('已包裝')) {
      return {
        text: statusText.startsWith('📦') ? statusText : `📦 ${statusText}`,
        color: 'text-indigo-100 border border-indigo-500/50 bg-indigo-600/30 font-bold'
      };
    }

    if (statusText.includes('處理中')) {
      return {
        text: statusText.startsWith('⏳') ? statusText : `⏳ ${statusText}`,
        color: 'text-sky-100 border border-sky-500/50 bg-sky-600/30 font-bold'
      };
    }

    if (statusText.includes('暫緩')) {
      return {
        text: statusText.startsWith('⏸️') ? statusText : `⏸️ ${statusText}`,
        color: 'text-purple-100 border border-purple-500/50 bg-purple-600/30 font-bold'
      };
    }

    return {
      text: statusText,
      color: 'text-zinc-200 border border-zinc-700 bg-zinc-800/80 font-bold'
    };
  };

  const productMap = useMemo(() => new Map(products.map(p => [p.product_id, p])), [products]);

  const getProductSpecification = (pid: string) => {
    const p = productMap.get(pid);
    return p ? p.specification : '';
  };

  const productTotalStockMap = useMemo(() => {
    const map = new Map<string, number>();
    stock.forEach(s => {
      map.set(s.product_id, (map.get(s.product_id) || 0) + s.quantity);
    });
    return map;
  }, [stock]);

  const lowStockProducts = useMemo(() => {
    return products.filter(p => {
      const statusInfo = getProductStatusInfo(p);
      if (statusInfo.isPaused || statusInfo.status === 'out_of_stock' || p.is_out_of_stock || p.is_discontinued) {
        return false;
      }
      const pStock = productTotalStockMap.get(p.product_id) || 0;
      const rawMin = p.min_stock;
      const alertThreshold = (typeof rawMin === 'number' && !isNaN(rawMin)) 
        ? rawMin 
        : (rawMin !== undefined && rawMin !== null && (rawMin as any) !== '' && !isNaN(Number(rawMin)))
          ? Number(rawMin)
          : 5;
      return pStock <= alertThreshold;
    });
  }, [products, productTotalStockMap]);

  const totalStock = stock.reduce((acc, curr) => acc + curr.quantity, 0);

  // Helper to validate single item health status (stock checks only)
  const checkItemHealth = (item: any) => {
    const product = products.find(p => p.product_id === item.product_id);
    if (!product) return { ok: false, message: '系統找不到此商品的資料，請先新增商品。' };

    const productStock = stock.filter(s => s.product_id === item.product_id);
    const totalQty = productStock.reduce((acc, curr) => acc + curr.quantity, 0);
    if (totalQty < item.quantity) {
      return { ok: false, message: `庫存量不足！需要 ${item.quantity}，但目前在席庫存僅剩 ${totalQty}。` };
    }

    const isExpired = (expiryStr?: string) => {
      if (!expiryStr) return false;
      const exp = new Date(expiryStr);
      if (isNaN(exp.getTime())) return false;
      const today = new Date();
      today.setHours(0,0,0,0);
      return exp < today;
    };
    const validStock = productStock.filter(s => !isExpired(s.expiry_date));
    const totalValid = validStock.reduce((acc, curr) => acc + curr.quantity, 0);
    if (totalValid < item.quantity) {
      return { ok: false, message: `出貨安全阻擋！雖有庫存 ${totalQty}，但皆已過期！可用健康庫存僅剩 ${totalValid}。` };
    }

    return { ok: true, message: '正常' };
  };

  // Helper to validate entire order health (including total cost vs order total price)
  const checkOrderHealth = (order: any) => {
    const errors: string[] = [];
    
    // Compare total cost vs order price
    const totalOrderCost = order.items.reduce((sum: number, item: any) => {
      const p = products.find(prod => prod.product_id === item.product_id);
      const cp = p ? (Number(p.cost_price) || 0) : 0;
      return sum + cp * item.quantity;
    }, 0);

    const price = getOrderPrice(order);
    if (price > 0 && totalOrderCost > price) {
      errors.push(`成本警示：訂單總進貨成本 ($${totalOrderCost.toLocaleString()}) 高於 訂單成交總價 ($${price.toLocaleString()})！`);
    }

    // Check individual items
    order.items.forEach((item: any) => {
      const itemHealth = checkItemHealth(item);
      if (!itemHealth.ok) {
        errors.push(`${item.product_name}: ${itemHealth.message}`);
      }
    });

    return {
      ok: errors.length === 0,
      errors
    };
  };

  const displayOrders = onlineOrders.filter(o => o.status !== '已刪除' && o.order_status !== '已刪除');

  // Group displayOrders by order_id
  const groupedOrdersMap: Record<string, any> = {};
  displayOrders.forEach(o => {
    const oid = o.order_id;
    if (!groupedOrdersMap[oid]) {
      const deadlineStr = o.shipping_deadline || o.status || '';
      const calcStatus = calculateOrderStatus(deadlineStr, o.order_status);

      groupedOrdersMap[oid] = {
        order_id: oid,
        platform: o.platform || '蝦皮購物',
        customer_name: o.customer_name || '顧客',
        shipping_deadline: deadlineStr,
        order_status: calcStatus,
        raw_order_status: o.order_status || '',
        created_at: o.created_at || '',
        shipping_method: o.shipping_method || '',
        price: Number(o.price) || 0,
        items: []
      };
    } else if (!groupedOrdersMap[oid].price && Number(o.price) > 0) {
      groupedOrdersMap[oid].price = Number(o.price);
    }
    groupedOrdersMap[oid].items.push(o);
  });
  
  const groupedOrders = Object.values(groupedOrdersMap);

  // Available unique options for dropdown filters
  const availablePlatforms = useMemo(() => {
    const set = new Set<string>();
    groupedOrders.forEach(o => {
      if (o.platform) set.add(o.platform);
    });
    return Array.from(set);
  }, [groupedOrders]);

  const availableShippingMethods = useMemo(() => {
    const set = new Set<string>();
    groupedOrders.forEach(o => {
      if (o.shipping_method) set.add(o.shipping_method);
      o.items.forEach((it: any) => {
        if (it.shipping_method) set.add(it.shipping_method);
      });
    });
    return Array.from(set);
  }, [groupedOrders]);

  // Calculate counts for quick filter pills
  const pendingOrdersCount = groupedOrders.length;
  const overdueOrdersCount = groupedOrders.filter(o => o.order_status.includes('逾期')).length;
  const dueSoonOrdersCount = groupedOrders.filter(o => o.order_status.includes('即將到期')).length;
  const shortfallOrdersCount = groupedOrders.filter(o => o.items.some((item: any) => !checkItemHealth(item).ok)).length;
  const readyOrdersCount = groupedOrders.filter(o => o.items.every((item: any) => checkItemHealth(item).ok)).length;
  const shippedOrdersCount = overdueOrdersCount;

  // Filter groupedOrders based on search query, dropdowns, and quick pills
  const filteredGroupedOrders = useMemo(() => {
    return groupedOrders.filter(order => {
      // 1. Quick Pill Filter
      if (orderQuickFilter === 'OVERDUE' && !order.order_status.includes('逾期')) return false;
      if (orderQuickFilter === 'DUE_SOON' && !order.order_status.includes('即將到期')) return false;
      if (orderQuickFilter === 'SHORTFALL' && !order.items.some((item: any) => !checkItemHealth(item).ok)) return false;
      if (orderQuickFilter === 'READY' && !order.items.every((item: any) => checkItemHealth(item).ok)) return false;

      // 2. Platform Dropdown Filter
      if (orderPlatformFilter !== 'ALL' && order.platform !== orderPlatformFilter) {
        return false;
      }

      // 3. Order Status Dropdown Filter
      if (orderStatusFilter !== 'ALL') {
        if (orderStatusFilter === 'OVERDUE' && !order.order_status.includes('逾期')) return false;
        if (orderStatusFilter === 'DUE_SOON' && !order.order_status.includes('即將到期')) return false;
        if (orderStatusFilter === 'PENDING' && !order.order_status.includes('待出貨') && order.order_status !== '正常') return false;
        if (orderStatusFilter === 'PACKED' && !order.order_status.includes('已包裝')) return false;
        if (orderStatusFilter === 'PROCESSING' && !order.order_status.includes('處理中')) return false;
        if (orderStatusFilter === 'HOLD' && !order.order_status.includes('暫緩')) return false;
        if (!['OVERDUE', 'DUE_SOON', 'PENDING', 'PACKED', 'PROCESSING', 'HOLD'].includes(orderStatusFilter)) {
          if (order.order_status !== orderStatusFilter && order.raw_order_status !== orderStatusFilter) return false;
        }
      }

      // 4. Stock Health Status Filter
      if (orderStockFilter === 'READY') {
        const isAllHealthy = order.items.every((item: any) => checkItemHealth(item).ok);
        if (!isAllHealthy) return false;
      } else if (orderStockFilter === 'SHORTFALL') {
        const hasShortfall = order.items.some((item: any) => !checkItemHealth(item).ok);
        if (!hasShortfall) return false;
      }

      // 5. Shipping Method Dropdown Filter
      if (orderShippingFilter !== 'ALL') {
        const orderShipMatch = order.shipping_method === orderShippingFilter;
        const itemShipMatch = order.items.some((it: any) => it.shipping_method === orderShippingFilter);
        if (!orderShipMatch && !itemShipMatch) return false;
      }

      // 6. Search Query
      if (orderSearchQuery.trim()) {
        const q = orderSearchQuery.toLowerCase().trim();
        const idMatch = order.order_id.toLowerCase().includes(q);
        const nameMatch = order.customer_name.toLowerCase().includes(q);
        const platMatch = order.platform.toLowerCase().includes(q);
        const shipMatch = order.shipping_method && order.shipping_method.toLowerCase().includes(q);
        const statMatch = order.order_status && order.order_status.toLowerCase().includes(q);

        const itemMatch = order.items.some((item: any) => {
          const pName = (item.product_name || '').toLowerCase();
          const spec = (item.specification || '').toLowerCase();
          const pid = (item.product_id || '').toLowerCase();
          return pName.includes(q) || spec.includes(q) || pid.includes(q);
        });

        if (!idMatch && !nameMatch && !platMatch && !shipMatch && !statMatch && !itemMatch) {
          return false;
        }
      }

      return true;
    });
  }, [
    groupedOrders,
    orderQuickFilter,
    orderPlatformFilter,
    orderStatusFilter,
    orderStockFilter,
    orderShippingFilter,
    orderSearchQuery,
    products,
    stock
  ]);

  // Sort grouped orders
  const sortedGroupedOrders = useMemo(() => {
    const list = [...filteredGroupedOrders];

    list.sort((a, b) => {
      if (orderSortType === 'deadline_asc') {
        const dA = a.shipping_deadline ? new Date(a.shipping_deadline).getTime() : Infinity;
        const dB = b.shipping_deadline ? new Date(b.shipping_deadline).getTime() : Infinity;
        return dA - dB;
      }
      if (orderSortType === 'deadline_desc') {
        const dA = a.shipping_deadline ? new Date(a.shipping_deadline).getTime() : 0;
        const dB = b.shipping_deadline ? new Date(b.shipping_deadline).getTime() : 0;
        return dB - dA;
      }
      if (orderSortType === 'status') {
        const getRank = (st: string) => {
          if (st.includes('逾期')) return 1;
          if (st.includes('即將到期')) return 2;
          if (st.includes('待出貨')) return 3;
          if (st.includes('處理中')) return 4;
          if (st.includes('已包裝')) return 5;
          if (st.includes('暫緩')) return 6;
          return 7;
        };
        return getRank(a.order_status) - getRank(b.order_status);
      }
      if (orderSortType === 'amount_desc') {
        const priceA = getOrderPrice(a);
        const priceB = getOrderPrice(b);
        return priceB - priceA;
      }
      if (orderSortType === 'amount_asc') {
        const priceA = getOrderPrice(a);
        const priceB = getOrderPrice(b);
        return priceA - priceB;
      }
      if (orderSortType === 'created_desc') {
        return String(b.created_at || '').localeCompare(String(a.created_at || ''));
      }
      if (orderSortType === 'created_asc') {
        return String(a.created_at || '').localeCompare(String(b.created_at || ''));
      }
      return 0;
    });

    return list;
  }, [filteredGroupedOrders, orderSortType]);

  // Vendors map for supplier names
  const vendorsMap = useMemo(() => new Map(vendors.map(v => [v.vendor_id, v.vendor_name])), [vendors]);

  // Aggregate all items across all pending online orders (ensuring all non-system items like ni-tk2618 are cleanly aggregated without loss)
  const consolidatedOrderItems = useMemo(() => {
    const itemMap = new Map<string, {
      product_id: string;
      product_name: string;
      specification: string;
      unit: string;
      vendor_name: string;
      total_ordered_qty: number;
      current_stock_qty: number;
      shortfall_qty: number;
      cost_price: number;
      selling_price: number;
      orders_count: number;
      order_ids: string[];
      is_non_system: boolean;
    }>();

    displayOrders.forEach(o => {
      const rawPid = String(o.product_id || '').trim();
      const rawName = String(o.product_name || '').trim();
      const rawSpec = String(o.specification || '').trim();

      // Find if this corresponds to a system product in products list
      const p = rawPid ? productMap.get(rawPid) : undefined;
      const matchedProd = p || (rawName ? products.find(prod => (prod.name && prod.name === rawName) || (prod.product_id && prod.product_id === rawName)) : undefined);

      const isSystemProduct = Boolean(matchedProd);
      const resolvedPid = matchedProd ? matchedProd.product_id : (rawPid || '非系統商品');
      const resolvedName = matchedProd ? matchedProd.name : (rawName || rawPid || '非系統商品 (未命名)');
      const resolvedSpec = rawSpec || (matchedProd ? (matchedProd.specification || '') : '');
      const resolvedUnit = matchedProd?.unit || '個';
      const resolvedCostPrice = matchedProd?.cost_price || 0;
      const resolvedVendor = matchedProd?.vendor_id 
        ? (vendorsMap.get(matchedProd.vendor_id) || '未指定廠商') 
        : (isSystemProduct ? '未指定廠商' : '非系統商品 / 尚未建檔');

      const currentStock = matchedProd 
        ? (productTotalStockMap.get(matchedProd.product_id) || 0) 
        : (rawPid && productTotalStockMap.has(rawPid) ? (productTotalStockMap.get(rawPid) || 0) : 0);

      // Distinct key ensuring non-system items with different names/specs never overwrite each other
      const key = isSystemProduct 
        ? `SYS_${matchedProd!.product_id}___${resolvedSpec}`
        : `NON_SYS_${resolvedName}___${resolvedPid}___${resolvedSpec}`;

      if (!itemMap.has(key)) {
        itemMap.set(key, {
          product_id: resolvedPid,
          product_name: resolvedName,
          specification: resolvedSpec,
          unit: resolvedUnit,
          vendor_name: resolvedVendor,
          total_ordered_qty: 0,
          current_stock_qty: currentStock,
          shortfall_qty: 0,
          cost_price: resolvedCostPrice,
          selling_price: Number(o.price) || matchedProd?.selling_price || 0,
          orders_count: 0,
          order_ids: [],
          is_non_system: !isSystemProduct
        });
      }

      const entry = itemMap.get(key)!;
      entry.total_ordered_qty += Number(o.quantity) || 1;
      if (!entry.order_ids.includes(o.order_id)) {
        entry.order_ids.push(o.order_id);
        entry.orders_count += 1;
      }
    });

    const result = Array.from(itemMap.values()).map(item => {
      const shortfall = Math.max(0, item.total_ordered_qty - item.current_stock_qty);
      return {
        ...item,
        shortfall_qty: shortfall
      };
    });

    return result;
  }, [displayOrders, productMap, products, productTotalStockMap, vendorsMap]);

  const filteredConsolidatedItems = useMemo(() => {
    return consolidatedOrderItems.filter(item => {
      if (summaryOnlyShortfall && item.shortfall_qty <= 0) return false;
      if (summaryVendorFilter !== 'ALL' && item.vendor_name !== summaryVendorFilter) return false;

      if (summarySearchQuery.trim()) {
        const q = summarySearchQuery.toLowerCase().trim();
        const pidMatch = (item.product_id || '').toLowerCase().includes(q);
        const nameMatch = (item.product_name || '').toLowerCase().includes(q);
        const specMatch = (item.specification || '').toLowerCase().includes(q);
        const vendorMatch = (item.vendor_name || '').toLowerCase().includes(q);
        const ordersMatch = item.order_ids.some(id => id.toLowerCase().includes(q));
        const nonSystemMatch = item.is_non_system && ('非系統商品'.includes(q) || '非系統'.includes(q));
        if (!pidMatch && !nameMatch && !specMatch && !vendorMatch && !ordersMatch && !nonSystemMatch) return false;
      }

      return true;
    });
  }, [consolidatedOrderItems, summaryOnlyShortfall, summaryVendorFilter, summarySearchQuery]);

  const summaryVendorOptions = useMemo(() => {
    const set = new Set<string>();
    consolidatedOrderItems.forEach(i => set.add(i.vendor_name));
    return Array.from(set);
  }, [consolidatedOrderItems]);

  const exportSummaryToExcel = () => {
    if (filteredConsolidatedItems.length === 0) {
      showToast("⚠️ 目前沒有可匯出的商品資料");
      return;
    }

    const headers = ['商品編號', '商品名稱', '規格', '供應商 / 來源', '單位', '網路訂單需求總量', '目前現有庫存量', '建議訂購數量(缺貨)', '預估進價成本', '預估採購小計', '涉及訂單筆數', '訂單編號列表', '系統建檔狀態'];
    const rows = filteredConsolidatedItems.map(item => {
      const rawSpec = item.specification ? String(item.specification).trim() : '';
      const isBlankSpec = !rawSpec || rawSpec === '預設規格' || rawSpec === '無' || rawSpec === '無規格' || rawSpec === '-' || rawSpec === '預設' || rawSpec === '未指定';
      const cleanSpec = isBlankSpec ? '' : rawSpec;
      return [
        `"${item.product_id || ''}"`,
        `"${(item.product_name || '').replace(/"/g, '""')}"`,
        `"${cleanSpec.replace(/"/g, '""')}"`,
        `"${(item.vendor_name || '').replace(/"/g, '""')}"`,
        `"${(item.unit || '個').replace(/"/g, '""')}"`,
        item.total_ordered_qty,
        item.current_stock_qty,
        item.shortfall_qty,
        item.cost_price || 0,
        (item.cost_price || 0) * item.shortfall_qty,
        item.orders_count,
        `"${item.order_ids.join('; ')}"`,
        `"${item.is_non_system ? '非系統商品' : '系統商品'}"`
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `網路訂單_全單商品訂貨彙整單_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("✅ 已成功匯出 Excel CSV 檔！");
  };

  const copySummaryForExcel = () => {
    if (filteredConsolidatedItems.length === 0) {
      showToast("⚠️ 目前沒有可複製的商品資料");
      return;
    }

    const headers = ['商品名稱', '規格', '數量'];
    const rows = filteredConsolidatedItems.map(item => {
      const rawSpec = item.specification ? String(item.specification).trim() : '';
      const isBlankSpec = !rawSpec || rawSpec === '預設規格' || rawSpec === '無' || rawSpec === '無規格' || rawSpec === '-' || rawSpec === '預設' || rawSpec === '未指定';
      const cleanSpec = isBlankSpec ? '' : rawSpec;
      return [
        item.product_name || '',
        cleanSpec,
        item.shortfall_qty > 0 ? item.shortfall_qty : item.total_ordered_qty
      ];
    });

    const tsvContent = [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');
    navigator.clipboard.writeText(tsvContent).then(() => {
      showToast("📋 已成功複製商品名稱、規格、數量！無規格已留空，可直接在 Excel 中貼上");
    }).catch(() => {
      showToast("❌ 複製失敗，請手動選取複製");
    });
  };

  const handleShipOrder = async (order: any, isForced: boolean = false) => {
    const orderIdStr = String(order.order_id || '').trim();
    if (!orderIdStr) return;

    // Prevent concurrent double-clicks or re-triggering while already processing
    if (shippingOrderIds.has(orderIdStr)) {
      return;
    }

    const health = checkOrderHealth(order);

    if (!health.ok && !isForced) {
      setConfirmShipOrderModal({ order, errors: health.errors });
      showToast("⚠️ 此訂單包含庫存問題，已自動擋住執行，請確認是否強行繼續！");
      return;
    }

    // Set lock immediately
    setShippingOrderIds(prev => new Set(prev).add(orderIdStr));

    try {
      const normPlatform = normalizePlatformName(order.platform);
      const txType = `stock_out ${normPlatform}`;
      const cleanOrderId = orderIdStr.replace(/[^a-zA-Z0-9_-]/g, '_');
      const timestampDate = format(new Date(), 'yyyy-MM-dd HH:mm:ss');
      const orderTxId = `TX_ORD_${cleanOrderId}`;

      for (let itemIdx = 0; itemIdx < order.items.length; itemIdx++) {
        const item = order.items[itemIdx];
        let remainingNeeded = Number(item.quantity) || 1;
        const itemPrice = Number(item.price || 0);
        const isProductInSystem = products.some(p => p.product_id && item.product_id && p.product_id === item.product_id);
        const productStock = isProductInSystem ? stock.filter(s => s.product_id === item.product_id) : [];
        
        const isExpired = (expiryStr?: string) => {
          if (!expiryStr) return false;
          const exp = new Date(expiryStr);
          if (isNaN(exp.getTime())) return false;
          const today = new Date();
          today.setHours(0,0,0,0);
          return exp < today;
        };
        const activeStock = productStock.filter(s => !isExpired(s.expiry_date));
        
        const sortedStock = [...activeStock].sort((a, b) => {
          if (!a.expiry_date) return 1;
          if (!b.expiry_date) return -1;
          return a.expiry_date.localeCompare(b.expiry_date);
        });

        const p = products.find(prod => prod.product_id === item.product_id);
        const itemCostPrice = p ? (Number(p.cost_price) || 0) : 0;
        let deductIdx = 0;

        if (isProductInSystem && sortedStock.length > 0) {
          for (const entry of sortedStock) {
            if (remainingNeeded <= 0) break;
            const deductQty = Math.min(entry.quantity, remainingNeeded);
            const rowUniqueId = `${orderTxId}_${itemIdx}_${deductIdx}_${Math.random().toString(36).substring(2, 6)}`;

            await enqueueAction('stockOut', {
              id: rowUniqueId,
              transaction_id: orderTxId,
              online_order_id: order.order_id,
              batch_id: orderTxId,
              batch_tx_id: orderTxId,
              platform: normPlatform,
              type: txType,
              stock_id: entry.stock_id,
              product_id: item.product_id || '',
              product_name: item.product_name || '',
              cost_price: itemCostPrice,
              price: itemPrice,
              quantity: deductQty,
              location: entry.location || '',
              floor: entry.floor || '',
              area: entry.area || '',
              expiry_date: entry.expiry_date,
              specification: item.specification || entry.specification || '',
              date: timestampDate,
              note: `${isForced ? '[強行出貨] ' : ''}網路訂單出貨 | 訂單號: ${order.order_id} | 平台: ${normPlatform} | 買家: ${order.customer_name || '未指定'} | 物流: ${order.shipping_method || '未指定'}`,
            });

            remainingNeeded -= deductQty;
            deductIdx++;
          }
        }

        // If item was not in system or stock was insufficient, log forced shipment for remaining qty with location/floor/area BLANK
        if (remainingNeeded > 0) {
          const rowUniqueId = `${orderTxId}_${itemIdx}_forced_${deductIdx}_${Math.random().toString(36).substring(2, 6)}`;
          const forcedNote = !isProductInSystem 
            ? `[強行出貨-非系統商品] 網路訂單出貨 | 訂單號: ${order.order_id} | 平台: ${normPlatform} | 買家: ${order.customer_name || '未指定'} | 物流: ${order.shipping_method || '未指定'}`
            : `[強行出貨-缺貨紀錄] 網路訂單出貨 | 訂單號: ${order.order_id} | 平台: ${normPlatform} | 買家: ${order.customer_name || '未指定'} | 物流: ${order.shipping_method || '未指定'}`;

          await enqueueAction('stockOut', {
            id: rowUniqueId,
            transaction_id: orderTxId,
            online_order_id: order.order_id,
            batch_id: orderTxId,
            batch_tx_id: orderTxId,
            platform: normPlatform,
            type: txType,
            product_id: item.product_id || '',
            product_name: item.product_name || '',
            cost_price: itemCostPrice,
            price: itemPrice,
            quantity: remainingNeeded,
            location: '',
            floor: '',
            area: '',
            specification: item.specification || p?.specification || '',
            date: timestampDate,
            note: forcedNote,
          });
        }
      }

      // 當使用者按出貨後，自動刪除 網路訂單管理看板的紀錄、試算表的紀錄；然後自動執行app的出貨功能。
      await deleteOnlineOrder(order.order_id);
      showToast(`✅ 訂單 ${order.order_id} ${isForced || !order.items.every((i: any) => products.some(p => p.product_id === i.product_id)) ? '(強行)' : ''}出貨成功！已刪除網路訂單與試算表紀錄，並自動扣除庫存及寫入交易歷史。`);
      setOrderErrors([]);
      setSelectedOrder(null);
      setConfirmShipOrderModal(null);
    } catch (e: any) {
      showToast(`❌ 出貨失敗: ${e.message}`);
    } finally {
      // Release lock
      setShippingOrderIds(prev => {
        const next = new Set(prev);
        next.delete(orderIdStr);
        return next;
      });
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    await deleteOnlineOrder(orderId);
    showToast(`🗑️ 訂單 ${orderId} 記錄已刪除。`);
    if (selectedOrder && selectedOrder.order_id === orderId) {
      setSelectedOrder(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Title bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900/90 via-sky-950/40 to-slate-900/90 border border-white/10 p-4 sm:p-6 rounded-2xl shadow-xl backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">營運概覽 & 出貨儀表板</h1>
            <span className="text-[10px] font-extrabold px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              雲端整合中
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">智慧掌控實體與網路通路庫存，確保訂單準時出貨。</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button 
            onClick={fetchRemoteData} 
            disabled={isLoading}
            className="flex items-center gap-2 px-3.5 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold text-white transition-all active:scale-95 disabled:opacity-50"
          >
            <RefreshCcw className={`w-4 h-4 text-sky-400 ${isLoading ? 'animate-spin' : ''}`} />
            <span>重新整理資料</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-950/50 border border-red-500/40 rounded-2xl flex items-start space-x-3 text-red-200 text-xs sm:text-sm shadow-lg animate-in fade-in">
          <AlertTriangle className="w-5 h-5 shrink-0 text-red-400" />
          <div>
            <p className="font-bold">連線或資料提示：</p>
            <p className="text-red-300 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {syncQueue.length > 0 && (
        <div className="p-4 bg-amber-950/40 border border-amber-500/40 rounded-2xl flex items-center justify-between text-amber-200 text-xs sm:text-sm shadow-lg animate-in fade-in">
          <div className="flex items-center space-x-3">
            <RefreshCcw className="w-5 h-5 shrink-0 animate-pulse text-amber-400" />
            <p>您有 <strong className="text-white underline">{syncQueue.length}</strong> 筆離線操作待同步至雲端試算表。</p>
          </div>
          <button
            onClick={() => useStore.getState().syncData()}
            className="px-3 py-1.5 bg-amber-500 text-slate-950 font-black rounded-lg text-xs hover:bg-amber-400 transition-colors"
          >
            立即同步
          </button>
        </div>
      )}

      {/* Top 4 KPI Metrics Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Link to="/products" className="glass-panel p-4 rounded-2xl border border-white/10 hover:border-sky-500/40 transition-all group flex items-center justify-between">
          <div>
            <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider block">總商品建檔數</span>
            <div className="text-2xl sm:text-3xl font-black text-sky-400 mt-1 font-mono">{products.length} <span className="text-xs text-slate-400 font-normal">品項</span></div>
          </div>
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400 group-hover:scale-110 transition-transform">
            <Package className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        </Link>

        <Link to="/products" className="glass-panel p-4 rounded-2xl border border-white/10 hover:border-emerald-500/40 transition-all group flex items-center justify-between">
          <div>
            <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider block">在席總庫存量</span>
            <div className="text-2xl sm:text-3xl font-black text-emerald-400 mt-1 font-mono">{totalStock} <span className="text-xs text-slate-400 font-normal">件</span></div>
          </div>
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
            <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        </Link>

        <div onClick={() => setIsOrderDashboardOpen(true)} className="glass-panel p-4 rounded-2xl border border-indigo-500/30 hover:border-indigo-500/60 transition-all group flex items-center justify-between cursor-pointer">
          <div>
            <span className="text-[10px] sm:text-xs font-bold text-indigo-300 uppercase tracking-wider block">網路待處理訂單</span>
            <div className="text-2xl sm:text-3xl font-black text-indigo-400 mt-1 font-mono">{pendingOrdersCount} <span className="text-xs text-slate-400 font-normal">筆</span></div>
          </div>
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
            <Globe className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        </div>

        <div onClick={() => setIsOrderDashboardOpen(true)} className="glass-panel p-4 rounded-2xl border border-red-500/30 hover:border-red-500/60 transition-all group flex items-center justify-between cursor-pointer">
          <div>
            <span className="text-[10px] sm:text-xs font-bold text-red-300 uppercase tracking-wider block">逾期出貨警示</span>
            <div className={`text-2xl sm:text-3xl font-black mt-1 font-mono ${overdueOrdersCount > 0 ? 'text-red-400 animate-pulse' : 'text-slate-400'}`}>
              {overdueOrdersCount} <span className="text-xs text-slate-400 font-normal">筆</span>
            </div>
          </div>
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 group-hover:scale-110 transition-transform">
            <Flame className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
        </div>
      </div>

      {/* Main Grid Section (Desktop Split: Left Order Banner 8 cols, Right Quick Tools 4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Main Column: E-commerce Orders Entry Board */}
        <div className="lg:col-span-8 space-y-4">
          <div className="glass-panel border-indigo-500/30 bg-gradient-to-br from-indigo-950/40 via-slate-900/80 to-slate-950/90 rounded-2xl p-5 sm:p-6 space-y-5 shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

            {/* Banner Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shadow-lg shadow-indigo-500/10 group-hover:scale-105 transition-transform">
                  <Globe className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    網路訂單管理看板
                    <span className="text-[10px] font-extrabold px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded-full border border-indigo-500/30">
                      即時連線
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">跨平台（蝦皮、MOMO等）訂單整合，支援一鍵出貨與自動扣存</p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button 
                  onClick={fetchOnlineOrders}
                  disabled={isLoading}
                  className="px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 text-indigo-300 border border-indigo-500/30 font-bold rounded-xl flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                  title="重新連線雲端擷取最新訂單"
                >
                  <RefreshCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>整理訂單</span>
                </button>
              </div>
            </div>

            {/* Summary Statistics inside Card */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div 
                onClick={() => setIsOrderDashboardOpen(true)}
                className="bg-black/30 border border-white/5 rounded-xl p-3.5 hover:border-indigo-500/40 transition-all cursor-pointer group/stat"
              >
                <span className="text-[11px] text-slate-400 font-medium block">待處理電商訂單</span>
                <span className="text-2xl font-black text-indigo-400 font-mono mt-1 block group-hover/stat:scale-105 transition-transform">
                  {pendingOrdersCount} <span className="text-xs font-normal text-slate-500">筆</span>
                </span>
              </div>

              <div 
                onClick={() => setIsOrderDashboardOpen(true)}
                className="bg-black/30 border border-white/5 rounded-xl p-3.5 hover:border-red-500/40 transition-all cursor-pointer group/stat"
              >
                <span className="text-[11px] text-slate-400 font-medium block">逾期出貨提醒</span>
                <span className={`text-2xl font-black font-mono mt-1 block group-hover/stat:scale-105 transition-transform ${overdueOrdersCount > 0 ? 'text-red-400 animate-pulse' : 'text-slate-400'}`}>
                  {overdueOrdersCount} <span className="text-xs font-normal text-slate-500">筆</span>
                </span>
              </div>

              <div 
                onClick={() => setIsOrderDashboardOpen(true)}
                className="col-span-2 sm:col-span-1 bg-black/30 border border-white/5 rounded-xl p-3.5 hover:border-emerald-500/40 transition-all cursor-pointer group/stat"
              >
                <span className="text-[11px] text-slate-400 font-medium block">平台涵蓋率</span>
                <span className="text-2xl font-black text-emerald-400 font-mono mt-1 block group-hover/stat:scale-105 transition-transform">
                  100% <span className="text-xs font-normal text-slate-500">同步中</span>
                </span>
              </div>
            </div>

            {/* Big Action Entry Buttons */}
            <div className="pt-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setOrderDashboardTab('orders');
                  setIsOrderDashboardOpen(true);
                }}
                className="py-3 px-3.5 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-slate-950 font-black rounded-xl text-xs sm:text-sm transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-1.5 active:scale-[0.99]"
              >
                <Globe className="w-4 h-4" />
                <span>網路訂單看板 ({groupedOrders.length} 筆)</span>
              </button>
              <button
                onClick={() => {
                  setOrderDashboardTab('items_summary');
                  setIsOrderDashboardOpen(true);
                }}
                className="py-3 px-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black rounded-xl text-xs sm:text-sm transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-1.5 active:scale-[0.99]"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>全單商品需求彙整 (製作訂貨單)</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Side Column: Quick Actions & Low Stock Alerts */}
        <div className="lg:col-span-4 space-y-6">
          {/* Quick Actions Card */}
          <div className="glass-panel border-white/10 rounded-2xl p-4 sm:p-5 space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>捷徑與常用操作</span>
              <button 
                onClick={handleOpenShortcutModal} 
                className="text-[10px] text-sky-400 hover:text-sky-300 flex items-center gap-1 bg-sky-500/10 px-2 py-1 rounded transition-colors"
              >
                <Settings className="w-3 h-3" />
                自訂
              </button>
            </h3>

            {activeShortcutIds.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {activeShortcutIds.slice(0, 4).map(id => {
                  const option = SHORTCUT_OPTIONS.find(o => o.id === id);
                  if (!option) return null;
                  return (
                    <Link 
                      key={option.id}
                      to={option.to} 
                      className={`flex flex-col items-center justify-center p-3.5 bg-gradient-to-br ${option.colorClass} border rounded-xl transition-all active:scale-95 group`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2 group-hover:scale-110 transition-transform ${option.iconBgClass}`}>
                        <option.icon className="w-5 h-5" />
                      </div>
                      <span className="text-xs font-bold text-white">{option.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}

            {activeShortcutIds.length > 4 && (
              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-white/5">
                {activeShortcutIds.slice(4).map(id => {
                  const option = SHORTCUT_OPTIONS.find(o => o.id === id);
                  if (!option) return null;
                  return (
                    <Link key={option.id} to={option.to} className="flex items-center gap-1.5 p-2.5 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-[11px] font-medium text-slate-300 justify-center">
                      <option.icon className={`w-3.5 h-3.5 shrink-0 ${option.smallTextClass}`} />
                      <span className="truncate">{option.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Low Stock Warning List */}
          <div className="glass-panel border-white/10 rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                <span>補貨警示專區</span>
              </h3>
              <Link to="/products" className="text-[10px] text-slate-400 hover:text-white underline">
                商品列表
              </Link>
            </div>

            {lowStockProducts.length === 0 ? (
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center text-xs text-emerald-300">
                👍 太棒了！目前沒有存量過低的商品。
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
                {lowStockProducts.slice(0, 6).map(p => {
                  const currentQty = productTotalStockMap.get(p.product_id) || 0;
                  return (
                    <div key={p.product_id} className="p-2.5 bg-black/30 border border-amber-500/20 rounded-xl flex items-center justify-between text-xs">
                      <div className="min-w-0 pr-2">
                        <p className="font-bold text-white truncate">{p.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">ID: {p.product_id}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-black text-amber-400 font-mono px-2 py-0.5 bg-amber-500/10 rounded border border-amber-500/30">
                          剩 {currentQty} {p.unit || '個'}
                        </span>
                        <Link 
                          to={`/manage?type=stock_in&pid=${p.product_id}`}
                          className="px-2 py-1 bg-sky-500 text-slate-950 font-extrabold rounded text-[10px] hover:bg-sky-400"
                        >
                          補貨
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Order Management Dashboard Fullscreen View Modal */}
      {isOrderDashboardOpen && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[60] flex items-center justify-center p-2 sm:p-6 animate-in fade-in duration-200">
          <div className="w-full max-w-5xl bg-[#0a1128] border border-indigo-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[92vh]">
            
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-white/10 bg-slate-900/80 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-extrabold text-white flex items-center gap-2">
                    網路訂單管理看板
                    <span className="text-[10px] font-black px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded-full border border-indigo-500/30">
                      共 {groupedOrders.length} 筆
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 hidden sm:block">各平台訂單即時看板，自動更新狀態，支援人工修改與排序</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={fetchOnlineOrders}
                  disabled={isLoading}
                  className="px-3 py-1.5 text-xs bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-extrabold rounded-xl flex items-center gap-1.5 transition-all active:scale-95 shadow-md shadow-indigo-500/20 disabled:opacity-50"
                >
                  <RefreshCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">抓取最新訂單</span>
                </button>
                <button 
                  onClick={() => setIsOrderDashboardOpen(false)}
                  className="p-2 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors"
                  title="關閉看板"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Sub-tab Navigation */}
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5 bg-slate-900/50 shrink-0 overflow-x-auto">
              <button
                onClick={() => setOrderDashboardTab('orders')}
                className={`px-3.5 py-1.5 text-xs font-extrabold rounded-xl flex items-center gap-2 transition-all shrink-0 ${
                  orderDashboardTab === 'orders'
                    ? 'bg-indigo-500 text-slate-950 shadow-md shadow-indigo-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Globe className="w-4 h-4" />
                <span>按訂單卡片檢視 ({groupedOrders.length} 筆)</span>
              </button>
              <button
                onClick={() => setOrderDashboardTab('items_summary')}
                className={`px-3.5 py-1.5 text-xs font-extrabold rounded-xl flex items-center gap-2 transition-all shrink-0 ${
                  orderDashboardTab === 'items_summary'
                    ? 'bg-indigo-500 text-slate-950 shadow-md shadow-indigo-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>全單商品需求彙整 (製作採購訂貨單 Excel)</span>
                {consolidatedOrderItems.some(i => i.shortfall_qty > 0) && (
                  <span className="px-2 py-0.5 bg-red-500 text-white text-[10px] rounded-full font-black animate-pulse">
                    {consolidatedOrderItems.filter(i => i.shortfall_qty > 0).length} 種缺貨
                  </span>
                )}
              </button>
            </div>

            {/* Modal Content Area */}
            <div className="p-4 sm:p-6 space-y-4 flex-1 overflow-y-auto custom-scrollbar">
              
              {/* Shipments error alert */}
              {orderErrors.length > 0 && (
                <div className="p-3 bg-red-950/50 border border-red-500/40 rounded-xl text-xs text-red-200 space-y-1">
                  <p className="font-bold flex items-center gap-1 text-red-400">⚠️ 發現出貨異常：</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {orderErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* TAB 1: Orders Cards Grid View */}
              {orderDashboardTab === 'orders' && (
                <div className="space-y-4">
                  {/* Quick Filter Pills */}
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
                    <button
                      type="button"
                      onClick={() => setOrderQuickFilter('ALL')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                        orderQuickFilter === 'ALL'
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 ring-1 ring-indigo-400'
                          : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white border border-white/5'
                      }`}
                    >
                      <span>全部訂單</span>
                      <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-black/30 font-mono">
                        {pendingOrdersCount}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setOrderQuickFilter('OVERDUE')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                        orderQuickFilter === 'OVERDUE'
                          ? 'bg-red-500 text-white shadow-md shadow-red-500/30 ring-1 ring-red-400'
                          : 'bg-red-500/10 text-red-300 hover:bg-red-500/20 border border-red-500/20'
                      }`}
                    >
                      <span>🚨 逾期訂單</span>
                      <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-black/30 font-mono font-black">
                        {overdueOrdersCount}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setOrderQuickFilter('DUE_SOON')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                        orderQuickFilter === 'DUE_SOON'
                          ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30 ring-1 ring-amber-400 font-extrabold'
                          : 'bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border border-amber-500/20'
                      }`}
                    >
                      <span>⏰ 即將到期</span>
                      <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-black/30 font-mono font-bold">
                        {dueSoonOrdersCount}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setOrderQuickFilter('SHORTFALL')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                        orderQuickFilter === 'SHORTFALL'
                          ? 'bg-rose-600 text-white shadow-md shadow-rose-600/30 ring-1 ring-rose-400'
                          : 'bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 border border-rose-500/20'
                      }`}
                    >
                      <span>🔴 缺貨需補貨</span>
                      <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-black/30 font-mono font-bold">
                        {shortfallOrdersCount}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setOrderQuickFilter('READY')}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                        orderQuickFilter === 'READY'
                          ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/30 ring-1 ring-emerald-400 font-extrabold'
                          : 'bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 border border-emerald-500/20'
                      }`}
                    >
                      <span>🟢 可立即出貨</span>
                      <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-black/30 font-mono font-bold">
                        {readyOrdersCount}
                      </span>
                    </button>
                  </div>

                  {/* Search & Multi-filter Controls Bar */}
                  <div className="bg-black/40 p-3 rounded-2xl border border-white/10 space-y-3">
                    <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
                      {/* Search Input Bar */}
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="搜尋訂單編號、收件人、商品品名、規格、商品編號..."
                          value={orderSearchQuery}
                          onChange={(e) => setOrderSearchQuery(e.target.value)}
                          className="w-full pl-10 pr-9 py-2 text-xs bg-slate-900/90 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500/50"
                        />
                        {orderSearchQuery && (
                          <button
                            onClick={() => setOrderSearchQuery('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {/* Sort Selector */}
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-slate-400 font-bold flex items-center gap-1">
                          <ArrowUpDown className="w-3.5 h-3.5 text-indigo-400" /> 排序:
                        </span>
                        <select
                          value={orderSortType}
                          onChange={(e) => setOrderSortType(e.target.value as any)}
                          className="bg-slate-900 border border-white/10 rounded-xl text-xs font-medium text-white px-3 py-2 outline-none focus:border-indigo-500 cursor-pointer"
                        >
                          <option value="deadline_asc">⏰ 最晚出貨期限：近 ➔ 遠 (優先)</option>
                          <option value="deadline_desc">⏰ 最晚出貨期限：遠 ➔ 近</option>
                          <option value="status">🚨 訂單狀態 (緊急/逾期優先)</option>
                          <option value="created_desc">📅 下單時間：最新 ➔ 最舊</option>
                          <option value="created_asc">📅 下單時間：最舊 ➔ 最新</option>
                          <option value="amount_desc">💰 訂單金額：高 ➔ 低</option>
                          <option value="amount_asc">💰 訂單金額：低 ➔ 高</option>
                        </select>
                      </div>
                    </div>

                    {/* Detailed Dropdown Filters Row */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-white/5 text-xs">
                      {/* Platform Filter */}
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">來源平台</label>
                        <select
                          value={orderPlatformFilter}
                          onChange={(e) => setOrderPlatformFilter(e.target.value)}
                          className="w-full bg-slate-900 border border-white/10 rounded-xl px-2.5 py-1.5 text-white text-xs outline-none focus:border-indigo-500 cursor-pointer"
                        >
                          <option value="ALL">所有平台 ({availablePlatforms.length})</option>
                          {availablePlatforms.map(p => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                        </select>
                      </div>

                      {/* Status Filter */}
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">訂單狀態</label>
                        <select
                          value={orderStatusFilter}
                          onChange={(e) => setOrderStatusFilter(e.target.value)}
                          className="w-full bg-slate-900 border border-white/10 rounded-xl px-2.5 py-1.5 text-white text-xs outline-none focus:border-indigo-500 cursor-pointer"
                        >
                          <option value="ALL">所有狀態</option>
                          <option value="OVERDUE">🚨 逾期 / 警告</option>
                          <option value="DUE_SOON">⏰ 即將到期</option>
                          <option value="PENDING">✅ 待出貨 (正常)</option>
                          <option value="PACKED">📦 已包裝</option>
                          <option value="PROCESSING">⏳ 處理中</option>
                          <option value="HOLD">⏸️ 暫緩</option>
                        </select>
                      </div>

                      {/* Stock Health Filter */}
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">庫存可否出貨</label>
                        <select
                          value={orderStockFilter}
                          onChange={(e) => setOrderStockFilter(e.target.value as any)}
                          className="w-full bg-slate-900 border border-white/10 rounded-xl px-2.5 py-1.5 text-white text-xs outline-none focus:border-indigo-500 cursor-pointer"
                        >
                          <option value="ALL">全部訂單</option>
                          <option value="READY">🟢 庫存充足 (可出貨)</option>
                          <option value="SHORTFALL">🔴 含缺貨品項 (需補貨)</option>
                        </select>
                      </div>

                      {/* Shipping Method Filter */}
                      <div>
                        <label className="text-[11px] text-slate-400 block mb-1">物流方式</label>
                        <select
                          value={orderShippingFilter}
                          onChange={(e) => setOrderShippingFilter(e.target.value)}
                          className="w-full bg-slate-900 border border-white/10 rounded-xl px-2.5 py-1.5 text-white text-xs outline-none focus:border-indigo-500 cursor-pointer"
                        >
                          <option value="ALL">所有物流 ({availableShippingMethods.length || '全部'})</option>
                          {availableShippingMethods.map(m => (
                            <option key={m} value={m}>{m}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Filter Status Summary & Clear Filter button */}
                    <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>
                          顯示 <strong className="text-indigo-400 font-mono font-bold text-xs">{sortedGroupedOrders.length}</strong> / {groupedOrders.length} 筆訂單
                        </span>
                        {(orderSearchQuery || orderPlatformFilter !== 'ALL' || orderStatusFilter !== 'ALL' || orderStockFilter !== 'ALL' || orderShippingFilter !== 'ALL' || orderQuickFilter !== 'ALL') && (
                          <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold">
                            已套用篩選
                          </span>
                        )}
                      </div>

                      {(orderSearchQuery || orderPlatformFilter !== 'ALL' || orderStatusFilter !== 'ALL' || orderStockFilter !== 'ALL' || orderShippingFilter !== 'ALL' || orderQuickFilter !== 'ALL') && (
                        <button
                          type="button"
                          onClick={() => {
                            setOrderSearchQuery('');
                            setOrderPlatformFilter('ALL');
                            setOrderStatusFilter('ALL');
                            setOrderStockFilter('ALL');
                            setOrderShippingFilter('ALL');
                            setOrderQuickFilter('ALL');
                          }}
                          className="text-indigo-400 hover:text-indigo-300 underline font-bold cursor-pointer"
                        >
                          重置所有篩選
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Orders Cards Grid */}
                  <div>
                    {groupedOrders.length === 0 ? (
                      <div className="text-center py-16 space-y-3 bg-black/20 rounded-2xl border border-white/5">
                        <Flame className="w-12 h-12 text-slate-600 mx-auto" />
                        <p className="text-sm font-medium text-slate-400">目前尚無任何待處理的網路訂單</p>
                      </div>
                    ) : sortedGroupedOrders.length === 0 ? (
                      <div className="text-center py-16 space-y-2 bg-black/20 rounded-2xl border border-white/5">
                        <Search className="w-12 h-12 text-slate-500 mx-auto animate-pulse" />
                        <p className="text-sm text-slate-400">找不到符合「{orderSearchQuery}」的訂單</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {sortedGroupedOrders.map((order) => {
                          const isShopee = order.platform === '蝦皮購物';
                          const isMomo = order.platform === 'MOMO購物網';
                          const statusStyle = getStatusBadgeStyle(order.order_status);
                          const orderPrice = getOrderPrice(order);

                          return (
                            <div 
                              key={order.order_id} 
                              className="glass-panel p-4 rounded-xl flex flex-col justify-between space-y-3 relative overflow-hidden transition-all duration-200 hover:border-indigo-500/50 border-white/10 bg-slate-900/80"
                            >
                              {/* Top Header: SWAPPED Position 1 -> 訂單狀態 (Order Status) */}
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center space-x-2 min-w-0">
                                  <span className={`text-[10px] uppercase font-black px-2 py-0.5 rounded-full shrink-0 ${
                                    isShopee ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
                                    isMomo ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30' :
                                    'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  }`}>
                                    {order.platform}
                                  </span>
                                  <span className="text-xs font-mono font-bold text-white truncate">{order.order_id}</span>
                                </div>

                                {/* 訂單狀態 Badge + Manual Edit Button */}
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className={`text-[10px] sm:text-[11px] font-bold px-2 py-0.5 rounded-lg flex items-center gap-1 ${statusStyle.color}`}>
                                    {statusStyle.text}
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingStatusOrder(order);
                                      setCustomStatusInput(order.raw_order_status || order.order_status);
                                    }}
                                    className="p-1 text-slate-400 hover:text-indigo-300 hover:bg-white/10 rounded-lg border border-white/5 transition-all"
                                    title="人工修改訂單狀態"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>

                              {/* Items list */}
                              <div className="space-y-2 cursor-pointer" onClick={() => setSelectedOrder(order)}>
                                {order.items.map((item: any, idx: number) => {
                                  const spec = item.specification || getProductSpecification(item.product_id);
                                  const shipMethod = item.shipping_method || order.shipping_method;
                                  const sysProd = item.product_id ? productMap.get(item.product_id) : (item.product_name ? products.find(p => p.name === item.product_name || p.product_id === item.product_name) : null);
                                  const vendorName = sysProd?.vendor_id ? (vendorsMap.get(sysProd.vendor_id) || sysProd.vendor_id) : null;
                                  const costPrice = sysProd?.cost_price !== undefined && sysProd?.cost_price !== null && !isNaN(Number(sysProd.cost_price)) ? Number(sysProd.cost_price) : null;

                                  return (
                                    <div key={idx} className="bg-white/5 rounded-lg p-2.5 flex items-start justify-between text-xs hover:bg-white/10 transition-colors">
                                      <div className="flex-1 min-w-0 mr-2 space-y-1">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <p className="font-semibold text-white truncate">{item.product_name}</p>
                                          {sysProd ? (
                                            <span className="text-[10px] font-mono bg-sky-500/10 text-sky-300 border border-sky-500/20 px-1.5 py-0.2 rounded font-medium">
                                              系統商品
                                            </span>
                                          ) : (
                                            <span className="text-[10px] font-mono bg-amber-500/10 text-amber-300 border border-amber-500/20 px-1.5 py-0.2 rounded italic">
                                              非系統商品
                                            </span>
                                          )}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                                          {spec && (
                                            <span className="inline-block bg-indigo-500/10 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/20 font-medium">
                                              規格: {spec}
                                            </span>
                                          )}
                                          {shipMethod && (
                                            <span className="inline-block bg-teal-500/10 text-teal-300 px-1.5 py-0.5 rounded border border-teal-500/20 font-medium">
                                              物流: {shipMethod}
                                            </span>
                                          )}
                                          {sysProd && (
                                            <>
                                              {costPrice !== null && (
                                                <span className="inline-block bg-amber-500/10 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/20 font-mono font-bold" title={`單件進價: $${costPrice.toLocaleString()}`}>
                                                  進價: ${costPrice.toLocaleString()} {item.quantity > 1 ? `(小計 $${(costPrice * item.quantity).toLocaleString()})` : ''}
                                                </span>
                                              )}
                                              <span className="inline-block bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-white/10" title="商品供應商">
                                                廠商: {vendorName || '未指定'}
                                              </span>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                      <div className="text-right shrink-0 font-mono">
                                        <p className="text-slate-400 text-xs">數量: <strong className="text-white font-black">{item.quantity}</strong></p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Footer Controls: SWAPPED Position 2 -> 最晚出貨期限 (Shipping Deadline) */}
                              <div className="flex items-center justify-between pt-2 border-t border-white/5">
                                <div className="flex flex-col text-[10px] text-slate-300 space-y-0.5">
                                  <span className="flex items-center gap-1 text-slate-400"><User className="w-3 h-3" /> {order.customer_name}</span>
                                  <span className="flex items-center gap-1 font-bold text-amber-300" title="最晚出貨期限">
                                    <Clock className="w-3 h-3 text-amber-400" /> 最晚出貨: {order.shipping_deadline || '未設定'}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2">
                                  <div className="mr-1 text-right">
                                    <span className="block text-[9px] text-slate-400">總金額</span>
                                    <span className="text-xs font-bold text-indigo-400 font-mono">
                                      {orderPrice > 0 ? `$${orderPrice.toLocaleString()}` : '無'}
                                    </span>
                                  </div>
                                  <button 
                                    onClick={() => setSelectedOrder(order)}
                                    className="px-2 py-1 text-xs text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors border border-white/5"
                                  >
                                    詳情
                                  </button>
                                  <button 
                                    disabled={shippingOrderIds.has(String(order.order_id))}
                                    onClick={() => handleShipOrder(order)}
                                    className={`px-2.5 py-1 text-xs font-bold rounded-lg flex items-center gap-1 transition-all shadow-md ${
                                      shippingOrderIds.has(String(order.order_id))
                                        ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                                        : 'bg-indigo-500 hover:bg-indigo-400 text-slate-950 shadow-indigo-500/20 active:scale-95'
                                    }`}
                                  >
                                    {shippingOrderIds.has(String(order.order_id)) ? (
                                      <>
                                        <span className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin inline-block" />
                                        出貨中...
                                      </>
                                    ) : (
                                      <>
                                        <Truck className="w-3.5 h-3.5" /> 出貨
                                      </>
                                    )}
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteOrder(order.order_id)}
                                    className="p-1 text-slate-400 hover:text-red-400 bg-white/5 hover:bg-red-500/10 rounded-lg border border-white/5 transition-all"
                                    title="刪除單筆訂單"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: Consolidated Products Order Slip (Excel) View */}
              {orderDashboardTab === 'items_summary' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  {/* KPI Summary Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-black/40 border border-white/10 rounded-xl p-3.5 space-y-1">
                      <span className="text-[11px] text-slate-400 font-medium block">需求商品品項數</span>
                      <span className="text-xl font-black text-indigo-400 font-mono">
                        {consolidatedOrderItems.length} <span className="text-xs font-normal text-slate-500">種</span>
                      </span>
                    </div>
                    <div className="bg-black/40 border border-white/10 rounded-xl p-3.5 space-y-1">
                      <span className="text-[11px] text-slate-400 font-medium block">網路訂單總需求件數</span>
                      <span className="text-xl font-black text-sky-400 font-mono">
                        {consolidatedOrderItems.reduce((a, c) => a + c.total_ordered_qty, 0)} <span className="text-xs font-normal text-slate-500">件</span>
                      </span>
                    </div>
                    <div className="bg-black/40 border border-amber-500/30 rounded-xl p-3.5 space-y-1">
                      <span className="text-[11px] text-amber-300 font-medium block">庫存不足需訂貨品項</span>
                      <span className={`text-xl font-black font-mono ${consolidatedOrderItems.some(i => i.shortfall_qty > 0) ? 'text-amber-400 animate-pulse' : 'text-slate-400'}`}>
                        {consolidatedOrderItems.filter(i => i.shortfall_qty > 0).length} <span className="text-xs font-normal text-slate-500">種缺貨</span>
                      </span>
                    </div>
                    <div className="bg-black/40 border border-emerald-500/30 rounded-xl p-3.5 space-y-1">
                      <span className="text-[11px] text-emerald-300 font-medium block">預估補貨採購總金額</span>
                      <span className="text-xl font-black text-emerald-400 font-mono">
                        ${consolidatedOrderItems.reduce((a, c) => a + (c.cost_price * c.shortfall_qty), 0).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Toolbar Controls */}
                  <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between bg-black/40 p-3 rounded-xl border border-white/10">
                    {/* Search & Filters */}
                    <div className="flex flex-col sm:flex-row gap-2 flex-1">
                      <div className="relative flex-1">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="搜尋品名、編號、規格、供應商或訂單號..."
                          value={summarySearchQuery}
                          onChange={(e) => setSummarySearchQuery(e.target.value)}
                          className="w-full pl-9 pr-8 py-2 text-xs bg-slate-900 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        {summarySearchQuery && (
                          <button onClick={() => setSummarySearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Vendor Selector */}
                      <select
                        value={summaryVendorFilter}
                        onChange={(e) => setSummaryVendorFilter(e.target.value)}
                        className="bg-slate-900 border border-white/10 rounded-xl text-xs font-medium text-white px-3 py-2 outline-none focus:border-indigo-500 cursor-pointer"
                      >
                        <option value="ALL">所有供應商 ({summaryVendorOptions.length})</option>
                        {summaryVendorOptions.map(v => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>

                      {/* Shortfall Only Filter Toggle */}
                      <button
                        onClick={() => setSummaryOnlyShortfall(!summaryOnlyShortfall)}
                        className={`px-3 py-2 text-xs font-bold rounded-xl border flex items-center justify-center gap-1.5 transition-all shrink-0 ${
                          summaryOnlyShortfall
                            ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/20'
                            : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'
                        }`}
                      >
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>僅看缺貨品項 ({consolidatedOrderItems.filter(i => i.shortfall_qty > 0).length})</span>
                      </button>
                    </div>

                    {/* Export Actions */}
                    <div className="flex items-center gap-2 shrink-0 justify-end">
                      <button
                        onClick={copySummaryForExcel}
                        className="px-3 py-2 text-xs font-extrabold bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 rounded-xl flex items-center gap-1.5 transition-all active:scale-95"
                        title="複製 TSV 格式，開啟 Excel 直接按 Ctrl+V 貼上"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>複製至 Excel (Ctrl+V)</span>
                      </button>
                      <button
                        onClick={exportSummaryToExcel}
                        className="px-3.5 py-2 text-xs font-extrabold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-emerald-500/20 active:scale-95"
                        title="下載包含全單商品的 Excel / CSV 檔"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        <span>下載 Excel (CSV)</span>
                      </button>
                    </div>
                  </div>

                  {/* Summary Table */}
                  {filteredConsolidatedItems.length === 0 ? (
                    <div className="text-center py-16 space-y-2 bg-black/20 rounded-2xl border border-white/5">
                      <ShoppingBag className="w-12 h-12 text-slate-600 mx-auto" />
                      <p className="text-sm font-medium text-slate-400">目前沒有符合條件的彙整商品</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-xl border border-white/10 custom-scrollbar">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-900/90 text-slate-300 border-b border-white/10 font-bold">
                            <th className="p-3">商品名稱 / 編號 / 規格</th>
                            <th className="p-3">供應商</th>
                            <th className="p-3 text-center">單位</th>
                            <th className="p-3 text-right">訂單需求總量</th>
                            <th className="p-3 text-right">目前現有庫存</th>
                            <th className="p-3 text-center">建議訂購量 (缺貨差額)</th>
                            <th className="p-3 text-right">預估進價成本</th>
                            <th className="p-3 text-right">採購預算小計</th>
                            <th className="p-3 text-center">涉及訂單筆數</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 bg-slate-950/60">
                          {filteredConsolidatedItems.map((item, idx) => {
                            const isShortfall = item.shortfall_qty > 0;
                            const subtotal = (item.cost_price || 0) * item.shortfall_qty;

                            return (
                              <tr key={idx} className={`hover:bg-white/5 transition-colors ${isShortfall ? 'bg-amber-500/5' : ''}`}>
                                <td className="p-3">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="font-extrabold text-white text-sm">{item.product_name}</p>
                                    {item.is_non_system && (
                                      <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded text-[10px] font-bold shrink-0">
                                        非系統商品
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-0.5 font-mono text-[11px]">
                                    <span className="text-slate-400">ID: {item.product_id}</span>
                                    <span className="text-indigo-300 bg-indigo-500/10 px-1.5 py-0.2 rounded border border-indigo-500/20">
                                      {item.specification}
                                    </span>
                                  </div>
                                </td>
                                <td className="p-3">
                                  <span className={`font-medium ${item.is_non_system ? 'text-amber-300/80 italic text-[11px]' : 'text-slate-300'}`}>
                                    {item.vendor_name}
                                  </span>
                                </td>
                                <td className="p-3 text-center">
                                  <span className="text-slate-400 font-mono">{item.unit}</span>
                                </td>
                                <td className="p-3 text-right font-mono font-black text-sky-400 text-sm">
                                  {item.total_ordered_qty} {item.unit}
                                </td>
                                <td className="p-3 text-right font-mono font-bold">
                                  <span className={item.current_stock_qty >= item.total_ordered_qty ? 'text-emerald-400' : 'text-amber-400'}>
                                    {item.current_stock_qty} {item.unit}
                                  </span>
                                </td>
                                <td className="p-3 text-center">
                                  {isShortfall ? (
                                    <span className="inline-flex items-center gap-1 font-black px-2.5 py-1 bg-red-500/20 text-red-300 border border-red-500/40 rounded-full font-mono text-xs animate-pulse">
                                      <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
                                      需補貨 {item.shortfall_qty} {item.unit}
                                    </span>
                                  ) : (
                                    <span className="inline-block px-2.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-[11px] font-bold">
                                      ✅ 庫存充裕
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 text-right font-mono text-slate-300">
                                  ${item.cost_price ? item.cost_price.toLocaleString() : '0'}
                                </td>
                                <td className="p-3 text-right font-mono font-bold text-emerald-400 text-sm">
                                  ${subtotal.toLocaleString()}
                                </td>
                                <td className="p-3 text-center">
                                  <span className="px-2 py-0.5 bg-white/10 text-slate-200 rounded font-mono text-xs font-bold" title={`涉及訂單: ${item.order_ids.join(', ')}`}>
                                    {item.orders_count} 筆訂單
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/10 bg-slate-900/90 flex justify-end">
              <button
                onClick={() => setIsOrderDashboardOpen(false)}
                className="px-5 py-2 bg-white/10 hover:bg-white/15 text-white font-bold rounded-xl text-xs transition-colors"
              >
                關閉看板
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Detailed Order Content Modal View */}
      {selectedOrder && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[70] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-[#0e1628] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-bold text-white">訂單詳情：{selectedOrder.order_id}</h3>
              </div>
              <button 
                onClick={() => setSelectedOrder(null)}
                className="p-1 text-zinc-400 hover:text-white bg-white/5 border border-white/5 rounded-full"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4 flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3 text-xs bg-white/5 p-3 rounded-xl border border-white/5">
                <div>
                  <span className="text-zinc-400 block mb-0.5">來源平台</span>
                  <span className="font-bold text-white">{selectedOrder.platform}</span>
                </div>
                <div>
                  <span className="text-zinc-400 block mb-0.5">訂單狀態 (可人工修改)</span>
                  <div className="flex items-center gap-1.5">
                    <span className={`inline-block px-2 py-0.5 rounded font-bold ${getStatusBadgeStyle(selectedOrder.order_status).color}`}>
                      {getStatusBadgeStyle(selectedOrder.order_status).text}
                    </span>
                    <button
                      onClick={() => {
                        setEditingStatusOrder(selectedOrder);
                        setCustomStatusInput(selectedOrder.raw_order_status || selectedOrder.order_status);
                      }}
                      className="px-2 py-0.5 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 text-indigo-300 text-[10px] rounded font-bold flex items-center gap-1 transition-all"
                    >
                      <Edit2 className="w-3 h-3" /> 修改
                    </button>
                  </div>
                </div>
                <div>
                  <span className="text-zinc-400 block mb-0.5">收件人</span>
                  <span className="font-bold text-white">{selectedOrder.customer_name}</span>
                </div>
                <div>
                  <span className="text-zinc-400 block mb-0.5">最晚出貨期限</span>
                  <span className="font-mono font-bold text-amber-300 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    {selectedOrder.shipping_deadline || selectedOrder.status || '未設定'}
                  </span>
                </div>
                {selectedOrder.created_at && (
                  <div>
                    <span className="text-zinc-400 block mb-0.5">下單日期</span>
                    <span className="font-mono text-zinc-300">{selectedOrder.created_at}</span>
                  </div>
                )}
                {selectedOrder.shipping_method && (
                  <div>
                    <span className="text-zinc-400 block mb-0.5">物流方式</span>
                    <span className="font-bold text-teal-300">{selectedOrder.shipping_method}</span>
                  </div>
                )}
              </div>

              {/* Items Table */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-zinc-300 uppercase tracking-wider">訂購商品品項 ({selectedOrder.items.length})</h4>
                <div className="space-y-2.5">
                  {selectedOrder.items.map((item: any, idx: number) => {
                    const health = checkItemHealth(item);
                    const spec = item.specification || getProductSpecification(item.product_id);
                    const sysProd = item.product_id ? productMap.get(item.product_id) : (item.product_name ? products.find(p => p.name === item.product_name || p.product_id === item.product_name) : null);
                    const vendorName = sysProd?.vendor_id ? (vendorsMap.get(sysProd.vendor_id) || sysProd.vendor_id) : null;
                    const costPrice = sysProd?.cost_price !== undefined && sysProd?.cost_price !== null && !isNaN(Number(sysProd.cost_price)) ? Number(sysProd.cost_price) : null;

                    return (
                      <div key={idx} className="bg-zinc-900/60 border border-white/5 rounded-xl p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-white">{item.product_name}</p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                              {item.product_id ? (
                                <span className="text-[10px] font-mono bg-white/10 text-zinc-300 px-1.5 py-0.5 rounded">商品ID: {item.product_id}</span>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-mono bg-amber-500/10 text-amber-300 border border-amber-500/20 px-1.5 py-0.5 rounded">
                                    商品ID: 未對接 (非系統商品)
                                  </span>
                                  <button
                                    onClick={() => {
                                      navigate(`/add-product?name=${encodeURIComponent(item.product_name)}&spec=${encodeURIComponent(spec || '')}`);
                                    }}
                                    className="text-[10px] bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-0.5 rounded flex items-center gap-1 transition-all shrink-0"
                                    title="點擊預填資料並快速新增此商品至系統"
                                  >
                                    <PlusCircle className="w-3 h-3" /> 新增商品
                                  </button>
                                </div>
                              )}
                              {spec && <span className="text-[10px] bg-indigo-500/10 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/20">規格: {spec}</span>}
                              {sysProd && (
                                <>
                                  {costPrice !== null && (
                                    <span className="text-[10px] bg-amber-500/10 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/20 font-mono font-bold" title={`單件進價: $${costPrice.toLocaleString()}`}>
                                      進價成本: ${costPrice.toLocaleString()} {item.quantity > 1 ? `(小計 $${(costPrice * item.quantity).toLocaleString()})` : ''}
                                    </span>
                                  )}
                                  <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded border border-white/10" title="商品供應商">
                                    供應商: {vendorName || '未指定'}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="text-right text-xs shrink-0 font-mono">
                            <span className="text-zinc-400">數量: <strong className="text-white text-sm">{item.quantity}</strong></span>
                          </div>
                        </div>

                        {/* Safety Checks for each item */}
                        <div className={`mt-2 p-2 rounded-lg text-[11px] flex items-center gap-1.5 border ${
                          health.ok 
                            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' 
                            : 'bg-red-500/10 border-red-500/20 text-red-300'
                        }`}>
                          <span className="shrink-0">{health.ok ? '🟢' : '🔴'}</span>
                          <span>{health.ok ? '庫存安全檢測正常，符合出貨規定' : health.message}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Order total */}
              <div className="flex justify-between items-center bg-white/5 p-3 rounded-xl border border-white/5 text-sm">
                <span className="font-medium text-zinc-300">訂單總金額 (不顯示商品單價)</span>
                <span className="font-mono font-black text-indigo-400 text-lg">
                  {getOrderPrice(selectedOrder) > 0 ? `$${getOrderPrice(selectedOrder).toLocaleString()}` : '無'}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="p-4 border-t border-white/10 bg-zinc-900/40 flex justify-end gap-3">
              <button 
                onClick={() => setSelectedOrder(null)}
                className="px-4 py-2 text-xs font-semibold bg-white/5 hover:bg-white/10 text-zinc-300 rounded-lg transition-colors"
              >
                關閉
              </button>
              <button 
                disabled={shippingOrderIds.has(String(selectedOrder.order_id))}
                onClick={() => handleShipOrder(selectedOrder)}
                className={`px-4 py-2 text-xs font-black rounded-lg transition-colors flex items-center gap-1.5 shadow-lg ${
                  shippingOrderIds.has(String(selectedOrder.order_id))
                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                    : 'bg-indigo-500 hover:bg-indigo-600 text-white shadow-indigo-500/20 active:scale-95'
                }`}
              >
                {shippingOrderIds.has(String(selectedOrder.order_id)) ? (
                  <>
                    <span className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin inline-block" />
                    執行出貨中...
                  </>
                ) : (
                  <>
                    <Truck className="w-4 h-4" /> 執行整單出貨 (扣減庫存 & 刪除記錄)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Status Override Modal Dialog */}
      {editingStatusOrder && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[80] flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-slate-900 border border-indigo-500/40 rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-indigo-400" />
                人工修改訂單狀態 (訂單編號: {editingStatusOrder.order_id})
              </h3>
              <button 
                onClick={() => setEditingStatusOrder(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              您可以點擊以下快速預設狀態，或手動自訂輸入狀態名稱：
            </p>

            {/* Presets */}
            <div className="grid grid-cols-2 gap-2">
              {[
                '✅ 待出貨',
                '⏳ 處理中',
                '📦 已包裝',
                '⏸️ 暫緩出貨',
                '⚠️ 已逾期',
                '⏰ 即將到期'
              ].map(st => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setCustomStatusInput(st)}
                  className={`px-3 py-2 text-xs font-bold rounded-xl border transition-all text-left flex items-center justify-between ${
                    customStatusInput === st 
                      ? 'bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-500/30' 
                      : 'bg-white/5 hover:bg-white/10 text-slate-200 border-white/10'
                  }`}
                >
                  <span>{st}</span>
                  {customStatusInput === st && <Check className="w-3.5 h-3.5 text-white" />}
                </button>
              ))}
            </div>

            {/* Custom Input */}
            <div className="space-y-1.5 pt-2">
              <label className="text-[11px] font-bold text-slate-400">自訂狀態名稱：</label>
              <input
                type="text"
                value={customStatusInput}
                onChange={(e) => setCustomStatusInput(e.target.value)}
                placeholder="輸入例如：已開立發票、買家請求修改規格..."
                className="w-full px-3 py-2 bg-black/40 border border-white/15 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={async () => {
                  await updateOnlineOrderStatus(editingStatusOrder.order_id, '');
                  showToast(`🔄 已將訂單 ${editingStatusOrder.order_id} 重置為依照出貨期限自動計算狀態`);
                  setEditingStatusOrder(null);
                }}
                className="px-3 py-1.5 text-[11px] bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 rounded-xl transition-colors border border-white/5"
              >
                重置為自動計算
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingStatusOrder(null)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const statusToSave = customStatusInput.trim();
                    await updateOnlineOrderStatus(editingStatusOrder.order_id, statusToSave);
                    showToast(`✨ 訂單 ${editingStatusOrder.order_id} 狀態更新為：「${statusToSave || '自動計算'}」`);
                    setEditingStatusOrder(null);
                  }}
                  className="px-4 py-1.5 text-xs font-extrabold bg-indigo-500 hover:bg-indigo-400 text-slate-950 rounded-xl shadow-md transition-all"
                >
                  確定儲存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stock Problem Blocking & Force Continuation Confirmation Modal */}
      {confirmShipOrderModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[90] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-[#0e172a] border border-amber-500/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="p-4 bg-gradient-to-r from-amber-500/20 via-red-500/10 to-transparent border-b border-amber-500/20 flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-400">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                <h3 className="text-sm font-extrabold text-white">
                  庫存異常安全擋：訂單 {confirmShipOrderModal.order.order_id}
                </h3>
              </div>
              <button 
                onClick={() => setConfirmShipOrderModal(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-200">
                <p className="font-bold mb-1">⚠️ 系統檢測出此訂單包含以下庫存異常/問題，已自動擋住執行：</p>
                <ul className="list-disc pl-5 space-y-1 text-slate-300 mt-2">
                  {confirmShipOrderModal.errors.map((err, idx) => (
                    <li key={idx} className="text-red-300 font-medium">{err}</li>
                  ))}
                </ul>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                請問您要<strong>取消出貨</strong>（先進行補貨或校正），或是<strong>強行繼續執行出貨</strong>（系統仍會扣除現有庫存並記錄訂單出貨歷史以利報表統計）？
              </p>
            </div>

            <div className="p-4 border-t border-white/10 bg-slate-900/80 flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmShipOrderModal(null)}
                className="px-4 py-2 text-xs font-bold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors border border-white/10"
              >
                ❌ 取消 / 暫緩出貨
              </button>
              <button
                disabled={shippingOrderIds.has(String(confirmShipOrderModal.order.order_id))}
                onClick={() => handleShipOrder(confirmShipOrderModal.order, true)}
                className={`px-4 py-2 text-xs font-black rounded-xl transition-all shadow-lg flex items-center gap-1.5 ${
                  shippingOrderIds.has(String(confirmShipOrderModal.order.order_id))
                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                    : 'text-slate-950 bg-amber-400 hover:bg-amber-300 shadow-amber-500/20 active:scale-95'
                }`}
              >
                {shippingOrderIds.has(String(confirmShipOrderModal.order.order_id)) ? (
                  <>
                    <span className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin inline-block" />
                    強行出貨中...
                  </>
                ) : (
                  <>
                    <Truck className="w-4 h-4" /> ⚠️ 強行繼續出貨 (扣存 & 記錄)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shortcut Customization Modal */}
      {isShortcutModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0f172a] w-full max-w-md rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
              <h3 className="font-bold text-white flex items-center gap-2 text-sm">
                <Settings className="w-4 h-4 text-sky-400" />
                自訂首頁捷徑
              </h3>
              <button onClick={() => setIsShortcutModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto custom-scrollbar flex-1">
              <p className="text-[11px] text-slate-400 mb-4">
                請選擇並排序您希望顯示在首頁的捷徑。
                <br />
                <span className="text-sky-400">💡 提示：</span> 排序前 4 個將以大按鈕顯示。
              </p>

              <div className="space-y-4">
                {/* Selected */}
                <div>
                  <h4 className="text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">已啟用的捷徑 (依序排列)</h4>
                  <div className="space-y-2">
                    {editingShortcuts.map((id, index) => {
                      const option = SHORTCUT_OPTIONS.find(o => o.id === id);
                      if (!option) return null;
                      const isLarge = index < 4;
                      return (
                        <div 
                          key={option.id} 
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = 'move';
                            setDraggedShortcutIndex(index);
                          }}
                          onDragEnter={(e) => {
                            e.preventDefault();
                            if (draggedShortcutIndex === null || draggedShortcutIndex === index) return;
                            setEditingShortcuts(prev => {
                              const next = [...prev];
                              const item = next.splice(draggedShortcutIndex, 1)[0];
                              next.splice(index, 0, item);
                              setDraggedShortcutIndex(index);
                              return next;
                            });
                          }}
                          onDragOver={(e) => e.preventDefault()}
                          onDragEnd={() => setDraggedShortcutIndex(null)}
                          className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-move ${
                            draggedShortcutIndex === index ? 'opacity-50 scale-[0.98]' : 'opacity-100'
                          } ${
                            isLarge ? 'border-sky-500/40 bg-sky-500/10' : 'border-white/10 bg-white/5'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <div className="cursor-grab active:cursor-grabbing text-slate-500 hover:text-slate-300 transition-colors pl-1">
                              <GripVertical className="w-4 h-4" />
                            </div>
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isLarge ? option.iconBgClass : 'bg-white/10 text-slate-400'}`}>
                              <option.icon className="w-4 h-4" />
                            </div>
                            <span className={`text-sm font-bold ${isLarge ? 'text-white' : 'text-slate-300'}`}>{option.label}</span>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            {isLarge ? (
                              <span className="text-[10px] font-mono text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded border border-sky-500/20 mr-1">
                                主按鈕 #{index + 1}
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono text-slate-400 bg-white/5 px-1.5 py-0.5 rounded border border-white/10 mr-1">
                                小按鈕
                              </span>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleShortcut(option.id); }}
                              className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Unselected */}
                {SHORTCUT_OPTIONS.filter(o => !editingShortcuts.includes(o.id)).length > 0 && (
                  <div>
                    <h4 className="text-[11px] font-bold text-slate-500 mb-2 uppercase tracking-wider">其他可用功能</h4>
                    <div className="space-y-2">
                      {SHORTCUT_OPTIONS.filter(o => !editingShortcuts.includes(o.id)).map(option => (
                        <div 
                          key={option.id} 
                          className="flex items-center justify-between p-2.5 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 cursor-pointer transition-colors"
                          onClick={(e) => {
                            e.preventDefault();
                            toggleShortcut(option.id);
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/10 text-slate-400">
                              <option.icon className="w-4 h-4" />
                            </div>
                            <span className="text-sm font-bold text-slate-300">{option.label}</span>
                          </div>
                          <div className="pr-2">
                            <PlusCircle className="w-5 h-5 text-slate-500" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="p-4 border-t border-white/10 bg-slate-900/80 flex gap-3">
              <button
                onClick={() => setEditingShortcuts(['stock_in', 'stock_out', 'scan', 'adjust', 'transactions', 'reports', 'vendors'])}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
              >
                恢復預設
              </button>
              <button
                onClick={handleSaveShortcuts}
                className="flex-1 py-2 rounded-xl text-sm font-bold text-slate-900 bg-sky-400 hover:bg-sky-300 transition-colors flex justify-center items-center gap-2 active:scale-95"
              >
                <Save className="w-4 h-4" />
                儲存設定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
