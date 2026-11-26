import { useState, useEffect, useRef, ChangeEvent } from 'react';
import { useStore, validateFullBackupPayload, countBackupPhotos, FullSiteBackup } from '../store/useStore';
import { Save, Check, RefreshCw, FileCode2, AlertTriangle, X, Key, Eye, EyeOff, Trash2, ListFilter, AlertCircle, Copy, CheckCheck, Download, Upload, Database, ShieldCheck, Image as ImageIcon } from 'lucide-react';
import { getGeminiAPIKey, setGeminiAPIKey as saveGeminiKey, clearGeminiAPIKey } from '../lib/geminiClient';

export default function SetupGuide() {
  const {
    gasApiUrl,
    setGasApiUrl,
    syncData,
    syncQueue,
    clearSyncQueue,
    removeFromSyncQueue,
    error,
    operator,
    setOperator,
    isLoading,
    products,
    vendors,
    stock,
    transactions,
    purchaseOrders,
    onlineOrders,
    exportFullBackup,
    importFullBackup
  } = useStore();
  const [url, setUrl] = useState(gasApiUrl);
  const [geminiKey, setGeminiKey] = useState(getGeminiAPIKey() || '');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [geminiSaved, setGeminiSaved] = useState(false);
  const [showQueueDetails, setShowQueueDetails] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [tab, setTab] = useState<'settings' | 'docs'>('settings');
  const backupFileInputRef = useRef<HTMLInputElement>(null);

  const [confirmAction, setConfirmAction] = useState<{
    type: 'stock' | 'transactions' | 'purchase_orders' | 'products' | 'vendors' | null;
    title: string;
    message: string;
    targetCount: number;
  }>({ type: null, title: '', message: '', targetCount: 0 });

  const [pendingBackupImport, setPendingBackupImport] = useState<{
    fileName: string;
    backup: FullSiteBackup;
    counts: {
      products: number;
      stock: number;
      vendors: number;
      transactions: number;
      purchaseOrders: number;
      onlineOrders: number;
      photos: number;
    };
  } | null>(null);
  const [isImportingBackup, setIsImportingBackup] = useState(false);

  useEffect(() => {
    setUrl(gasApiUrl);
  }, [gasApiUrl]);

  const handleSave = async () => {
    await setGasApiUrl(url);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSaveGeminiKey = () => {
    if (geminiKey.trim()) {
      saveGeminiKey(geminiKey.trim());
    } else {
      clearGeminiAPIKey();
    }
    setGeminiSaved(true);
    setTimeout(() => setGeminiSaved(false), 2000);
    useStore.getState().showToast("✅ AI 辨識金鑰已更新");
  };

  const handleExecuteOverwrite = async () => {
    const type = confirmAction.type;
    setConfirmAction({ type: null, title: '', message: '', targetCount: 0 });

    if (type === 'stock') {
      const success = await useStore.getState().overwriteCloudStock();
      if (success) {
        useStore.getState().showToast("✅ 庫存校正成功！雲端庫存工作表（stock）已完全還原為本系統資訊。");
      }
    } else if (type === 'transactions') {
      const success = await useStore.getState().overwriteCloudTransactions();
      if (success) {
        useStore.getState().showToast("✅ 紀錄還原成功！雲端交易紀錄工作表（transactions）已完全同步補齊。");
      }
    } else if (type === 'purchase_orders') {
      const success = await useStore.getState().overwriteCloudPurchaseOrders();
      if (success) {
        useStore.getState().showToast("✅ 採購單同步成功！雲端採購單工作表（purchase_orders）已完全同步補齊。");
      }
    } else if (type === 'products') {
      const success = await useStore.getState().overwriteCloudProducts();
      if (success) {
        useStore.getState().showToast("✅ 商品主檔同步成功！雲端商品工作表（products）已完全覆寫補齊。");
      }
    } else if (type === 'vendors') {
      const success = await useStore.getState().overwriteCloudVendors();
      if (success) {
        useStore.getState().showToast("✅ 供應商同步成功！雲端廠商工作表（vendors）已完全覆寫補齊。");
      }
    }
  };

  const handleExportFullBackup = () => {
    try {
      const backup = exportFullBackup();
      const photoCount = countBackupPhotos(backup.data.purchaseOrders, backup.data.transactions);
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const fileName = `StockApp_Backup_${stamp}.json`;
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      useStore.getState().showToast(
        `✅ 已匯出全站完整 JSON 備份（商品 ${backup.data.products.length}、庫存 ${backup.data.stock.length}、廠商 ${backup.data.vendors.length}、採購單 ${backup.data.purchaseOrders.length}、交易 ${backup.data.transactions.length}、單據照片 ${photoCount} 張）`
      );
    } catch (err: any) {
      useStore.getState().showToast(`❌ 匯出 JSON 備份失敗：${err?.message || '未知錯誤'}`);
    }
  };

  const handleSelectBackupFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const validation = validateFullBackupPayload(parsed);
      if (!validation.valid || !validation.backup || !validation.counts) {
        useStore.getState().showToast(`❌ 備份檔驗證失敗：${validation.error || '格式無效'}`);
        return;
      }
      setPendingBackupImport({
        fileName: file.name,
        backup: validation.backup,
        counts: validation.counts
      });
    } catch (err: any) {
      useStore.getState().showToast(`❌ 無法讀取 JSON 備份檔：${err?.message || '檔案格式錯誤'}`);
    }
  };

  const handleConfirmImportBackup = async () => {
    if (!pendingBackupImport) return;
    setIsImportingBackup(true);
    try {
      const res = await importFullBackup(pendingBackupImport.backup);
      if (res.success) {
        useStore.getState().showToast(
          `✅ 全站資料還原完成！（商品 ${res.counts.products}、庫存 ${res.counts.stock}、採購單 ${res.counts.purchaseOrders}、交易 ${res.counts.transactions}、單據照片 ${res.photoCount} 張）`
        );
        setPendingBackupImport(null);
      } else {
        useStore.getState().showToast(`❌ 還原失敗：${res.error || '未知錯誤'}`);
      }
    } finally {
      setIsImportingBackup(false);
    }
  };

  const handleCopyScript = () => {
    const el = document.getElementById('gas-script-code');
    if (el) {
      navigator.clipboard.writeText(el.innerText);
      setCopiedScript(true);
      useStore.getState().showToast("📋 已複製最新版 Google Apps Script 伺服器代碼！");
      setTimeout(() => setCopiedScript(false), 3000);
    }
  };

  return (
    <div className="h-full flex flex-col pb-24 md:pb-12">
      <div className="glass-panel border-x-0 border-t-0 px-4 pt-6 pb-2">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-main)] mb-4">設定與同步</h1>
        <div className="flex space-x-4 border-b border-white/10">
          <button 
            className={`pb-2 text-sm font-bold transition-colors ${tab === 'settings' ? 'text-[var(--color-accent-blue)] border-b-2 border-[var(--color-accent-blue)]' : 'text-[var(--color-text-dim)] hover:text-white'}`}
            onClick={() => setTab('settings')}
          >
            系統設定
          </button>
          <button 
            className={`pb-2 text-sm font-bold transition-colors flex items-center gap-2 ${tab === 'docs' ? 'text-[var(--color-accent-blue)] border-b-2 border-[var(--color-accent-blue)]' : 'text-[var(--color-text-dim)] hover:text-white'}`}
            onClick={() => setTab('docs')}
          >
            <span>後端代碼與文件</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
              v2.6 更新
            </span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {tab === 'settings' && (
          <>
            {/* Apps Script Update Notice Banner */}
            <div className="glass-panel p-4 rounded-2xl border-amber-500/40 bg-gradient-to-r from-amber-500/15 to-amber-600/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg shadow-amber-500/5">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-amber-500/20 border border-amber-500/40 rounded-xl text-amber-300 shrink-0 mt-0.5">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-amber-200">Google Apps Script 腳本版本已更新 (v2.6)</h3>
                    <span className="px-2 py-0.5 text-[10px] font-black bg-amber-400 text-slate-950 rounded">資料防遺失防護</span>
                  </div>
                  <p className="text-xs text-amber-200/80 mt-1 leading-relaxed">
                    本次升級包含採購單與覆寫寫入的<strong>記憶體先備快照＋失敗自動回滾保護</strong>、儲存格 45,000 字元安全防呆、日期格式正規化，以及新增 <code className="bg-black/30 px-1 py-0.5 rounded font-mono text-amber-200">overwriteProducts</code> / <code className="bg-black/30 px-1 py-0.5 rounded font-mono text-amber-200">overwriteVendors</code> 雲端修復接口。強烈建議先更新部署腳本！
                  </p>
                </div>
              </div>
              <button
                onClick={() => setTab('docs')}
                className="px-3.5 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl text-xs font-black shrink-0 transition-all shadow-md shadow-amber-400/20 active:scale-95 cursor-pointer flex items-center gap-1.5"
              >
                <span>複製最新代碼</span>
                <span>→</span>
              </button>
            </div>
            <div className="glass-panel p-4 rounded-2xl">
              <h2 className="text-base font-bold text-[var(--color-text-main)] mb-4">操作角色</h2>
              <div className="flex gap-2">
                 {(['staff', 'admin'] as const).map(role => (
                   <button
                     key={role}
                     onClick={() => setOperator(role)}
                     className={`px-4 py-2 rounded-xl text-sm font-bold capitalize flex-1 transition-colors ${operator === role ? 'bg-[var(--color-accent-blue)] text-[#0f172a] shadow-[0_0_15px_rgba(56,189,248,0.4)]' : 'glass-panel text-[var(--color-text-dim)] hover:text-white'}`}
                   >
                     {role}
                   </button>
                 ))}
              </div>
              <p className="text-xs text-[var(--color-text-dim)] mt-3">管理員可調整庫存，一般員工僅能進出貨。</p>
            </div>

            <div className="glass-panel p-4 rounded-2xl">
              <h2 className="text-base font-bold text-[var(--color-text-main)] mb-4">功能開關與警示控制</h2>
              
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-sm font-bold text-[var(--color-text-main)]">補貨警示功能</h3>
                  <p className="text-xs text-[var(--color-text-dim)] mt-1">開啟後，庫存低於設定值時會顯示警示標章 (預設 5 個)。</p>
                </div>
                <button
                  onClick={() => useStore.getState().setLowStockAlertEnabled(!useStore.getState().lowStockAlertEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${useStore.getState().lowStockAlertEnabled ? 'bg-[var(--color-accent-blue)]' : 'bg-gray-600'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${useStore.getState().lowStockAlertEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              <div className="pt-4 border-t border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-[var(--color-text-main)]">即將到期提醒天數</h3>
                  <span className="text-[var(--color-accent-blue)] font-bold text-lg">{useStore.getState().expiryThreshold} 天</span>
                </div>
                <p className="text-xs text-[var(--color-text-dim)] mb-3">設定商品在到期前幾天標記為「即將到期」。</p>
                <input 
                  type="range"
                  min="3"
                  max="180"
                  step="1"
                  value={useStore.getState().expiryThreshold}
                  onChange={(e) => useStore.getState().setExpiryThreshold(parseInt(e.target.value))}
                  className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[var(--color-accent-blue)]"
                />
                <div className="flex justify-between text-[10px] text-[var(--color-text-dim)] mt-1 uppercase font-bold tracking-widest">
                  <span>3 天</span>
                  <span>90 天</span>
                  <span>180 天</span>
                </div>
              </div>
            </div>

            <div className="glass-panel p-4 rounded-2xl">
              <h2 className="text-base font-bold text-[var(--color-text-main)] mb-4">Google Apps Script 網址</h2>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full rounded-xl border border-white/10 bg-white/5 py-3 px-3 text-sm text-[var(--color-text-main)] placeholder-[var(--color-text-dim)] focus:border-[var(--color-accent-blue)] focus:ring-1 focus:ring-[var(--color-accent-blue)] outline-none"
              />
              <button
                onClick={handleSave}
                className="mt-4 w-full flex items-center justify-center py-3 px-4 rounded-xl text-sm font-bold text-[#0f172a] bg-[var(--color-accent-blue)] hover:opacity-90 active:scale-95 transition-all"
              >
                {saved ? <Check className="w-5 h-5 mr-2" /> : <Save className="w-5 h-5 mr-2" />}
                {saved ? '已儲存！' : '儲存網址'}
              </button>
            </div>

            <div className="glass-panel p-4 rounded-2xl">
              <h2 className="text-base font-bold text-[var(--color-text-main)] mb-4 flex items-center gap-2">
                <Key className="w-5 h-5 text-indigo-400" />
                Google Gemini API 金鑰
              </h2>
              <p className="text-xs text-[var(--color-text-dim)] mb-3 leading-relaxed">
                用於啟用「採購單 AI 智慧辨識」功能。您的金鑰僅會安全地儲存於本機瀏覽器，不會上傳至任何其他伺服器。
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 ml-1 underline underline-offset-2">
                  免費申請金鑰
                </a>
              </p>
              <div className="relative">
                <input
                  type={showGeminiKey ? 'text' : 'password'}
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-3 pr-10 text-sm text-[var(--color-text-main)] placeholder-[var(--color-text-dim)] focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none font-mono"
                />
                <button
                  onClick={() => setShowGeminiKey(!showGeminiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                >
                  {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <button
                onClick={handleSaveGeminiKey}
                className="mt-4 w-full flex items-center justify-center py-3 px-4 rounded-xl text-sm font-bold text-white bg-indigo-500 hover:bg-indigo-600 active:scale-95 transition-all shadow-[0_0_15px_rgba(99,102,241,0.2)]"
              >
                {geminiSaved ? <Check className="w-5 h-5 mr-2" /> : <Save className="w-5 h-5 mr-2" />}
                {geminiSaved ? '金鑰已儲存！' : '儲存 AI 金鑰'}
              </button>
            </div>

            <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-4">
              <div className="flex flex-wrap justify-between items-center gap-2">
                 <div>
                   <h2 className="text-base font-bold text-[var(--color-text-main)] flex items-center gap-2">
                     <span>雲端同步狀態</span>
                     {syncQueue.length === 0 ? (
                       <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                         <Check className="w-3 h-3 stroke-[3]" /> 已全數同步
                       </span>
                     ) : (
                       <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                         <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                         {syncQueue.length} 筆待同步
                       </span>
                     )}
                   </h2>
                   <p className="text-xs text-slate-400 mt-1">
                     {syncQueue.length === 0
                       ? '目前所有本機異動均已與 Google Sheet 試算表保持一致。'
                       : '目前有操作暫存於本機隊列中，點選下方按鈕可進行重試或直接清空。'}
                   </p>
                 </div>
              </div>

              {error && (
                <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 p-3 rounded-xl flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <span className="font-bold">同步中斷提示：</span> {error}
                    <div className="text-[11px] text-rose-300/80 mt-1">
                      可能原因：Google 試算表端尚未部署最新版 Apps Script 腳本，或網路暫時中斷。您可以點擊「清空待同步佇列」消除此錯誤，或至「使用教學」複製最新腳本更新試算表。
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  onClick={syncData}
                  disabled={isLoading || !gasApiUrl}
                  className={`flex-1 flex items-center justify-center py-2.5 px-4 rounded-xl text-xs font-bold active:scale-95 transition-all outline-none ${
                    isLoading || !gasApiUrl ? 'bg-white/5 text-[var(--color-text-dim)] cursor-not-allowed' : 'bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-md shadow-sky-500/20 font-black'
                  }`}
                >
                  <RefreshCw className={`w-4 h-4 mr-1.5 ${isLoading ? 'animate-spin' : ''}`} />
                  {isLoading ? '正在同步試算表...' : '立即重試同步'}
                </button>

                {syncQueue.length > 0 && (
                  <>
                    <button
                      onClick={() => setShowQueueDetails(!showQueueDetails)}
                      className="px-3.5 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <ListFilter className="w-4 h-4 text-amber-400" />
                      <span>{showQueueDetails ? '收合明細' : `檢視明細 (${syncQueue.length})`}</span>
                    </button>

                    <button
                      onClick={() => {
                        if (window.confirm(`確定要清空目前卡在佇列中的 ${syncQueue.length} 筆操作嗎？\n\n注意：清空後將不會再將這 ${syncQueue.length} 筆操作寫入試算表，本機資料將保留現狀，頂部黃色待同步計數將立即歸零。`)) {
                          clearSyncQueue();
                        }
                      }}
                      className="px-3.5 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                      title="清空佇列中的所有操作，解決卡單問題"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>清空待同步佇列</span>
                    </button>
                  </>
                )}
              </div>

              {/* Queue Items Detail List */}
              {showQueueDetails && syncQueue.length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                  <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
                    <span>待同步隊列明細（按順序發送）：</span>
                    <span className="text-[11px] text-slate-500 font-mono">共 {syncQueue.length} 筆</span>
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                    {syncQueue.map((item, qIdx) => {
                      const actionLabelMap: Record<string, string> = {
                        batchStockIn: '批次到貨入庫',
                        stockIn: '單筆入庫',
                        stockOut: '商品出貨',
                        adjustStock: '庫存校正',
                        editPurchaseOrder: '採購單更新',
                        addPurchaseOrder: '建立採購單',
                        deletePurchaseOrder: '刪除採購單',
                        addProduct: '新增商品',
                        editProduct: '編輯商品',
                        deleteProduct: '刪除商品',
                        addVendor: '新增廠商',
                        editVendor: '編輯廠商',
                        deleteVendor: '刪除廠商',
                        batchShipment: '批次訂單出貨',
                        overwriteStock: '覆寫雲端庫存',
                        overwriteTransactions: '覆寫雲端交易紀錄',
                        overwritePurchaseOrders: '覆寫雲端採購單',
                        overwriteProducts: '覆寫雲端商品主檔',
                        overwriteVendors: '覆寫雲端廠商清單'
                      };
                      const actionName = actionLabelMap[item.action] || item.action;
                      const p = item.payload || {};
                      let detailText = '';
                      if (item.action === 'batchStockIn') {
                        detailText = `單號: ${p.po_id || p.batch_tx_id || '-'} (${p.items?.length || 0} 項商品)`;
                      } else if (item.action === 'stockIn') {
                        detailText = `${p.name || p.product_name || p.product_id} x${p.quantity} (${p.specification || '無規格'})`;
                      } else if (item.action === 'editPurchaseOrder') {
                        detailText = `採購單: ${p.po_id} (狀態: ${p.status || '-'})`;
                      } else if (item.action === 'stockOut') {
                        detailText = `${p.name || p.product_id} x${p.quantity} (${p.platform || '出貨'})`;
                      } else {
                        detailText = p.product_id || p.po_id || p.order_id || JSON.stringify(p).substring(0, 30);
                      }

                      return (
                        <div key={item.id || qIdx} className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-black/40 border border-white/5 text-xs">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="w-5 text-slate-500 font-mono text-[11px] shrink-0">{qIdx + 1}.</span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/30 shrink-0">
                              {actionName}
                            </span>
                            <span className="text-slate-300 truncate" title={detailText}>{detailText}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
                              {item.timestamp ? item.timestamp.split('T')[1]?.substring(0, 8) : ''}
                            </span>
                            <button
                              onClick={() => removeFromSyncQueue(item.id)}
                              className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors cursor-pointer"
                              title="自佇列中單獨移除此項"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="glass-panel p-4 rounded-2xl border-orange-500/20 bg-orange-500/5">
              <h2 className="text-base font-bold text-orange-200 mb-2">資料庫維護工具</h2>
              <p className="text-xs text-orange-200/60 mb-4">若您手動在 Google Sheets 新增了多行資料，或需要為雲端試算表自動補齊最新欄位（如 products 表的預計進貨日 expected_restock_date、brand、specification 等），請執行此功能以自動補齊表頭與生成缺失的 ID 並確保格式正確。</p>
              <button
                onClick={() => useStore.getState().reformatDatabase()}
                disabled={isLoading || !gasApiUrl}
                className={`w-full flex items-center justify-center py-3 px-4 rounded-xl text-sm font-bold active:scale-95 transition-all outline-none border border-orange-500/30 text-orange-200 bg-orange-500/10 hover:bg-orange-500/20 disabled:opacity-50`}
              >
                整理資料庫格式、補齊欄位與 ID
              </button>
            </div>

            <div className="glass-panel p-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h2 className="text-base font-bold text-emerald-200 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0" />
                  <span>雲端試算表手動修復與強行校正</span>
                </h2>
                <span className="text-[11px] font-mono text-emerald-300/80">覆寫前請先更新 GAS v2.6</span>
              </div>
              <p className="text-xs text-emerald-200/70 leading-relaxed">
                若 Google 試算表發生資料缺漏或與最完整裝置不一致，可於該裝置點擊下方對應工作表，以本機資料安全覆寫還原至雲端（支援 5 大核心資料表，覆寫採快照防遺失機制）。
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 font-semibold text-xs text-emerald-100">
                <div className="p-3.5 bg-black/40 rounded-xl border border-white/10 space-y-2.5 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span>1. 庫存工作表 (stock) 校正</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 font-mono tabular-nums">本機批次數：{stock.length} 筆</p>
                  </div>
                  <button
                    onClick={() => {
                      setConfirmAction({
                        type: 'stock',
                        title: '確定強制覆寫雲端庫存嗎？',
                        message: '確定要將雲端試算表的 stock 工作表覆蓋為此裝置上的庫存資料嗎？GAS v2.6 會先備份快照驗證後再寫入。',
                        targetCount: stock.length
                      });
                    }}
                    disabled={isLoading || !gasApiUrl}
                    className="w-full flex items-center justify-center py-2 px-3 rounded-lg text-xs font-bold transition-colors border border-emerald-500/40 text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-50 cursor-pointer"
                  >
                    以本地快取覆寫雲端庫存
                  </button>
                </div>

                <div className="p-3.5 bg-black/40 rounded-xl border border-white/10 space-y-2.5 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span>2. 交易紀錄 (transactions) 補齊</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 font-mono tabular-nums">本機紀錄數：{transactions.length} 筆</p>
                  </div>
                  <button
                    onClick={() => {
                      setConfirmAction({
                        type: 'transactions',
                        title: '確定強制還原雲端交易紀錄嗎？',
                        message: '確定要將雲端試算表的 transactions 交易紀錄覆蓋並補齊為此裝置上的紀錄嗎？GAS v2.6 會先備份快照驗證後再寫入。',
                        targetCount: transactions.length
                      });
                    }}
                    disabled={isLoading || !gasApiUrl}
                    className="w-full flex items-center justify-center py-2 px-3 rounded-lg text-xs font-bold transition-colors border border-emerald-500/40 text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-50 cursor-pointer"
                  >
                    以本地快取還原雲端交易
                  </button>
                </div>

                <div className="p-3.5 bg-black/40 rounded-xl border border-white/10 space-y-2.5 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span>3. 採購單 (purchase_orders) 同步</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 font-mono tabular-nums">本機採購單：{purchaseOrders.length} 筆（含單據號與照片連結）</p>
                  </div>
                  <button
                    onClick={() => {
                      setConfirmAction({
                        type: 'purchase_orders',
                        title: '確定強制同步雲端採購單嗎？',
                        message: '確定要將雲端試算表的 purchase_orders 工作表覆蓋並補齊為此裝置的採購單歷史紀錄嗎？GAS v2.6 會先嘗試上傳待存照片並以快照安全寫入。',
                        targetCount: purchaseOrders.length
                      });
                    }}
                    disabled={isLoading || !gasApiUrl}
                    className="w-full flex items-center justify-center py-2 px-3 rounded-lg text-xs font-bold transition-colors border border-emerald-500/40 text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-50 cursor-pointer"
                  >
                    以本地快取同步雲端採購單
                  </button>
                </div>

                <div className="p-3.5 bg-black/40 rounded-xl border border-white/10 space-y-2.5 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span>4. 商品主檔 (products) 同步</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 font-mono tabular-nums">本機商品數：{products.length} 筆</p>
                  </div>
                  <button
                    onClick={() => {
                      setConfirmAction({
                        type: 'products',
                        title: '確定強制同步雲端商品主檔嗎？',
                        message: '確定要將雲端試算表的 products 商品主檔工作表覆蓋並補齊為此裝置上的商品清單（含規格、安全庫存與供應狀態）嗎？',
                        targetCount: products.length
                      });
                    }}
                    disabled={isLoading || !gasApiUrl}
                    className="w-full flex items-center justify-center py-2 px-3 rounded-lg text-xs font-bold transition-colors border border-emerald-500/40 text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-50 cursor-pointer"
                  >
                    以本地快取覆寫雲端商品
                  </button>
                </div>

                <div className="p-3.5 bg-black/40 rounded-xl border border-white/10 space-y-2.5 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span>5. 供應商名單 (vendors) 同步</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 font-mono tabular-nums">本機廠商數：{vendors.length} 筆</p>
                  </div>
                  <button
                    onClick={() => {
                      setConfirmAction({
                        type: 'vendors',
                        title: '確定強制同步雲端供應商嗎？',
                        message: '確定要將雲端試算表的 vendors 供應商工作表覆蓋並補齊為此裝置上的廠商資料嗎？',
                        targetCount: vendors.length
                      });
                    }}
                    disabled={isLoading || !gasApiUrl}
                    className="w-full flex items-center justify-center py-2 px-3 rounded-lg text-xs font-bold transition-colors border border-emerald-500/40 text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 disabled:opacity-50 cursor-pointer"
                  >
                    以本地快取覆寫雲端廠商
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-emerald-300/65 leading-relaxed">
                * 提醒：覆寫功能需搭配 Google Apps Script v2.6 代碼。請點選上方「後端代碼與文件」，複製最新腳本更新部署後再執行復原。
              </p>
            </div>

            {/* Full-Site JSON Snapshot Backup & Restore */}
            <div className="glass-panel p-4 rounded-2xl border border-sky-500/25 bg-sky-500/5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h2 className="text-base font-bold text-sky-200 flex items-center gap-2">
                  <Database className="w-5 h-5 text-sky-400 shrink-0" />
                  <span>全站資料 JSON 快照備份與還原</span>
                </h2>
                <span className="text-[11px] font-mono text-sky-300/80 tabular-nums">
                  含 6 大資料表與 {countBackupPhotos(purchaseOrders, transactions)} 張單據照片
                </span>
              </div>
              <p className="text-xs text-sky-200/75 leading-relaxed">
                完整匯出或還原所有本地資料（商品、廠商、庫存、採購單、交易紀錄、網路訂單、設定），並<strong>完整保留全部採購單與進貨單據照片（含 Google Drive 連結與離線影像資料）</strong>。建議在進行大規模調整前先匯出一份本機 JSON 快照。
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 text-[11px] font-mono">
                <div className="px-2.5 py-2 rounded-lg bg-black/35 border border-white/10 flex items-center justify-between">
                  <span className="text-slate-400">商品</span>
                  <span className="text-slate-100 font-bold tabular-nums">{products.length}</span>
                </div>
                <div className="px-2.5 py-2 rounded-lg bg-black/35 border border-white/10 flex items-center justify-between">
                  <span className="text-slate-400">廠商</span>
                  <span className="text-slate-100 font-bold tabular-nums">{vendors.length}</span>
                </div>
                <div className="px-2.5 py-2 rounded-lg bg-black/35 border border-white/10 flex items-center justify-between">
                  <span className="text-slate-400">庫存</span>
                  <span className="text-slate-100 font-bold tabular-nums">{stock.length}</span>
                </div>
                <div className="px-2.5 py-2 rounded-lg bg-black/35 border border-white/10 flex items-center justify-between">
                  <span className="text-slate-400">採購單</span>
                  <span className="text-slate-100 font-bold tabular-nums">{purchaseOrders.length}</span>
                </div>
                <div className="px-2.5 py-2 rounded-lg bg-black/35 border border-white/10 flex items-center justify-between">
                  <span className="text-slate-400">交易</span>
                  <span className="text-slate-100 font-bold tabular-nums">{transactions.length}</span>
                </div>
                <div className="px-2.5 py-2 rounded-lg bg-black/35 border border-white/10 flex items-center justify-between">
                  <span className="text-slate-400">網單</span>
                  <span className="text-slate-100 font-bold tabular-nums">{onlineOrders.length}</span>
                </div>
                <div className="px-2.5 py-2 rounded-lg bg-sky-950/50 border border-sky-500/30 flex items-center justify-between">
                  <span className="text-sky-300 flex items-center gap-1"><ImageIcon className="w-3 h-3" />照片</span>
                  <span className="text-sky-200 font-bold tabular-nums">{countBackupPhotos(purchaseOrders, transactions)}</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  onClick={handleExportFullBackup}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold bg-sky-500 hover:bg-sky-400 text-slate-950 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>匯出全站完整 JSON 備份（含單據照片）</span>
                </button>

                <button
                  type="button"
                  onClick={() => backupFileInputRef.current?.click()}
                  disabled={isImportingBackup}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/15 text-slate-100 border border-white/15 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-sky-400" />
                  <span>匯入並還原 JSON 快照檔案</span>
                </button>

                <input
                  ref={backupFileInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={handleSelectBackupFile}
                />
              </div>
              <p className="text-[11px] text-sky-300/65 leading-relaxed">
                * 匯入 JSON 快照後將優先還原本機資料庫與所有單據照片，不會直接覆動試算表；若需將還原後的資料同步寫回 Google 試算表，請接著點擊上方對應工作表的「覆寫雲端」修復按鈕。
              </p>
            </div>
          </>
        )}

        {tab === 'docs' && (
           <div className="glass-panel p-4 rounded-2xl text-sm space-y-4">
             <div className="p-4 bg-[var(--color-accent-blue)]/10 border border-[var(--color-accent-blue)]/30 rounded-xl text-blue-100">
               <FileCode2 className="w-6 h-6 mb-2 text-[var(--color-accent-blue)]" />
               <h3 className="font-bold text-[var(--color-accent-blue)]">關於 PWA (漸進式網頁應用) 的重要提醒</h3>
               <p className="mt-1 text-white/90">
                 此系統提供離線操作、條碼掃描以及快速的本地搜尋功能。為了讓您能在各平台順暢使用，我們已將其建置為 <strong>PWA (漸進式網頁應用程式)</strong>。
               </p>
               <ul className="list-disc pl-5 mt-2 space-y-1 text-white/90">
                 <li><strong>iOS 使用方式：</strong> 請在 Safari 開啟此網址，點擊「分享」圖示，然後選擇 <strong>「加入主畫面」</strong>。它的運作會與一般的原生 App 一模一樣且支援離線。</li>
                 <li><strong>Android/電腦版：</strong> 請使用 Chrome 開啟，根據提示選擇「安裝應用程式」。</li>
               </ul>
             </div>

             <section>
                <h3 className="text-base font-bold text-[var(--color-text-main)]">1. Google Sheets 結構設定</h3>
                <p className="text-[var(--color-text-dim)] mt-1">請建立一個 Google Sheet，並確保下方有這六個工作表（<strong>欄位順序無須固定，系統會依照第 1 列的表頭名稱自動動態對齊，只要包含該欄位即可</strong>）：</p>
                <ul className="list-disc pl-5 mt-2 space-y-1 text-white/80 font-mono text-xs break-words">
                  <li><strong>products</strong> (商品表): product_id, barcode, name, category, brand, unit, cost_price, vendor_id, has_expiry, specification, min_stock, is_discontinued, expected_restock_date, created_at</li>
                  <li><strong>vendors</strong> (供應商): vendor_id, vendor_name, contact, phone</li>
                  <li><strong>stock</strong> (庫存表): stock_id, product_id, name, location, floor, area, quantity, expiry_date, specification, last_update</li>
                  <li><strong>transactions</strong> (交易明細表): transaction_id, online_order_id, platform, product_id, name, type, quantity, price, location, floor, area, specification, cost_price, vendor_id, date, note, operator</li>
                  <li><strong>purchase_orders</strong> (採購單表): po_id, vendor_id, vendor_name, product_id, name, specification, ordered_quantity, received_quantity, cost_price, status, order_date, expected_date, note, operator, invoice_number, invoice_image_url</li>
                  <li><strong>網路訂單</strong> (網路訂單): order_id (訂單編號), platform (來源平台), product_id (商品編號), product_name (商品名稱), quantity (數量), price (金額), customer_name (買家), 最晚出貨期限 (shipping_deadline), order_status (訂單狀態), created_at (下單時間), specification (規格), shipping_method (物流方式)</li>
                </ul>
             </section>

             <section>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-8 mb-3">
                  <div>
                    <h3 className="text-base font-bold text-[var(--color-text-main)] flex items-center gap-2">
                      <span>2. Google Apps Script 伺服器代碼</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-400 text-slate-950">
                        v2.6 最新版
                      </span>
                    </h3>
                    <p className="text-[var(--color-text-dim)] mt-0.5 text-xs">在 Google 試算表中點選「擴充功能 &gt; Apps Script」，將以下代碼覆蓋貼上並部署為網頁應用程式：</p>
                  </div>
                  <button
                    onClick={handleCopyScript}
                    className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 shadow-md shadow-sky-500/20 active:scale-95 cursor-pointer shrink-0"
                  >
                    {copiedScript ? <CheckCheck className="w-4 h-4 stroke-[3]" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedScript ? '代碼已複製到剪貼簿！' : '一鍵複製全部代碼'}</span>
                  </button>
                </div>

                {/* Prominent Apps Script Update Reminder Notice */}
                <div className="p-4 bg-gradient-to-r from-amber-500/15 via-sky-500/10 to-indigo-500/10 border-2 border-amber-500/40 rounded-2xl mb-3 space-y-3 shadow-lg shadow-amber-500/5">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded text-xs font-black bg-amber-400 text-slate-950 flex items-center gap-1.5 shadow-sm">
                      <AlertTriangle className="w-3.5 h-3.5 fill-slate-950 stroke-none" />
                      腳本更新提醒 (v2.6)
                    </span>
                    <span className="text-xs font-bold text-amber-300">2026-11-25 最新版（防遺失防護）</span>
                  </div>

                  <div className="text-xs text-slate-200 leading-relaxed bg-black/40 p-3 rounded-xl border border-white/5 space-y-1.5">
                    <div className="font-bold text-amber-200 flex items-center gap-1.5">
                      🚀 本次腳本重點升級（原子快照防遺失、45K 儲存格保護與全表修復）：
                    </div>
                    <ul className="list-disc pl-5 space-y-1 text-slate-300">
                      <li><strong>原子快照與錯誤回滾保護（Never Clear Before Build）</strong>：所有 <code className="text-sky-300 font-mono">overwrite*</code> 與採購單寫入（<code className="text-sky-300 font-mono">addPurchaseOrder</code> / <code className="text-sky-300 font-mono">editPurchaseOrder</code>）改為先在記憶體驗證整理所有列資料、並對原表進行 <code className="text-sky-300 font-mono">snapshotSheetData</code> 快照備份後才覆寫；寫入若遇例外即自動以 <code className="text-sky-300 font-mono">restoreSheetData</code> 還原，杜絕清表後中斷造成試算表資料消失。</li>
                      <li><strong>儲存格長度防呆與日期正規化</strong>：對所有寫入儲存格加入 45,000 字元防呆（過濾超限未上傳 base64 同時完整保留 Google Drive 圖片連結），採購單 <code className="text-sky-300 font-mono">order_date</code> / <code className="text-sky-300 font-mono">expected_date</code> 統一以純文字 <code className="text-sky-300 font-mono">yyyy-MM-dd</code> 格式存讀。</li>
                      <li><strong>新增商品與廠商雲端修復接口</strong>：加入 <code className="text-sky-300 font-mono">overwriteProducts</code> 與 <code className="text-sky-300 font-mono">overwriteVendors</code>，配合系統設定頁 5 大工作表手動覆寫還原。</li>
                    </ul>
                    <div className="text-[11px] text-amber-300/90 font-medium pt-1 border-t border-white/10 mt-2">
                      📌 <strong>更新步驟</strong>：
                      點擊右上角「一鍵複製全部代碼」👉 開啟 Google 試算表「擴充功能 &gt; Apps Script」全選貼上 👉 點擊「部署 &gt; 管理部署」點選鉛筆圖示，版本選「新版本」後儲存即可！
                    </div>
                  </div>
                </div>

                <div className="relative group">
                  <button
                    onClick={handleCopyScript}
                    className="absolute top-3 right-3 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border border-white/10 shadow-sm cursor-pointer z-10"
                  >
                    {copiedScript ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-300" />}
                    <span>{copiedScript ? '已複製！' : '複製代碼'}</span>
                  </button>
                  <pre id="gas-script-code" className="bg-black/50 border border-white/10 text-[var(--color-text-dim)] p-4 pt-10 rounded-xl overflow-x-auto text-xs font-mono max-h-[500px]">
{`function getProdNameMap(ss) {
  var pSheet = ss.getSheetByName('products');
  var map = {};
  if (pSheet && pSheet.getLastRow() > 1) {
    var pHeaders = pSheet.getRange(1, 1, 1, pSheet.getLastColumn()).getValues()[0];
    var pidIdx = -1;
    var nameIdx = -1;
    for (var i = 0; i < pHeaders.length; i++) {
      var h = String(pHeaders[i] || '').trim().toLowerCase();
      if (h === 'product_id' || h === '商品代碼' || h === '商品編號' || h === '商品id' || h === 'id') pidIdx = i;
      if (h === 'name' || h === 'product_name' || h === '商品名稱' || h === '品名' || h === '名稱') nameIdx = i;
    }
    if (pidIdx !== -1 && nameIdx !== -1) {
      var pVals = pSheet.getDataRange().getValues();
      for (var r = 1; r < pVals.length; r++) {
        var pid = String(pVals[r][pidIdx] || '').trim();
        var pname = String(pVals[r][nameIdx] || '').trim();
        if (pid && pname) {
          map[pid] = pname;
          map[pid.toLowerCase()] = pname;
        }
      }
    }
  }
  return map;
}

function normalizePoHeader(h) {
  var key = String(h || '').trim().toLowerCase();
  if (key === 'po_id' || key === '採購單號' || key === '採購單id') return 'po_id';
  if (key === 'vendor_id' || key === '廠商編號' || key === '廠商id') return 'vendor_id';
  if (key === 'vendor_name' || key === '廠商名稱' || key === '廠商') return 'vendor_name';
  if (key === 'product_id' || key === '商品編號' || key === '商品代碼' || key === '商品id') return 'product_id';
  if (key === 'name' || key === 'product_name' || key === '商品名稱' || key === '品名') return 'name';
  if (key === 'specification' || key === '規格') return 'specification';
  if (key === 'ordered_quantity' || key === 'order_quantity' || key === 'quantity' || key === '訂購數量' || key === '採購數量') return 'ordered_quantity';
  if (key === 'received_quantity' || key === 'delivered_quantity' || key === '已到貨數量' || key === '已到貨' || key === '已收數量') return 'received_quantity';
  if (key === 'cost_price' || key === '進價' || key === '成本' || key === '約定進價') return 'cost_price';
  if (key === 'status' || key === '狀態') return 'status';
  if (key === 'order_date' || key === '下單日期') return 'order_date';
  if (key === 'expected_date' || key === '預計到貨日') return 'expected_date';
  if (key === 'note' || key === '備註') return 'note';
  if (key === 'operator' || key === '操作人員') return 'operator';
  if (key === 'invoice_number' || key === '發票號碼' || key === '單據號' || key === '發票號' || key === '單號' || key === '發票號/單據號') return 'invoice_number';
  if (key === 'invoice_image_url' || key === '單據照片' || key === '發票照片') return 'invoice_image_url';
  if (key === 'updated_at' || key === '更新時間') return 'updated_at';
  if (key === 'manual_edited_at') return 'manual_edited_at';
  if (key === 'manual_override') return 'manual_override';
  return String(h || '').trim();
}

function clampSheetCell(val, maxLen) {
  var limit = maxLen || 45000;
  if (val === undefined || val === null) return '';
  if (typeof val === 'number' || typeof val === 'boolean') return val;
  var str = String(val);
  if (str.length <= limit) return str;
  return str.substring(0, limit);
}

function sanitizeSheetImageUrlCell(val) {
  if (val === undefined || val === null) return '';
  var raw = String(val).trim();
  if (!raw) return '';
  var lines = raw.split('\\n');
  var kept = [];
  var totalLen = 0;
  for (var i = 0; i < lines.length; i++) {
    var line = String(lines[i] || '').trim();
    if (!line) continue;
    if (line.indexOf('data:image') === 0 && line.length > 45000) {
      continue;
    }
    var nextTotal = totalLen + (kept.length > 0 ? 1 : 0) + line.length;
    if (nextTotal > 45000) {
      continue;
    }
    kept.push(line);
    totalLen = nextTotal;
  }
  return kept.join('\\n');
}

function formatPoDateCell(val) {
  if (val === undefined || val === null || val === '') return '';
  if (Object.prototype.toString.call(val) === '[object Date]' && !isNaN(val.getTime())) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(val).trim();
  if (!s) return '';
  var m = s.match(/^(\\d{4})[\\/\\-](\\d{1,2})[\\/\\-](\\d{1,2})/);
  if (m) {
    var mm = m[2].length === 1 ? '0' + m[2] : m[2];
    var dd = m[3].length === 1 ? '0' + m[3] : m[3];
    return m[1] + '-' + mm + '-' + dd;
  }
  return s;
}

function snapshotSheetData(sheet) {
  if (!sheet || sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) return null;
  return sheet.getDataRange().getValues();
}

function restoreSheetData(sheet, snapshot) {
  if (!sheet || !snapshot || snapshot.length === 0 || !snapshot[0] || snapshot[0].length === 0) return;
  try {
    sheet.clearContents();
    sheet.getRange(1, 1, snapshot.length, snapshot[0].length).setValues(snapshot);
  } catch (restoreErr) {
    // Best-effort restore
  }
}

function doPost(e) {
  var action = e.parameter.action;
  var data = JSON.parse(e.postData.contents);
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  if (action === 'addProduct') {
    var prodSheet = ss.getSheetByName('products');
    if (!prodSheet) prodSheet = ss.insertSheet('products');
    
    var headers = [];
    if (prodSheet.getLastRow() === 0) {
      headers = ['product_id', 'barcode', 'name', 'category', 'unit', 'cost_price', 'vendor_id', 'has_expiry', 'created_at', 'brand', 'specification', 'min_stock', 'is_discontinued', 'expected_restock_date'];
      prodSheet.appendRow(headers);
    } else {
      headers = prodSheet.getRange(1, 1, 1, prodSheet.getLastColumn()).getValues()[0];
      if (headers.indexOf('brand') === -1) { headers.push('brand'); prodSheet.getRange(1, headers.length).setValue('brand'); }
      if (headers.indexOf('specification') === -1) { headers.push('specification'); prodSheet.getRange(1, headers.length).setValue('specification'); }
      if (headers.indexOf('min_stock') === -1) { headers.push('min_stock'); prodSheet.getRange(1, headers.length).setValue('min_stock'); }
      if (headers.indexOf('is_discontinued') === -1) { headers.push('is_discontinued'); prodSheet.getRange(1, headers.length).setValue('is_discontinued'); }
      if (headers.indexOf('expected_restock_date') === -1) { headers.push('expected_restock_date'); prodSheet.getRange(1, headers.length).setValue('expected_restock_date'); }
    }
    
    // Automatic ID generation (Pattern B: P000001)
    if (!data.product_id || data.product_id === '') {
      var lastIdNum = 0;
      if (prodSheet.getLastRow() > 1) {
        var idValues = prodSheet.getRange(2, headers.indexOf('product_id') + 1, prodSheet.getLastRow() - 1, 1).getValues();
        for (var i = 0; i < idValues.length; i++) {
          var currentId = String(idValues[i][0]);
          if (currentId.indexOf('P') === 0) {
            var num = parseInt(currentId.substring(1));
            if (!isNaN(num) && num > lastIdNum) lastIdNum = num;
          }
        }
      }
      var nextId = 'P' + String(lastIdNum + 1).padStart(6, '0');
      data.product_id = nextId;
    }

    var rowData = [];
    for (var j = 0; j < headers.length; j++) {
      var val = data[headers[j]];
      rowData.push(val !== undefined ? val : '');
    }
    prodSheet.appendRow(rowData);
    return ContentService.createTextOutput(JSON.stringify({success:true, product_id: data.product_id})).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'reformatDatabase') {
    // 1. Refresh Products table
    var prodSheet = ss.getSheetByName('products');
    var prodCostMap = {};
    var prodNameMap = {};
    if (prodSheet && prodSheet.getLastRow() > 0) {
       var headers = ['product_id', 'barcode', 'name', 'category', 'unit', 'cost_price', 'vendor_id', 'has_expiry', 'created_at', 'brand', 'specification', 'min_stock', 'is_discontinued', 'expected_restock_date'];
       var existingHeaders = prodSheet.getRange(1, 1, 1, prodSheet.getLastColumn()).getValues()[0];
       if (existingHeaders.indexOf('brand') === -1) { existingHeaders.push('brand'); prodSheet.getRange(1, existingHeaders.length).setValue('brand'); }
       if (existingHeaders.indexOf('specification') === -1) { existingHeaders.push('specification'); prodSheet.getRange(1, existingHeaders.length).setValue('specification'); }
       if (existingHeaders.indexOf('min_stock') === -1) { existingHeaders.push('min_stock'); prodSheet.getRange(1, existingHeaders.length).setValue('min_stock'); }
       if (existingHeaders.indexOf('is_discontinued') === -1) { existingHeaders.push('is_discontinued'); prodSheet.getRange(1, existingHeaders.length).setValue('is_discontinued'); }
       if (existingHeaders.indexOf('expected_restock_date') === -1) { existingHeaders.push('expected_restock_date'); prodSheet.getRange(1, existingHeaders.length).setValue('expected_restock_date'); }
       
       var values = prodSheet.getDataRange().getValues();
       var idIdx = existingHeaders.indexOf('product_id');
       var nameIdx = existingHeaders.indexOf('name');
       var costIdx = existingHeaders.indexOf('cost_price');
       var lastIdNum = 0;
       
       // Pass 1: Find max ID & map cost prices & product names
       for(var i=1; i<values.length; i++) {
         var cid = String(values[i][idIdx] || '').trim();
         if(cid.indexOf('P') === 0) {
           var n = parseInt(cid.substring(1));
           if(!isNaN(n) && n > lastIdNum) lastIdNum = n;
         }
         if (cid) {
           if (costIdx !== -1) prodCostMap[cid] = Number(values[i][costIdx]) || 0;
           if (nameIdx !== -1) prodNameMap[cid] = String(values[i][nameIdx] || '').trim();
         }
       }
       
       // Pass 2: Assign IDs to empty rows
       for(var i=1; i<values.length; i++) {
         if(!values[i][idIdx] || values[i][idIdx] === '') {
           lastIdNum++;
           var nid = 'P' + String(lastIdNum).padStart(6, '0');
           prodSheet.getRange(i+1, idIdx + 1).setValue(nid);
           if (nameIdx !== -1 && values[i][nameIdx]) {
             prodNameMap[nid] = String(values[i][nameIdx]).trim();
           }
         }
       }
    }

    // 2. Fix transactions sheet headers and cost_price formatting/date corruption and missing product names
    var transSheet = ss.getSheetByName('transactions');
    if (transSheet && transSheet.getLastRow() > 0) {
       var tHeaders = transSheet.getRange(1, 1, 1, transSheet.getLastColumn()).getValues()[0];
       var tNameIdx = tHeaders.indexOf('name');
       if (tNameIdx === -1) {
         for (var th = 0; th < tHeaders.length; th++) {
           var thStr = String(tHeaders[th] || '').trim().toLowerCase();
           if (thStr === 'product_name' || thStr === '商品名稱' || thStr === '品名') {
             transSheet.getRange(1, th + 1).setValue('name');
             tHeaders[th] = 'name';
             tNameIdx = th;
             break;
           }
         }
         if (tNameIdx === -1) {
           tHeaders.push('name');
           transSheet.getRange(1, tHeaders.length).setValue('name');
           tNameIdx = tHeaders.length - 1;
         }
       }
       var tCostIdx = tHeaders.indexOf('cost_price');
       var tPidIdx = tHeaders.indexOf('product_id');
       var tPriceIdx = tHeaders.indexOf('price');
       var tDateIdx = tHeaders.indexOf('date');

       if (transSheet.getLastRow() > 1) {
         var tValues = transSheet.getDataRange().getValues();
         if (tCostIdx !== -1) {
           transSheet.getRange(2, tCostIdx + 1, transSheet.getLastRow() - 1, 1).setNumberFormat('0.##');
         }
         if (tPriceIdx !== -1) {
           transSheet.getRange(2, tPriceIdx + 1, transSheet.getLastRow() - 1, 1).setNumberFormat('0.##');
         }
         if (tDateIdx !== -1) {
           transSheet.getRange(2, tDateIdx + 1, transSheet.getLastRow() - 1, 1).setNumberFormat('@');
         }

         for (var ti = 1; ti < tValues.length; ti++) {
           var rawPid = tPidIdx !== -1 ? String(tValues[ti][tPidIdx] || '').trim() : '';
           // Fix cost price
           if (tCostIdx !== -1) {
             var rawCost = tValues[ti][tCostIdx];
             if (rawCost instanceof Date || String(rawCost).indexOf('1899') !== -1 || isNaN(Number(rawCost))) {
               var fixedCost = prodCostMap[rawPid] || 0;
               transSheet.getRange(ti + 1, tCostIdx + 1).setValue(fixedCost);
             }
           }
           // Fix missing product name
           if (tNameIdx !== -1 && rawPid && prodNameMap[rawPid]) {
             var rawName = String(tValues[ti][tNameIdx] || '').trim();
             if (!rawName) {
               transSheet.getRange(ti + 1, tNameIdx + 1).setValue(prodNameMap[rawPid]);
             }
           }
         }
       }
    }

    // 3. Fix purchase_orders sheet headers and missing product names
    var poSheet = ss.getSheetByName('purchase_orders');
    if (poSheet && poSheet.getLastRow() > 0) {
       var poHeaders = poSheet.getRange(1, 1, 1, poSheet.getLastColumn()).getValues()[0];
       if (poHeaders.indexOf('invoice_number') === -1) {
         poHeaders.push('invoice_number');
         poSheet.getRange(1, poHeaders.length).setValue('invoice_number');
       }
       if (poHeaders.indexOf('invoice_image_url') === -1) {
         poHeaders.push('invoice_image_url');
         poSheet.getRange(1, poHeaders.length).setValue('invoice_image_url');
       }
       var poNameIdx = poHeaders.indexOf('name');
       if (poNameIdx === -1) {
         for (var ph = 0; ph < poHeaders.length; ph++) {
           var phStr = String(poHeaders[ph] || '').trim().toLowerCase();
           if (phStr === 'product_name' || phStr === '商品名稱' || phStr === '品名') {
             poSheet.getRange(1, ph + 1).setValue('name');
             poHeaders[ph] = 'name';
             poNameIdx = ph;
             break;
           }
         }
         if (poNameIdx === -1) {
           poHeaders.push('name');
           poSheet.getRange(1, poHeaders.length).setValue('name');
           poNameIdx = poHeaders.length - 1;
         }
       }
       var poPidIdx = poHeaders.indexOf('product_id');
       if (poSheet.getLastRow() > 1 && poNameIdx !== -1 && poPidIdx !== -1) {
         var poValues = poSheet.getDataRange().getValues();
         for (var pi = 1; pi < poValues.length; pi++) {
           var pPid = String(poValues[pi][poPidIdx] || '').trim();
           var pName = String(poValues[pi][poNameIdx] || '').trim();
           if (!pName && pPid && prodNameMap[pPid]) {
             poSheet.getRange(pi + 1, poNameIdx + 1).setValue(prodNameMap[pPid]);
           }
         }
       }
    }

    return ContentService.createTextOutput(JSON.stringify({success:true, message: 'Database reformatted, product names populated, and transactions/purchase_orders repaired.'})).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'editProduct') {
    var prodSheet = ss.getSheetByName('products');
    if (prodSheet && prodSheet.getLastRow() > 1) {
      var headers = prodSheet.getRange(1, 1, 1, prodSheet.getLastColumn()).getValues()[0];
      if (headers.indexOf('brand') === -1) { headers.push('brand'); prodSheet.getRange(1, headers.length).setValue('brand'); }
      if (headers.indexOf('specification') === -1) { headers.push('specification'); prodSheet.getRange(1, headers.length).setValue('specification'); }
      if (headers.indexOf('min_stock') === -1) { headers.push('min_stock'); prodSheet.getRange(1, headers.length).setValue('min_stock'); }
      if (headers.indexOf('is_discontinued') === -1) { headers.push('is_discontinued'); prodSheet.getRange(1, headers.length).setValue('is_discontinued'); }

      var values = prodSheet.getDataRange().getValues();
      var idIndex = headers.indexOf('product_id');

      for (var i = 1; i < values.length; i++) {
        if (values[i][idIndex] == data.product_id) {
          var rowData = [];
          for (var j = 0; j < headers.length; j++) {
            var val = data[headers[j]];
            if (headers[j] === 'is_discontinued') {
              val = (val === true || String(val).toUpperCase() === 'TRUE');
            }
            rowData.push(val !== undefined ? val : values[i][j]);
          }
          prodSheet.getRange(i+1, 1, 1, headers.length).setValues([rowData]);
          break;
        }
      }
    }
    return ContentService.createTextOutput(JSON.stringify({success:true})).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'deleteProduct') {
    var prodSheet = ss.getSheetByName('products');
    if (prodSheet && prodSheet.getLastRow() > 1) {
      var values = prodSheet.getDataRange().getValues();
      for (var i = 1; i < values.length; i++) {
        if (values[i][0] == data.product_id) {
          prodSheet.deleteRow(i+1);
          break;
        }
      }
    }
    
    // Also delete stock entries for this product
    var stockSheet = ss.getSheetByName('stock');
    if(stockSheet && stockSheet.getLastRow() > 1) {
      var sValues = stockSheet.getDataRange().getValues();
      for(var j = sValues.length - 1; j >= 1; j--) {
        if(sValues[j][1] == data.product_id) {
          stockSheet.deleteRow(j+1);
        }
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({success:true})).setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === 'addVendor') {
    var vendorSheet = ss.getSheetByName('vendors');
    if (!vendorSheet) vendorSheet = ss.insertSheet('vendors');
    if (vendorSheet.getLastRow() === 0) {
      vendorSheet.appendRow(['vendor_id', 'vendor_name', 'contact', 'phone']);
    }
    vendorSheet.appendRow([data.vendor_id, data.vendor_name, data.contact || '', data.phone || '']);
    return ContentService.createTextOutput(JSON.stringify({success:true})).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'editVendor') {
    var vendorSheet = ss.getSheetByName('vendors');
    if (vendorSheet && vendorSheet.getLastRow() > 1) {
      var values = vendorSheet.getDataRange().getValues();
      for (var i = 1; i < values.length; i++) {
        if (values[i][0] == data.vendor_id) {
          vendorSheet.getRange(i+1, 2, 1, 3).setValues([[data.vendor_name, data.contact || '', data.phone || '']]);
          break;
        }
      }
    }
    return ContentService.createTextOutput(JSON.stringify({success:true})).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'deleteVendor') {
    var vendorSheet = ss.getSheetByName('vendors');
    if (vendorSheet && vendorSheet.getLastRow() > 1) {
      var values = vendorSheet.getDataRange().getValues();
      for (var i = 1; i < values.length; i++) {
        if (values[i][0] == data.vendor_id) {
          vendorSheet.deleteRow(i+1);
          break;
        }
      }
    }
    return ContentService.createTextOutput(JSON.stringify({success:true})).setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === 'stockIn') {
    var stockSheet = ss.getSheetByName('stock');
    if (!stockSheet) stockSheet = ss.insertSheet('stock');
    var transSheet = ss.getSheetByName('transactions');
    if (!transSheet) transSheet = ss.insertSheet('transactions');
    
    var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy/M/d  HH:mm:ss");
    var stockId = data.stock_id || [data.product_id, data.location, data.floor, data.area, data.expiry_date || '', data.specification || ''].join('_').replace(/_+$/, '');
    
    // Manage stock headers dynamically
    var stockHeaders = [];
    if (stockSheet.getLastRow() === 0) {
      stockHeaders = ['stock_id', 'product_id', 'name', 'location', 'floor', 'area', 'quantity', 'expiry_date', 'specification', 'last_update'];
      stockSheet.appendRow(stockHeaders);
    } else {
      stockHeaders = stockSheet.getRange(1, 1, 1, stockSheet.getLastColumn()).getValues()[0];
      // Ensure specific optional/new columns exist
      var requiredStockCols = ['name', 'specification', 'last_update'];
      requiredStockCols.forEach(function(col) {
        if (stockHeaders.indexOf(col) === -1) {
          stockHeaders.push(col);
          stockSheet.getRange(1, stockHeaders.length).setValue(col);
        }
      });
    }
    
    var values = stockSheet.getDataRange().getValues();
    var stockIdIdx = stockHeaders.indexOf('stock_id');
    var prodIdx = stockHeaders.indexOf('product_id');
    var locIdx = stockHeaders.indexOf('location');
    var floorIdx = stockHeaders.indexOf('floor');
    var areaIdx = stockHeaders.indexOf('area');
    var expiryIdx = stockHeaders.indexOf('expiry_date');
    var specIdx = stockHeaders.indexOf('specification');
    var qtyIdx = stockHeaders.indexOf('quantity');
    var updateIdx = stockHeaders.indexOf('last_update');
    
    var foundIndex = -1;
    if (values.length > 1) {
      for (var i = 1; i < values.length; i++) {
         // Match by ID OR by attributes
         var matchById = (stockIdIdx !== -1 && values[i][stockIdIdx] == stockId);
         var matchByAttrs = (
           values[i][prodIdx] == data.product_id &&
           values[i][locIdx] == data.location &&
           values[i][floorIdx] == data.floor &&
           values[i][areaIdx] == data.area &&
           String(values[i][expiryIdx] || '') == String(data.expiry_date || '') &&
           String(values[i][specIdx] || '') == String(data.specification || '')
         );
         
         if (matchById || matchByAttrs) {
            foundIndex = i;
            break;
         }
      }
    }

    if (foundIndex !== -1) {
       var oldQty = Number(values[foundIndex][qtyIdx]) || 0;
       stockSheet.getRange(foundIndex + 1, qtyIdx + 1).setValue(oldQty + Number(data.quantity));
       if (updateIdx !== -1) stockSheet.getRange(foundIndex + 1, updateIdx + 1).setValue(now);
       // Update name if missing
       var nameIdx = stockHeaders.indexOf('name');
       if (nameIdx !== -1 && data.name && !values[foundIndex][nameIdx]) {
         stockSheet.getRange(foundIndex + 1, nameIdx + 1).setValue(data.name);
       }
    } else {
       var sRow = [];
       for(var m=0; m<stockHeaders.length; m++) {
         var key = stockHeaders[m];
         var val = data[key];
         if (key === 'stock_id') val = stockId;
         if (key === 'last_update') val = now;
         sRow.push(val !== undefined ? val : '');
       }
       stockSheet.appendRow(sRow);
    }
    
    // Transactions logic
    var transHeaders = [];
    if(transSheet.getLastRow() === 0) {
      transHeaders = ['transaction_id', 'online_order_id', 'platform', 'product_id', 'name', 'type', 'quantity', 'price', 'location', 'floor', 'area', 'specification', 'cost_price', 'vendor_id', 'date', 'note', 'operator'];
      transSheet.appendRow(transHeaders);
    } else {
      transHeaders = transSheet.getRange(1, 1, 1, transSheet.getLastColumn()).getValues()[0];
      var tNameColIdx = transHeaders.indexOf('name');
      if (tNameColIdx === -1) {
        for (var th = 0; th < transHeaders.length; th++) {
          var thStr = String(transHeaders[th] || '').trim().toLowerCase();
          if (thStr === 'product_name' || thStr === '商品名稱' || thStr === '品名') {
            transSheet.getRange(1, th + 1).setValue('name');
            transHeaders[th] = 'name';
            tNameColIdx = th;
            break;
          }
        }
        if (tNameColIdx === -1) {
          transHeaders.push('name');
          transSheet.getRange(1, transHeaders.length).setValue('name');
        }
      }
      var requiredTransCols = ['online_order_id', 'platform', 'price', 'specification', 'cost_price', 'vendor_id'];
      requiredTransCols.forEach(function(col) {
        if (transHeaders.indexOf(col) === -1) {
          transHeaders.push(col);
          transSheet.getRange(1, transHeaders.length).setValue(col);
        }
      });
    }
    
    data.transaction_id = data.transaction_id || Utilities.getUuid();
    data.type = data.type || 'stock_in';
    data.date = data.date || now;
    data.note = data.note || '';
    
    var prodNameMap = getProdNameMap(ss);
    var cleanDataPid = String(data.product_id || '').trim().toLowerCase();
    var trRow = [];
    for (var k = 0; k < transHeaders.length; k++) {
      var kName = transHeaders[k];
      var val = data[kName];
      if ((val === undefined || val === '') && (kName === 'name' || kName === 'product_name')) {
        val = data.name || data.product_name || (cleanDataPid ? prodNameMap[cleanDataPid] : '') || '';
      }
      trRow.push(val !== undefined ? val : '');
    }

    // Idempotency check: don't append if exact same transaction_id, product_id, specification, quantity already exists
    var isDuplicateTx = false;
    if (transSheet.getLastRow() > 1 && data.transaction_id) {
      var tCheckData = transSheet.getDataRange().getValues();
      var cTxIdIdx = transHeaders.indexOf('transaction_id');
      var cPidIdx = transHeaders.indexOf('product_id');
      var cSpecIdx = transHeaders.indexOf('specification');
      var cQtyIdx = transHeaders.indexOf('quantity');
      var cTypeIdx = transHeaders.indexOf('type');
      for (var ci = tCheckData.length - 1; ci >= 1; ci--) {
        if (cTxIdIdx !== -1 && String(tCheckData[ci][cTxIdIdx] || '').trim() === String(data.transaction_id).trim()) {
          var pMatch = cPidIdx === -1 || String(tCheckData[ci][cPidIdx] || '').trim().toLowerCase() === cleanDataPid;
          var sMatch = cSpecIdx === -1 || String(tCheckData[ci][cSpecIdx] || '').trim() === String(data.specification || '').trim();
          var qMatch = cQtyIdx === -1 || String(tCheckData[ci][cQtyIdx] || '').trim() === String(data.quantity || '').trim();
          var tMatch = cTypeIdx === -1 || String(tCheckData[ci][cTypeIdx] || '').trim() === String(data.type || 'stock_in').trim();
          if (pMatch && sMatch && qMatch && tMatch) {
            isDuplicateTx = true;
            break;
          }
        }
      }
    }

    if (!isDuplicateTx) {
      transSheet.appendRow(trRow);
    }
    
    return ContentService.createTextOutput(JSON.stringify({success:true})).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'batchStockIn') {
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(30000);
    } catch (e) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: '系統忙碌中，請稍候重試' })).setMimeType(ContentService.MimeType.JSON);
    }

    try {
      var stockSheet = ss.getSheetByName('stock');
      if (!stockSheet) stockSheet = ss.insertSheet('stock');
      var transSheet = ss.getSheetByName('transactions');
      if (!transSheet) transSheet = ss.insertSheet('transactions');
      var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy/M/d  HH:mm:ss");

      var poId = data && data.po_id ? String(data.po_id).trim() : '';
      var batchTxId = data && data.batch_tx_id ? String(data.batch_tx_id).trim() : (poId || Utilities.getUuid());
      var items = data && data.items && Array.isArray(data.items) ? data.items : [];
      if (items.length === 0) {
        lock.releaseLock();
        return ContentService.createTextOutput(JSON.stringify({ success: true, count: 0 })).setMimeType(ContentService.MimeType.JSON);
      }

      var prodNameMapStockIn = getProdNameMap(ss);

      // 1. Stock sheet headers
      var stockHeaders = [];
      if (stockSheet.getLastRow() === 0) {
        stockHeaders = ['stock_id', 'product_id', 'name', 'location', 'floor', 'area', 'quantity', 'expiry_date', 'specification', 'last_update'];
        stockSheet.appendRow(stockHeaders);
      } else {
        stockHeaders = stockSheet.getRange(1, 1, 1, stockSheet.getLastColumn()).getValues()[0];
        var requiredStockCols = ['name', 'specification', 'last_update'];
        requiredStockCols.forEach(function(col) {
          if (stockHeaders.indexOf(col) === -1) {
            stockHeaders.push(col);
            stockSheet.getRange(1, stockHeaders.length).setValue(col);
          }
        });
      }

      var sValues = stockSheet.getDataRange().getValues();
      var sStockIdIdx = stockHeaders.indexOf('stock_id');
      var sProdIdx = stockHeaders.indexOf('product_id');
      var sLocIdx = stockHeaders.indexOf('location');
      var sFloorIdx = stockHeaders.indexOf('floor');
      var sAreaIdx = stockHeaders.indexOf('area');
      var sExpiryIdx = stockHeaders.indexOf('expiry_date');
      var sSpecIdx = stockHeaders.indexOf('specification');
      var sQtyIdx = stockHeaders.indexOf('quantity');
      var sUpdateIdx = stockHeaders.indexOf('last_update');
      var sNameIdx = stockHeaders.indexOf('name');

      // Update or add stock items
      for (var si = 0; si < items.length; si++) {
        var itm = items[si];
        var itmQty = Number(itm.quantity) || 0;
        if (itmQty <= 0) continue;

        var stockId = itm.stock_id || [itm.product_id, itm.location || '倉庫', itm.floor || '1F', itm.area || 'A區', itm.expiry_date || '', itm.specification || ''].join('_').replace(/_+$/, '');
        var cleanPid = String(itm.product_id || '').trim().toLowerCase();
        var itmName = itm.name || itm.product_name || (cleanPid ? prodNameMapStockIn[cleanPid] : '') || '';

        var foundIndex = -1;
        if (sValues.length > 1) {
          for (var r = 1; r < sValues.length; r++) {
            var matchById = (sStockIdIdx !== -1 && sValues[r][sStockIdIdx] == stockId);
            var matchByAttrs = (
              sValues[r][sProdIdx] == itm.product_id &&
              sValues[r][sLocIdx] == (itm.location || '倉庫') &&
              sValues[r][sFloorIdx] == (itm.floor || '1F') &&
              sValues[r][sAreaIdx] == (itm.area || 'A區') &&
              String(sValues[r][sExpiryIdx] || '') == String(itm.expiry_date || '') &&
              String(sValues[r][sSpecIdx] || '') == String(itm.specification || '')
            );
            if (matchById || matchByAttrs) {
              foundIndex = r;
              break;
            }
          }
        }

        if (foundIndex !== -1) {
          var oldQty = Number(sValues[foundIndex][sQtyIdx]) || 0;
          var newStockQty = oldQty + itmQty;
          sValues[foundIndex][sQtyIdx] = newStockQty;
          stockSheet.getRange(foundIndex + 1, sQtyIdx + 1).setValue(newStockQty);
          if (sUpdateIdx !== -1) stockSheet.getRange(foundIndex + 1, sUpdateIdx + 1).setValue(now);
          if (sNameIdx !== -1 && itmName && !sValues[foundIndex][sNameIdx]) {
            stockSheet.getRange(foundIndex + 1, sNameIdx + 1).setValue(itmName);
          }
        } else {
          var sRow = [];
          for (var m = 0; m < stockHeaders.length; m++) {
            var colKey = stockHeaders[m];
            var colVal = itm[colKey];
            if (colKey === 'stock_id') colVal = stockId;
            if (colKey === 'name') colVal = itmName;
            if (colKey === 'quantity') colVal = itmQty;
            if (colKey === 'location') colVal = itm.location || '倉庫';
            if (colKey === 'floor') colVal = itm.floor || '1F';
            if (colKey === 'area') colVal = itm.area || 'A區';
            if (colKey === 'last_update') colVal = now;
            sRow.push(colVal !== undefined ? colVal : '');
          }
          stockSheet.appendRow(sRow);
          sValues.push(sRow);
        }
      }

      // 2. Transactions sheet headers and ID deduplication
      var transHeaders = [];
      if (transSheet.getLastRow() === 0) {
        transHeaders = ['transaction_id', 'online_order_id', 'platform', 'product_id', 'name', 'type', 'quantity', 'price', 'location', 'floor', 'area', 'specification', 'cost_price', 'vendor_id', 'date', 'note', 'operator'];
        transSheet.appendRow(transHeaders);
      } else {
        transHeaders = transSheet.getRange(1, 1, 1, transSheet.getLastColumn()).getValues()[0];
        var tInNameIdx = transHeaders.indexOf('name');
        if (tInNameIdx === -1) {
          for (var th = 0; th < transHeaders.length; th++) {
            var thStr = String(transHeaders[th] || '').trim().toLowerCase();
            if (thStr === 'product_name' || thStr === '商品名稱' || thStr === '品名') {
              transSheet.getRange(1, th + 1).setValue('name');
              transHeaders[th] = 'name';
              tInNameIdx = th;
              break;
            }
          }
          if (tInNameIdx === -1) {
            transHeaders.push('name');
            transSheet.getRange(1, transHeaders.length).setValue('name');
          }
        }
      }

      // Read existing transactions for idempotency check (prevent duplicate transaction rows!)
      var existingTxs = transSheet.getLastRow() > 1 ? transSheet.getDataRange().getValues() : [];
      var tTxIdIdx = transHeaders.indexOf('transaction_id');
      var tProdIdx = transHeaders.indexOf('product_id');
      var tSpecIdx = transHeaders.indexOf('specification');
      var tQtyIdx = transHeaders.indexOf('quantity');
      var tTypeIdx = transHeaders.indexOf('type');

      var existingTxKeys = {};
      for (var er = 1; er < existingTxs.length; er++) {
        var rowTxId = tTxIdIdx !== -1 ? String(existingTxs[er][tTxIdIdx] || '').trim() : '';
        var rowPid = tProdIdx !== -1 ? String(existingTxs[er][tProdIdx] || '').trim().toLowerCase() : '';
        var rowSpec = tSpecIdx !== -1 ? String(existingTxs[er][tSpecIdx] || '').trim().toLowerCase() : '';
        var rowQty = tQtyIdx !== -1 ? String(existingTxs[er][tQtyIdx] || '').trim() : '';
        var rowType = tTypeIdx !== -1 ? String(existingTxs[er][tTypeIdx] || '').trim() : '';
        var rowKey = [rowTxId, rowPid, rowSpec, rowQty, rowType].join('___');
        existingTxKeys[rowKey] = true;
      }

      var newTransRows = [];
      for (var ti = 0; ti < items.length; ti++) {
        var tItm = items[ti];
        var itemTxId = tItm.transaction_id || batchTxId;
        var itemPid = String(tItm.product_id || '').trim().toLowerCase();
        var itemSpec = String(tItm.specification || '').trim().toLowerCase();
        var itemQty = String(Number(tItm.quantity) || 0);
        var itemType = tItm.type || 'stock_in';

        // Check if identical transaction already exists in transSheet
        var txKey = [itemTxId, itemPid, itemSpec, itemQty, itemType].join('___');
        if (existingTxKeys[txKey]) {
          // Already recorded! Skip to prevent duplicate registration
          continue;
        }
        existingTxKeys[txKey] = true;

        tItm.transaction_id = itemTxId;
        tItm.type = itemType;
        tItm.date = tItm.date || now;
        tItm.cost_price = Number(tItm.cost_price) || 0;
        tItm.price = Number(tItm.price) || 0;
        tItm.quantity = Number(tItm.quantity) || 0;
        tItm.location = tItm.location || '倉庫';
        tItm.floor = tItm.floor || '1F';
        tItm.area = tItm.area || 'A區';

        var tRow = [];
        for (var tk = 0; tk < transHeaders.length; tk++) {
          var colKey = transHeaders[tk];
          var colVal = tItm[colKey];
          if ((colVal === undefined || colVal === '') && (colKey === 'name' || colKey === 'product_name')) {
            colVal = tItm.name || tItm.product_name || (itemPid ? prodNameMapStockIn[itemPid] : '') || '';
          }
          tRow.push(colVal !== undefined ? colVal : '');
        }
        newTransRows.push(tRow);
      }

      if (newTransRows.length > 0) {
        var startR = transSheet.getLastRow() + 1;
        transSheet.getRange(startR, 1, newTransRows.length, transHeaders.length).setValues(newTransRows);
      }

      lock.releaseLock();
      return ContentService.createTextOutput(JSON.stringify({ success: true, count: newTransRows.length })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      lock.releaseLock();
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: String(err.message || err) })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  if(action === 'batchShipment') {
    var stockSheet = ss.getSheetByName('stock');
    var transSheet = ss.getSheetByName('transactions');
    var orderSheet = ss.getSheetByName('網路訂單');
    var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy/M/d  HH:mm:ss");
    var prodNameMapBatch = getProdNameMap(ss);

    // 1. 處理庫存扣減與交易明細寫入
    var items = data.items || [];
    if (items.length > 0) {
      var stockHeaders = [];
      var sValues = [];
      var sIdIdx = -1, sPidIdx = -1, sQtyIdx = -1, sUpdateIdx = -1;
      if (stockSheet && stockSheet.getLastRow() > 1) {
        stockHeaders = stockSheet.getRange(1, 1, 1, stockSheet.getLastColumn()).getValues()[0];
        sIdIdx = stockHeaders.indexOf('stock_id');
        sPidIdx = stockHeaders.indexOf('product_id');
        sQtyIdx = stockHeaders.indexOf('quantity');
        sUpdateIdx = stockHeaders.indexOf('last_update');
        sValues = stockSheet.getDataRange().getValues();
      }

      var transHeaders = [];
      if (!transSheet) transSheet = ss.insertSheet('transactions');
      if (transSheet.getLastRow() === 0) {
        transHeaders = ['transaction_id', 'online_order_id', 'platform', 'product_id', 'name', 'type', 'quantity', 'price', 'location', 'floor', 'area', 'specification', 'cost_price', 'vendor_id', 'date', 'note', 'operator'];
        transSheet.appendRow(transHeaders);
      } else {
        transHeaders = transSheet.getRange(1, 1, 1, transSheet.getLastColumn()).getValues()[0];
        var tBatchNameIdx = transHeaders.indexOf('name');
        if (tBatchNameIdx === -1) {
          for (var th = 0; th < transHeaders.length; th++) {
            var thStr = String(transHeaders[th] || '').trim().toLowerCase();
            if (thStr === 'product_name' || thStr === '商品名稱' || thStr === '品名') {
              transSheet.getRange(1, th + 1).setValue('name');
              transHeaders[th] = 'name';
              tBatchNameIdx = th;
              break;
            }
          }
          if (tBatchNameIdx === -1) {
            transHeaders.push('name');
            transSheet.getRange(1, transHeaders.length).setValue('name');
          }
        }
      }

      for (var it = 0; it < items.length; it++) {
        var itm = items[it];
        var stockId = String(itm.stock_id || '').trim();
        var productId = String(itm.product_id || '').trim();
        var deductNeeded = Number(itm.quantity) || 0;

        // 優先以 stock_id 扣減
        if (stockSheet && sValues.length > 1 && deductNeeded > 0) {
          if (stockId && sIdIdx !== -1) {
            for (var r = 1; r < sValues.length && deductNeeded > 0; r++) {
              if (String(sValues[r][sIdIdx] || '').trim() === stockId) {
                var currQ = Number(sValues[r][sQtyIdx]) || 0;
                var deductRow = Math.min(currQ, deductNeeded);
                deductNeeded -= deductRow;
                var newQ = currQ - deductRow;
                if (newQ <= 0) {
                  stockSheet.deleteRow(r + 1);
                  sValues.splice(r, 1);
                  r--;
                } else {
                  stockSheet.getRange(r + 1, sQtyIdx + 1).setValue(newQ);
                  sValues[r][sQtyIdx] = newQ;
                  if (sUpdateIdx !== -1) stockSheet.getRange(r + 1, sUpdateIdx + 1).setValue(now);
                }
                break;
              }
            }
          }

          // 次依 product_id 扣減
          if (deductNeeded > 0 && productId && sPidIdx !== -1) {
            for (var r2 = sValues.length - 1; r2 >= 1 && deductNeeded > 0; r2--) {
              if (String(sValues[r2][sPidIdx] || '').trim().toLowerCase() === productId.toLowerCase()) {
                var currQ2 = Number(sValues[r2][sQtyIdx]) || 0;
                var deductRow2 = Math.min(currQ2, deductNeeded);
                deductNeeded -= deductRow2;
                var newQ2 = currQ2 - deductRow2;
                if (newQ2 <= 0) {
                  stockSheet.deleteRow(r2 + 1);
                  sValues.splice(r2, 1);
                } else {
                  stockSheet.getRange(r2 + 1, sQtyIdx + 1).setValue(newQ2);
                  sValues[r2][sQtyIdx] = newQ2;
                  if (sUpdateIdx !== -1) stockSheet.getRange(r2 + 1, sUpdateIdx + 1).setValue(now);
                }
              }
            }
          }
        }

        // 寫入交易紀錄
        itm.transaction_id = itm.transaction_id || Utilities.getUuid();
        itm.type = itm.type || 'stock_out';
        itm.date = itm.date || now;
        itm.cost_price = Number(itm.cost_price) || 0;
        itm.price = Number(itm.price) || 0;
        var cleanBatchPid = String(itm.product_id || '').trim().toLowerCase();
        var rowData = [];
        for (var k = 0; k < transHeaders.length; k++) {
          var kName = transHeaders[k];
          var val = itm[kName];
          if ((val === undefined || val === '') && (kName === 'name' || kName === 'product_name')) {
            val = itm.name || itm.product_name || (cleanBatchPid ? prodNameMapBatch[cleanBatchPid] : '') || '';
          }
          rowData.push(val !== undefined ? val : '');
        }
        transSheet.appendRow(rowData);
      }
    }

    // 2. 刪除網路訂單工作表對應單號
    var targetOrderId = String(data.order_id || '').trim();
    if (orderSheet && orderSheet.getLastRow() > 1 && targetOrderId) {
      var oHeaders = orderSheet.getRange(1, 1, 1, orderSheet.getLastColumn()).getValues()[0];
      var oIdIdx = oHeaders.indexOf('order_id');
      if (oIdIdx === -1) oIdIdx = oHeaders.indexOf('訂單編號');
      if (oIdIdx !== -1) {
        var oVals = orderSheet.getDataRange().getValues();
        for (var orow = oVals.length - 1; orow >= 1; orow--) {
          if (String(oVals[orow][oIdIdx]).trim() === targetOrderId) {
            orderSheet.deleteRow(orow + 1);
          }
        }
      }
    }

    return ContentService.createTextOutput(JSON.stringify({success: true, message: 'Batch shipment completed'})).setMimeType(ContentService.MimeType.JSON);
  }
  
  if(action === 'stockOut') {
    var stockSheet = ss.getSheetByName('stock');
    var transSheet = ss.getSheetByName('transactions');
    var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy/M/d  HH:mm:ss");
    var stockId = String(data.stock_id || '').trim();
    var productId = String(data.product_id || '').trim();
    var deductNeeded = Number(data.quantity) || 0;

    if(stockSheet && stockSheet.getLastRow() > 1 && deductNeeded > 0) {
      var stockHeaders = stockSheet.getRange(1, 1, 1, stockSheet.getLastColumn()).getValues()[0];
      var idIdx = stockHeaders.indexOf('stock_id');
      var pIdIdx = stockHeaders.indexOf('product_id');
      var qtyIdx = stockHeaders.indexOf('quantity');
      var updateIdx = stockHeaders.indexOf('last_update');

      // 1. First priority: match exact stock_id
      if (stockId && idIdx !== -1) {
        var values = stockSheet.getDataRange().getValues();
        for (var i = 1; i < values.length && deductNeeded > 0; i++) {
          if (String(values[i][idIdx] || '').trim() === stockId) {
            var currQ = Number(values[i][qtyIdx]) || 0;
            var deductFromRow = Math.min(currQ, deductNeeded);
            deductNeeded -= deductFromRow;
            var newQ = currQ - deductFromRow;
            if (newQ <= 0) {
              stockSheet.deleteRow(i + 1);
            } else {
              stockSheet.getRange(i + 1, qtyIdx + 1).setValue(newQ);
              if (updateIdx !== -1) stockSheet.getRange(i + 1, updateIdx + 1).setValue(now);
            }
            break;
          }
        }
      }

      // 2. Second priority: if deductNeeded > 0 and productId provided, deduct from matching product_id rows
      if (deductNeeded > 0 && productId && pIdIdx !== -1) {
        var values2 = stockSheet.getDataRange().getValues();
        for (var j = values2.length - 1; j >= 1 && deductNeeded > 0; j--) {
          if (String(values2[j][pIdIdx] || '').trim().toLowerCase() === productId.toLowerCase()) {
            var currQ2 = Number(values2[j][qtyIdx]) || 0;
            var deductFromRow2 = Math.min(currQ2, deductNeeded);
            deductNeeded -= deductFromRow2;
            var newQ2 = currQ2 - deductFromRow2;
            if (newQ2 <= 0) {
              stockSheet.deleteRow(j + 1);
            } else {
              stockSheet.getRange(j + 1, qtyIdx + 1).setValue(newQ2);
              if (updateIdx !== -1) stockSheet.getRange(j + 1, updateIdx + 1).setValue(now);
            }
          }
        }
      }
    }
    
    var transHeaders = transSheet.getRange(1, 1, 1, transSheet.getLastColumn()).getValues()[0];
    var tOutNameIdx = transHeaders.indexOf('name');
    if (tOutNameIdx === -1) {
      for (var th = 0; th < transHeaders.length; th++) {
        var thStr = String(transHeaders[th] || '').trim().toLowerCase();
        if (thStr === 'product_name' || thStr === '商品名稱' || thStr === '品名') {
          transSheet.getRange(1, th + 1).setValue('name');
          transHeaders[th] = 'name';
          tOutNameIdx = th;
          break;
        }
      }
      if (tOutNameIdx === -1) {
        transHeaders.push('name');
        transSheet.getRange(1, transHeaders.length).setValue('name');
      }
    }
    data.transaction_id = data.transaction_id || data.batch_id || data.batch_tx_id || Utilities.getUuid();
    data.type = data.type || 'stock_out';
    data.date = data.date || now;
    data.note = data.note || '';
    data.cost_price = (data.cost_price !== undefined && data.cost_price !== null && data.cost_price !== '') ? Number(data.cost_price) || 0 : 0;
    data.price = (data.price !== undefined && data.price !== null && data.price !== '') ? Number(data.price) || 0 : 0;
    data.vendor_id = data.vendor_id || '';
    
    var prodNameMapOut = getProdNameMap(ss);
    var cleanOutPid = String(data.product_id || '').trim().toLowerCase();
    var trRow = [];
    for (var k = 0; k < transHeaders.length; k++) {
      var kName = transHeaders[k];
      var val = data[kName];
      if ((val === undefined || val === '') && (kName === 'name' || kName === 'product_name')) {
        val = data.name || data.product_name || (cleanOutPid ? prodNameMapOut[cleanOutPid] : '') || '';
      }
      trRow.push(val !== undefined ? val : '');
    }

    // Always append every stock-out event as an independent transaction ledger record
    transSheet.appendRow(trRow);
    
    return ContentService.createTextOutput(JSON.stringify({success:true})).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'adjustStock') {
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(30000);
    } catch (e) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: '系統忙碌中，請稍候重試' })).setMimeType(ContentService.MimeType.JSON);
    }

    try {
      var stockSheet = ss.getSheetByName('stock');
      if (!stockSheet) stockSheet = ss.insertSheet('stock');
      var transSheet = ss.getSheetByName('transactions');
      if (!transSheet) transSheet = ss.insertSheet('transactions');
      var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy/M/d  HH:mm:ss");

      var targetQty = Number(data.quantity);
      if (isNaN(targetQty)) targetQty = 0;
      var targetPid = String(data.product_id || '').trim();
      var targetLoc = String(data.location || '倉庫').trim();
      var targetFloor = String(data.floor || '1F').trim();
      var targetArea = String(data.area || 'A區').trim();
      var targetExpiry = String(data.expiry_date || '').trim();
      var targetSpec = String(data.specification || '').trim();
      var stockId = String(data.stock_id || '').trim() || [targetPid, targetLoc, targetFloor, targetArea, targetExpiry, targetSpec].join('_').replace(/_+$/, '');

      var prodNameMapAdj = getProdNameMap(ss);
      var cleanAdjPid = targetPid.toLowerCase();
      var adjProdName = data.name || data.product_name || (cleanAdjPid ? prodNameMapAdj[cleanAdjPid] : '') || '';

      var stockHeaders = [];
      if (stockSheet.getLastRow() === 0) {
        stockHeaders = ['stock_id', 'product_id', 'name', 'location', 'floor', 'area', 'quantity', 'expiry_date', 'specification', 'last_update'];
        stockSheet.appendRow(stockHeaders);
      } else {
        stockHeaders = stockSheet.getRange(1, 1, 1, stockSheet.getLastColumn()).getValues()[0];
        var requiredAdjStockCols = ['name', 'location', 'floor', 'area', 'expiry_date', 'specification', 'last_update'];
        requiredAdjStockCols.forEach(function(col) {
          if (stockHeaders.indexOf(col) === -1) {
            stockHeaders.push(col);
            stockSheet.getRange(1, stockHeaders.length).setValue(col);
          }
        });
      }

      var idIdx = stockHeaders.indexOf('stock_id');
      var pidIdx = stockHeaders.indexOf('product_id');
      var nameIdx = stockHeaders.indexOf('name');
      var locIdx = stockHeaders.indexOf('location');
      var floorIdx = stockHeaders.indexOf('floor');
      var areaIdx = stockHeaders.indexOf('area');
      var expiryIdx = stockHeaders.indexOf('expiry_date');
      var specIdx = stockHeaders.indexOf('specification');
      var qtyIdx = stockHeaders.indexOf('quantity');
      var updateIdx = stockHeaders.indexOf('last_update');

      var foundAdjRow = -1;
      if (stockSheet.getLastRow() > 1) {
        var values = stockSheet.getDataRange().getValues();
        for (var i = 1; i < values.length; i++) {
          var rowStockId = idIdx !== -1 ? String(values[i][idIdx] || '').trim() : '';
          var matchById = (idIdx !== -1 && stockId !== '' && rowStockId === stockId);
          var matchByAttrs = (
            pidIdx !== -1 &&
            String(values[i][pidIdx] || '').trim().toLowerCase() === cleanAdjPid &&
            (locIdx === -1 || String(values[i][locIdx] || '').trim() === targetLoc) &&
            (floorIdx === -1 || String(values[i][floorIdx] || '').trim() === targetFloor) &&
            (areaIdx === -1 || String(values[i][areaIdx] || '').trim() === targetArea) &&
            (expiryIdx === -1 || String(values[i][expiryIdx] || '').trim() === targetExpiry) &&
            (specIdx === -1 || String(values[i][specIdx] || '').trim() === targetSpec)
          );

          if (matchById || matchByAttrs) {
            foundAdjRow = i;
            break;
          }
        }
      }

      if (foundAdjRow !== -1) {
        if (targetQty <= 0) {
          stockSheet.deleteRow(foundAdjRow + 1);
        } else {
          if (qtyIdx !== -1) stockSheet.getRange(foundAdjRow + 1, qtyIdx + 1).setValue(targetQty);
          if (updateIdx !== -1) stockSheet.getRange(foundAdjRow + 1, updateIdx + 1).setValue(now);
          if (nameIdx !== -1 && adjProdName) stockSheet.getRange(foundAdjRow + 1, nameIdx + 1).setValue(adjProdName);
          if (locIdx !== -1) stockSheet.getRange(foundAdjRow + 1, locIdx + 1).setValue(targetLoc);
          if (floorIdx !== -1) stockSheet.getRange(foundAdjRow + 1, floorIdx + 1).setValue(targetFloor);
          if (areaIdx !== -1) stockSheet.getRange(foundAdjRow + 1, areaIdx + 1).setValue(targetArea);
          if (expiryIdx !== -1) {
            var expCell = stockSheet.getRange(foundAdjRow + 1, expiryIdx + 1);
            expCell.setNumberFormat('@');
            expCell.setValue(targetExpiry);
          }
          if (specIdx !== -1) stockSheet.getRange(foundAdjRow + 1, specIdx + 1).setValue(targetSpec);
        }
      } else if (targetQty > 0) {
        var newStockRow = [];
        for (var m = 0; m < stockHeaders.length; m++) {
          var sColKey = stockHeaders[m];
          if (sColKey === 'stock_id') newStockRow.push(stockId);
          else if (sColKey === 'product_id') newStockRow.push(targetPid);
          else if (sColKey === 'name') newStockRow.push(adjProdName);
          else if (sColKey === 'location') newStockRow.push(targetLoc);
          else if (sColKey === 'floor') newStockRow.push(targetFloor);
          else if (sColKey === 'area') newStockRow.push(targetArea);
          else if (sColKey === 'quantity') newStockRow.push(targetQty);
          else if (sColKey === 'expiry_date') newStockRow.push(targetExpiry);
          else if (sColKey === 'specification') newStockRow.push(targetSpec);
          else if (sColKey === 'last_update') newStockRow.push(now);
          else newStockRow.push(data[sColKey] !== undefined ? data[sColKey] : '');
        }
        stockSheet.appendRow(newStockRow);
      }

      var transHeaders = [];
      if (transSheet.getLastRow() === 0) {
        transHeaders = ['transaction_id', 'online_order_id', 'platform', 'product_id', 'name', 'type', 'quantity', 'delta', 'final_quantity', 'price', 'location', 'floor', 'area', 'expiry_date', 'specification', 'cost_price', 'vendor_id', 'po_id', 'date', 'note', 'operator'];
        transSheet.appendRow(transHeaders);
      } else {
        transHeaders = transSheet.getRange(1, 1, 1, transSheet.getLastColumn()).getValues()[0];
        var tAdjNameIdx = transHeaders.indexOf('name');
        if (tAdjNameIdx === -1) {
          for (var th = 0; th < transHeaders.length; th++) {
            var thStr = String(transHeaders[th] || '').trim().toLowerCase();
            if (thStr === 'product_name' || thStr === '商品名稱' || thStr === '品名') {
              transSheet.getRange(1, th + 1).setValue('name');
              transHeaders[th] = 'name';
              tAdjNameIdx = th;
              break;
            }
          }
          if (tAdjNameIdx === -1) {
            transHeaders.push('name');
            transSheet.getRange(1, transHeaders.length).setValue('name');
          }
        }
        var requiredAdjTransCols = ['delta', 'final_quantity', 'expiry_date', 'specification', 'location', 'floor', 'area'];
        requiredAdjTransCols.forEach(function(col) {
          if (transHeaders.indexOf(col) === -1) {
            transHeaders.push(col);
            transSheet.getRange(1, transHeaders.length).setValue(col);
          }
        });
      }

      data.transaction_id = String(data.transaction_id || '').trim() || Utilities.getUuid();
      data.type = 'adjust';
      data.date = data.date || now;
      data.location = targetLoc;
      data.floor = targetFloor;
      data.area = targetArea;
      data.expiry_date = targetExpiry;
      data.specification = targetSpec;
      if (data.final_quantity === undefined || data.final_quantity === null || data.final_quantity === '') {
        data.final_quantity = targetQty;
      } else {
        data.final_quantity = Number(data.final_quantity) || 0;
      }
      if (data.delta !== undefined && data.delta !== null && data.delta !== '') {
        data.delta = Number(data.delta) || 0;
      }
      data.cost_price = (data.cost_price !== undefined && data.cost_price !== null && data.cost_price !== '') ? Number(data.cost_price) || 0 : 0;
      data.price = (data.price !== undefined && data.price !== null && data.price !== '') ? Number(data.price) || 0 : 0;
      data.vendor_id = data.vendor_id || '';

      // Idempotency check by transaction_id
      var isDuplicateAdjTx = false;
      var adjTxIdIdx = transHeaders.indexOf('transaction_id');
      if (adjTxIdIdx !== -1 && transSheet.getLastRow() > 1) {
        var existingAdjIds = transSheet.getRange(2, adjTxIdIdx + 1, transSheet.getLastRow() - 1, 1).getValues();
        for (var ai = 0; ai < existingAdjIds.length; ai++) {
          if (String(existingAdjIds[ai][0] || '').trim() === data.transaction_id) {
            isDuplicateAdjTx = true;
            break;
          }
        }
      }

      if (!isDuplicateAdjTx) {
        var trRow = [];
        for (var k = 0; k < transHeaders.length; k++) {
          var kName = transHeaders[k];
          var val = data[kName];
          if ((val === undefined || val === '') && (kName === 'name' || kName === 'product_name')) {
            val = adjProdName;
          }
          trRow.push(val !== undefined ? val : '');
        }
        transSheet.appendRow(trRow);
      }

      return ContentService.createTextOutput(JSON.stringify({ success: true })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: err && err.message ? err.message : String(err) })).setMimeType(ContentService.MimeType.JSON);
    } finally {
      lock.releaseLock();
    }
  }

  if (action === 'overwriteStock') {
    if (!Array.isArray(data)) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: '無效的庫存資料陣列，已中止覆寫' })).setMimeType(ContentService.MimeType.JSON);
    }
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(30000);
    } catch (e) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: '系統忙碌中，請稍候重試' })).setMimeType(ContentService.MimeType.JSON);
    }

    var stockSheet = null;
    var backupSnapshot = null;
    try {
      stockSheet = ss.getSheetByName('stock');
      if (!stockSheet) stockSheet = ss.insertSheet('stock');
      var stockHeaders = ['stock_id', 'product_id', 'name', 'location', 'floor', 'area', 'quantity', 'expiry_date', 'specification', 'last_update'];
      var prodNameMapStockOv = getProdNameMap(ss);
      var rows = [];
      for (var i = 0; i < data.length; i++) {
        var item = data[i];
        if (!item) continue;
        var itemQty = Number(item.quantity);
        if (isNaN(itemQty) || itemQty <= 0) continue;
        var cleanStockPid = String(item.product_id || '').trim().toLowerCase();
        var row = [];
        for (var j = 0; j < stockHeaders.length; j++) {
          var hKey = stockHeaders[j];
          var val = item[hKey];
          if ((val === undefined || val === '') && hKey === 'name') {
            val = item.name || item.product_name || (cleanStockPid ? prodNameMapStockOv[cleanStockPid] : '') || '';
          }
          if (hKey === 'quantity') {
            val = itemQty;
          } else {
            val = clampSheetCell(val);
          }
          row.push(val !== undefined ? val : '');
        }
        rows.push(row);
      }

      backupSnapshot = snapshotSheetData(stockSheet);
      if (stockSheet.getLastRow() > 0) {
        stockSheet.clear();
        stockSheet.clearFormats();
      }
      stockSheet.appendRow(stockHeaders);
      if (rows.length > 0) {
        stockSheet.getRange(2, 1, rows.length, stockHeaders.length).setValues(rows);
        stockSheet.getRange(2, 1, rows.length, 2).setNumberFormat('@');
        stockSheet.getRange(2, 7, rows.length, 1).setNumberFormat('0');
        stockSheet.getRange(2, 8, rows.length, 1).setNumberFormat('@');
        stockSheet.getRange(2, 10, rows.length, 1).setNumberFormat('@');
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true, count: rows.length })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      restoreSheetData(stockSheet, backupSnapshot);
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: err && err.message ? err.message : String(err) })).setMimeType(ContentService.MimeType.JSON);
    } finally {
      lock.releaseLock();
    }
  }

  if (action === 'overwriteTransactions') {
    if (!Array.isArray(data)) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: '無效的交易資料陣列，已中止覆寫' })).setMimeType(ContentService.MimeType.JSON);
    }
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(30000);
    } catch (e) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: '系統忙碌中，請稍候重試' })).setMimeType(ContentService.MimeType.JSON);
    }

    var transSheet = null;
    var backupSnapshot = null;
    try {
      transSheet = ss.getSheetByName('transactions');
      if (!transSheet) transSheet = ss.insertSheet('transactions');
      var transHeaders = ['transaction_id', 'online_order_id', 'platform', 'product_id', 'name', 'type', 'quantity', 'delta', 'final_quantity', 'price', 'location', 'floor', 'area', 'expiry_date', 'specification', 'cost_price', 'vendor_id', 'po_id', 'date', 'note', 'operator'];
      if (transSheet.getLastRow() > 0) {
        var existingTH = transSheet.getRange(1, 1, 1, transSheet.getLastColumn()).getValues()[0];
        if (existingTH && existingTH.length > 0 && String(existingTH[0]).trim()) {
          transHeaders = existingTH.slice();
          if (transHeaders.indexOf('name') === -1) {
            var foundAlias = false;
            for (var th = 0; th < transHeaders.length; th++) {
              var thStr = String(transHeaders[th] || '').trim().toLowerCase();
              if (thStr === 'product_name' || thStr === '商品名稱' || thStr === '品名') {
                transHeaders[th] = 'name';
                foundAlias = true;
                break;
              }
            }
            if (!foundAlias) transHeaders.push('name');
          }
          var ensureTransCols = ['delta', 'final_quantity', 'expiry_date', 'po_id'];
          ensureTransCols.forEach(function(col) {
            if (transHeaders.indexOf(col) === -1) {
              transHeaders.push(col);
            }
          });
        }
      }

      var prodNameMapOverwrite = getProdNameMap(ss);
      var rows = [];
      for (var i = 0; i < data.length; i++) {
        var item = data[i];
        if (!item) continue;
        var cleanTxPid = String(item.product_id || '').trim().toLowerCase();
        var row = [];
        for (var j = 0; j < transHeaders.length; j++) {
          var k = transHeaders[j];
          var val = item[k];
          if ((val === undefined || val === '') && (k === 'name' || k === 'product_name')) {
            val = item.name || item.product_name || (cleanTxPid ? prodNameMapOverwrite[cleanTxPid] : '') || '';
          }
          if (k === 'cost_price' || k === 'price' || k === 'quantity') {
            val = (val !== undefined && val !== null && val !== '') ? Number(val) || 0 : 0;
          } else if (k === 'delta' || k === 'final_quantity') {
            val = (val !== undefined && val !== null && val !== '') ? Number(val) || 0 : '';
          } else if (k === 'invoice_image_url') {
            val = sanitizeSheetImageUrlCell(val);
          } else {
            val = clampSheetCell(val);
          }
          row.push(val !== undefined ? val : '');
        }
        rows.push(row);
      }

      backupSnapshot = snapshotSheetData(transSheet);
      if (transSheet.getLastRow() > 0) {
        transSheet.clear();
        transSheet.clearFormats();
      }
      transSheet.appendRow(transHeaders);
      if (rows.length > 0) {
        transSheet.getRange(2, 1, rows.length, transHeaders.length).setValues(rows);
        var txIdCol = transHeaders.indexOf('transaction_id') + 1;
        var poIdCol = transHeaders.indexOf('po_id') + 1;
        var costPriceCol = transHeaders.indexOf('cost_price') + 1;
        var priceCol = transHeaders.indexOf('price') + 1;
        var qtyCol = transHeaders.indexOf('quantity') + 1;
        var deltaCol = transHeaders.indexOf('delta') + 1;
        var finalQtyCol = transHeaders.indexOf('final_quantity') + 1;
        var dateCol = transHeaders.indexOf('date') + 1;
        var expiryCol = transHeaders.indexOf('expiry_date') + 1;
        if (txIdCol > 0) transSheet.getRange(2, txIdCol, rows.length, 1).setNumberFormat('@');
        if (poIdCol > 0) transSheet.getRange(2, poIdCol, rows.length, 1).setNumberFormat('@');
        if (costPriceCol > 0) transSheet.getRange(2, costPriceCol, rows.length, 1).setNumberFormat('0.##');
        if (priceCol > 0) transSheet.getRange(2, priceCol, rows.length, 1).setNumberFormat('0.##');
        if (qtyCol > 0) transSheet.getRange(2, qtyCol, rows.length, 1).setNumberFormat('0');
        if (deltaCol > 0) transSheet.getRange(2, deltaCol, rows.length, 1).setNumberFormat('0');
        if (finalQtyCol > 0) transSheet.getRange(2, finalQtyCol, rows.length, 1).setNumberFormat('0');
        if (dateCol > 0) transSheet.getRange(2, dateCol, rows.length, 1).setNumberFormat('@');
        if (expiryCol > 0) transSheet.getRange(2, expiryCol, rows.length, 1).setNumberFormat('@');
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true, count: rows.length })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      restoreSheetData(transSheet, backupSnapshot);
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: err && err.message ? err.message : String(err) })).setMimeType(ContentService.MimeType.JSON);
    } finally {
      lock.releaseLock();
    }
  }

  if (action === 'overwriteProducts') {
    if (!Array.isArray(data)) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: '無效的商品資料陣列，已中止覆寫' })).setMimeType(ContentService.MimeType.JSON);
    }
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(30000);
    } catch (e) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: '系統忙碌中，請稍候重試' })).setMimeType(ContentService.MimeType.JSON);
    }

    var prodSheet = null;
    var backupSnapshot = null;
    try {
      prodSheet = ss.getSheetByName('products');
      if (!prodSheet) prodSheet = ss.insertSheet('products');
      var prodHeaders = ['product_id', 'barcode', 'name', 'category', 'brand', 'unit', 'cost_price', 'vendor_id', 'has_expiry', 'specification', 'min_stock', 'is_discontinued', 'expected_restock_date', 'created_at'];
      if (prodSheet.getLastRow() > 0) {
        var existingPH = prodSheet.getRange(1, 1, 1, prodSheet.getLastColumn()).getValues()[0];
        if (existingPH && existingPH.length > 0 && String(existingPH[0]).trim()) {
          prodHeaders = existingPH.slice();
          var ensureProdCols = ['brand', 'specification', 'min_stock', 'is_discontinued', 'expected_restock_date', 'created_at'];
          ensureProdCols.forEach(function(col) {
            if (prodHeaders.indexOf(col) === -1) prodHeaders.push(col);
          });
        }
      }

      var rows = [];
      for (var i = 0; i < data.length; i++) {
        var p = data[i];
        if (!p || !p.product_id) continue;
        var row = [];
        for (var j = 0; j < prodHeaders.length; j++) {
          var key = prodHeaders[j];
          var val = p[key];
          if (key === 'cost_price' || key === 'min_stock') {
            val = Number(val) || 0;
          } else if (key === 'has_expiry' || key === 'is_discontinued') {
            val = (val === true || String(val).toUpperCase() === 'TRUE');
          } else {
            val = clampSheetCell(val);
          }
          row.push(val !== undefined ? val : '');
        }
        rows.push(row);
      }

      backupSnapshot = snapshotSheetData(prodSheet);
      if (prodSheet.getLastRow() > 0) {
        prodSheet.clear();
        prodSheet.clearFormats();
      }
      prodSheet.appendRow(prodHeaders);
      if (rows.length > 0) {
        prodSheet.getRange(2, 1, rows.length, prodHeaders.length).setValues(rows);
        var pidCol = prodHeaders.indexOf('product_id') + 1;
        var barcodeCol = prodHeaders.indexOf('barcode') + 1;
        var costCol = prodHeaders.indexOf('cost_price') + 1;
        var restockCol = prodHeaders.indexOf('expected_restock_date') + 1;
        if (pidCol > 0) prodSheet.getRange(2, pidCol, rows.length, 1).setNumberFormat('@');
        if (barcodeCol > 0) prodSheet.getRange(2, barcodeCol, rows.length, 1).setNumberFormat('@');
        if (costCol > 0) prodSheet.getRange(2, costCol, rows.length, 1).setNumberFormat('0.##');
        if (restockCol > 0) prodSheet.getRange(2, restockCol, rows.length, 1).setNumberFormat('@');
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true, count: rows.length })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      restoreSheetData(prodSheet, backupSnapshot);
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: err && err.message ? err.message : String(err) })).setMimeType(ContentService.MimeType.JSON);
    } finally {
      lock.releaseLock();
    }
  }

  if (action === 'overwriteVendors') {
    if (!Array.isArray(data)) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: '無效的廠商資料陣列，已中止覆寫' })).setMimeType(ContentService.MimeType.JSON);
    }
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(30000);
    } catch (e) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: '系統忙碌中，請稍候重試' })).setMimeType(ContentService.MimeType.JSON);
    }

    var vendorSheet = null;
    var backupSnapshot = null;
    try {
      vendorSheet = ss.getSheetByName('vendors');
      if (!vendorSheet) vendorSheet = ss.insertSheet('vendors');
      var vendorHeaders = ['vendor_id', 'vendor_name', 'contact', 'phone'];
      if (vendorSheet.getLastRow() > 0) {
        var existingVH = vendorSheet.getRange(1, 1, 1, vendorSheet.getLastColumn()).getValues()[0];
        if (existingVH && existingVH.length > 0 && String(existingVH[0]).trim()) {
          vendorHeaders = existingVH.slice();
        }
      }

      var rows = [];
      for (var i = 0; i < data.length; i++) {
        var v = data[i];
        if (!v || !v.vendor_id) continue;
        var row = [];
        for (var j = 0; j < vendorHeaders.length; j++) {
          var key = vendorHeaders[j];
          var val = v[key];
          if ((val === undefined || val === '') && key === 'vendor_name') {
            val = v.vendor_name || v.name || '';
          }
          row.push(clampSheetCell(val));
        }
        rows.push(row);
      }

      backupSnapshot = snapshotSheetData(vendorSheet);
      if (vendorSheet.getLastRow() > 0) {
        vendorSheet.clear();
        vendorSheet.clearFormats();
      }
      vendorSheet.appendRow(vendorHeaders);
      if (rows.length > 0) {
        vendorSheet.getRange(2, 1, rows.length, vendorHeaders.length).setValues(rows);
        var vidCol = vendorHeaders.indexOf('vendor_id') + 1;
        var phoneCol = vendorHeaders.indexOf('phone') + 1;
        if (vidCol > 0) vendorSheet.getRange(2, vidCol, rows.length, 1).setNumberFormat('@');
        if (phoneCol > 0) vendorSheet.getRange(2, phoneCol, rows.length, 1).setNumberFormat('@');
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true, count: rows.length })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      restoreSheetData(vendorSheet, backupSnapshot);
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: err && err.message ? err.message : String(err) })).setMimeType(ContentService.MimeType.JSON);
    } finally {
      lock.releaseLock();
    }
  }

  if (action === 'updateOnlineOrder') {
    var orderSheet = ss.getSheetByName('網路訂單');
    if (orderSheet && orderSheet.getLastRow() > 1) {
      var headers = orderSheet.getRange(1, 1, 1, orderSheet.getLastColumn()).getValues()[0];
      var orderIdIdx = headers.indexOf('order_id');
      var statusIdx = headers.indexOf('status');
      var productIdIdx = headers.indexOf('product_id');
      if (orderIdIdx !== -1 && statusIdx !== -1) {
        var values = orderSheet.getDataRange().getValues();
        for (var i = 1; i < values.length; i++) {
          var matchOrder = String(values[i][orderIdIdx]).trim() === String(data.order_id).trim();
          var matchProduct = true;
          if (data.product_id && productIdIdx !== -1) {
            matchProduct = String(values[i][productIdIdx]).trim() === String(data.product_id).trim();
          }
          if (matchOrder && matchProduct) {
            orderSheet.getRange(i+1, statusIdx + 1).setValue(data.status);
          }
        }
      }
    }
    return ContentService.createTextOutput(JSON.stringify({success:true})).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'deleteOnlineOrder') {
    var orderSheet = ss.getSheetByName('網路訂單');
    if (orderSheet && orderSheet.getLastRow() > 1) {
      var headers = orderSheet.getRange(1, 1, 1, orderSheet.getLastColumn()).getValues()[0];
      var orderIdIdx = headers.indexOf('order_id');
      if (orderIdIdx === -1) orderIdIdx = headers.indexOf('訂單編號');
      if (orderIdIdx !== -1) {
        var values = orderSheet.getDataRange().getValues();
        for (var i = values.length - 1; i >= 1; i--) {
          var currentOrderId = String(values[i][orderIdIdx]).trim();
          if (currentOrderId === String(data.order_id).trim()) {
            orderSheet.deleteRow(i + 1);
          }
        }
      }
    }
    return ContentService.createTextOutput(JSON.stringify({success:true})).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'saveOnlineOrder' || action === 'saveOnlineOrders') {
    var orderSheet = ss.getSheetByName('網路訂單');
    if (!orderSheet) {
      orderSheet = ss.insertSheet('網路訂單');
      orderSheet.appendRow(['order_id', 'platform', 'product_id', 'product_name', 'quantity', 'price', 'customer_name', '最晚出貨期限', 'order_status', 'created_at', 'specification', 'shipping_method']);
    }
    var headers = orderSheet.getRange(1, 1, 1, orderSheet.getLastColumn()).getValues()[0];
    var orderIdIdx = headers.indexOf('order_id');
    if (orderIdIdx === -1) orderIdIdx = headers.indexOf('訂單編號');

    var incomingOrders = Array.isArray(data) ? data : (Array.isArray(data.orders) ? data.orders : [data]);
    var overwrite = data.overwrite !== false;

    for (var oIdx = 0; oIdx < incomingOrders.length; oIdx++) {
      var incOrder = incomingOrders[oIdx];
      var oId = String(incOrder.order_id || '').trim();
      if (!oId) continue;

      if (overwrite && orderSheet.getLastRow() > 1 && orderIdIdx !== -1) {
        var vals = orderSheet.getDataRange().getValues();
        for (var r = vals.length - 1; r >= 1; r--) {
          if (String(vals[r][orderIdIdx]).trim() === oId) {
            orderSheet.deleteRow(r + 1);
          }
        }
      }

      var items = Array.isArray(incOrder.items) && incOrder.items.length > 0 ? incOrder.items : [incOrder];
      for (var itIdx = 0; itIdx < items.length; itIdx++) {
        var it = items[itIdx];
        var row = [];
        for (var c = 0; c < headers.length; c++) {
          var h = String(headers[c] || '').trim().toLowerCase();
          if (h === 'order_id' || h === '訂單編號') row.push(oId);
          else if (h === 'platform' || h === '來源平台' || h === '平台') row.push(incOrder.platform || '蝦皮購物');
          else if (h === 'product_id' || h === '商品編號' || h === '商品id') row.push(it.product_id || '');
          else if (h === 'product_name' || h === '商品名稱' || h === '品名') row.push(it.product_name || it.name || '');
          else if (h === 'quantity' || h === '數量') row.push(Number(it.quantity) || 1);
          else if (h === 'price' || h === '金額' || h === '售價') row.push(Number(it.price) || Number(incOrder.price) || 0);
          else if (h === 'customer_name' || h === '買家' || h === '顧客') row.push(incOrder.customer_name || '');
          else if (h === '最晚出貨期限' || h === 'shipping_deadline') row.push(incOrder.shipping_deadline || '');
          else if (h === 'order_status' || h === '訂單狀態' || h === 'status') row.push(incOrder.order_status || '待出貨');
          else if (h === 'created_at' || h === '下單時間') row.push(incOrder.created_at || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy/MM/dd HH:mm:ss"));
          else if (h === 'specification' || h === '規格') row.push(it.specification || '');
          else if (h === 'shipping_method' || h === '物流方式') row.push(incOrder.shipping_method || '');
          else row.push('');
        }
        orderSheet.appendRow(row);
      }
    }
    return ContentService.createTextOutput(JSON.stringify({success:true, count: incomingOrders.length})).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'updateOnlineOrderProductId') {
    var orderSheet = ss.getSheetByName('網路訂單');
    if (orderSheet && orderSheet.getLastRow() > 1) {
      var headers = orderSheet.getRange(1, 1, 1, orderSheet.getLastColumn()).getValues()[0];
      var orderIdIdx = headers.indexOf('order_id');
      if (orderIdIdx === -1) orderIdIdx = headers.indexOf('訂單編號');
      var productIdIdx = headers.indexOf('product_id');
      if (productIdIdx === -1) productIdIdx = headers.indexOf('商品編號');
      var productNameIdx = headers.indexOf('product_name');
      if (productNameIdx === -1) productNameIdx = headers.indexOf('商品名稱');
      var specIdx = headers.indexOf('specification');
      if (specIdx === -1) specIdx = headers.indexOf('規格');

      var updates = Array.isArray(data) ? data : (data.updates ? data.updates : [data]);
      var values = orderSheet.getDataRange().getValues();
      for (var u = 0; u < updates.length; u++) {
        var up = updates[u];
        var targetOid = String(up.order_id || '').trim();
        var targetOldPid = String(up.old_product_id || '').trim();
        var targetNewPid = String(up.new_product_id || '').trim();
        var targetPName = String(up.product_name || '').trim();
        var targetSpec = String(up.specification || '').trim();

        for (var i = 1; i < values.length; i++) {
          var rowOid = String(values[i][orderIdIdx] || '').trim();
          var rowPid = productIdIdx !== -1 ? String(values[i][productIdIdx] || '').trim() : '';
          var rowPName = productNameIdx !== -1 ? String(values[i][productNameIdx] || '').trim() : '';
          var rowSpec = specIdx !== -1 ? String(values[i][specIdx] || '').trim() : '';

          if (rowOid === targetOid) {
            var isTargetRow = false;
            if (targetOldPid && rowPid === targetOldPid) isTargetRow = true;
            else if (targetPName && rowPName === targetPName) {
              if (!targetSpec || !rowSpec || targetSpec === rowSpec) isTargetRow = true;
            } else if (!targetOldPid && !rowPid) isTargetRow = true;

            if (isTargetRow && productIdIdx !== -1) {
              orderSheet.getRange(i + 1, productIdIdx + 1).setValue(targetNewPid);
            }
          }
        }
      }
    }
    return ContentService.createTextOutput(JSON.stringify({success:true})).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'batchShipment') {
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(30000);
    } catch (e) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: '系統忙碌中，請稍候重試' })).setMimeType(ContentService.MimeType.JSON);
    }

    try {
      var stockSheet = ss.getSheetByName('stock');
      var transSheet = ss.getSheetByName('transactions');
      var orderSheet = ss.getSheetByName('網路訂單');
      var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy/M/d  HH:mm:ss");

      var targetOrderId = data && data.order_id ? String(data.order_id).trim() : '';
      var platform = data && data.platform ? String(data.platform).trim() : '';
      var items = data && data.items && Array.isArray(data.items) ? data.items : [];

      var prodNameMapBatch = getProdNameMap(ss);

      // 1. 扣除庫存 (stock)
      if (stockSheet && stockSheet.getLastRow() > 1 && items.length > 0) {
        var stockHeaders = stockSheet.getRange(1, 1, 1, stockSheet.getLastColumn()).getValues()[0];
        var sIdIdx = stockHeaders.indexOf('stock_id');
        var sPidIdx = stockHeaders.indexOf('product_id');
        if (sPidIdx === -1) sPidIdx = stockHeaders.indexOf('商品編號');
        var sQtyIdx = stockHeaders.indexOf('quantity');
        if (sQtyIdx === -1) sQtyIdx = stockHeaders.indexOf('數量');
        var sUpdateIdx = stockHeaders.indexOf('last_update');

        for (var bi = 0; bi < items.length; bi++) {
          var itm = items[bi];
          var deductNeeded = Number(itm.quantity) || 0;
          if (deductNeeded <= 0) continue;

          var itmStockId = String(itm.stock_id || '').trim();
          var itmPid = String(itm.product_id || '').trim().toLowerCase();

          // 優先比對 exact stock_id
          if (itmStockId && sIdIdx !== -1 && stockSheet.getLastRow() > 1) {
            var sValues = stockSheet.getDataRange().getValues();
            for (var si = 1; si < sValues.length && deductNeeded > 0; si++) {
              if (String(sValues[si][sIdIdx] || '').trim() === itmStockId) {
                var currQ = Number(sValues[si][sQtyIdx]) || 0;
                var deductAmount = Math.min(currQ, deductNeeded);
                deductNeeded -= deductAmount;
                var newQ = currQ - deductAmount;
                if (newQ <= 0) {
                  stockSheet.deleteRow(si + 1);
                } else {
                  stockSheet.getRange(si + 1, sQtyIdx + 1).setValue(newQ);
                  if (sUpdateIdx !== -1) stockSheet.getRange(si + 1, sUpdateIdx + 1).setValue(now);
                }
                break;
              }
            }
          }

          // 次要比對 product_id (倒序扣減)
          if (deductNeeded > 0 && itmPid && sPidIdx !== -1 && stockSheet.getLastRow() > 1) {
            var sValues2 = stockSheet.getDataRange().getValues();
            for (var sj = sValues2.length - 1; sj >= 1 && deductNeeded > 0; sj--) {
              if (String(sValues2[sj][sPidIdx] || '').trim().toLowerCase() === itmPid) {
                var currQ2 = Number(sValues2[sj][sQtyIdx]) || 0;
                var deductAmount2 = Math.min(currQ2, deductNeeded);
                deductNeeded -= deductAmount2;
                var newQ2 = currQ2 - deductAmount2;
                if (newQ2 <= 0) {
                  stockSheet.deleteRow(sj + 1);
                } else {
                  stockSheet.getRange(sj + 1, sQtyIdx + 1).setValue(newQ2);
                  if (sUpdateIdx !== -1) stockSheet.getRange(sj + 1, sUpdateIdx + 1).setValue(now);
                }
              }
            }
          }
        }
      }

      // 2. 寫入交易流水紀錄 (transactions)
      if (items.length > 0) {
        if (!transSheet) transSheet = ss.insertSheet('transactions');
        var transHeaders = transSheet.getRange(1, 1, 1, transSheet.getLastColumn()).getValues()[0];
        var tOutNameIdx = transHeaders.indexOf('name');
        if (tOutNameIdx === -1) {
          for (var th = 0; th < transHeaders.length; th++) {
            var thStr = String(transHeaders[th] || '').trim().toLowerCase();
            if (thStr === 'product_name' || thStr === '商品名稱' || thStr === '品名') {
              transSheet.getRange(1, th + 1).setValue('name');
              transHeaders[th] = 'name';
              tOutNameIdx = th;
              break;
            }
          }
          if (tOutNameIdx === -1) {
            transHeaders.push('name');
            transSheet.getRange(1, transHeaders.length).setValue('name');
          }
        }

        var newRows = [];
        for (var ti = 0; ti < items.length; ti++) {
          var tItm = items[ti];
          tItm.transaction_id = tItm.transaction_id || Utilities.getUuid();
          tItm.online_order_id = tItm.online_order_id || targetOrderId;
          tItm.platform = tItm.platform || platform;
          tItm.type = tItm.type || ('stock_out ' + (platform || '網路訂單'));
          tItm.date = tItm.date || now;
          tItm.cost_price = Number(tItm.cost_price) || 0;
          tItm.price = Number(tItm.price) || 0;
          tItm.quantity = Number(tItm.quantity) || 0;

          var cleanPid = String(tItm.product_id || '').trim().toLowerCase();
          var tRow = [];
          for (var tk = 0; tk < transHeaders.length; tk++) {
            var colKey = transHeaders[tk];
            var colVal = tItm[colKey];
            if ((colVal === undefined || colVal === '') && (colKey === 'name' || colKey === 'product_name')) {
              colVal = tItm.name || tItm.product_name || (cleanPid ? prodNameMapBatch[cleanPid] : '') || '';
            }
            tRow.push(colVal !== undefined ? colVal : '');
          }
          newRows.push(tRow);
        }

        if (newRows.length > 0) {
          var startR = transSheet.getLastRow() + 1;
          transSheet.getRange(startR, 1, newRows.length, transHeaders.length).setValues(newRows);
        }
      }

      // 3. 刪除網路訂單 (網路訂單)
      var deletedOrdersCount = 0;
      if (orderSheet && orderSheet.getLastRow() > 1 && targetOrderId) {
        var oHeaders = orderSheet.getRange(1, 1, 1, orderSheet.getLastColumn()).getValues()[0];
        var oIdIdx = oHeaders.indexOf('order_id');
        if (oIdIdx === -1) oIdIdx = oHeaders.indexOf('訂單編號');
        if (oIdIdx === -1) oIdIdx = oHeaders.indexOf('單號');

        if (oIdIdx !== -1) {
          var oValues = orderSheet.getDataRange().getValues();
          var cleanTargetId = targetOrderId.replace(/[^0-9a-zA-Z_-]/g, '').toLowerCase();
          for (var oi = oValues.length - 1; oi >= 1; oi--) {
            var rowOrderId = String(oValues[oi][oIdIdx] || '').trim().replace(/[^0-9a-zA-Z_-]/g, '').toLowerCase();
            if (rowOrderId === cleanTargetId) {
              orderSheet.deleteRow(oi + 1);
              deletedOrdersCount++;
            }
          }
        }
      }

      lock.releaseLock();
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        order_id: targetOrderId,
        processedItems: items.length,
        deletedOrdersCount: deletedOrdersCount
      })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      lock.releaseLock();
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: String(err.message || err)
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  if (action === 'deduplicateOnlineOrders') {
    var orderSheet = ss.getSheetByName('網路訂單');
    var deletedCount = 0;
    if (orderSheet && orderSheet.getLastRow() > 1) {
      var headers = orderSheet.getRange(1, 1, 1, orderSheet.getLastColumn()).getValues()[0];
      
      // 動態對應欄位索引（支援英文與中文欄位名稱）
      var orderIdIdx = headers.indexOf('order_id');
      if (orderIdIdx === -1) orderIdIdx = headers.indexOf('訂單編號');
      if (orderIdIdx === -1) orderIdIdx = headers.indexOf('單號');

      var productIdIdx = headers.indexOf('product_id');
      if (productIdIdx === -1) productIdIdx = headers.indexOf('商品編號');
      if (productIdIdx === -1) productIdIdx = headers.indexOf('商品ID');
      if (productIdIdx === -1) productIdIdx = headers.indexOf('品項編號');

      var productNameIdx = headers.indexOf('product_name');
      if (productNameIdx === -1) productNameIdx = headers.indexOf('商品名稱');
      if (productNameIdx === -1) productNameIdx = headers.indexOf('品名');
      if (productNameIdx === -1) productNameIdx = headers.indexOf('商品');

      var qtyIdx = headers.indexOf('quantity');
      if (qtyIdx === -1) qtyIdx = headers.indexOf('數量');

      var targetOrderId = data && data.order_id ? String(data.order_id).trim() : '';

      var values = orderSheet.getDataRange().getValues();
      var seenFingerprints = {};
      var rowsToDelete = [];

      // 由上至下檢索重複行（保留第一次出現的首筆，其餘標記刪除）
      for (var i = 1; i < values.length; i++) {
        var row = values[i];
        var oid = orderIdIdx !== -1 ? String(row[orderIdIdx] || '').trim() : '';
        if (!oid) continue;

        // 若指定特定訂單，非該訂單者跳過
        if (targetOrderId && oid !== targetOrderId) continue;

        var pid = productIdIdx !== -1 ? String(row[productIdIdx] || '').trim().toLowerCase() : '';
        var pname = productNameIdx !== -1 ? String(row[productNameIdx] || '').trim().toLowerCase() : '';
        var pqty = qtyIdx !== -1 ? (Number(row[qtyIdx]) || 0) : 0;

        var fp = oid.toLowerCase() + ':::' + pid + ':::' + pname + ':::' + pqty;

        if (seenFingerprints[fp]) {
          // 重複行，記錄 1-based 列號
          rowsToDelete.push(i + 1);
        } else {
          seenFingerprints[fp] = true;
        }
      }

      // 由下往上倒序刪除，確保列號（Row Index）不會偏移錯位
      for (var d = rowsToDelete.length - 1; d >= 0; d--) {
        orderSheet.deleteRow(rowsToDelete[d]);
        deletedCount++;
      }
    }
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      deletedCount: deletedCount,
      message: '成功清理試算表重複資料，共刪除 ' + deletedCount + ' 列（每項只留一筆）'
    })).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'addPurchaseOrder' || action === 'savePurchaseOrders' || action === 'editPurchaseOrder') {
    var poList = Array.isArray(data) ? data : (data ? [data] : []);
    if (poList.length === 0) {
      return ContentService.createTextOutput(JSON.stringify({success: false, error: '無效的採購單資料'})).setMimeType(ContentService.MimeType.JSON);
    }
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(30000);
    } catch (e) {
      return ContentService.createTextOutput(JSON.stringify({success: false, error: '系統忙碌中，請稍候重試'})).setMimeType(ContentService.MimeType.JSON);
    }
    var poSheet = null;
    var poSnapshot = null;
    try {
      poSheet = ss.getSheetByName('purchase_orders');
      if (!poSheet) {
        poSheet = ss.insertSheet('purchase_orders');
        poSheet.appendRow(['po_id', 'vendor_id', 'vendor_name', 'product_id', 'specification', 'name', 'ordered_quantity', 'received_quantity', 'cost_price', 'status', 'order_date', 'expected_date', 'note', 'operator', 'invoice_number', 'invoice_image_url', 'updated_at', 'manual_edited_at', 'manual_override']);
      }
      var headers = poSheet.getRange(1, 1, 1, poSheet.getLastColumn()).getValues()[0];
      var normHeaders = [];
      for (var nh = 0; nh < headers.length; nh++) {
        normHeaders.push(normalizePoHeader(headers[nh]));
      }
      var requiredPoCols = ['invoice_number', 'invoice_image_url', 'name', 'updated_at', 'manual_edited_at', 'manual_override'];
      for (var rc = 0; rc < requiredPoCols.length; rc++) {
        var reqCol = requiredPoCols[rc];
        if (normHeaders.indexOf(reqCol) === -1) {
          headers.push(reqCol);
          normHeaders.push(reqCol);
          poSheet.getRange(1, headers.length).setValue(reqCol);
        }
      }
      var poIdIdx = normHeaders.indexOf('po_id');
      var orderDateIdx = normHeaders.indexOf('order_date');
      var expectedDateIdx = normHeaders.indexOf('expected_date');
      var invNumIdx = normHeaders.indexOf('invoice_number');

      var prodNameMapPO = getProdNameMap(ss);
      var preparedBatches = [];
      for (var p = 0; p < poList.length; p++) {
        var po = poList[p];
        var targetPoId = String((po && po.po_id) || '').trim();
        if (!targetPoId) continue;

        var items = po.items && po.items.length > 0 ? po.items : [{
          product_id: po.product_id || '',
          name: po.name || po.product_name || '',
          specification: po.specification || '',
          ordered_quantity: po.ordered_quantity || po.quantity || 1,
          received_quantity: po.received_quantity || 0,
          cost_price: po.cost_price || 0,
          note: ''
        }];

        var safeImageUrl = sanitizeSheetImageUrlCell(po.invoice_image_url || '');
        var safeOrderDate = formatPoDateCell(po.order_date || '');
        var safeExpectedDate = formatPoDateCell(po.expected_date || '');
        var rowsForPo = [];

        for (var it = 0; it < items.length; it++) {
          var item = items[it];
          var cleanPoPid = String(item.product_id || '').trim().toLowerCase();
          var row = [];
          for (var h = 0; h < normHeaders.length; h++) {
            var colName = normHeaders[h];
            var val = '';
            if (colName === 'po_id') val = targetPoId;
            else if (colName === 'vendor_id') val = clampSheetCell(po.vendor_id || '');
            else if (colName === 'vendor_name') val = clampSheetCell(po.vendor_name || '');
            else if (colName === 'product_id') val = clampSheetCell(item.product_id || '');
            else if (colName === 'name') val = clampSheetCell(item.name || item.product_name || (cleanPoPid ? prodNameMapPO[cleanPoPid] : '') || '');
            else if (colName === 'specification') val = clampSheetCell(item.specification || '');
            else if (colName === 'ordered_quantity') val = Number(item.ordered_quantity) || 0;
            else if (colName === 'received_quantity') val = Number(item.received_quantity) || 0;
            else if (colName === 'cost_price') val = Number(item.cost_price) || 0;
            else if (colName === 'status') val = clampSheetCell(po.status || 'pending');
            else if (colName === 'order_date') val = safeOrderDate;
            else if (colName === 'expected_date') val = safeExpectedDate;
            else if (colName === 'note') val = clampSheetCell(po.note !== undefined ? String(po.note || '') : (item.note || ''));
            else if (colName === 'operator') val = clampSheetCell(po.operator || '');
            else if (colName === 'invoice_number') val = clampSheetCell(po.invoice_number || '');
            else if (colName === 'invoice_image_url') val = safeImageUrl;
            else if (colName === 'updated_at') val = clampSheetCell(po.updated_at || new Date().toISOString());
            else if (colName === 'manual_edited_at') val = clampSheetCell(po.manual_edited_at || '');
            else if (colName === 'manual_override') val = po.manual_override === true ? 'TRUE' : (po.manual_override === false ? 'FALSE' : '');
            row.push(val);
          }
          rowsForPo.push(row);
        }
        preparedBatches.push({ poId: targetPoId, rows: rowsForPo });
      }

      if (preparedBatches.length === 0) {
        return ContentService.createTextOutput(JSON.stringify({success: false, error: '採購單缺乏有效的 po_id'})).setMimeType(ContentService.MimeType.JSON);
      }

      poSnapshot = snapshotSheetData(poSheet);
      for (var b = 0; b < preparedBatches.length; b++) {
        var batch = preparedBatches[b];
        if (poSheet.getLastRow() > 1 && poIdIdx !== -1) {
          var values = poSheet.getDataRange().getDisplayValues();
          for (var r = values.length - 1; r >= 1; r--) {
            if (String(values[r][poIdIdx] || '').trim() === batch.poId) {
              poSheet.deleteRow(r + 1);
            }
          }
        }
        if (batch.rows.length > 0) {
          var startRow = poSheet.getLastRow() + 1;
          poSheet.getRange(startRow, 1, batch.rows.length, normHeaders.length).setValues(batch.rows);
          if (poIdIdx !== -1) poSheet.getRange(startRow, poIdIdx + 1, batch.rows.length, 1).setNumberFormat('@');
          if (orderDateIdx !== -1) poSheet.getRange(startRow, orderDateIdx + 1, batch.rows.length, 1).setNumberFormat('@');
          if (expectedDateIdx !== -1) poSheet.getRange(startRow, expectedDateIdx + 1, batch.rows.length, 1).setNumberFormat('@');
          if (invNumIdx !== -1) poSheet.getRange(startRow, invNumIdx + 1, batch.rows.length, 1).setNumberFormat('@');
        }
      }
      return ContentService.createTextOutput(JSON.stringify({success: true})).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      restoreSheetData(poSheet, poSnapshot);
      return ContentService.createTextOutput(JSON.stringify({success: false, error: err.toString()})).setMimeType(ContentService.MimeType.JSON);
    } finally {
      lock.releaseLock();
    }
  }

  if (action === 'overwritePurchaseOrders') {
    if (!Array.isArray(data)) {
      return ContentService.createTextOutput(JSON.stringify({success: false, error: '無效的採購單陣列，已中止覆寫'})).setMimeType(ContentService.MimeType.JSON);
    }
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(30000);
    } catch (e) {
      return ContentService.createTextOutput(JSON.stringify({success: false, error: '系統忙碌中，請稍候重試'})).setMimeType(ContentService.MimeType.JSON);
    }
    var poSheet = null;
    var poSnapshot = null;
    try {
      poSheet = ss.getSheetByName('purchase_orders');
      if (!poSheet) poSheet = ss.insertSheet('purchase_orders');
      var poHeaders = ['po_id', 'vendor_id', 'vendor_name', 'product_id', 'specification', 'name', 'ordered_quantity', 'received_quantity', 'cost_price', 'status', 'order_date', 'expected_date', 'note', 'operator', 'invoice_number', 'invoice_image_url', 'updated_at', 'manual_edited_at', 'manual_override'];
      if (poSheet.getLastRow() > 0) {
        var existingPOH = poSheet.getRange(1, 1, 1, poSheet.getLastColumn()).getValues()[0];
        if (existingPOH && existingPOH.length > 0 && String(existingPOH[0]).trim()) {
          poHeaders = existingPOH.slice();
          var existingNorm = [];
          for (var ehi = 0; ehi < poHeaders.length; ehi++) {
            existingNorm.push(normalizePoHeader(poHeaders[ehi]));
          }
          var reqOverwriteCols = ['name', 'invoice_number', 'invoice_image_url', 'updated_at', 'manual_edited_at', 'manual_override'];
          for (var roc = 0; roc < reqOverwriteCols.length; roc++) {
            if (existingNorm.indexOf(reqOverwriteCols[roc]) === -1) {
              poHeaders.push(reqOverwriteCols[roc]);
              existingNorm.push(reqOverwriteCols[roc]);
            }
          }
        }
      }
      var poNormHeaders = [];
      for (var pnh = 0; pnh < poHeaders.length; pnh++) {
        poNormHeaders.push(normalizePoHeader(poHeaders[pnh]));
      }

      var prodNameMapPOOverwrite = getProdNameMap(ss);
      var rows = [];
      for (var p = 0; p < data.length; p++) {
        var po = data[p];
        if (!po || !po.po_id) continue;
        var safeImgCell = sanitizeSheetImageUrlCell(po.invoice_image_url || '');
        var safeOrderD = formatPoDateCell(po.order_date || '');
        var safeExpectedD = formatPoDateCell(po.expected_date || '');
        var items = po.items && po.items.length > 0 ? po.items : [{
          product_id: po.product_id || '',
          name: po.name || po.product_name || '',
          specification: po.specification || '',
          ordered_quantity: po.ordered_quantity || po.quantity || 1,
          received_quantity: po.received_quantity || 0,
          cost_price: po.cost_price || 0,
          note: ''
        }];
        for (var it = 0; it < items.length; it++) {
          var item = items[it];
          var cleanPoItPid = String(item.product_id || '').trim().toLowerCase();
          var row = [];
          for (var h = 0; h < poNormHeaders.length; h++) {
            var colName = poNormHeaders[h];
            var val = '';
            if (colName === 'po_id') val = clampSheetCell(po.po_id);
            else if (colName === 'vendor_id') val = clampSheetCell(po.vendor_id || '');
            else if (colName === 'vendor_name') val = clampSheetCell(po.vendor_name || '');
            else if (colName === 'product_id') val = clampSheetCell(item.product_id || '');
            else if (colName === 'name') val = clampSheetCell(item.name || item.product_name || (cleanPoItPid ? prodNameMapPOOverwrite[cleanPoItPid] : '') || '');
            else if (colName === 'specification') val = clampSheetCell(item.specification || '');
            else if (colName === 'ordered_quantity') val = Number(item.ordered_quantity) || 0;
            else if (colName === 'received_quantity') val = Number(item.received_quantity) || 0;
            else if (colName === 'cost_price') val = Number(item.cost_price) || 0;
            else if (colName === 'status') val = clampSheetCell(po.status || 'pending');
            else if (colName === 'order_date') val = safeOrderD;
            else if (colName === 'expected_date') val = safeExpectedD;
            else if (colName === 'note') val = clampSheetCell(po.note !== undefined ? String(po.note || '') : (item.note || ''));
            else if (colName === 'operator') val = clampSheetCell(po.operator || '');
            else if (colName === 'invoice_number') val = clampSheetCell(po.invoice_number || '');
            else if (colName === 'invoice_image_url') val = safeImgCell;
            else if (colName === 'updated_at') val = clampSheetCell(po.updated_at || new Date().toISOString());
            else if (colName === 'manual_edited_at') val = clampSheetCell(po.manual_edited_at || '');
            else if (colName === 'manual_override') val = po.manual_override === true ? 'TRUE' : (po.manual_override === false ? 'FALSE' : '');
            row.push(val);
          }
          rows.push(row);
        }
      }

      poSnapshot = snapshotSheetData(poSheet);
      if (poSheet.getLastRow() > 0) {
        poSheet.clear();
        poSheet.clearFormats();
      }
      poSheet.appendRow(poHeaders);
      if (rows.length > 0) {
        poSheet.getRange(2, 1, rows.length, poHeaders.length).setValues(rows);
        var ovPoIdCol = poNormHeaders.indexOf('po_id') + 1;
        var ovOrdDateCol = poNormHeaders.indexOf('order_date') + 1;
        var ovExpDateCol = poNormHeaders.indexOf('expected_date') + 1;
        var ovInvCol = poNormHeaders.indexOf('invoice_number') + 1;
        if (ovPoIdCol > 0) poSheet.getRange(2, ovPoIdCol, rows.length, 1).setNumberFormat('@');
        if (ovOrdDateCol > 0) poSheet.getRange(2, ovOrdDateCol, rows.length, 1).setNumberFormat('@');
        if (ovExpDateCol > 0) poSheet.getRange(2, ovExpDateCol, rows.length, 1).setNumberFormat('@');
        if (ovInvCol > 0) poSheet.getRange(2, ovInvCol, rows.length, 1).setNumberFormat('@');
      }
      return ContentService.createTextOutput(JSON.stringify({success: true, count: data.length})).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      restoreSheetData(poSheet, poSnapshot);
      return ContentService.createTextOutput(JSON.stringify({success: false, error: err.toString()})).setMimeType(ContentService.MimeType.JSON);
    } finally {
      lock.releaseLock();
    }
  }

  if (action === 'deletePurchaseOrder') {
    var lock = LockService.getScriptLock();
    try {
      lock.waitLock(15000);
    } catch (e) {
      return ContentService.createTextOutput(JSON.stringify({success: false, error: '系統忙碌中，請稍候重試'})).setMimeType(ContentService.MimeType.JSON);
    }
    try {
      var poSheet = ss.getSheetByName('purchase_orders');
      if (poSheet && poSheet.getLastRow() > 1) {
        var headers = poSheet.getRange(1, 1, 1, poSheet.getLastColumn()).getValues()[0];
        var poIdIdx = -1;
        for (var hi = 0; hi < headers.length; hi++) {
          if (normalizePoHeader(headers[hi]) === 'po_id') {
            poIdIdx = hi;
            break;
          }
        }
        if (poIdIdx !== -1) {
          var values = poSheet.getDataRange().getDisplayValues();
          var targetDelId = String(data.po_id || '').trim();
          for (var r = values.length - 1; r >= 1; r--) {
            if (String(values[r][poIdIdx] || '').trim() === targetDelId) {
              poSheet.deleteRow(r + 1);
            }
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({success: true})).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({success: false, error: err.toString()})).setMimeType(ContentService.MimeType.JSON);
    } finally {
      lock.releaseLock();
    }
  }

  if (action === 'uploadInvoiceImage') {
    try {
      var folderName = '進貨單據歸檔';
      var folders = DriveApp.getFoldersByName(folderName);
      var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(folderName);
      
      var base64Data = data.imageBase64 || data.base64 || '';
      var cleanBase64 = base64Data;
      if (cleanBase64.indexOf('base64,') !== -1) {
        cleanBase64 = cleanBase64.split('base64,')[1];
      }
      var decoded = Utilities.base64Decode(cleanBase64);
      var fileName = data.fileName || ('Invoice_' + Utilities.formatDate(new Date(), 'GMT+8', 'yyyyMMdd_HHmmss') + '.jpg');
      var blob = Utilities.newBlob(decoded, 'image/jpeg', fileName);
      var file = folder.createFile(blob);
      try {
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch(e) {}
      
      var fileId = file.getId();
      var directUrl = 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1600';
      var viewUrl = file.getUrl();
      
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        fileId: fileId,
        url: directUrl,
        viewUrl: viewUrl
      })).setMimeType(ContentService.MimeType.JSON);
    } catch(err) {
      return ContentService.createTextOutput(JSON.stringify({success: false, error: err.toString()})).setMimeType(ContentService.MimeType.JSON);
    }
  }

  return ContentService.createTextOutput(JSON.stringify({success: false, error: 'Unknown action: ' + (action || '')})).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var action = e.parameter.action;
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 0. 極速綜合數據整合接口 (一次性撈取所有品項、庫存、網路訂單、採購單，杜絕多次 HTTP 請求被 Google 免費帳戶並發限制)
  if (action === 'getAllData' || action === 'getCloudAssistantData') {
    var pSheet = ss.getSheetByName('products');
    var products = [];
    if (pSheet && pSheet.getLastRow() > 1) {
      var pData = pSheet.getDataRange().getDisplayValues();
      if (pData.length >= 2) {
        var pKeys = pData[0];
        var pidIdx = pKeys.indexOf('product_id');
        for (var i = 1; i < pData.length; i++) {
          if (!pData[i].join('').trim()) continue;
          if (pidIdx !== -1 && !pData[i][pidIdx]) continue;
          var pObj = {};
          for (var j = 0; j < pKeys.length; j++) {
            var val = pData[i][j];
            if (pKeys[j] === 'has_expiry') val = (String(val).toUpperCase() === 'TRUE');
            if (pKeys[j] === 'is_discontinued') val = (String(val).toUpperCase() === 'TRUE');
            if (pKeys[j] === 'cost_price' || pKeys[j] === 'min_stock') val = Number(val) || 0;
            pObj[pKeys[j]] = val;
          }
          products.push(pObj);
        }
      }
    }

    var sSheet = ss.getSheetByName('stock');
    var stock = [];
    if (sSheet && sSheet.getLastRow() > 1) {
      var sData = sSheet.getDataRange().getDisplayValues();
      if (sData.length >= 2) {
        var sKeys = sData[0];
        var sidIdx = sKeys.indexOf('stock_id');
        var spidIdx = sKeys.indexOf('product_id');
        if (spidIdx === -1) spidIdx = sKeys.indexOf('商品編號');
        for (var si = 1; si < sData.length; si++) {
          if (!sData[si].join('').trim()) continue;
          if (sidIdx !== -1 && !sData[si][sidIdx] && spidIdx !== -1 && !sData[si][spidIdx]) continue;
          var sObj = {};
          for (var sj = 0; sj < sKeys.length; sj++) {
            var sval = sData[si][sj];
            if (sKeys[sj] === 'quantity') sval = Number(sval) || 0;
            sObj[sKeys[sj]] = sval;
          }
          if (!sObj.stock_id && sObj.product_id) {
            sObj.stock_id = 'STOCK_' + sObj.product_id + '_' + si;
          }
          stock.push(sObj);
        }
      }
    }

    var oSheet = ss.getSheetByName('網路訂單');
    var onlineOrders = [];
    if (oSheet && oSheet.getLastRow() > 1) {
      var oData = oSheet.getDataRange().getDisplayValues();
      if (oData.length >= 2) {
        var oKeys = oData[0];
        for (var oi = 1; oi < oData.length; oi++) {
          if (!oData[oi].join('').trim()) continue;
          var oObj = {};
          for (var oj = 0; oj < oKeys.length; oj++) {
            var oval = oData[oi][oj];
            if (oKeys[oj] === 'quantity') oval = Number(oval) || 0;
            if (oKeys[oj] === 'price') oval = Number(oval) || 0;
            oObj[oKeys[oj]] = oval;
          }
          onlineOrders.push(oObj);
        }
      }
    }

    var poSheet = ss.getSheetByName('purchase_orders');
    var purchaseOrders = [];
    if (poSheet && poSheet.getLastRow() > 1) {
      var poData = poSheet.getDataRange().getDisplayValues();
      if (poData.length >= 2) {
        var poRawKeys = poData[0];
        var poKeys = [];
        for (var pkIdx = 0; pkIdx < poRawKeys.length; pkIdx++) {
          poKeys.push(normalizePoHeader(poRawKeys[pkIdx]));
        }
        var prodNameMapGetPO = getProdNameMap(ss);
        var poMap = {};
        for (var poi = 1; poi < poData.length; poi++) {
          if (!poData[poi].join('').trim()) continue;
          var poObj = {};
          for (var poj = 0; poj < poKeys.length; poj++) {
            var poval = poData[poi][poj];
            if (poKeys[poj] === 'ordered_quantity' || poKeys[poj] === 'received_quantity' || poKeys[poj] === 'cost_price') {
              poval = Number(poval) || 0;
            }
            poObj[poKeys[poj]] = poval;
          }
          var poid = String(poObj.po_id || ('PO_ROW_' + poi)).trim();
          var invNum = poObj.invoice_number || '';
          if (!invNum && poObj.note) {
            var m = String(poObj.note).match(/\[(?:單據|發票|單據號|發票號)[:：]\s*([^\]]+)\]/);
            if (m && m[1]) invNum = m[1].trim();
          }

          if (!poMap[poid]) {
            poMap[poid] = {
              po_id: poid,
              vendor_id: poObj.vendor_id || '',
              vendor_name: poObj.vendor_name || '',
              status: poObj.status || 'pending',
              order_date: formatPoDateCell(poObj.order_date || ''),
              expected_date: formatPoDateCell(poObj.expected_date || ''),
              note: poObj.note || '',
              operator: poObj.operator || '',
              invoice_number: invNum,
              invoice_image_url: poObj.invoice_image_url || '',
              updated_at: poObj.updated_at || '',
              manual_edited_at: poObj.manual_edited_at || '',
              manual_override: String(poObj.manual_override || '').trim().toUpperCase() === 'TRUE',
              items: []
            };
          } else if (!poMap[poid].invoice_number && invNum) {
            poMap[poid].invoice_number = invNum;
          }

          var cleanPoPid = String(poObj.product_id || '').trim().toLowerCase();
          var resolvedPoName = poObj.name || poObj.product_name || (cleanPoPid ? prodNameMapGetPO[cleanPoPid] : '') || '';

          poMap[poid].items.push({
            product_id: poObj.product_id || '',
            name: resolvedPoName,
            product_name: resolvedPoName,
            specification: poObj.specification || '',
            ordered_quantity: Number(poObj.ordered_quantity) || 0,
            received_quantity: Number(poObj.received_quantity) || 0,
            cost_price: Number(poObj.cost_price) || 0,
            note: ''
          });
        }
        for (var pk in poMap) {
          purchaseOrders.push(poMap[pk]);
        }
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      products: products,
      stock: stock,
      onlineOrders: onlineOrders,
      purchaseOrders: purchaseOrders
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === 'getProducts') {
    var sheet = ss.getSheetByName('products');
    if(!sheet || sheet.getLastRow() <= 1) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    var dataRange = sheet.getDataRange();
    var data = dataRange.getDisplayValues(); // Fix: use getDisplayValues to avoid .000Z dates
    if(data.length < 2) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    var keys = data[0];
    var result = [];
    var pidIdx = keys.indexOf('product_id');
    for(var i=1; i<data.length; i++){
      if (!data[i].join('').trim()) continue; // Skip empty rows
      if (pidIdx !== -1 && !data[i][pidIdx]) continue; // Skip if no product_id
      var obj = {};
      for(var j=0; j<keys.length; j++){ 
        var val = data[i][j];
        if (keys[j] === 'has_expiry') val = (String(val).toUpperCase() === 'TRUE');
        if (keys[j] === 'is_discontinued') val = (String(val).toUpperCase() === 'TRUE');
        if (keys[j] === 'cost_price' || keys[j] === 'min_stock') val = Number(val) || 0;
        obj[keys[j]] = val; 
      }
      result.push(obj);
    }
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === 'getVendors') {
    var sheet = ss.getSheetByName('vendors');
    if(!sheet || sheet.getLastRow() <= 1) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    var dataRange = sheet.getDataRange();
    var data = dataRange.getDisplayValues(); // Option: display values
    if(data.length < 2) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    var keys = data[0];
    var result = [];
    var vidIdx = keys.indexOf('vendor_id');
    for(var i=1; i<data.length; i++){
      if (!data[i].join('').trim()) continue; // Skip empty rows
      if (vidIdx !== -1 && !data[i][vidIdx]) continue; // Skip if no vendor_id
      var obj = {};
      for(var j=0; j<keys.length; j++){ obj[keys[j]] = data[i][j]; }
      result.push(obj);
    }
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === 'getStock') {
    var sheet = ss.getSheetByName('stock');
    if(!sheet || sheet.getLastRow() <= 1) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    var dataRange = sheet.getDataRange();
    var data = dataRange.getDisplayValues(); // Fix: use getDisplayValues
    if(data.length < 2) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    var keys = data[0];
    var result = [];
    var sidIdx = keys.indexOf('stock_id');
    var pidIdx = keys.indexOf('product_id');
    if (pidIdx === -1) pidIdx = keys.indexOf('商品編號');
    for(var i=1; i<data.length; i++){
      if (!data[i].join('').trim()) continue; // Skip empty rows
      if (sidIdx !== -1 && !data[i][sidIdx] && pidIdx !== -1 && !data[i][pidIdx]) continue;
      var obj = {};
      for(var j=0; j<keys.length; j++){ 
        var val = data[i][j];
        if (keys[j] === 'quantity') val = Number(val) || 0;
        obj[keys[j]] = val; 
      }
      if (!obj.stock_id && obj.product_id) {
        obj.stock_id = 'STOCK_' + obj.product_id + '_' + i;
      }
      result.push(obj);
    }
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'getTransactions') {
    var sheet = ss.getSheetByName('transactions');
    if(!sheet || sheet.getLastRow() <= 1) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    var dataRange = sheet.getDataRange();
    var data = dataRange.getDisplayValues(); // Fix: use getDisplayValues
    if(data.length < 2) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    var keys = data[0];
    var prodNameMapGet = getProdNameMap(ss);
    var result = [];
    var tidIdx = keys.indexOf('transaction_id');
    for(var i=data.length-1; i>=1; i--){ // reverse order for latest first, limited
      if (!data[i].join('').trim()) continue; // Skip empty rows
      if (tidIdx !== -1 && !data[i][tidIdx]) continue; // Skip if no transaction_id
      var obj = {};
      for(var j=0; j<keys.length; j++){ 
        var val = data[i][j];
        if (keys[j] === 'quantity') val = Number(val) || 0;
        if (keys[j] === 'cost_price') {
          if (String(val).indexOf('1899') !== -1 || isNaN(Number(val))) val = 0;
          else val = Number(val) || 0;
        }
        if (keys[j] === 'price') val = Number(val) || 0;
        obj[keys[j]] = val; 
      }
      var cleanPid = String(obj.product_id || '').trim().toLowerCase();
      if (!obj.name && cleanPid && prodNameMapGet[cleanPid]) {
        obj.name = prodNameMapGet[cleanPid];
      }
      result.push(obj);
    }
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'getOnlineOrders') {
    var sheet = ss.getSheetByName('網路訂單');
    if(!sheet || sheet.getLastRow() <= 1) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    var dataRange = sheet.getDataRange();
    var data = dataRange.getDisplayValues();
    if(data.length < 2) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    var keys = data[0];
    var result = [];
    for(var i=1; i<data.length; i++){
      if (!data[i].join('').trim()) continue; // Skip empty rows
      var obj = {};
      for(var j=0; j<keys.length; j++){ 
        var val = data[i][j];
        if (keys[j] === 'quantity') val = Number(val) || 0;
        if (keys[j] === 'price') val = Number(val) || 0;
        obj[keys[j]] = val; 
      }
      result.push(obj);
    }
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }

  if (action === 'getPurchaseOrders') {
    var sheet = ss.getSheetByName('purchase_orders');
    if (!sheet || sheet.getLastRow() <= 1) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    var dataRange = sheet.getDataRange();
    var data = dataRange.getDisplayValues();
    if (data.length < 2) return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    var rawKeys = data[0];
    var keys = [];
    for (var rk = 0; rk < rawKeys.length; rk++) {
      keys.push(normalizePoHeader(rawKeys[rk]));
    }
    var prodNameMapGetPO = getProdNameMap(ss);
    var poMap = {};
    for (var i = 1; i < data.length; i++) {
      if (!data[i].join('').trim()) continue;
      var obj = {};
      for (var j = 0; j < keys.length; j++) {
        var val = data[i][j];
        if (keys[j] === 'ordered_quantity' || keys[j] === 'received_quantity' || keys[j] === 'cost_price') {
          val = Number(val) || 0;
        }
        obj[keys[j]] = val;
      }
      var poid = String(obj.po_id || ('PO_ROW_' + i)).trim();
      var invNum = obj.invoice_number || '';
      if (!invNum && obj.note) {
        var m = String(obj.note).match(/\[(?:單據|發票|單據號|發票號)[:：]\s*([^\]]+)\]/);
        if (m && m[1]) invNum = m[1].trim();
      }

      if (!poMap[poid]) {
        poMap[poid] = {
          po_id: poid,
          vendor_id: obj.vendor_id || '',
          vendor_name: obj.vendor_name || '',
          status: obj.status || 'pending',
          order_date: formatPoDateCell(obj.order_date || ''),
          expected_date: formatPoDateCell(obj.expected_date || ''),
          note: obj.note || '',
          operator: obj.operator || '',
          invoice_number: invNum,
          invoice_image_url: obj.invoice_image_url || '',
          updated_at: obj.updated_at || '',
          manual_edited_at: obj.manual_edited_at || '',
          manual_override: String(obj.manual_override || '').trim().toUpperCase() === 'TRUE',
          items: []
        };
      } else if (!poMap[poid].invoice_number && invNum) {
        poMap[poid].invoice_number = invNum;
      }

      var cleanPoPid = String(obj.product_id || '').trim().toLowerCase();
      var resolvedPoName = obj.name || obj.product_name || (cleanPoPid ? prodNameMapGetPO[cleanPoPid] : '') || '';

      poMap[poid].items.push({
        product_id: obj.product_id || '',
        name: resolvedPoName,
        product_name: resolvedPoName,
        specification: obj.specification || '',
        ordered_quantity: Number(obj.ordered_quantity) || 0,
        received_quantity: Number(obj.received_quantity) || 0,
        cost_price: Number(obj.cost_price) || 0,
        note: ''
      });
    }
    var result = Object.values(poMap);
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }
}`}
                </pre>
                </div>
             </section>

             <section>
                <h3 className="text-base font-bold text-[var(--color-text-main)] mt-8">3. 原生 Flutter App (選填)</h3>
                <p className="text-[var(--color-text-dim)] mt-1">如果您仍希望編譯成原生的手機 App 而非使用上述的 PWA，您可以使用 Flutter，並搭配 <code>mobile_scanner</code> 及 <code>sqflite</code> 開發，以下為核心邏輯參考：</p>
                <pre className="bg-black/40 border border-white/10 text-[var(--color-text-dim)] p-4 rounded-xl mt-3 overflow-x-auto text-xs font-mono">
{`// Example Flutter Main Logic (Reference)
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:sqflite/sqflite.dart';
import 'package:path/path.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

// ... Setup sqflite DB and Provider/Bloc for offline sync ...
// See the Web version implementation for API data structure.

class ScannerScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Scan Custom Barcode')),
      body: MobileScanner(
        onDetect: (capture) {
          final List<Barcode> barcodes = capture.barcodes;
          for (final barcode in barcodes) {
            final String? code = barcode.rawValue;
            if (code != null) {
              Navigator.pop(context, code);
              break;
            }
          }
        },
      ),
    );
  }
}`}
                </pre>
             </section>
           </div>
        )}
      </div>

      {confirmAction.type !== null && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-[#0f172a] border border-white/10 rounded-2xl overflow-hidden shadow-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-500/20 border border-amber-500/30 rounded-xl shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1 space-y-1">
                <h3 className="text-sm font-bold text-white mb-1">{confirmAction.title}</h3>
                <p className="text-xs text-zinc-400 leading-relaxed">{confirmAction.message}</p>
              </div>
            </div>

            <div className="bg-white/5 rounded-xl p-3 border border-white/5 flex justify-between items-center text-xs font-mono">
              <span className="text-zinc-500 font-sans">本地預備寫入筆數</span>
              <span className="text-emerald-400 font-bold tabular-nums">{confirmAction.targetCount} 筆</span>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setConfirmAction({ type: null, title: '', message: '', targetCount: 0 })}
                className="flex-1 py-2 px-4 bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl text-xs font-bold text-zinc-300 transition-colors cursor-pointer"
              >
                取消
              </button>
              <button
                onClick={handleExecuteOverwrite}
                className="flex-1 py-2 px-4 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-[#0f172a] rounded-xl text-xs font-bold transition-all shadow-lg shadow-emerald-500/15 cursor-pointer"
              >
                確認執行覆寫
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingBackupImport && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[105] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-[#0f172a] border border-sky-500/30 rounded-2xl overflow-hidden shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-sky-500/20 border border-sky-500/30 rounded-xl shrink-0">
                  <Database className="w-5 h-5 text-sky-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">確認還原全站 JSON 快照備份？</h3>
                  <p className="text-xs text-slate-400 mt-1 break-all">
                    檔案：<span className="text-slate-200 font-mono">{pendingBackupImport.fileName}</span>
                  </p>
                  <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                    備份時間：{pendingBackupImport.backup.exportedAt}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isImportingBackup && setPendingBackupImport(null)}
                disabled={isImportingBackup}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs font-mono">
              <div className="bg-white/5 rounded-lg p-2.5 border border-white/10 flex justify-between">
                <span className="text-slate-400 font-sans">商品主檔</span>
                <span className="text-white font-bold tabular-nums">{pendingBackupImport.counts.products}</span>
              </div>
              <div className="bg-white/5 rounded-lg p-2.5 border border-white/10 flex justify-between">
                <span className="text-slate-400 font-sans">廠商名單</span>
                <span className="text-white font-bold tabular-nums">{pendingBackupImport.counts.vendors}</span>
              </div>
              <div className="bg-white/5 rounded-lg p-2.5 border border-white/10 flex justify-between">
                <span className="text-slate-400 font-sans">庫存批次</span>
                <span className="text-white font-bold tabular-nums">{pendingBackupImport.counts.stock}</span>
              </div>
              <div className="bg-white/5 rounded-lg p-2.5 border border-white/10 flex justify-between">
                <span className="text-slate-400 font-sans">採購訂單</span>
                <span className="text-white font-bold tabular-nums">{pendingBackupImport.counts.purchaseOrders}</span>
              </div>
              <div className="bg-white/5 rounded-lg p-2.5 border border-white/10 flex justify-between">
                <span className="text-slate-400 font-sans">交易紀錄</span>
                <span className="text-white font-bold tabular-nums">{pendingBackupImport.counts.transactions}</span>
              </div>
              <div className="bg-white/5 rounded-lg p-2.5 border border-white/10 flex justify-between">
                <span className="text-slate-400 font-sans">網路訂單</span>
                <span className="text-white font-bold tabular-nums">{pendingBackupImport.counts.onlineOrders}</span>
              </div>
            </div>

            <div className="bg-sky-500/10 rounded-xl p-3 border border-sky-500/30 flex justify-between items-center text-xs">
              <span className="text-sky-200 flex items-center gap-1.5 font-semibold">
                <ImageIcon className="w-4 h-4 text-sky-400" />
                包含單據照片數量（完整還原留存）
              </span>
              <span className="text-sky-300 font-mono font-bold tabular-nums">{pendingBackupImport.counts.photos} 張</span>
            </div>

            <p className="text-[11px] text-amber-200/80 leading-relaxed bg-amber-500/10 border border-amber-500/25 rounded-xl p-3">
              還原後會覆寫目前這台裝置的本機資料並清空舊的待同步佇列（不會立即蓋掉 Google 試算表）。若要將還原資料寫回雲端試算表，請接著點擊「雲端試算表手動修復」各表的覆寫按鈕。
            </p>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setPendingBackupImport(null)}
                disabled={isImportingBackup}
                className="flex-1 py-2.5 px-4 bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl text-xs font-bold text-zinc-300 transition-colors cursor-pointer disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmImportBackup}
                disabled={isImportingBackup}
                className="flex-1 py-2.5 px-4 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                {isImportingBackup ? '正在還原資料...' : '確認匯入還原本機資料'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
