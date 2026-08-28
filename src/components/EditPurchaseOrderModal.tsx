import React, { useState, useEffect, useMemo } from 'react';
import { PurchaseOrder, PurchaseOrderItem, Product, Vendor } from '../lib/db';
import { 
  X, Check, Plus, Trash2, Calendar, Building2, 
  AlertCircle, CheckCircle2, Clock, Ban, Sparkles, Package 
} from 'lucide-react';
import SearchableProductCombobox from './SearchableProductCombobox';

interface EditPurchaseOrderModalProps {
  po: PurchaseOrder | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (poId: string, updated: Partial<PurchaseOrder>) => Promise<void>;
  products: Product[];
  vendors: Vendor[];
  allKnownVendors: Array<{ vendor_id: string; vendor_name: string }>;
}

export default function EditPurchaseOrderModal({
  po,
  isOpen,
  onClose,
  onSave,
  products,
  allKnownVendors
}: EditPurchaseOrderModalProps) {
  const [vendorId, setVendorId] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [orderDate, setOrderDate] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [status, setStatus] = useState<PurchaseOrder['status']>('pending');
  const [note, setNote] = useState('');
  const [items, setItems] = useState<PurchaseOrderItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (po) {
      setVendorId(po.vendor_id || '');
      setVendorName(po.vendor_name || po.vendor_id || '');
      setOrderDate(po.order_date || '');
      setExpectedDate(po.expected_date || '');
      setStatus(po.status || 'pending');
      setNote(po.note || '');
      setItems((po.items || []).map(it => ({ ...it })));
    }
  }, [po]);

  if (!isOpen || !po) return null;

  const totalOrdered = items.reduce((sum, it) => sum + Number(it.ordered_quantity || 0), 0);
  const totalReceived = items.reduce((sum, it) => sum + Number(it.received_quantity || 0), 0);
  const totalCost = items.reduce((sum, it) => sum + (Number(it.ordered_quantity || 0) * Number(it.cost_price || 0)), 0);
  const remainingOnOrder = Math.max(0, totalOrdered - totalReceived);

  const handleQuickClose = () => {
    setStatus('completed');
  };

  const handleQuickFullReceiveAndClose = () => {
    setItems(prev => prev.map(it => ({
      ...it,
      received_quantity: it.ordered_quantity
    })));
    setStatus('completed');
  };

  const handleQuickReopen = () => {
    setStatus(totalReceived > 0 ? 'partial' : 'pending');
  };

  const handleAddItem = (prod: Product) => {
    setItems(prev => [
      ...prev,
      {
        item_id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        product_id: prod.product_id,
        product_name: prod.name,
        name: prod.name,
        specification: prod.specification || '',
        ordered_quantity: 1,
        received_quantity: 0,
        cost_price: prod.cost_price || 0,
        note: ''
      }
    ]);
  };

  const handleSubmit = async () => {
    if (items.length === 0) {
      alert('採購單至少需要一項商品！');
      return;
    }

    try {
      setIsSaving(true);
      await onSave(po.po_id, {
        vendor_id: vendorId || vendorName,
        vendor_name: vendorName || vendorId,
        order_date: orderDate,
        expected_date: expectedDate,
        status: status,
        note: note,
        items: items
      });
      onClose();
    } catch (err: any) {
      alert(`儲存失敗: ${err.message || err}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-[#0f172a] border border-white/15 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-white text-base sm:text-lg">
                  編輯採購單 #{po.po_id}
                </h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
                  status === 'partial' ? 'bg-amber-500/20 text-amber-300' :
                  status === 'cancelled' ? 'bg-slate-500/20 text-slate-400' :
                  'bg-sky-500/20 text-sky-400'
                }`}>
                  {status === 'completed' ? '已結案' :
                   status === 'partial' ? '部分到貨' :
                   status === 'cancelled' ? '已取消' : '待到貨'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                可修改廠商、品項數量、進貨狀態，或手動結案清除在途庫存
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
          {/* Quick Action Banner */}
          <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-indigo-300 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
              <span>
                目前在途未到貨：<strong className="text-sky-300 font-mono">{status === 'completed' ? '0 (已結案)' : `${remainingOnOrder} 件`}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              {status !== 'completed' ? (
                <>
                  <button
                    type="button"
                    onClick={handleQuickClose}
                    className="px-3 py-1 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-bold transition-all cursor-pointer"
                    title="將採購單標記結案，不再計入剩餘在途"
                  >
                    ✅ 立即標記結案
                  </button>
                  <button
                    type="button"
                    onClick={handleQuickFullReceiveAndClose}
                    className="px-3 py-1 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 rounded-lg text-xs font-bold transition-all cursor-pointer"
                    title="將已到貨數量設為訂購數量並結案"
                  >
                    📦 全數到貨並結案
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleQuickReopen}
                  className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-bold transition-all cursor-pointer"
                  title="將已結案的採購單重新轉為待到貨"
                >
                  🔁 重新開啟採購單
                </button>
              )}
            </div>
          </div>

          {/* Form Fields: Vendor, Dates, Status */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Vendor */}
            <div>
              <label className="text-xs text-slate-400 block mb-1">採購廠商</label>
              <select
                value={vendorName}
                onChange={(e) => {
                  setVendorName(e.target.value);
                  setVendorId(e.target.value);
                }}
                className="w-full bg-[#1e293b] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
              >
                <option value="">-- 選擇廠商 --</option>
                {allKnownVendors.map(v => (
                  <option key={v.vendor_id || v.vendor_name} value={v.vendor_name}>
                    {v.vendor_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Expected Delivery Date */}
            <div>
              <label className="text-xs text-slate-400 block mb-1">預計到貨日</label>
              <input
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className="w-full bg-[#1e293b] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
              />
            </div>

            {/* Status Select */}
            <div>
              <label className="text-xs text-slate-400 block mb-1">採購單狀態</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full bg-[#1e293b] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none font-bold"
              >
                <option value="pending" className="bg-slate-900 text-sky-400">待到貨 (未進貨)</option>
                <option value="partial" className="bg-slate-900 text-amber-400">部分到貨</option>
                <option value="completed" className="bg-slate-900 text-emerald-400">已結案 / 全部到齊</option>
                <option value="cancelled" className="bg-slate-900 text-slate-400">已取消</option>
              </select>
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">採購備註</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="例如: 預計分兩批進貨、廠商出貨單據號..."
              className="w-full bg-[#1e293b] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
            />
          </div>

          {/* Items Section */}
          <div className="space-y-3 pt-2 border-t border-white/10">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-300">
                採購商品明細 ({items.length} 款)
              </h4>
            </div>

            {/* Add product to PO */}
            <div className="bg-white/[0.02] p-3 rounded-xl border border-white/5 space-y-2">
              <label className="text-xs text-slate-400 block">新增商品至此採購單：</label>
              <SearchableProductCombobox
                value=""
                products={products}
                onSelect={handleAddItem}
                onClear={() => {}}
                placeholder="搜尋並加入商品..."
              />
            </div>

            {/* Items Table */}
            <div className="overflow-x-auto border border-white/10 rounded-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-white/5 text-slate-400 font-bold border-b border-white/10">
                    <th className="py-2.5 px-3">商品名稱</th>
                    <th className="py-2.5 px-2">規格</th>
                    <th className="py-2.5 px-2 w-24 text-center">訂購量</th>
                    <th className="py-2.5 px-2 w-24 text-center">已到貨量</th>
                    <th className="py-2.5 px-2 w-24 text-center">單價</th>
                    <th className="py-2.5 px-2 text-right">小計</th>
                    <th className="py-2.5 px-2 w-10 text-center">刪除</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {items.map((item, idx) => (
                    <tr key={item.item_id || item.product_id || idx} className="hover:bg-white/[0.02]">
                      <td className="py-2 px-3">
                        <span className="font-bold text-white block truncate max-w-[180px]">
                          {item.name || item.product_name}
                        </span>
                        <span className="font-mono text-[10px] text-slate-500">
                          {item.product_id}
                        </span>
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          value={item.specification || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setItems(prev => prev.map((it, i) => i === idx ? { ...it, specification: val } : it));
                          }}
                          className="w-full bg-[#1e293b] border border-white/10 rounded px-1.5 py-1 text-xs text-white"
                        />
                      </td>
                      <td className="py-2 px-2 text-center">
                        <input
                          type="number"
                          min="1"
                          value={item.ordered_quantity}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 1;
                            setItems(prev => prev.map((it, i) => i === idx ? { ...it, ordered_quantity: val } : it));
                          }}
                          className="w-16 bg-[#1e293b] border border-white/10 rounded px-1.5 py-1 text-xs text-center text-white font-bold"
                        />
                      </td>
                      <td className="py-2 px-2 text-center">
                        <input
                          type="number"
                          min="0"
                          value={item.received_quantity || 0}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            setItems(prev => prev.map((it, i) => i === idx ? { ...it, received_quantity: val } : it));
                          }}
                          className="w-16 bg-[#1e293b] border border-white/10 rounded px-1.5 py-1 text-xs text-center text-emerald-400 font-bold"
                        />
                      </td>
                      <td className="py-2 px-2 text-center">
                        <input
                          type="number"
                          min="0"
                          value={item.cost_price}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            setItems(prev => prev.map((it, i) => i === idx ? { ...it, cost_price: val } : it));
                          }}
                          className="w-16 bg-[#1e293b] border border-white/10 rounded px-1.5 py-1 text-xs text-center text-white font-mono"
                        />
                      </td>
                      <td className="py-2 px-2 text-right font-mono font-bold text-amber-300">
                        ${(item.ordered_quantity * item.cost_price).toLocaleString()}
                      </td>
                      <td className="py-2 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                          className="text-slate-500 hover:text-red-400 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-white/10 bg-white/[0.02] flex items-center justify-between">
          <div className="text-xs text-slate-400">
            預計總金額: <span className="text-sm font-mono font-bold text-amber-300">${totalCost.toLocaleString()}</span>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSaving}
              className="flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold rounded-xl text-xs shadow-lg shadow-indigo-600/25 transition-all cursor-pointer disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{isSaving ? '儲存中...' : '儲存變更'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
