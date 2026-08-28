import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { Product, PurchaseOrder, PurchaseOrderItem, Vendor } from '../lib/db';
import { performLocalInvoiceOcr, calculateSimilarity, optimizeImageForUpload } from '../lib/localOcrEngine';
import { format } from 'date-fns';
import { 
  Truck, Camera, Plus, Search, CheckCircle2, Clock, 
  AlertTriangle, Trash2, Edit3, Eye, FileText, Upload, 
  RefreshCw, X, ArrowRight, Check, Sparkles, Building2, 
  Layers, Package, DollarSign, Calendar, ChevronRight, ChevronDown,
  ExternalLink, ZoomIn, ZoomOut, AlertCircle, ShoppingCart, Zap, Cpu,
  CheckCheck
} from 'lucide-react';
import { cn } from '../lib/utils';
import SearchableProductCombobox from '../components/SearchableProductCombobox';
import StorageLocationSelector from '../components/StorageLocationSelector';
import EditPurchaseOrderModal from '../components/EditPurchaseOrderModal';

interface ScannedInvoiceItem {
  temp_id: string;
  product_id: string;
  product_name: string;
  matched_system_product?: Product;
  specification: string;
  quantity: number;
  cost_price: number;
  location: string;
  floor: string;
  area: string;
  expiry_date?: string;
  note?: string;
}

