import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Users, Plus, Phone, User, Building2, Pencil, Trash2, X } from 'lucide-react';
import { Vendor } from '../lib/db';
import { useSearchParams } from 'react-router-dom';

export default function Vendors() {
  const { vendors, addVendor, editVendor, deleteVendor, showToast } = useStore();
  const [searchParams] = useSearchParams();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  
  // Form State
  const [vendorName, setVendorName] = useState('');
  const [contact, setContact] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    const newName = searchParams.get('newVendorName');
    const tempId = searchParams.get('tempId');
    if (newName) {
      setVendorName(newName);
      setShowForm(true);
    }
  }, [searchParams]);

  const openForm = (vendor?: Vendor) => {
    if (vendor) {
      setEditingId(vendor.vendor_id);
      setVendorName(vendor.vendor_name);
      setContact(vendor.contact || '');
      setPhone(vendor.phone || '');
    } else {
      setEditingId(null);
      setVendorName('');
      setContact('');
      setPhone('');
    }
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorName) return;

    if (editingId) {
      await editVendor({
        vendor_id: editingId,
        vendor_name: vendorName,
        contact,
        phone
      });
      showToast('✅ 供應商已更新！');
    } else {
      const tempId = searchParams.get('tempId');
      await addVendor({
        vendor_id: tempId || `V${Date.now().toString().slice(-6)}`,
        vendor_name: vendorName,
        contact,
        phone
      });
      showToast('✅ 新供應商已新增！');
    }
    closeForm();
  };

  const executeDelete = async (vendorId: string) => {
    try {
      await deleteVendor(vendorId);
      showToast('✅ 供應商已刪除！');
      setConfirmDeleteId(null);
    } catch (e: any) {
      showToast('❌ 刪除失敗: ' + e.message);
    }
  };

  return (
    <div className="p-4 space-y-6 pb-24 h-full flex flex-col">
      <header className="flex items-center justify-between pt-4 pb-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-main)]">供應商管理</h1>
          <p className="text-sm text-[var(--color-text-dim)]">Vendors Directory</p>
        </div>
        {!showForm && (
          <button
            onClick={() => openForm()}
            className="px-4 py-2 flex items-center glass-panel text-[var(--color-accent-blue)] rounded-xl text-sm font-bold shadow-sm hover:bg-white/10 transition-colors"
          >
            <Plus className="w-4 h-4 mr-1" /> 新增
          </button>
        )}
      </header>

      {showForm && (
        <form onSubmit={handleSubmit} className="glass-panel p-4 rounded-2xl space-y-4 shadow-lg border-[var(--color-accent-blue)]/30 animate-in fade-in slide-in-from-top-4">
          <div className="flex justify-between items-center mb-2">
             <h2 className="text-base font-bold text-[var(--color-text-main)] flex items-center">
               <Building2 className="w-5 h-5 mr-2 text-[var(--color-accent-blue)]" />
               {editingId ? '編輯供應商' : '新增供應商資料'}
             </h2>
             <button type="button" onClick={closeForm} className="p-1 rounded-full hover:bg-white/10 text-[var(--color-text-dim)]">
                <X className="w-5 h-5" />
             </button>
          </div>
          <div>
            <label className="block text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider text-[10px] mb-1">供應商名稱 *</label>
            <input
              type="text"
              required
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              placeholder="例如：聯強國際"
              className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] focus:border-[var(--color-accent-blue)] focus:ring-1 outline-none transition-all"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider text-[10px] mb-1">聯絡人</label>
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="例如：王先生"
                className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] focus:border-[var(--color-accent-blue)] focus:ring-1 outline-none transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-[var(--color-text-dim)] uppercase tracking-wider text-[10px] mb-1">電話</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="block w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] focus:border-[var(--color-accent-blue)] focus:ring-1 outline-none transition-all"
              />
            </div>
          </div>
          <button
            type="submit"
            className="w-full flex justify-center items-center mt-2 py-3 px-4 rounded-xl text-sm font-bold text-[#0f172a] bg-[var(--color-accent-blue)] hover:opacity-90 active:scale-95 transition-all"
          >
            {editingId ? '儲存修改' : '確認新增'}
          </button>
        </form>
      )}

      <div className="flex-1 overflow-y-auto space-y-3">
        {vendors.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center text-[var(--color-text-dim)] glass-panel rounded-2xl border-dashed">
            <Building2 className="w-8 h-8 mb-2 opacity-50 text-[var(--color-accent-blue)]" />
            <p className="text-sm font-medium">尚未建立任何供應商</p>
          </div>
        ) : (
          vendors.map(v => (
            <div key={v.vendor_id} className="glass-panel p-4 rounded-2xl flex items-center justify-between group">
              <div>
                <h3 className="text-base font-bold text-[var(--color-text-main)]">{v.vendor_name}</h3>
                <div className="flex items-center space-x-3 mt-2 text-[var(--color-text-dim)] text-xs">
                  {v.contact && (
                    <span className="flex items-center">
                      <User className="w-3 h-3 mr-1" />
                      {v.contact}
                    </span>
                  )}
                  {v.phone && (
                    <span className="flex items-center">
                      <Phone className="w-3 h-3 mr-1" />
                      {v.phone}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {confirmDeleteId === v.vendor_id ? (
                   <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2">
                     <span className="text-xs font-bold text-red-400 mr-1">確定刪除？</span>
                     <button onClick={() => executeDelete(v.vendor_id)} className="p-1 px-3 glass-panel rounded-lg text-red-400 hover:bg-red-500/20 text-xs font-bold transition-colors">確認</button>
                     <button onClick={() => setConfirmDeleteId(null)} className="p-1 px-3 glass-panel rounded-lg text-white hover:bg-white/10 text-xs transition-colors">取消</button>
                   </div>
                ) : (
                  <>
                    <button onClick={() => openForm(v)} className="p-2 glass-panel rounded-xl text-[var(--color-accent-blue)] hover:bg-white/10 transition-colors">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => setConfirmDeleteId(v.vendor_id)} className="p-2 glass-panel rounded-xl text-red-400 hover:bg-red-500/20 hover:border-red-500/30 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
