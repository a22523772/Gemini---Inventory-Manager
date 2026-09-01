import React, { useState, useEffect, useRef } from 'react';
import { PurchaseOrder } from '../lib/db';
import { 
  X, Camera, Upload, Trash2, ExternalLink, Image as ImageIcon, 
  Check, Loader2, Plus, AlertCircle, Eye, RefreshCw, ZoomIn
} from 'lucide-react';
import { optimizeImageForUpload } from '../lib/localOcrEngine';

interface PurchaseOrderPhotoModalProps {
  po: PurchaseOrder | null;
  isOpen: boolean;
  onClose: () => void;
  onSaveImages: (poId: string, newImageUrls: string) => Promise<void>;
  uploadInvoiceImage: (base64Data: string, fileName?: string) => Promise<{ success: boolean; url?: string; viewUrl?: string; fileId?: string; error?: string }>;
  vendorName?: string;
  showToast: (msg: string) => void;
}

export default function PurchaseOrderPhotoModal({
  po,
  isOpen,
  onClose,
  onSaveImages,
  uploadInvoiceImage,
  vendorName,
  showToast
}: PurchaseOrderPhotoModalProps) {
  const [existingUrls, setExistingUrls] = useState<string[]>([]);
  const [newImageFiles, setNewImageFiles] = useState<File[]>([]);
  const [newImagePreviews, setNewImagePreviews] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (po && isOpen) {
      const urls = po.invoice_image_url 
        ? po.invoice_image_url.split('\n').map(u => u.trim()).filter(Boolean)
        : [];
      setExistingUrls(urls);
      setNewImageFiles([]);
      setNewImagePreviews([]);
      setIsUploading(false);
      setUploadProgress('');
      setZoomImageUrl(null);
    }
  }, [po, isOpen]);

  if (!isOpen || !po) return null;

  const handleSelectFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const validImageFiles = fileArray.filter(f => f.type.startsWith('image/'));
    
    if (validImageFiles.length === 0) {
      showToast('❌ 請選擇圖檔格式 (JPG, PNG, WEBP)');
      return;
    }

    const readers = validImageFiles.map(file => {
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(file);
      });
    });

    try {
      const newUrls = await Promise.all(readers);
      setNewImageFiles(prev => [...prev, ...validImageFiles]);
      setNewImagePreviews(prev => [...prev, ...newUrls]);
      showToast(`📸 已加入 ${validImageFiles.length} 張照片，點擊下方「儲存並上傳」即可完成存檔`);
    } catch (err) {
      console.error('Failed to read image files', err);
      showToast('❌ 讀取圖片失敗');
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const pastedFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) pastedFiles.push(file);
      }
    }
    if (pastedFiles.length > 0) {
      handleSelectFiles(pastedFiles);
      showToast(`📋 已貼上剪貼簿照片 (${pastedFiles.length} 張)`);
    }
  };

  const handleRemoveExisting = (indexToRemove: number) => {
    setExistingUrls(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleRemoveNew = (indexToRemove: number) => {
    setNewImageFiles(prev => prev.filter((_, idx) => idx !== indexToRemove));
    setNewImagePreviews(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleSave = async () => {
    if (existingUrls.length === 0 && newImagePreviews.length === 0) {
      if (!window.confirm('目前沒有任何單據照片，確定要清空此採購單的照片存檔嗎？')) {
        return;
      }
    }

    try {
      setIsUploading(true);
      const finalUrls = [...existingUrls];

      if (newImagePreviews.length > 0) {
        for (let i = 0; i < newImagePreviews.length; i++) {
          setUploadProgress(`正在壓縮並上傳新照片 (${i + 1}/${newImagePreviews.length})...`);
          const preview = newImagePreviews[i];
          const optimized = await optimizeImageForUpload(preview);
          const fileName = `PO_${po.po_id}_Doc_${Date.now()}_${i + 1}.jpg`;
          
          const uploadRes = await uploadInvoiceImage(optimized, fileName);
          if (uploadRes.success && uploadRes.url) {
            finalUrls.push(uploadRes.url);
          } else {
            finalUrls.push(optimized);
          }
        }
      }

      const mergedUrlString = finalUrls.join('\n');
      setUploadProgress('正在儲存採購單紀錄...');
      await onSaveImages(po.po_id, mergedUrlString);
      showToast(`✅ 採購單【${po.po_id}】單據照片已成功更新存檔！(共 ${finalUrls.length} 張)`);
      onClose();
    } catch (err: any) {
      console.error('Failed to save purchase order photos', err);
      showToast(`❌ 儲存單據照片失敗: ${err.message || '未知錯誤'}`);
    } finally {
      setIsUploading(false);
      setUploadProgress('');
    }
  };

  const totalPhotosCount = existingUrls.length + newImagePreviews.length;

  return (
    <div 
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[120] flex items-center justify-center p-4 overflow-y-auto"
      onPaste={handlePaste}
    >
      <div className="relative w-full max-w-2xl bg-[#0f172a] border border-white/20 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-slate-900/90 border-b border-white/10 flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Camera className="w-5 h-5 text-sky-400" />
              <h3 className="text-sm font-bold text-white">採購單據照片存檔 / 補傳管理</h3>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                po.status === 'completed' 
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' 
                  : po.status === 'partial'
                  ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
              }`}>
                {po.status === 'completed' ? '已結案' : po.status === 'partial' ? '部分到貨' : '待到貨'}
              </span>
            </div>
            <div className="text-xs text-slate-400 flex items-center gap-2 flex-wrap">
              <span>單號: <strong className="text-slate-200 font-mono">{po.po_id}</strong></span>
              <span>•</span>
              <span>廠商: <strong className="text-slate-200">{vendorName || po.vendor_name || po.vendor_id || '未指定'}</strong></span>
              {po.expected_date && <span>• 預計到貨: {po.expected_date}</span>}
              <span>• 共 {totalPhotosCount} 張照片</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isUploading}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {/* Action buttons to add photos */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-white/[0.03] border border-white/10 rounded-xl">
            <div className="text-xs text-slate-300 font-medium">
              支援已結案單據補拍、多張單據追加、或電腦直接貼上 (Ctrl+V)
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={isUploading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-lg text-xs font-bold shadow-md shadow-sky-500/20 transition-all cursor-pointer disabled:opacity-50"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>📷 拍照</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/15 text-white border border-white/20 rounded-lg text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
              >
                <Upload className="w-3.5 h-3.5 text-sky-400" />
                <span>📁 選取照片 (可多選)</span>
              </button>
            </div>

            {/* Hidden Inputs */}
            <input
              type="file"
              ref={cameraInputRef}
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleSelectFiles(e.target.files);
                }
                e.target.value = '';
              }}
            />
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleSelectFiles(e.target.files);
                }
                e.target.value = '';
              }}
            />
          </div>

          {/* Existing Photos Section */}
          {existingUrls.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                <span className="flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                  已存檔單據照片 ({existingUrls.length} 張)
                </span>
                <span className="text-[11px] text-slate-500">點擊圖片可放大檢視</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {existingUrls.map((url, idx) => (
                  <div 
                    key={idx} 
                    className="group relative bg-black/40 border border-white/10 rounded-xl overflow-hidden aspect-[4/3] flex flex-col justify-between"
                  >
                    <img
                      src={url}
                      alt={`Saved Invoice ${idx + 1}`}
                      className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-200"
                      onClick={() => setZoomImageUrl(url)}
                    />
                    {/* Hover Overlay Controls */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2 pointer-events-none">
                      <button
                        type="button"
                        onClick={() => setZoomImageUrl(url)}
                        className="pointer-events-auto p-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs flex items-center gap-1"
                        title="放大檢視"
                      >
                        <ZoomIn className="w-4 h-4" />
                      </button>
                      {url.startsWith('http') && (
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="pointer-events-auto p-1.5 bg-sky-500/40 hover:bg-sky-500/60 text-sky-200 rounded-lg text-xs"
                          title="在 Google Drive 開啟"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveExisting(idx)}
                        className="pointer-events-auto p-1.5 bg-red-500/40 hover:bg-red-500/60 text-red-200 rounded-lg text-xs"
                        title="移除此張照片"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="absolute bottom-1 left-1.5 px-1.5 py-0.5 bg-black/70 rounded text-[10px] font-mono text-slate-300">
                      第 {idx + 1} 張
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* New / Pending Upload Photos Section */}
          {newImagePreviews.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-white/10">
              <div className="flex items-center justify-between text-xs font-bold text-sky-300">
                <span className="flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5 text-sky-400" />
                  本次新增待上傳照片 ({newImagePreviews.length} 張)
                </span>
                <span className="text-[11px] text-amber-300">尚未儲存，請點擊下方儲存鈕</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {newImagePreviews.map((preview, idx) => (
                  <div 
                    key={idx} 
                    className="group relative bg-sky-950/20 border border-sky-500/40 rounded-xl overflow-hidden aspect-[4/3]"
                  >
                    <img
                      src={preview}
                      alt={`New Upload Preview ${idx + 1}`}
                      className="w-full h-full object-cover cursor-pointer"
                      onClick={() => setZoomImageUrl(preview)}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveNew(idx)}
                      className="absolute top-1.5 right-1.5 p-1 bg-black/70 hover:bg-red-600 text-white rounded-lg transition-colors cursor-pointer"
                      title="移除"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <div className="absolute bottom-1 left-1.5 px-1.5 py-0.5 bg-sky-600/80 rounded text-[10px] font-mono text-white font-bold">
                      新增 +{idx + 1}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {totalPhotosCount === 0 && (
            <div className="py-10 text-center space-y-3 bg-white/[0.02] border border-dashed border-white/15 rounded-xl">
              <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-slate-400">
                <Camera className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-slate-300">尚未上傳任何進貨單據、發票或送貨單照片</p>
                <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                  已結案之採購單亦可隨時拍照或補傳單據，上傳後將永久留存並同步備份至雲端。
                </p>
              </div>
              <div className="flex items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>立即拍照</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/15 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>選取檔案</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-900 border-t border-white/10 flex items-center justify-between flex-wrap gap-2">
          <div className="text-xs text-slate-400">
            {uploadProgress ? (
              <span className="text-sky-300 font-bold flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {uploadProgress}
              </span>
            ) : (
              <span>共保留 {totalPhotosCount} 張單據照片存檔</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-bold border border-white/10 transition-colors disabled:opacity-50 cursor-pointer"
            >
              取消
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={isUploading}
              className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-600/25 transition-all disabled:opacity-50 cursor-pointer"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>儲存上傳中...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>💾 儲存並更新單據照片</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Full Image Zoom Modal */}
      {zoomImageUrl && (
        <div 
          className="fixed inset-0 bg-black/95 z-[130] flex items-center justify-center p-4"
          onClick={() => setZoomImageUrl(null)}
        >
          <div className="relative max-w-5xl max-h-[95vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-2 text-white">
              <span className="text-xs text-slate-300 font-bold">單據檢視</span>
              <button
                type="button"
                onClick={() => setZoomImageUrl(null)}
                className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <img
              src={zoomImageUrl}
              alt="Zoomed document"
              className="max-h-[85vh] w-auto object-contain rounded-xl shadow-2xl border border-white/20"
            />
          </div>
        </div>
      )}
    </div>
  );
}