export default function Purchases() {
  const { 
    products, 
    stock, 
    vendors, 
    transactions,
    purchaseOrders, 
    isLoading, 
    gasApiUrl,
    addPurchaseOrder, 
    updatePurchaseOrder, 
    deletePurchaseOrder,
    batchStockInFromInvoice,
    uploadInvoiceImage,
    fetchPurchaseOrders,
    addVendor,
    operator,
    showToast 
  } = useStore();

  const [activeTab, setActiveTab] = useState<'list' | 'scan' | 'create'>('list');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'pending' | 'partial' | 'completed' | 'cancelled'>('ALL');
  const [vendorFilter, setVendorFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Image preview modal
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Detail / Edit PO Modal
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [isEditingPO, setIsEditingPO] = useState(false);

  // --- OCR / Scanner States ---
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanEngineType, setScanEngineType] = useState<'local' | 'ai'>('local');
  const [ocrProgressText, setOcrProgressText] = useState<string>('');
  const [ocrProgressPercent, setOcrProgressPercent] = useState<number>(0);
  const [ocrEngineUsed, setOcrEngineUsed] = useState<'local' | 'ai' | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [showConfirmPanel, setShowConfirmPanel] = useState<boolean>(false);

  // Confirmation Panel Data
  const [confirmVendorName, setConfirmVendorName] = useState<string>('');
  const [confirmVendorId, setConfirmVendorId] = useState<string>('');
  const [isConfirmCustomVendor, setIsConfirmCustomVendor] = useState<boolean>(false);
  const [confirmInvoiceNumber, setConfirmInvoiceNumber] = useState<string>('');
  const [confirmInvoiceDate, setConfirmInvoiceDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [confirmSelectedPOId, setConfirmSelectedPOId] = useState<string>('');
  const [confirmIsCloseRemainingPO, setConfirmIsCloseRemainingPO] = useState<boolean>(false);
  const [confirmItems, setConfirmItems] = useState<ScannedInvoiceItem[]>([]);
  const [confirmImageUrl, setConfirmImageUrl] = useState<string>('');
  const [isSavingStockIn, setIsSavingStockIn] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // --- Create PO Form States ---
  const [newPOVendorId, setNewPOVendorId] = useState<string>('');
  const [newPOVendorName, setNewPOVendorName] = useState<string>('');
  const [isNewPOCustomVendor, setIsNewPOCustomVendor] = useState<boolean>(false);
  const [newPOExpectedDate, setNewPOExpectedDate] = useState<string>('');
  const [newPONote, setNewPONote] = useState<string>('');
  const [newPOItems, setNewPOItems] = useState<Array<{
    temp_id: string;
    product_id: string;
    name: string;
    specification: string;
    ordered_quantity: number;
    cost_price: number;
    note: string;
  }>>([]);
  const [productSearchTerm, setProductSearchTerm] = useState<string>('');

  // Map for quick vendor lookup
  const vendorMap = useMemo(() => {
    const map = new Map<string, string>();
    vendors.forEach(v => map.set(v.vendor_id, v.vendor_name || v.name || v.vendor_id));
    return map;
  }, [vendors]);

  // Aggregate all known vendors from vendors store, products, transactions, and existing purchase orders
  const allKnownVendors = useMemo(() => {
    const map = new Map<string, { vendor_id: string; vendor_name: string }>();
    
    // 1. From store vendors
    (vendors || []).forEach(v => {
      const name = (v.vendor_name || v.name || v.vendor_id || '').trim();
      const id = (v.vendor_id || name).trim();
      if (name) {
        map.set(name.toLowerCase(), { vendor_id: id, vendor_name: name });
      }
    });

    // 2. From products
    (products || []).forEach(p => {
      const rawVendor = (p.vendor_id || (p as any).vendor_name || (p as any).vendor || '').trim();
      if (rawVendor) {
        const resolvedName = vendorMap.get(rawVendor) || rawVendor;
        if (resolvedName && !map.has(resolvedName.toLowerCase())) {
          map.set(resolvedName.toLowerCase(), { vendor_id: rawVendor, vendor_name: resolvedName });
        }
      }
    });

    // 3. From transactions
    (transactions || []).forEach(t => {
      const vName = ((t as any).vendor || (t as any).vendor_name || '').trim();
      if (vName && !map.has(vName.toLowerCase())) {
        map.set(vName.toLowerCase(), { vendor_id: vName, vendor_name: vName });
      }
    });

    // 4. From purchase orders
    (purchaseOrders || []).forEach(po => {
      const name = (po.vendor_name || po.vendor_id || '').trim();
      const id = (po.vendor_id || name).trim();
      if (name && !map.has(name.toLowerCase())) {
        map.set(name.toLowerCase(), { vendor_id: id, vendor_name: name });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.vendor_name.localeCompare(b.vendor_name, 'zh-Hant'));
  }, [vendors, products, transactions, purchaseOrders, vendorMap]);

  // Map for quick product stock / location lookup
  const productDefaultLocationMap = useMemo(() => {
    const map = new Map<string, { location: string; floor: string; area: string }>();
    stock.forEach(s => {
      if (s.product_id && !map.has(s.product_id)) {
        map.set(s.product_id, {
          location: s.location || '倉庫',
          floor: s.floor || '1F',
          area: s.area || 'A區'
        });
      }
    });
    return map;
  }, [stock]);

  // Unique storage locations, floors, and areas across stock and transactions
  const uniqueLocations = useMemo(() => {
    const locSet = new Set<string>(['倉庫', '門市', '展示區', '台北倉', '台中倉']);
    stock.forEach(s => s.location && locSet.add(s.location));
    transactions.forEach(t => t.location && locSet.add(t.location));
    return Array.from(locSet).filter(Boolean);
  }, [stock, transactions]);

  const uniqueFloors = useMemo(() => {
    const floorSet = new Set<string>(['1F', '2F', '3F', '4F', 'B1']);
    stock.forEach(s => s.floor && floorSet.add(s.floor));
    transactions.forEach(t => t.floor && floorSet.add(t.floor));
    return Array.from(floorSet).filter(Boolean);
  }, [stock, transactions]);

  const uniqueAreas = useMemo(() => {
    const areaSet = new Set<string>(['A區', 'B區', 'C區', 'D區', 'E區', '暫存區']);
    stock.forEach(s => s.area && areaSet.add(s.area));
    transactions.forEach(t => t.area && areaSet.add(t.area));
    return Array.from(areaSet).filter(Boolean);
  }, [stock, transactions]);

  // Overall Statistics
  const stats = useMemo(() => {
    let pendingCount = 0;
    let partialCount = 0;
    let completedCount = 0;
    let totalOnOrderUnits = 0;

    purchaseOrders.forEach(po => {
      if (po.status === 'pending') pendingCount++;
      else if (po.status === 'partial') partialCount++;
      else if (po.status === 'completed') completedCount++;

      if (po.status === 'pending' || po.status === 'partial') {
        (po.items || []).forEach(it => {
          const remaining = Math.max(0, Number(it.ordered_quantity || 0) - Number(it.received_quantity || 0));
          totalOnOrderUnits += remaining;
        });
      }
    });

    return { pendingCount, partialCount, completedCount, totalOnOrderUnits };
  }, [purchaseOrders]);

  // Filtered PO list
  const filteredPOs = useMemo(() => {
    return purchaseOrders.filter(po => {
      if (statusFilter !== 'ALL' && po.status !== statusFilter) return false;
      if (vendorFilter !== 'ALL') {
        const vMatch = po.vendor_id === vendorFilter || po.vendor_name === vendorFilter;
        if (!vMatch) return false;
      }
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const poIdMatch = po.po_id.toLowerCase().includes(term);
        const vNameMatch = (po.vendor_name || '').toLowerCase().includes(term);
        const noteMatch = (po.note || '').toLowerCase().includes(term);
        const itemMatch = (po.items || []).some(it => 
          (it.name || '').toLowerCase().includes(term) || 
          (it.product_id || '').toLowerCase().includes(term) ||
          (it.specification || '').toLowerCase().includes(term)
        );
        if (!poIdMatch && !vNameMatch && !noteMatch && !itemMatch) return false;
      }
      return true;
    });
  }, [purchaseOrders, statusFilter, vendorFilter, searchTerm]);

  // --- Handlers for Image Upload / Camera ---
  const handleSelectImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast('❌ 請選擇圖檔格式 (JPG, PNG, WEBP)');
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);
    setScanError(null);
  };

  const handlePasteImage = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          handleSelectImageFile(file);
          showToast('📋 已貼上剪貼簿圖片！');
          break;
        }
      }
    }
  };

  // Helper to map and populate scanned result into confirmation panel
  const populateScannedData = (data: any, engine: 'local' | 'ai') => {
    // 1. Match recognized vendor with existing vendors
    let detectedVendorId = data.vendor_id || '';
    const recognizedVendorName = data.vendor_name || '';
    if (!detectedVendorId && recognizedVendorName) {
      const matchedV = vendors.find(v => {
        const vName = v.vendor_name || v.name || '';
        return vName.toLowerCase().includes(recognizedVendorName.toLowerCase()) || 
               recognizedVendorName.toLowerCase().includes(vName.toLowerCase());
      });
      if (matchedV) {
        detectedVendorId = matchedV.vendor_id;
      }
    }

    // 2. Transform items and match with existing products
    const parsedItems: ScannedInvoiceItem[] = (data.items || []).map((it: any, idx: number) => {
      const rawName = String(it.raw_product_name || it.product_name || it.matched_product_name || it.name || '').trim();
      const rawSpec = String(it.specification || '').trim();
      const qty = Number(it.quantity) || 1;
      const price = Number(it.cost_price) || 0;

      // Try to match existing system product by ID, name, or barcode
      let matchedP = it.matched_product_id ? products.find(p => p.product_id === it.matched_product_id) : undefined;
      if (!matchedP) {
        matchedP = products.find(p => p.name && (p.name.toLowerCase() === rawName.toLowerCase() || rawName.toLowerCase().includes(p.name.toLowerCase())));
      }
      if (!matchedP && it.barcode) {
        matchedP = products.find(p => p.barcode === it.barcode);
      }

      const pid = matchedP ? matchedP.product_id : (it.product_id || `TEMP_${Date.now()}_${idx}`);
      const prodName = matchedP ? matchedP.name : rawName;
      const finalSpec = rawSpec || (matchedP?.specification || '');
      const defLoc = matchedP ? productDefaultLocationMap.get(matchedP.product_id) : undefined;

      return {
        temp_id: `ITEM_${Date.now()}_${idx}`,
        product_id: pid,
        product_name: prodName,
        matched_system_product: matchedP,
        specification: finalSpec,
        quantity: qty,
        cost_price: price || (matchedP?.cost_price || 0),
        location: defLoc?.location || '倉庫',
        floor: defLoc?.floor || '1F',
        area: defLoc?.area || 'A區',
        expiry_date: it.expiry_date || '',
        note: it.note || ''
      };
    });

    // 3. Pre-select matching PO if any
    let matchedPOId = '';
    if (detectedVendorId || recognizedVendorName) {
      const candidatePO = purchaseOrders.find(po => 
        (po.status === 'pending' || po.status === 'partial') &&
        (po.vendor_id === detectedVendorId || (po.vendor_name && po.vendor_name.includes(recognizedVendorName)))
      );
      if (candidatePO) {
        matchedPOId = candidatePO.po_id;
      }
    }

    setConfirmVendorName(recognizedVendorName);
    setConfirmVendorId(detectedVendorId);
    setConfirmInvoiceNumber(data.invoice_number || '');
    setConfirmInvoiceDate(data.invoice_date || format(new Date(), 'yyyy-MM-dd'));
    setConfirmSelectedPOId(matchedPOId);
    setConfirmItems(parsedItems);
    setConfirmImageUrl(imagePreviewUrl || '');
    setOcrEngineUsed(engine);
    setShowConfirmPanel(true);
  };

  // Perform Local Offline OCR on the selected image (Tesseract.js + Canvas pre-processing + Local Fuzzy Matching)
  const handleStartLocalOCR = async () => {
    if (!imagePreviewUrl) {
      showToast('請先拍攝或選擇進貨單據圖片');
      return;
    }

    setIsScanning(true);
    setScanEngineType('local');
    setScanError(null);
    setOcrProgressText('正在初始化本地離線 OCR 引擎...');
    setOcrProgressPercent(5);

    try {
      const result = await performLocalInvoiceOcr(
        imagePreviewUrl,
        products,
        vendors,
        (status, percent) => {
          setOcrProgressText(status);
          setOcrProgressPercent(percent);
        }
      );

      if (!result.items || result.items.length === 0) {
        // If local engine couldn't detect clear rows, notify user they can switch to AI
        setScanError('本地離線引擎未能辨識出清晰的品項表格（可能因手寫筆跡或折痕干擾）。建議點擊「✨ 雲端 AI 深度解析」獲取更高精度辨識。');
        showToast('⚠️ 本地辨識品項較少，可改用雲端 AI 深度解析');
      }

      populateScannedData(result, 'local');
      showToast('⚡ 本地離線辨識完成！已自動比對商品資料庫');
    } catch (err: any) {
      console.error("Local OCR Error:", err);
      setScanError(`本地離線辨識異常: ${err.message || '未知錯誤'}。您可以直接改用「✨ 雲端 AI 深度解析」。`);
      showToast(`❌ 本地辨識異常，請嘗試改用雲端 AI`);
    } finally {
      setIsScanning(false);
      setOcrProgressText('');
      setOcrProgressPercent(0);
    }
  };

  // Perform Cloud AI (Gemini) OCR on the selected image
  const handleStartAIOCR = async () => {
    if (!imagePreviewUrl) {
      showToast('請先拍攝或選擇進貨單據圖片');
      return;
    }

    setIsScanning(true);
    setScanEngineType('ai');
    setScanError(null);
    setOcrProgressText('正在壓縮影像以最佳化傳輸速度...');
    setOcrProgressPercent(15);

    try {
      // Optimize image before API call to reduce latency and prevent timeouts
      const base64Data = await optimizeImageForUpload(imagePreviewUrl);

      setOcrProgressText('正在呼叫 Google Gemini 雲端多模態視覺 AI 深度解析...');
      setOcrProgressPercent(40);

      // System Prompt logic
      const sysPrompt = `
      你是一個高精準的進貨單/採購單解析系統。
      請辨識提供的圖片，並回傳格式為 JSON。
      
      已知系統廠商：
      ${JSON.stringify(vendors.map(v => ({ vendor_id: v.vendor_id, vendor_name: v.vendor_name || v.name || '' })))}
      
      已知系統商品 (輔助比對，優先使用 name、specification 對應)：
      ${JSON.stringify(products.map(p => ({ product_id: p.product_id, name: p.name, specification: p.specification || '', cost_price: p.cost_price || 0, vendor_id: p.vendor_id || '' })))}
      
      請盡最大努力從圖片中提取：
      1. 單據日期 (invoice_date, YYYY-MM-DD 格式，若無則留空)
      2. 廠商名稱 (vendor_name) 與 對應的廠商 ID (vendor_id)
      3. 商品項目清單 (items): 
          - product_name (單據上的品名)
          - specification (單據上的規格，若無則留空)
          - quantity (數量，數字)
          - cost_price (單價/進價，數字)
          - product_id (嘗試對應已知系統商品ID，若無則留空)
      
      請確保回傳純 JSON 格式字串，不可包含 Markdown 語法 (如 \`\`\`json) 也不要包含額外說明。
      格式範例：
      {
        "invoice_date": "2024-03-25",
        "vendor_name": "ABC 廠商",
        "vendor_id": "V001",
        "items": [
           { "product_name": "商品A", "specification": "紅色", "quantity": 10, "cost_price": 100, "product_id": "P001" }
        ]
      }
      `;

      let rawText = '';
      try {
        const { scanInvoiceOCR } = await import('../lib/geminiClient');
        rawText = await scanInvoiceOCR(base64Data, sysPrompt);
      } catch (geminiError: any) {
        // Handle specific error for missing key
        if (geminiError.message && geminiError.message.includes('未設定')) {
          setScanError('尚未設定 AI 金鑰，請先至設定頁面完成設定。');
          showToast('尚未設定 Gemini API 金鑰');
          return;
        }
        throw new Error(geminiError.message || "AI 辨識失敗");
      }

      setOcrProgressPercent(85);

      // Clean up markdown wrapping if present
      rawText = rawText.trim();
      if (rawText.startsWith('```json')) rawText = rawText.replace(/^```json/, '');
      if (rawText.startsWith('```')) rawText = rawText.replace(/^```/, '');
      if (rawText.endsWith('```')) rawText = rawText.replace(/```$/, '');
      rawText = rawText.trim();

      let parsedData: any = null;
      try {
        parsedData = JSON.parse(rawText);
      } catch {
        throw new Error('回傳格式不正確，請稍後重試。');
      }

      if (!parsedData || !parsedData.items || parsedData.items.length === 0) {
        throw new Error('無法從單據中辨識出商品，請確認圖片是否清晰。');
      }

      populateScannedData(parsedData, 'ai');
      showToast('✨ 雲端 AI 單據深度解析成功！');
    } catch (err: any) {
      console.error("AI OCR Error:", err);
      const errMsg = err.message || 'AI 辨識失敗，請檢查照片清晰度或改用本地快速辨識。';
      setScanError(errMsg);
      showToast(`❌ ${errMsg}`);
    } finally {
      setIsScanning(false);
      setOcrProgressText('');
      setOcrProgressPercent(0);
    }
  };

  // Execute Batch Stock In from confirmation panel
  const handleExecuteStockIn = async () => {
    if (confirmItems.length === 0) {
      showToast('❌ 請至少保留一項進貨商品！');
      return;
    }

    setIsSavingStockIn(true);
    try {
      // 1. Upload photo to Google Drive (if configured) or keep base64
      let finalImageUrl = confirmImageUrl;
      if (confirmImageUrl.startsWith('data:image')) {
        const uploadRes = await uploadInvoiceImage(confirmImageUrl, `Invoice_${confirmInvoiceNumber || Date.now()}.jpg`);
        if (uploadRes.success && uploadRes.url) {
          finalImageUrl = uploadRes.url;
        }
      }

      // 2. Format items for stock-in
      const itemsToStockIn = confirmItems.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        specification: item.specification,
        quantity: item.quantity,
        cost_price: item.cost_price,
        vendor_id: confirmVendorId,
        location: item.location,
        floor: item.floor,
        area: item.area,
        expiry_date: item.expiry_date,
        note: item.note
      }));

      // 3. Batch stock in & update PO status
      await batchStockInFromInvoice({
        items: itemsToStockIn,
        po_id: confirmSelectedPOId || undefined,
        invoice_number: confirmInvoiceNumber,
        invoice_image_url: finalImageUrl,
        is_close_remaining_po: confirmIsCloseRemainingPO
      });

      // 4. Reset states & return to list
      setShowConfirmPanel(false);
      setImageFile(null);
      setImagePreviewUrl(null);
      setActiveTab('list');
    } catch (err: any) {
      console.error("Stock in error:", err);
      showToast(`❌ 入庫失敗: ${err.message}`);
    } finally {
      setIsSavingStockIn(false);
    }
  };

  // Launch confirmation panel directly from an existing PO for manual delivery verification
  const handleStartCheckInForPO = (po: PurchaseOrder) => {
    setConfirmVendorId(po.vendor_id || '');
    setConfirmVendorName(po.vendor_name || vendorMap.get(po.vendor_id || '') || '');
    setConfirmInvoiceNumber('');
    setConfirmInvoiceDate(format(new Date(), 'yyyy-MM-dd'));
    setConfirmSelectedPOId(po.po_id);
    setConfirmImageUrl(po.invoice_image_url || '');

    const checkInItems: ScannedInvoiceItem[] = (po.items || []).map((it, idx) => {
      const remaining = Math.max(0, Number(it.ordered_quantity || 0) - Number(it.received_quantity || 0));
      const defLoc = productDefaultLocationMap.get(it.product_id);
      const matchedP = products.find(p => p.product_id === it.product_id);

      return {
        temp_id: `PO_CHK_${Date.now()}_${idx}`,
        product_id: it.product_id,
        product_name: it.name,
        matched_system_product: matchedP,
        specification: it.specification || '',
        quantity: remaining > 0 ? remaining : it.ordered_quantity,
        cost_price: it.cost_price || matchedP?.cost_price || 0,
        location: defLoc?.location || '倉庫',
        floor: defLoc?.floor || '1F',
        area: defLoc?.area || 'A區',
        note: it.note || ''
      };
    });

    setConfirmItems(checkInItems);
    setShowConfirmPanel(true);
  };

  // Handlers for creating manual PO
  const handleAddProductToNewPO = (p: Product) => {
    if (newPOItems.some(it => it.product_id === p.product_id)) {
      showToast('⚠️ 該商品已在採購清單中');
      return;
    }
    setNewPOItems(prev => [
      ...prev,
      {
        temp_id: `NEW_PO_ITEM_${Date.now()}`,
        product_id: p.product_id,
        name: p.name,
        specification: p.specification || '',
        ordered_quantity: 1,
        cost_price: Number(p.cost_price) || 0,
        note: ''
      }
    ]);
    if (!newPOVendorName && !newPOVendorId && p.vendor_id) {
      const vName = vendorMap.get(p.vendor_id) || p.vendor_id;
      setNewPOVendorId(p.vendor_id);
      setNewPOVendorName(vName);
    }
  };

  const handleSaveNewPO = async () => {
    if (newPOItems.length === 0) {
      showToast('❌ 請至少新增一項採購商品！');
      return;
    }

    let finalVendorName = (newPOVendorName || '').trim() || (newPOVendorId || '').trim();
    if (!finalVendorName) {
      showToast('❌ 請選擇或填寫供應商！');
      return;
    }

    const matchedVendor = allKnownVendors.find(v => 
      v.vendor_name.toLowerCase() === finalVendorName.toLowerCase() || 
      v.vendor_id === finalVendorName
    );

    const finalVendorId = matchedVendor ? matchedVendor.vendor_id : (newPOVendorId.trim() || `V_${Date.now().toString().slice(-6)}`);
    finalVendorName = matchedVendor ? matchedVendor.vendor_name : finalVendorName;

    // Automatically register new vendor to store if not exists
    if (!vendors.some(v => (v.vendor_name || v.name || '').toLowerCase() === finalVendorName.toLowerCase())) {
      try {
        await addVendor({
          vendor_id: finalVendorId,
          vendor_name: finalVendorName,
          contact: '',
          phone: ''
        });
      } catch (err) {
        console.warn("Auto add vendor notice:", err);
      }
    }

    const poItems: PurchaseOrderItem[] = newPOItems.map(it => ({
      product_id: it.product_id,
      product_name: it.name,
      name: it.name,
      specification: it.specification,
      ordered_quantity: Number(it.ordered_quantity) || 1,
      received_quantity: 0,
      cost_price: Number(it.cost_price) || 0,
      note: it.note
    }));

    await addPurchaseOrder({
      po_id: `PO_${format(new Date(), 'yyyyMMdd')}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      vendor_id: finalVendorId,
      vendor_name: finalVendorName,
      status: 'pending',
      order_date: format(new Date(), 'yyyy-MM-dd'),
      expected_date: newPOExpectedDate || undefined,
      note: newPONote,
      operator: operator || 'admin',
      items: poItems
    });

    showToast('✅ 已成功建立採購訂單並登記在途庫存！');

    // Reset create form
    setNewPOVendorId('');
    setNewPOVendorName('');
    setNewPOExpectedDate('');
    setNewPONote('');
    setNewPOItems([]);
    setActiveTab('list');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Header & Overview Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-gradient-to-r from-sky-950/40 via-[#0d1322] to-indigo-950/30 p-5 rounded-2xl border border-sky-500/20 shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/20 shrink-0">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white flex items-center gap-2">
              採購與進貨管理
              <span className="text-xs font-bold px-2 py-0.5 bg-sky-500/20 text-sky-400 rounded-full border border-sky-500/30">
                在途庫存 & AI 單據辨識
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              追蹤供應商訂貨在途狀態避免重複下單，並可拍照單據自動執行驗收入庫
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {gasApiUrl && (
            <button
              onClick={() => fetchPurchaseOrders()}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
              title="重新載入雲端採購單"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 text-sky-400", isLoading && "animate-spin")} />
              <span>重新同步</span>
            </button>
          )}

          <button
            onClick={() => setActiveTab('create')}
            className={cn(
              "flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-md",
              activeTab === 'create'
                ? "bg-indigo-600 text-white shadow-indigo-600/25"
                : "bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30"
            )}
          >
            <Plus className="w-4 h-4" />
            <span>建立採購單</span>
          </button>

          <button
            onClick={() => setActiveTab('scan')}
            className={cn(
              "flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all shadow-md",
              activeTab === 'scan'
                ? "bg-sky-500 text-slate-950 shadow-sky-500/30"
                : "bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30"
            )}
          >
            <Camera className="w-4 h-4 text-sky-400" />
            <span>拍照/辨識單據進貨</span>
          </button>
        </div>
      </div>

      {/* Metric Indicators */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#0f172a] p-4 rounded-xl border border-white/10 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">採購在途總數量</span>
            <div className="text-2xl font-black text-sky-400 mt-0.5">{stats.totalOnOrderUnits} <span className="text-xs font-normal text-slate-400">件</span></div>
          </div>
          <div className="p-2.5 bg-sky-500/10 rounded-xl text-sky-400">
            <Package className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#0f172a] p-4 rounded-xl border border-white/10 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">待驗收到貨訂單</span>
            <div className="text-2xl font-black text-amber-400 mt-0.5">{stats.pendingCount} <span className="text-xs font-normal text-slate-400">單</span></div>
          </div>
          <div className="p-2.5 bg-amber-500/10 rounded-xl text-amber-400">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#0f172a] p-4 rounded-xl border border-white/10 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">部分到貨訂單</span>
            <div className="text-2xl font-black text-indigo-400 mt-0.5">{stats.partialCount} <span className="text-xs font-normal text-slate-400">單</span></div>
          </div>
          <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-400">
            <AlertCircle className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#0f172a] p-4 rounded-xl border border-white/10 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">已完成結案</span>
            <div className="text-2xl font-black text-emerald-400 mt-0.5">{stats.completedCount} <span className="text-xs font-normal text-slate-400">單</span></div>
          </div>
          <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="flex border-b border-white/10 gap-2">
        <button
          onClick={() => setActiveTab('list')}
          className={cn(
            "flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-2 transition-all cursor-pointer",
            activeTab === 'list'
              ? "border-sky-500 text-sky-400 bg-sky-500/5"
              : "border-transparent text-slate-400 hover:text-slate-200"
          )}
        >
          <FileText className="w-4 h-4" />
          <span>採購訂單與在途追蹤 ({purchaseOrders.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('scan')}
          className={cn(
            "flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-2 transition-all cursor-pointer",
            activeTab === 'scan'
              ? "border-sky-500 text-sky-400 bg-sky-500/5"
              : "border-transparent text-slate-400 hover:text-slate-200"
          )}
        >
          <Camera className="w-4 h-4" />
          <span>📷 拍照 / 智慧單據辨識</span>
        </button>

        <button
          onClick={() => setActiveTab('create')}
          className={cn(
            "flex items-center gap-2 px-5 py-3 text-sm font-bold border-b-2 transition-all cursor-pointer",
            activeTab === 'create'
              ? "border-sky-500 text-sky-400 bg-sky-500/5"
              : "border-transparent text-slate-400 hover:text-slate-200"
          )}
        >
          <Plus className="w-4 h-4" />
          <span>➕ 建立新採購單</span>
        </button>
      </div>

      {/* TAB 1: PURCHASE ORDERS LIST */}
      {activeTab === 'list' && (
        <div className="space-y-4">
          {/* Filters & Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#0f172a] p-3 rounded-xl border border-white/10">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="搜尋單號、品名、廠商、備註..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-[#1e293b] border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
              >
                <option value="ALL">全部狀態 ({purchaseOrders.length})</option>
                <option value="pending">待到貨 ({stats.pendingCount})</option>
                <option value="partial">部分到貨 ({stats.partialCount})</option>
                <option value="completed">已完成 ({stats.completedCount})</option>
                <option value="cancelled">已取消</option>
              </select>

              <select
                value={vendorFilter}
                onChange={(e) => setVendorFilter(e.target.value)}
                className="bg-[#1e293b] border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500 max-w-[180px] truncate"
              >
                <option value="ALL">所有供應商 ({allKnownVendors.length})</option>
                {allKnownVendors.map(v => (
                  <option key={v.vendor_id} value={v.vendor_id}>{v.vendor_name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Orders Cards / Table */}
          {filteredPOs.length === 0 ? (
            <div className="text-center py-16 bg-[#0f172a] rounded-2xl border border-white/10 space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-white/5 flex items-center justify-center text-slate-500">
                <Truck className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-300">尚無符合條件的採購訂貨紀錄</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                您可以點擊「建立新採購單」登記向廠商訂購的商品，或者使用「拍照進貨」直接辨識單據並入庫。
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredPOs.map((po) => {
                const totalOrdered = (po.items || []).reduce((acc, it) => acc + Number(it.ordered_quantity || 0), 0);
                const totalReceived = (po.items || []).reduce((acc, it) => acc + Number(it.received_quantity || 0), 0);
                const remainingOnOrder = Math.max(0, totalOrdered - totalReceived);
                const totalCost = (po.items || []).reduce((acc, it) => acc + (Number(it.ordered_quantity || 0) * Number(it.cost_price || 0)), 0);

                return (
                  <div
                    key={po.po_id}
                    className="bg-[#0f172a] border border-white/10 rounded-2xl p-4 sm:p-5 space-y-4 hover:border-sky-500/30 transition-all"
                  >
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/5">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="font-mono text-sm font-extrabold text-sky-400 bg-sky-500/10 px-2.5 py-1 rounded-lg border border-sky-500/20">
                          {po.po_id}
                        </span>

                        <div className="flex items-center gap-1.5 text-xs text-slate-300 font-bold">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>{po.vendor_name || vendorMap.get(po.vendor_id || '') || '未指定供應商'}</span>
                        </div>

                        <span className={cn(
                          "text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border",
                          po.status === 'pending' ? "bg-amber-500/20 text-amber-300 border-amber-500/30" :
                          po.status === 'partial' ? "bg-indigo-500/20 text-indigo-300 border-indigo-500/30 animate-pulse" :
                          po.status === 'completed' ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" :
                          "bg-zinc-500/20 text-zinc-300 border-zinc-500/30"
                        )}>
                          {po.status === 'pending' ? '待到貨 (在途中)' :
                           po.status === 'partial' ? '部分到貨 (繼續在途)' :
                           po.status === 'completed' ? '已全數到貨 / 結案' : '已取消'}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {po.invoice_image_url && (
                          <button
                            onClick={() => setPreviewImage(po.invoice_image_url!)}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-sky-300 rounded-lg text-xs font-bold border border-white/10"
                            title="查看進貨單據原圖"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            <span>單據照片</span>
                          </button>
                        )}

                        {/* Quick Status Selector */}
                        <select
                          value={po.status}
                          onChange={async (e) => {
                            const newStatus = e.target.value as any;
                            await updatePurchaseOrder(po.po_id, { status: newStatus });
                            showToast(`已將採購單 ${po.po_id} 狀態更新為【${newStatus === 'completed' ? '已結案' : newStatus === 'partial' ? '部分到貨' : newStatus === 'cancelled' ? '已取消' : '待到貨'}】`);
                          }}
                          className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold px-2.5 py-1.5 text-slate-200 cursor-pointer"
                          title="快速變更採購單狀態"
                        >
                          <option value="pending" className="bg-slate-900 text-sky-400">待到貨</option>
                          <option value="partial" className="bg-slate-900 text-amber-400">部分到貨</option>
                          <option value="completed" className="bg-slate-900 text-emerald-400">已結案</option>
                          <option value="cancelled" className="bg-slate-900 text-slate-400">已取消</option>
                        </select>

                        {/* Quick Close Button */}
                        {po.status !== 'completed' && (
                          <button
                            onClick={async () => {
                              if (window.confirm(`確定要將採購單 ${po.po_id} 標記為結案嗎？\n（若不再進貨，結案後將清除剩餘 ${remainingOnOrder} 件未到的在途庫存）`)) {
                                await updatePurchaseOrder(po.po_id, { status: 'completed' });
                                showToast(`✅ 採購單 ${po.po_id} 已成功結案！`);
                              }
                            }}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-bold transition-all cursor-pointer"
                            title="直接將此採購單結案（清除在途庫存）"
                          >
                            <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                            <span>結案</span>
                          </button>
                        )}

                        {/* Edit PO Button */}
                        <button
                          onClick={() => {
                            setSelectedPO(po);
                            setIsEditingPO(true);
                          }}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 rounded-lg text-xs font-bold border border-indigo-500/20 transition-all cursor-pointer"
                          title="編輯此採購單品項、數量或備註"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>編輯</span>
                        </button>

                        {(po.status === 'pending' || po.status === 'partial') && (
                          <button
                            onClick={() => handleStartCheckInForPO(po)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg text-xs font-extrabold shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
                          >
                            <Check className="w-4 h-4 stroke-[3]" />
                            <span>驗收入庫</span>
                          </button>
                        )}

                        <button
                          onClick={() => {
                            if (window.confirm(`確定要刪除採購單 ${po.po_id} 嗎？`)) {
                              deletePurchaseOrder(po.po_id);
                            }
                          }}
                          className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                          title="刪除此採購單"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Metadata summary */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-white/[0.02] p-3 rounded-xl border border-white/5">
                      <div>
                        <span className="text-slate-500 block">下單日期</span>
                        <span className="font-medium text-slate-300">{po.order_date || '未註記'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">預計到貨日</span>
                        <span className="font-medium text-slate-300">{po.expected_date || '未註記'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">訂購 / 已到 / 剩餘在途</span>
                        <span className="font-bold text-white">
                          {totalOrdered} / {totalReceived} / <span className="text-sky-400 font-extrabold">{remainingOnOrder} 件</span>
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">採購預估總額</span>
                        <span className="font-mono font-bold text-amber-300">${totalCost.toLocaleString()}</span>
                      </div>
                    </div>

                    {/* Items Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-white/10 text-slate-400 font-bold bg-white/[0.02]">
                            <th className="py-2.5 px-3">商品品名 / 代號</th>
                            <th className="py-2.5 px-2">規格</th>
                            <th className="py-2.5 px-2 text-center">訂購數量</th>
                            <th className="py-2.5 px-2 text-center">已到貨</th>
                            <th className="py-2.5 px-2 text-center text-sky-400 font-bold">在途中</th>
                            <th className="py-2.5 px-2 text-right">約定進價</th>
                            <th className="py-2.5 px-2 text-right">小計</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {(po.items || []).map((it, idx) => {
                            const itemRemaining = Math.max(0, Number(it.ordered_quantity || 0) - Number(it.received_quantity || 0));
                            return (
                              <tr key={idx} className="hover:bg-white/[0.02]">
                                <td className="py-2.5 px-3">
                                  <div className="font-bold text-white">{it.name}</div>
                                  <div className="text-[10px] font-mono text-slate-500">{it.product_id}</div>
                                </td>
                                <td className="py-2.5 px-2 text-slate-300">{it.specification || '-'}</td>
                                <td className="py-2.5 px-2 text-center font-medium text-slate-300">{it.ordered_quantity}</td>
                                <td className="py-2.5 px-2 text-center font-bold text-emerald-400">{it.received_quantity || 0}</td>
                                <td className="py-2.5 px-2 text-center">
                                  {itemRemaining > 0 ? (
                                    <span className="font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded">
                                      {itemRemaining}
                                    </span>
                                  ) : (
                                    <span className="text-slate-500">0 (完畢)</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-2 text-right font-mono text-slate-300">${it.cost_price || 0}</td>
                                <td className="py-2.5 px-2 text-right font-mono font-bold text-slate-200">
                                  ${((it.ordered_quantity || 0) * (it.cost_price || 0)).toLocaleString()}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Footer Actions & Note */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 text-xs text-slate-400">
                      <div>
                        {po.note ? (
                          <span>📌 備註：<span className="text-slate-200">{po.note}</span></span>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2 self-end">
                        {po.status === 'partial' && (
                          <button
                            onClick={() => {
                              if (window.confirm('若廠商通知此採購單剩餘商品缺貨/斷貨不再補，確定要結案並清除剩餘在途庫存嗎？')) {
                                updatePurchaseOrder(po.po_id, { status: 'completed' });
                                showToast('🏁 採購單已標記結案，在途數量已釋放');
                              }
                            }}
                            className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded border border-amber-500/20 font-bold"
                          >
                            廠商缺貨斷貨 / 結束剩餘在途
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: AI / LOCAL SCANNER & INVOICE OCR */}
      {activeTab === 'scan' && (
        <div className="space-y-6" onPaste={handlePasteImage}>
          <div className="bg-[#0f172a] border border-white/10 rounded-2xl p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Camera className="w-5 h-5 text-sky-400" />
                  進貨單據拍照 / 雙引擎智慧辨識
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  支援「⚡ 本地離線辨識（不耗流量、快速）」與「✨ 雲端 AI 深度解析（適合手寫、點陣模糊單據）」，辨識後可立即在預覽面板校對與修改。
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-extrabold rounded-xl text-xs shadow-md shadow-sky-500/20 cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  <span>拍照</span>
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 font-bold rounded-xl text-xs cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-sky-400" />
                  <span>選取檔案</span>
                </button>
              </div>
            </div>

            {/* Hidden native inputs */}
            <input
              type="file"
              ref={cameraInputRef}
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleSelectImageFile(e.target.files[0])}
            />
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleSelectImageFile(e.target.files[0])}
            />

            {/* Upload Area / Image Preview */}
            {!imagePreviewUrl ? (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-white/20 hover:border-sky-500/50 bg-white/[0.02] hover:bg-sky-500/[0.03] rounded-2xl p-10 text-center cursor-pointer transition-all space-y-3"
              >
                <div className="w-16 h-16 mx-auto rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                  <Camera className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-white">點擊選取或拖曳進貨單、出貨單、發票圖片至此</p>
                  <p className="text-xs text-slate-400">支援紙本點陣印刷單、手寫銷貨單、熱感應紙收據（亦可直接按 Ctrl+V 貼上剪貼簿截圖）</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative rounded-2xl overflow-hidden bg-black/40 border border-white/10 max-h-[450px] flex items-center justify-center">
                  <img
                    src={imagePreviewUrl}
                    alt="Invoice Preview"
                    className="max-h-[450px] w-auto object-contain"
                  />
                  <button
                    onClick={() => {
                      setImageFile(null);
                      setImagePreviewUrl(null);
                    }}
                    className="absolute top-3 right-3 p-2 bg-black/70 hover:bg-black text-white rounded-full transition-colors"
                    title="移除圖片重新選取"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Progress bar during scan */}
                {isScanning && (
                  <div className="p-4 bg-sky-500/10 border border-sky-500/20 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-xs text-sky-300 font-bold">
                      <span className="flex items-center gap-2">
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        {ocrProgressText || '正在辨識中...'}
                      </span>
                      <span>{ocrProgressPercent}%</span>
                    </div>
                    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-sky-400 to-indigo-500 transition-all duration-300 rounded-full"
                        style={{ width: `${Math.max(8, ocrProgressPercent)}%` }}
                      />
                    </div>
                  </div>
                )}

                {scanError && (
                  <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start gap-2.5 text-xs text-amber-300">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                    <div className="space-y-1.5 flex-1">
                      <p>{scanError}</p>
                      <div className="flex items-center gap-3 pt-0.5 flex-wrap">
                        <button
                          onClick={handleStartLocalOCR}
                          disabled={isScanning}
                          className="text-xs font-bold text-amber-400 hover:text-amber-300 underline flex items-center gap-1 cursor-pointer"
                        >
                          <Zap className="w-3.5 h-3.5 fill-current" />
                          <span>改用「⚡ 本地離線快速辨識」（零延遲、不依賴雲端）</span>
                        </button>

                        <button
                          onClick={handleStartAIOCR}
                          disabled={isScanning}
                          className="text-xs font-bold text-sky-400 hover:text-sky-300 underline flex items-center gap-1 cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>重試「✨ 雲端 AI 深度解析」</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <button
                    onClick={() => {
                      setImageFile(null);
                      setImagePreviewUrl(null);
                    }}
                    className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    重新選擇圖片
                  </button>

                  <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                    {/* Primary Button: Local Offline OCR */}
                    <button
                      onClick={handleStartLocalOCR}
                      disabled={isScanning}
                      className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black rounded-xl text-xs shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50 cursor-pointer"
                      title="在瀏覽器本地離線執行辨識，速度快、不消耗任何網路 AI 額度"
                    >
                      {isScanning && scanEngineType === 'local' ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>本地辨識中...</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4 fill-current stroke-[2.5]" />
                          <span>⚡ 本地離線快速辨識 (推薦優先)</span>
                        </>
                      )}
                    </button>

                    {/* Secondary Button: Cloud AI Fallback */}
                    <button
                      onClick={handleStartAIOCR}
                      disabled={isScanning}
                      className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-slate-950 font-black rounded-xl text-xs shadow-lg shadow-sky-500/20 transition-all disabled:opacity-50 cursor-pointer"
                      title="使用 Google Gemini 視覺大模型，專門解析手寫、點陣斷字或複雜版面"
                    >
                      {isScanning && scanEngineType === 'ai' ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>AI 解析中...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 stroke-[2.5]" />
                          <span>✨ 雲端 AI 深度解析 (手寫/模糊推薦)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: CREATE MANUAL PURCHASE ORDER */}
      {activeTab === 'create' && (
        <div className="space-y-6">
          <div className="bg-[#0f172a] border border-white/10 rounded-2xl p-6 space-y-6">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-400" />
                建立供應商採購訂單 (在途庫存登記)
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                向廠商訂貨後建立此紀錄，系統會自動在「網路訂單管理」中計入在途庫存，避免隔天新訂單重複下單採購。
              </p>
            </div>

            {/* Basic Info */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white/[0.02] p-4 rounded-xl border border-white/5">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-300">
                    供應商 <span className="text-red-400">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsNewPOCustomVendor(!isNewPOCustomVendor);
                      if (!isNewPOCustomVendor) {
                        setNewPOVendorName('');
                        setNewPOVendorId('');
                      }
                    }}
                    className="text-[11px] text-sky-400 hover:text-sky-300 font-semibold underline underline-offset-2 flex items-center gap-1 cursor-pointer"
                  >
                    {isNewPOCustomVendor ? '切換回下拉選單' : '✍️ 手動輸入新廠商'}
                  </button>
                </div>

                {!isNewPOCustomVendor ? (
                  <div className="relative">
                    <select
                      value={newPOVendorName}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '__MANUAL_INPUT__') {
                          setIsNewPOCustomVendor(true);
                          setNewPOVendorName('');
                          setNewPOVendorId('');
                          return;
                        }
                        setNewPOVendorName(val);
                        const match = allKnownVendors.find(v => v.vendor_name === val || v.vendor_id === val);
                        setNewPOVendorId(match ? match.vendor_id : val);
                      }}
                      className="w-full bg-[#1e293b] border border-white/20 hover:border-white/30 rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-medium cursor-pointer shadow-sm appearance-none pr-8"
                    >
                      <option value="" className="text-slate-400 bg-slate-900">
                        {allKnownVendors.length > 0 ? '-- 請選擇供應商 --' : '-- 尚未同步供應商 (可直接點右上角手動輸入) --'}
                      </option>
                      {allKnownVendors.map(v => (
                        <option key={v.vendor_id} value={v.vendor_name} className="text-white bg-slate-900 py-1.5">
                          {v.vendor_name}
                        </option>
                      ))}
                      <option value="__MANUAL_INPUT__" className="text-indigo-400 bg-slate-900 font-bold">
                        ✍️ + 手動輸入其他新供應商...
                      </option>
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      autoFocus
                      value={newPOVendorName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewPOVendorName(val);
                        const match = allKnownVendors.find(v => 
                          v.vendor_name.toLowerCase() === val.trim().toLowerCase() || 
                          v.vendor_id === val.trim()
                        );
                        setNewPOVendorId(match ? match.vendor_id : val.trim());
                      }}
                      placeholder="請輸入供應商名稱..."
                      className="w-full bg-[#1e293b] border border-indigo-500/60 rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-400 font-medium"
                    />
                    <p className="text-[10px] text-indigo-300/80">已開啟手動輸入，建立訂單時會自動登記至供應商名冊並同步。</p>
                  </div>
                )}

                {allKnownVendors.length > 0 && (
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap max-h-16 overflow-y-auto">
                    <span className="text-[10px] text-slate-400 shrink-0">快速點選：</span>
                    {allKnownVendors.slice(0, 6).map(v => (
                      <button
                        key={v.vendor_id}
                        type="button"
                        onClick={() => {
                          setIsNewPOCustomVendor(false);
                          setNewPOVendorId(v.vendor_id);
                          setNewPOVendorName(v.vendor_name);
                        }}
                        className={`text-[10px] px-2 py-0.5 rounded-md border transition-colors cursor-pointer ${
                          newPOVendorName === v.vendor_name
                            ? 'bg-indigo-500/20 border-indigo-400 text-indigo-300 font-bold'
                            : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {v.vendor_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">預計到貨日</label>
                <input
                  type="date"
                  value={newPOExpectedDate}
                  onChange={(e) => setNewPOExpectedDate(e.target.value)}
                  className="w-full bg-[#1e293b] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">訂單備註 / 聯絡註記</label>
                <input
                  type="text"
                  placeholder="如：已LINE確認、廠商預計週五出貨..."
                  value={newPONote}
                  onChange={(e) => setNewPONote(e.target.value)}
                  className="w-full bg-[#1e293b] border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Product Picker */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-300">挑選商品加入採購清單</label>
                <span className="text-xs text-slate-500">已加入 {newPOItems.length} 項商品</span>
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="搜尋要訂購的商品品名、規格、條碼..."
                  value={productSearchTerm}
                  onChange={(e) => setProductSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {productSearchTerm.trim() && (
                <div className="max-h-48 overflow-y-auto bg-[#1e293b] border border-white/10 rounded-xl p-2 space-y-1 divide-y divide-white/5">
                  {products
                    .filter(p => 
                      p.name.toLowerCase().includes(productSearchTerm.toLowerCase()) ||
                      p.product_id.toLowerCase().includes(productSearchTerm.toLowerCase()) ||
                      (p.barcode && p.barcode.includes(productSearchTerm)) ||
                      (p.specification && p.specification.toLowerCase().includes(productSearchTerm.toLowerCase()))
                    )
                    .slice(0, 8)
                    .map(p => (
                      <div
                        key={p.product_id}
                        onClick={() => {
                          handleAddProductToNewPO(p);
                          setProductSearchTerm('');
                        }}
                        className="flex items-center justify-between p-2 hover:bg-indigo-500/10 rounded-lg cursor-pointer transition-colors"
                      >
                        <div>
                          <div className="font-bold text-xs text-white">{p.name}</div>
                          <div className="text-[10px] text-slate-400">
                            {p.product_id} {p.specification ? `• 規格: ${p.specification}` : ''} • 進價: ${p.cost_price || 0}
                          </div>
                        </div>
                        <button className="px-2 py-1 bg-indigo-600 text-white rounded text-[10px] font-bold">
                          + 加入
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Selected Items Table */}
            {newPOItems.length > 0 && (
              <div className="overflow-x-auto border border-white/10 rounded-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-white/5 text-slate-400 font-bold border-b border-white/10">
                      <th className="py-2.5 px-3">商品品名</th>
                      <th className="py-2.5 px-2">規格</th>
                      <th className="py-2.5 px-2 w-28 text-center">訂購數量</th>
                      <th className="py-2.5 px-2 w-28 text-center">約定進價</th>
                      <th className="py-2.5 px-2 text-right">小計</th>
                      <th className="py-2.5 px-2 w-10 text-center">刪除</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {newPOItems.map((item, idx) => (
                      <tr key={item.temp_id} className="hover:bg-white/[0.02]">
                        <td className="py-2.5 px-3">
                          <span className="font-bold text-white">{item.name}</span>
                          <span className="block text-[10px] font-mono text-slate-500">{item.product_id}</span>
                        </td>
                        <td className="py-2.5 px-2">
                          <input
                            type="text"
                            value={item.specification}
                            onChange={(e) => {
                              const val = e.target.value;
                              setNewPOItems(prev => prev.map((it, i) => i === idx ? { ...it, specification: val } : it));
                            }}
                            className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white"
                          />
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <input
                            type="number"
                            min="1"
                            value={item.ordered_quantity}
                            onChange={(e) => {
                              const val = Number(e.target.value) || 1;
                              setNewPOItems(prev => prev.map((it, i) => i === idx ? { ...it, ordered_quantity: val } : it));
                            }}
                            className="w-20 mx-auto bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-center text-white font-bold"
                          />
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <input
                            type="number"
                            min="0"
                            value={item.cost_price}
                            onChange={(e) => {
                              const val = Number(e.target.value) || 0;
                              setNewPOItems(prev => prev.map((it, i) => i === idx ? { ...it, cost_price: val } : it));
                            }}
                            className="w-20 mx-auto bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-center text-white font-mono"
                          />
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono font-bold text-amber-300">
                          ${(item.ordered_quantity * item.cost_price).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <button
                            onClick={() => setNewPOItems(prev => prev.filter((_, i) => i !== idx))}
                            className="text-slate-500 hover:text-red-400 p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Bottom Actions */}
            <div className="flex justify-between items-center pt-3 border-t border-white/5">
              <div className="text-xs text-slate-400">
                預估總金額：
                <span className="text-sm font-mono font-bold text-amber-300 ml-1">
                  ${newPOItems.reduce((acc, it) => acc + (it.ordered_quantity * it.cost_price), 0).toLocaleString()}
                </span>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setActiveTab('list')}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 rounded-xl text-xs font-bold"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveNewPO}
                  className="flex items-center gap-1.5 px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold rounded-xl text-xs shadow-lg shadow-indigo-600/25 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>儲存採購單 (計入在途庫存)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL / PANEL: 入庫前確認預覽面板 (PRE-ENTRY CONFIRMATION & EDIT PANEL)     */}
      {/* ========================================================================= */}
      {showConfirmPanel && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
          <div className="w-full max-w-5xl bg-[#0f172a] border border-white/15 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Panel Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-sky-950/60 to-indigo-950/40 border-b border-white/10 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base sm:text-lg font-black text-white">
                      進貨入庫前確認預覽面板
                    </h2>
                    {ocrEngineUsed === 'local' ? (
                      <span className="text-xs font-bold px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded border border-amber-500/30 flex items-center gap-1">
                        <Zap className="w-3 h-3 fill-current" />
                        本地離線引擎辨識
                      </span>
                    ) : ocrEngineUsed === 'ai' ? (
                      <span className="text-xs font-bold px-2 py-0.5 bg-sky-500/20 text-sky-300 rounded border border-sky-500/30 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        雲端 AI 深度解析
                      </span>
                    ) : null}
                    <span className="text-xs font-bold px-2 py-0.5 bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/30">
                      可即時修改價格/數量/儲位
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    請核對廠商送達商品，若廠商臨時改價、缺貨或部分到貨，可直接於下方編輯或刪除品項。
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Fallback to Cloud AI button if currently in local mode */}
                {ocrEngineUsed === 'local' && (
                  <button
                    onClick={() => {
                      setShowConfirmPanel(false);
                      handleStartAIOCR();
                    }}
                    disabled={isScanning}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    title="若本地辨識有遺漏或字跡模糊，切換由 Google Gemini 雲端視覺大模型重新精準提取"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>辨識不理想？切換為 雲端 AI 深度解析</span>
                  </button>
                )}

                <button
                  onClick={() => setShowConfirmPanel(false)}
                  className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Panel Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-6 custom-scrollbar flex-1">
              {/* Invoice Meta Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-3 bg-white/[0.02] p-4 rounded-xl border border-white/5 text-xs">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-slate-400 font-bold text-xs">供應商</label>
                    <button
                      type="button"
                      onClick={() => setIsConfirmCustomVendor(!isConfirmCustomVendor)}
                      className="text-[10px] text-sky-400 hover:text-sky-300 underline cursor-pointer"
                    >
                      {isConfirmCustomVendor ? '下拉選單' : '+ 手動輸入'}
                    </button>
                  </div>
                  {!isConfirmCustomVendor ? (
                    <div className="relative">
                      <select
                        value={confirmVendorName}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '__MANUAL_INPUT__') {
                            setIsConfirmCustomVendor(true);
                            setConfirmVendorName('');
                            setConfirmVendorId('');
                            return;
                          }
                          setConfirmVendorName(val);
                          const v = allKnownVendors.find(item => item.vendor_name === val || item.vendor_id === val);
                          setConfirmVendorId(v ? v.vendor_id : val);
                        }}
                        className="w-full bg-[#1e293b] border border-white/10 rounded-lg px-2.5 py-1.5 text-white text-xs cursor-pointer appearance-none pr-7"
                      >
                        <option value="" className="text-slate-400 bg-slate-900">
                          {confirmVendorName ? `已選: ${confirmVendorName}` : '-- 請選擇供應商 --'}
                        </option>
                        {allKnownVendors.map(v => (
                          <option key={v.vendor_id} value={v.vendor_name} className="text-white bg-slate-900">
                            {v.vendor_name}
                          </option>
                        ))}
                        <option value="__MANUAL_INPUT__" className="text-indigo-400 bg-slate-900 font-bold">
                          ✍️ + 手動輸入其他新廠商...
                        </option>
                      </select>
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                        <ChevronDown className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  ) : (
                    <input
                      type="text"
                      autoFocus
                      value={confirmVendorName}
                      onChange={(e) => {
                        const val = e.target.value;
                        setConfirmVendorName(val);
                        const v = allKnownVendors.find(item => item.vendor_name.toLowerCase() === val.trim().toLowerCase() || item.vendor_id === val.trim());
                        setConfirmVendorId(v ? v.vendor_id : val.trim());
                      }}
                      placeholder="輸入供應商名稱..."
                      className="w-full bg-[#1e293b] border border-indigo-500/50 rounded-lg px-2.5 py-1.5 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-400"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-slate-400 font-bold mb-1">單據號碼 / 發票號</label>
                  <input
                    type="text"
                    value={confirmInvoiceNumber}
                    onChange={(e) => setConfirmInvoiceNumber(e.target.value)}
                    placeholder="如：INV-20260301"
                    className="w-full bg-[#1e293b] border border-white/10 rounded-lg px-2.5 py-1.5 text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-bold mb-1">進貨日期</label>
                  <input
                    type="date"
                    value={confirmInvoiceDate}
                    onChange={(e) => setConfirmInvoiceDate(e.target.value)}
                    className="w-full bg-[#1e293b] border border-white/10 rounded-lg px-2.5 py-1.5 text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-bold mb-1">關聯採購訂單 (在途扣抵)</label>
                  <select
                    value={confirmSelectedPOId}
                    onChange={(e) => setConfirmSelectedPOId(e.target.value)}
                    className="w-full bg-[#1e293b] border border-white/10 rounded-lg px-2.5 py-1.5 text-white"
                  >
                    <option value="">無關聯 (獨立進貨)</option>
                    {purchaseOrders
                      .filter(po => po.status === 'pending' || po.status === 'partial')
                      .map(po => (
                        <option key={po.po_id} value={po.po_id}>
                          {po.po_id} - {po.vendor_name || '廠商'} ({po.status === 'pending' ? '待到貨' : '部分到貨'})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Items Editable Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    進貨商品清單 ({confirmItems.length} 項)
                  </h4>
                  <button
                    onClick={() => {
                      setConfirmItems(prev => [
                        ...prev,
                        {
                          temp_id: `ADD_${Date.now()}`,
                          product_id: '',
                          product_name: '',
                          specification: '',
                          quantity: 1,
                          cost_price: 0,
                          location: '倉庫',
                          floor: '1F',
                          area: 'A區'
                        }
                      ]);
                    }}
                    className="text-xs font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>手動新增一列品項</span>
                  </button>
                </div>

                <div className="overflow-x-auto border border-white/10 rounded-xl bg-black/20">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-white/5 text-slate-400 font-bold border-b border-white/10">
                        <th className="py-2.5 px-3 min-w-[280px]">品名 / 對應系統商品 (可輸入搜尋)</th>
                        <th className="py-2.5 px-2 min-w-[110px]">規格</th>
                        <th className="py-2.5 px-2 w-24 text-center">進貨數量</th>
                        <th className="py-2.5 px-2 w-24 text-center">進價 (成本)</th>
                        <th className="py-2.5 px-2 min-w-[220px]">入庫儲位 (下拉選單)</th>
                        <th className="py-2.5 px-2 text-right">小計</th>
                        <th className="py-2.5 px-2 w-10 text-center">刪除</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {confirmItems.map((item, idx) => (
                        <tr key={item.temp_id} className="hover:bg-white/[0.02]">
                          {/* Product Name & Searchable Product Combobox */}
                          <td className="py-2.5 px-3">
                            <div className="space-y-1.5">
                              {/* Scanned/Invoice Product Name */}
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={item.product_name}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setConfirmItems(prev => prev.map((it, i) => i === idx ? { ...it, product_name: val } : it));
                                  }}
                                  className="w-full bg-[#1e293b] border border-white/10 rounded px-2 py-1 text-xs text-white font-bold placeholder-slate-500"
                                  placeholder="單據品名 (可手動修改)"
                                />
                              </div>

                              {/* Searchable System Product Combobox */}
                              <SearchableProductCombobox
                                value={item.product_id}
                                products={products}
                                onSelect={(matchedP) => {
                                  const defLoc = productDefaultLocationMap.get(matchedP.product_id);
                                  setConfirmItems(prev => prev.map((it, i) => i === idx ? {
                                    ...it,
                                    product_id: matchedP.product_id,
                                    matched_system_product: matchedP,
                                    product_name: it.product_name || matchedP.name,
                                    specification: it.specification || matchedP.specification || '',
                                    cost_price: it.cost_price || matchedP.cost_price || 0,
                                    location: defLoc?.location || it.location || '倉庫',
                                    floor: defLoc?.floor || it.floor || '1F',
                                    area: defLoc?.area || it.area || 'A區'
                                  } : it));
                                }}
                                onClear={() => {
                                  setConfirmItems(prev => prev.map((it, i) => i === idx ? {
                                    ...it,
                                    product_id: '',
                                    matched_system_product: undefined
                                  } : it));
                                }}
                                placeholder="🔍 輸入文字搜尋系統商品綁定..."
                              />
                            </div>
                          </td>

                          {/* Specification */}
                          <td className="py-2.5 px-2">
                            <input
                              type="text"
                              value={item.specification}
                              onChange={(e) => {
                                const val = e.target.value;
                                setConfirmItems(prev => prev.map((it, i) => i === idx ? { ...it, specification: val } : it));
                              }}
                              className="w-full bg-[#1e293b] border border-white/10 rounded px-2 py-1 text-xs text-white"
                              placeholder="規格 (如: 500ml)"
                            />
                          </td>

                          {/* Quantity */}
                          <td className="py-2.5 px-2 text-center">
                            <input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => {
                                const val = Number(e.target.value) || 1;
                                setConfirmItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: val } : it));
                              }}
                              className="w-20 mx-auto bg-[#1e293b] border border-white/10 rounded px-2 py-1 text-xs text-center text-white font-bold"
                            />
                          </td>

                          {/* Cost Price */}
                          <td className="py-2.5 px-2 text-center">
                            <input
                              type="number"
                              min="0"
                              value={item.cost_price}
                              onChange={(e) => {
                                const val = Number(e.target.value) || 0;
                                setConfirmItems(prev => prev.map((it, i) => i === idx ? { ...it, cost_price: val } : it));
                              }}
                              className="w-20 mx-auto bg-[#1e293b] border border-white/10 rounded px-2 py-1 text-xs text-center text-white font-mono font-bold text-amber-300"
                            />
                          </td>

                          {/* Storage Location Dropdown Selector */}
                          <td className="py-2.5 px-2">
                            <StorageLocationSelector
                              location={item.location}
                              floor={item.floor}
                              area={item.area}
                              availableLocations={uniqueLocations}
                              availableFloors={uniqueFloors}
                              availableAreas={uniqueAreas}
                              onChange={(fields) => {
                                setConfirmItems(prev => prev.map((it, i) => i === idx ? {
                                  ...it,
                                  location: fields.location !== undefined ? fields.location : it.location,
                                  floor: fields.floor !== undefined ? fields.floor : it.floor,
                                  area: fields.area !== undefined ? fields.area : it.area
                                } : it));
                              }}
                            />
                          </td>

                          {/* Subtotal */}
                          <td className="py-2.5 px-2 text-right font-mono font-bold text-amber-300">
                            ${(item.quantity * item.cost_price).toLocaleString()}
                          </td>

                          {/* Delete Item */}
                          <td className="py-2.5 px-2 text-center">
                            <button
                              onClick={() => setConfirmItems(prev => prev.filter((_, i) => i !== idx))}
                              className="text-slate-500 hover:text-red-400 p-1 transition-colors"
                              title="刪除此項 (若缺貨未到)"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Partial Delivery / Close Remaining Option */}
              {confirmSelectedPOId && (
                <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-amber-300">
                      <AlertCircle className="w-4 h-4" />
                      <span>採購單在途處理設定 (PO: {confirmSelectedPOId})</span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      提示：忘記勾選亦可隨時在採購列表點擊【結案】
                    </span>
                  </div>
                  <label className="flex items-center gap-2 text-slate-200 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={confirmIsCloseRemainingPO}
                      onChange={(e) => setConfirmIsCloseRemainingPO(e.target.checked)}
                      className="w-4 h-4 rounded bg-white/10 border-white/20 text-amber-500 focus:ring-0 cursor-pointer"
                    />
                    <span className="font-medium">
                      廠商已無後續到貨 / 剩餘數量不再補齊，直接將此採購單標記【結案】（清除剩餘在途庫存計數）
                    </span>
                  </label>
                </div>
              )}
            </div>

            {/* Panel Footer */}
            <div className="p-4 sm:p-5 bg-white/[0.02] border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-slate-400 flex items-center gap-4">
                <div>進貨總件數：<span className="font-bold text-white">{confirmItems.reduce((acc, it) => acc + Number(it.quantity || 0), 0)} 件</span></div>
                <div>進貨總金額：<span className="font-mono font-bold text-amber-300 text-sm">${confirmItems.reduce((acc, it) => acc + (it.quantity * it.cost_price), 0).toLocaleString()}</span></div>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  onClick={() => setShowConfirmPanel(false)}
                  className="flex-1 sm:flex-none px-4 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 rounded-xl text-xs font-bold transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleExecuteStockIn}
                  disabled={isSavingStockIn || confirmItems.length === 0}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold rounded-xl text-xs shadow-lg shadow-emerald-500/25 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSavingStockIn ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>正在執行入庫與在途扣抵...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>確認並執行批次進貨入庫</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Purchase Order Modal */}
      <EditPurchaseOrderModal
        po={selectedPO}
        isOpen={isEditingPO}
        onClose={() => {
          setIsEditingPO(false);
          setSelectedPO(null);
        }}
        onSave={async (poId, updated) => {
          await updatePurchaseOrder(poId, updated);
          showToast(`✅ 採購單 ${poId} 已成功更新！`);
        }}
        products={products}
        vendors={vendors}
        allKnownVendors={allKnownVendors}
      />

      {/* Image Preview Large Modal */}
      {previewImage && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[110] flex items-center justify-center p-4">
          <div className="relative max-w-4xl max-h-[90vh] bg-[#0f172a] rounded-2xl overflow-hidden border border-white/20 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between p-3 bg-black/50 border-b border-white/10">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-sky-400" />
                單據原始存檔影像
              </span>
              <div className="flex items-center gap-2">
                {previewImage.startsWith('http') && (
                  <a
                    href={previewImage}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 text-slate-400 hover:text-white"
                    title="在 Google Drive 開啟"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                )}
                <button
                  onClick={() => setPreviewImage(null)}
                  className="p-1.5 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-2 flex items-center justify-center">
              <img
                src={previewImage}
                alt="Document Preview"
                className="max-h-[80vh] w-auto object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
