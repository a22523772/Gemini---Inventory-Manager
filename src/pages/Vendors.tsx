import { useState } from 'react';
import { useStore } from '../store/useStore';
import { Users, Plus, Phone, User, Building2, HardDriveDownload } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

export default function Vendors() {
  const { vendors, addVendor } = useStore();
  const [showForm, setShowForm] = useState(false);
  
  // Form State
  const [vendorName, setVendorName] = useState('');
  const [contact, setContact] = useState('');
  const [phone, setPhone] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vendorName) return;

    await addVendor({
      vendor_id: `V${Date.now().toString().slice(-6)}`,
      vendor_name: vendorName,
      contact,
      phone
    });

    setVendorName('');
    setContact('');
    setPhone('');
    setShowForm(false);
  };

  return (
    <div className="p-4 space-y-6 pb-24 h-full flex flex-col">
      <header className="flex items-center justify-between pt-4 pb-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-main)]">供應商管理</h1>
          <p className="text-sm text-[var(--color-text-dim)]">Vendors Directory</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 flex items-center glass-panel text-[var(--color-accent-blue)] rounded-xl text-sm font-bold shadow-sm hover:bg-white/10 transition-colors"
        >
          {showForm ? '取消' : <><Plus className="w-4 h-4 mr-1" /> 新增</>}
        </button>
      </header>

      {showForm && (
        <form onSubmit={handleSubmit} className="glass-panel p-4 rounded-2xl space-y-4 shadow-lg border-[var(--color-accent-blue)]/30 animate-in fade-in slide-in-from-top-4">
          <h2 className="text-base font-bold text-[var(--color-text-main)] mb-2 flex items-center">
            <Building2 className="w-5 h-5 mr-2 text-[var(--color-accent-blue)]" />
            新增供應商資料
          </h2>
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
            className="w-full mt-2 py-3 px-4 rounded-xl text-sm font-bold text-[#0f172a] bg-[var(--color-accent-blue)] hover:opacity-90 active:scale-95 transition-all"
          >
            確認新增
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
            <div key={v.vendor_id} className="glass-panel p-4 rounded-2xl flex items-center justify-between">
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
              <div className="px-3 py-1 bg-white/5 border border-white/10 rounded-lg">
                <span className="text-xs font-mono text-[var(--color-accent-blue)]">{v.vendor_id}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
