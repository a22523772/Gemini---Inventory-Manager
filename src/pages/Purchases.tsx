import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useStore, getOnOrderStockQty } from '../store/useStore';
import { Product, PurchaseOrder, PurchaseOrderItem, Vendor } from '../lib/db';
import { performLocalInvoiceOcr, calculateSimilarity, optimizeImageForUpload } from '../lib/localOcrEngine';
import { format } from 'date-fns';
import { 
  Truck, Camera, Plus, Search, CheckCircle2, Clock, 
  AlertTriangle, Trash2, Edit3, Eye, FileText, Upload, 
  RefreshCw, X, ArrowRight, Check, Sparkles, Building2, 
  Layers, Package, DollarSign, Calendar, ChevronRight, ChevronDown,
  ExternalLink, ZoomIn, ZoomOut, AlertCircle, ShoppingCart, Zap, Cpu,
  CheckCheck, FileSpreadsheet, ArrowDownToLine, Boxes, PackageCheck,
  Images, Image as ImageIcon, ArrowUpDown, Filter, RotateCcw
} from 'lucide-react';
import { cn } from '../lib/utils';
import SearchableProductCombobox from '../components/SearchableProductCombobox';
import StorageLocationSelector from '../components/StorageLocationSelector';
import EditPurchaseOrderModal from '../components/EditPurchaseOrderModal';
import ImportExcelOrderModal from '../components/ImportExcelOrderModal';
import ProductCatalogPickerModal from '../components/ProductCatalogPickerModal';
import PurchaseOrderPhotoModal from '../components/PurchaseOrderPhotoModal';

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
    completeAndStockInAllRemainingPO,
    uploadInvoiceImage,
    fetchPurchaseOrders,
    addVendor,
    operator,
    showToast 
  } = useStore();

  const [activeTab, setActiveTab] = useState<'list' | 'scan' | 'create'>('list');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'pending' | 'partial' | 'completed' | 'cancelled'>('ALL');
  const [vendorFilter, setVendorFilter] = useState<string>('ALL');
  const [invoiceFilter, setInvoiceFilter] = useState<'ALL' | 'has_invoice' | 'missing_invoice'>('ALL');
  const [photoFilter, setPhotoFilter] = useState<'ALL' | 'has_photo' | 'no_photo'>('ALL');
  const [sortBy, setSortBy] = useState<'order_date_desc' | 'order_date_asc' | 'expected_date_asc' | 'expected_date_desc' | 'cost_desc' | 'cost_asc'>('order_date_desc');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Image preview & PO Photo Upload modals
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [photoModalPO, setPhotoModalPO] = useState<PurchaseOrder | null>(null);

  // Detail / Edit PO Modal
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [isEditingPO, setIsEditingPO] = useState(false);

  // --- OCR / Multi-Image Scanner States ---
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const [activeImageIndex, setActiveImageIndex] = useState<number>(0);
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
  const [confirmImageUrls, setConfirmImageUrls] = useState<string[]>([]);
  const [confirmActiveImageIndex, setConfirmActiveImageIndex] = useState<number>(0);
  const [isSavingStockIn, setIsSavingStockIn] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // --- Create PO Form States ---
  const [newPOVendorId, setNewPOVendorId] = useState<string>('');
  const [newPOVendorName, setNewPOVendorName] = useState<string>('');
  const [isNewPOCustomVendor, setIsNewPOCustomVendor] = useState<boolean>(false);
  const [newPOExpectedDate, setNewPOExpectedDate] = useState<string>('');
  const [newPONote, setNewPONote] = useState<string>('');
  const [isExcelImportModalOpen, setIsExcelImportModalOpen] = useState<boolean>(false);
  const [isProductCatalogModalOpen, setIsProductCatalogModalOpen] = useState<boolean>(false);
  const [isSearchFocused, setIsSearchFocused] = useState<boolean>(false);
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

  // Map for total stock quantity per product
  const productTotalStockMap = useMemo(() => {
    const map = new Map<string, number>();
    (stock || []).forEach(s => {
      if (s.product_id) {
        map.set(s.product_id, (map.get(s.product_id) || 0) + Number(s.quantity || 0));
      }
    });
    return map;
  }, [stock]);

  // Map for quick vendor lookup
  const vendorMap = useMemo(() => {
    const map = new Map<string, string>();
    vendors.forEach(v => map.set(v.vendor_id, v.vendor_name || v.name || v.vendor_id));
    return map;
  }, [vendors]);

  // Products belonging to currently selected vendor (if any)
  const currentVendorProducts = useMemo(() => {
    if (!newPOVendorName && !newPOVendorId) return [];
    const vIdLower = (newPOVendorId || '').toLowerCase();
    const vNameLower = (newPOVendorName || '').toLowerCase();
    return (products || []).filter(p => {
      const pVid = (p.vendor_id || '').toLowerCase();
      const pVname = (vendorMap.get(p.vendor_id) || (p as any).vendor_name || '').toLowerCase();
      return (vIdLower && pVid === vIdLower) || (vNameLower && (pVname.includes(vNameLower) || vNameLower.includes(pVname)));
    });
  }, [products, newPOVendorId, newPOVendorName, vendorMap]);

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

  // Filtered and Sorted PO list
  const filteredPOs = useMemo(() => {
    const result = purchaseOrders.filter(po => {
      // Status filter
      if (statusFilter !== 'ALL' && po.status !== statusFilter) return false;

      // Vendor filter
      if (vendorFilter !== 'ALL') {
        const vMatch = po.vendor_id === vendorFilter || po.vendor_name === vendorFilter;
        if (!vMatch) return false;
      }

      // Invoice / Document Number status filter
      const hasInvoiceNum = Boolean(po.invoice_number && po.invoice_number.trim());
      if (invoiceFilter === 'has_invoice' && !hasInvoiceNum) return false;
      if (invoiceFilter === 'missing_invoice' && hasInvoiceNum) return false;

      // Document Photo status filter
      const hasPhoto = Boolean(po.invoice_image_url && po.invoice_image_url.trim());
      if (photoFilter === 'has_photo' && !hasPhoto) return false;
      if (photoFilter === 'no_photo' && hasPhoto) return false;

      // Search keyword filter
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const poIdMatch = po.po_id.toLowerCase().includes(term);
        const invNumMatch = (po.invoice_number || '').toLowerCase().includes(term);
        const vNameMatch = (po.vendor_name || '').toLowerCase().includes(term);
        const noteMatch = (po.note || '').toLowerCase().includes(term);
        const itemMatch = (po.items || []).some(it => 
          (it.name || '').toLowerCase().includes(term) || 
          (it.product_id || '').toLowerCase().includes(term) ||
          (it.specification || '').toLowerCase().includes(term)
        );
        if (!poIdMatch && !invNumMatch && !vNameMatch && !noteMatch && !itemMatch) return false;
      }
      return true;
    });

    // Helper to calculate total cost for a PO
    const getPOCost = (po: PurchaseOrder) => {
      return (po.items || []).reduce((sum, it) => sum + (Number(it.ordered_quantity || 0) * Number(it.cost_price || 0)), 0);
    };

    // Sort order logic
    result.sort((a, b) => {
      if (sortBy === 'order_date_desc') {
        return (b.order_date || '').localeCompare(a.order_date || '');
      } else if (sortBy === 'order_date_asc') {
        return (a.order_date || '').localeCompare(b.order_date || '');
      } else if (sortBy === 'expected_date_asc') {
        // Near to far (blank/no date goes to the end)
        if (!a.expected_date) return 1;
        if (!b.expected_date) return -1;
        return a.expected_date.localeCompare(b.expected_date);
      } else if (sortBy === 'expected_date_desc') {
        // Far to near
        if (!a.expected_date) return 1;
        if (!b.expected_date) return -1;
        return b.expected_date.localeCompare(a.expected_date);
      } else if (sortBy === 'cost_desc') {
        return getPOCost(b) - getPOCost(a);
      } else if (sortBy === 'cost_asc') {
        return getPOCost(a) - getPOCost(b);
      }
      return 0;
    });

    return result;
  }, [purchaseOrders, statusFilter, vendorFilter, invoiceFilter, photoFilter, sortBy, searchTerm]);

  // --- Handlers for Image Upload / Camera (Supports 1, 2, or multiple images) ---
  const handleSelectImageFiles = (files: FileList | File[]) => {
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

    Promise.all(readers).then(newUrls => {
      setImageFiles(prev => [...prev, ...validImageFiles]);
      setImagePreviewUrls(prev => {
        const next = [...prev, ...newUrls];
        setActiveImageIndex(next.length - 1);
        return next;
      });
      setScanError(null);
      showToast(`📸 已加入 ${validImageFiles.length} 張單據圖片（目前共 ${imagePreviewUrls.length + validImageFiles.length} 張）`);
    });
  };

  const handlePasteImage = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const pastedFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          pastedFiles.push(file);
        }
      }
    }
    if (pastedFiles.length > 0) {
      handleSelectImageFiles(pastedFiles);
      showToast(`📋 已貼上剪貼簿圖片 (共 ${pastedFiles.length} 張)！`);
    }
  };

  const handleRemoveImage = (index: number) => {
    setImageFiles(prev => prev.filter((_, i) => i !== index));
    setImagePreviewUrls(prev => {
      const next = prev.filter((_, i) => i !== index);
      if (activeImageIndex >= next.length) {
        setActiveImageIndex(Math.max(0, next.length - 1));
      }
      return next;
    });
  };

  const handleClearAllImages = () => {
    setImageFiles([]);
    setImagePreviewUrls([]);
    setActiveImageIndex(0);
    setScanError(null);
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
    setConfirmImageUrls(imagePreviewUrls);
    setConfirmActiveImageIndex(0);
    setOcrEngineUsed(engine);
    setShowConfirmPanel(true);
  };

  // Perform Local Offline OCR across all selected images (Tesseract.js + Canvas pre-processing + Local Fuzzy Matching)
  const handleStartLocalOCR = async () => {
    if (imagePreviewUrls.length === 0) {
      showToast('請先拍攝或選擇進貨單據圖片');
      return;
    }

    setIsScanning(true);
    setScanEngineType('local');
    setScanError(null);
    setOcrProgressText(`正在初始化本地離線 OCR 引擎 (共 ${imagePreviewUrls.length} 張單據)...`);
    setOcrProgressPercent(5);

    try {
      let combinedVendorName = '';
      let combinedVendorId = '';
      let combinedInvoiceNumber = '';
      let combinedInvoiceDate = '';
      let allItems: any[] = [];
      let allRawText = '';

      for (let i = 0; i < imagePreviewUrls.length; i++) {
        const currentUrl = imagePreviewUrls[i];
        const pageLabel = imagePreviewUrls.length > 1 ? `第 ${i + 1}/${imagePreviewUrls.length} 張` : '';
        setOcrProgressText(`正在辨識 ${pageLabel} 單據內容...`);
        setOcrProgressPercent(Math.round(10 + (i / imagePreviewUrls.length) * 80));

        const result = await performLocalInvoiceOcr(
          currentUrl,
          products,
          vendors,
          (status, percent) => {
            const pageProgress = Math.round(10 + ((i + (percent / 100)) / imagePreviewUrls.length) * 80);
            setOcrProgressText(`[${pageLabel || '單據'}] ${status}`);
            setOcrProgressPercent(pageProgress);
          }
        );

        if (!combinedVendorName && result.vendor_name) combinedVendorName = result.vendor_name;
        if (!combinedVendorId && result.vendor_id) combinedVendorId = result.vendor_id;
        if (!combinedInvoiceNumber && result.invoice_number) combinedInvoiceNumber = result.invoice_number;
        if (!combinedInvoiceDate && result.invoice_date) combinedInvoiceDate = result.invoice_date;
        if (result.items && result.items.length > 0) {
          allItems.push(...result.items);
        }
        allRawText += `\n--- 單據 ${i + 1} ---\n` + (result.raw_text || '');
      }

      const aggregatedResult = {
        vendor_name: combinedVendorName,
        vendor_id: combinedVendorId,
        invoice_number: combinedInvoiceNumber,
        invoice_date: combinedInvoiceDate,
        total_amount: allItems.reduce((sum, it) => sum + (Number(it.total_amount) || 0), 0),
        items: allItems,
        raw_text: allRawText,
        engine: 'local' as const
      };

      if (!aggregatedResult.items || aggregatedResult.items.length === 0) {
        setScanError('本地離線引擎未能辨識出清晰的品項表格（可能因手寫筆跡或折痕干擾）。建議點擊「✨ 雲端 AI 深度解析」獲取更高精度辨識。');
        showToast('⚠️ 本地辨識品項較少，可改用雲端 AI 深度解析');
      }

      populateScannedData(aggregatedResult, 'local');
      showToast(`⚡ 本地離線辨識完成！已整合 ${imagePreviewUrls.length} 張單據商品資料`);
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

  // Perform Cloud AI (Gemini) OCR on all selected images (Joint Multimodal Recognition for Multi-page invoices)
  const handleStartAIOCR = async () => {
    if (imagePreviewUrls.length === 0) {
      showToast('請先拍攝或選擇進貨單據圖片');
      return;
    }

    setIsScanning(true);
    setScanEngineType('ai');
    setScanError(null);
    setOcrProgressText(`正在壓縮最佳化 ${imagePreviewUrls.length} 張影像傳輸速度...`);
    setOcrProgressPercent(15);

    try {
      // Optimize all images before sending to API in parallel
      const base64List = await Promise.all(
        imagePreviewUrls.map(url => optimizeImageForUpload(url))
      );

      setOcrProgressText(`正在呼叫 Google Gemini 多模態視覺 AI 深度聯合解析 ${imagePreviewUrls.length} 張單據...`);
      setOcrProgressPercent(40);

      const countDesc = imagePreviewUrls.length > 1 
        ? `本次共提供了 ${imagePreviewUrls.length} 張單據圖片（可能為多頁單據如第1頁、第2頁，或同批次的數張進貨單據）。請完整解析所有圖片中的全部品項並整合成一個完整的 items 清單。` 
        : `本次提供了 1 張進貨單據圖片。`;

      // System Prompt logic
      const sysPrompt = `
      你是一個高精準的進貨單/採購單解析系統。
      ${countDesc}
      請辨識提供的圖片，並回傳格式為 JSON。
      
      已知系統廠商：
      ${JSON.stringify(vendors.map(v => ({ vendor_id: v.vendor_id, vendor_name: v.vendor_name || v.name || '' })))}
      
      已知系統商品 (輔助比對，優先使用 name、specification 對應)：
      ${JSON.stringify(products.map(p => ({ product_id: p.product_id, name: p.name, specification: p.specification || '', cost_price: p.cost_price || 0, vendor_id: p.vendor_id || '' })))}
      
      請盡最大努力從所有圖片中提取：
      1. 單據日期 (invoice_date, YYYY-MM-DD 格式，若無則留空)
      2. 廠商名稱 (vendor_name) 與 對應的廠商 ID (vendor_id)
      3. 單據號碼 / 發票號 (invoice_number，若有多張可提取主要單號或以逗號連接)
      4. 商品項目清單 (items): 
          - product_name (單據上的品名，若有多頁請依序提取全部頁面的所有商品，不要遺漏)
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
        "invoice_number": "INV-20240325",
        "items": [
           { "product_name": "商品A", "specification": "紅色", "quantity": 10, "cost_price": 100, "product_id": "P001" },
           { "product_name": "商品B", "specification": "大號", "quantity": 5, "cost_price": 200, "product_id": "P002" }
        ]
      }
      `;

      let rawText = '';
      try {
        const { scanInvoiceOCR } = await import('../lib/geminiClient');
        rawText = await scanInvoiceOCR(base64List, sysPrompt);
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
      showToast(`✨ 雲端 AI 成功辨識 ${parsedData.items.length} 項進貨商品（共 ${imagePreviewUrls.length} 張單據）！`);
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
      // 1. Upload photos to Google Drive (if configured) or keep base64
      let finalImageUrl = confirmImageUrls[0] || '';
      const uploadedUrls: string[] = [];

      for (let i = 0; i < confirmImageUrls.length; i++) {
        const img = confirmImageUrls[i];
        if (img.startsWith('data:image')) {
          const fileName = `Invoice_${confirmInvoiceNumber || Date.now()}_p${i + 1}.jpg`;
          const uploadRes = await uploadInvoiceImage(img, fileName);
          if (uploadRes.success && uploadRes.url) {
            uploadedUrls.push(uploadRes.url);
          } else {
            uploadedUrls.push(img);
          }
        } else {
          uploadedUrls.push(img);
        }
      }

      if (uploadedUrls.length > 0) {
        finalImageUrl = uploadedUrls.join('\n');
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
      setImageFiles([]);
      setImagePreviewUrls([]);
      setActiveImageIndex(0);
      setConfirmImageUrls([]);
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
    const existingImgs = po.invoice_image_url ? po.invoice_image_url.split('\n').filter(Boolean) : [];
    setConfirmImageUrls(existingImgs);
    setConfirmActiveImageIndex(0);

    const checkInItems: ScannedInvoiceItem[] = (po.items || []).map((it, idx) => {
      const remaining = Math.max(0, Number(it.ordered_quantity || 0) - Number(it.received_quantity || 0));
      const targetQty = remaining > 0 ? remaining : Number(it.ordered_quantity || 1);
      const defLoc = productDefaultLocationMap.get(it.product_id);
      const matchedP = products.find(p => p.product_id === it.product_id);

      return {
        temp_id: `PO_CHK_${Date.now()}_${idx}`,
        product_id: it.product_id,
        product_name: it.name,
        matched_system_product: matchedP,
        specification: it.specification || '',
        quantity: targetQty,
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
  const handleAddProductToNewPO = (p: Product, qty: number = 1) => {
    if (!p) return;
    const existingIndex = newPOItems.findIndex(it => it.product_id === p.product_id);
    if (existingIndex >= 0) {
      setNewPOItems(prev => prev.map((it, idx) => 
        idx === existingIndex 
          ? { ...it, ordered_quantity: Math.max(1, Number(it.ordered_quantity || 0) + qty) } 
          : it
      ));
      showToast(`➕ 已累加「${p.name || p.product_id}」訂購數量 (+${qty})`);
    } else {
      setNewPOItems(prev => [
        ...prev,
        {
          temp_id: `NEW_PO_ITEM_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          product_id: p.product_id || `P_${Date.now()}`,
          name: p.name || '未命名商品',
          specification: p.specification || '',
          ordered_quantity: Math.max(1, qty),
          cost_price: Number(p.cost_price) || 0,
          note: ''
        }
      ]);
      showToast(`✅ 已將「${p.name || p.product_id}」加入採購清單`);
    }

    // Auto-fill vendor if currently empty and product has vendor
    if (!newPOVendorName && !newPOVendorId && p.vendor_id) {
      const vName = vendorMap.get(p.vendor_id) || p.vendor_id;
      setNewPOVendorId(p.vendor_id);
      setNewPOVendorName(vName);
    }
  };

  const handleUpdatePOItemQuantity = (productId: string, delta: number) => {
    setNewPOItems(prev => {
      const targetIdx = prev.findIndex(it => it.product_id === productId);
      if (targetIdx < 0) return prev;

      const currentQty = Number(prev[targetIdx].ordered_quantity) || 1;
      const newQty = currentQty + delta;

      if (newQty <= 0) {
        // Remove item if reduced to 0
        return prev.filter((_, idx) => idx !== targetIdx);
      } else {
        return prev.map((it, idx) => idx === targetIdx ? { ...it, ordered_quantity: newQty } : it);
      }
    });
  };

  const handleAddCustomItemToNewPO = () => {
    const timestamp = Date.now();
    setNewPOItems(prev => [
      ...prev,
      {
        temp_id: `CUSTOM_PO_ITEM_${timestamp}`,
        product_id: `CUSTOM_${timestamp.toString().slice(-6)}`,
        name: '',
        specification: '',
        ordered_quantity: 1,
        cost_price: 0,
        note: ''
      }
    ]);
    showToast('➕ 已新增自訂採購品項，請直接於下方表格填寫品名與進價');
  };

  const handleImportExcelOrderItems = (
    importedItems: Array<{
      temp_id: string;
      product_id: string;
      name: string;
      specification: string;
      ordered_quantity: number;
      cost_price: number;
      note: string;
    }>,
    mode: 'append' | 'replace',
    detectedVendor?: { vendor_id: string; vendor_name: string },
    detectedExpectedDate?: string
  ) => {
    if (mode === 'replace') {
      setNewPOItems(importedItems);
    } else {
      setNewPOItems(prev => {
        const nextList = [...prev];
        importedItems.forEach(item => {
          const matchIdx = nextList.findIndex(it => 
            (it.product_id && item.product_id && it.product_id === item.product_id) ||
            (it.name.trim().toLowerCase() === item.name.trim().toLowerCase() && 
             (it.specification || '').trim().toLowerCase() === (item.specification || '').trim().toLowerCase())
          );
          if (matchIdx >= 0) {
            nextList[matchIdx] = {
              ...nextList[matchIdx],
              ordered_quantity: Number(nextList[matchIdx].ordered_quantity) + Number(item.ordered_quantity),
              cost_price: item.cost_price > 0 ? item.cost_price : nextList[matchIdx].cost_price
            };
          } else {
            nextList.push(item);
          }
        });
        return nextList;
      });
    }

    if (detectedVendor) {
      setIsNewPOCustomVendor(false);
      setNewPOVendorId(detectedVendor.vendor_id);
      setNewPOVendorName(detectedVendor.vendor_name);
    }

    if (detectedExpectedDate) {
      setNewPOExpectedDate(detectedExpectedDate);
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

      {/* Metric Indicators / Quick Filters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div 
          onClick={() => {
            setActiveTab('list');
            setStatusFilter('ALL');
          }}
          className={cn(
            "p-4 rounded-xl border flex items-center justify-between transition-all cursor-pointer select-none group",
            statusFilter === 'ALL'
              ? "bg-sky-500/15 border-sky-500/50 shadow-lg shadow-sky-500/10 ring-1 ring-sky-500/30"
              : "bg-[#0f172a] border-white/10 hover:border-sky-500/30 hover:bg-sky-500/5"
          )}
          title="點擊切換篩選：全部採購單"
        >
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">採購在途總數量</span>
              {statusFilter === 'ALL' && (
                <span className="text-[10px] px-1.5 py-0.2 bg-sky-500/30 text-sky-200 rounded font-extrabold">全部</span>
              )}
            </div>
            <div className="text-2xl font-black text-sky-400 mt-0.5">{stats.totalOnOrderUnits} <span className="text-xs font-normal text-slate-400">件</span></div>
          </div>
          <div className="p-2.5 bg-sky-500/10 rounded-xl text-sky-400 group-hover:scale-110 transition-transform">
            <Package className="w-5 h-5" />
          </div>
        </div>

        <div 
          onClick={() => {
            setActiveTab('list');
            setStatusFilter(statusFilter === 'pending' ? 'ALL' : 'pending');
          }}
          className={cn(
            "p-4 rounded-xl border flex items-center justify-between transition-all cursor-pointer select-none group",
            statusFilter === 'pending'
              ? "bg-amber-500/15 border-amber-500/50 shadow-lg shadow-amber-500/10 ring-1 ring-amber-500/30"
              : "bg-[#0f172a] border-white/10 hover:border-amber-500/30 hover:bg-amber-500/5"
          )}
          title="點擊切換篩選：待到貨訂單"
        >
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">待驗收到貨訂單</span>
              {statusFilter === 'pending' && (
                <span className="text-[10px] px-1.5 py-0.2 bg-amber-500/30 text-amber-200 rounded font-extrabold">已選</span>
              )}
            </div>
            <div className="text-2xl font-black text-amber-400 mt-0.5">{stats.pendingCount} <span className="text-xs font-normal text-slate-400">單</span></div>
          </div>
          <div className="p-2.5 bg-amber-500/10 rounded-xl text-amber-400 group-hover:scale-110 transition-transform">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div 
          onClick={() => {
            setActiveTab('list');
            setStatusFilter(statusFilter === 'partial' ? 'ALL' : 'partial');
          }}
          className={cn(
            "p-4 rounded-xl border flex items-center justify-between transition-all cursor-pointer select-none group",
            statusFilter === 'partial'
              ? "bg-indigo-500/15 border-indigo-500/50 shadow-lg shadow-indigo-500/10 ring-1 ring-indigo-500/30"
              : "bg-[#0f172a] border-white/10 hover:border-indigo-500/30 hover:bg-indigo-500/5"
          )}
          title="點擊切換篩選：部分到貨訂單"
        >
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">部分到貨訂單</span>
              {statusFilter === 'partial' && (
                <span className="text-[10px] px-1.5 py-0.2 bg-indigo-500/30 text-indigo-200 rounded font-extrabold">已選</span>
              )}
            </div>
            <div className="text-2xl font-black text-indigo-400 mt-0.5">{stats.partialCount} <span className="text-xs font-normal text-slate-400">單</span></div>
          </div>
          <div className="p-2.5 bg-indigo-500/10 rounded-xl text-indigo-400 group-hover:scale-110 transition-transform">
            <AlertCircle className="w-5 h-5" />
          </div>
        </div>

        <div 
          onClick={() => {
            setActiveTab('list');
            setStatusFilter(statusFilter === 'completed' ? 'ALL' : 'completed');
          }}
          className={cn(
            "p-4 rounded-xl border flex items-center justify-between transition-all cursor-pointer select-none group",
            statusFilter === 'completed'
              ? "bg-emerald-500/15 border-emerald-500/50 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-500/30"
              : "bg-[#0f172a] border-white/10 hover:border-emerald-500/30 hover:bg-emerald-500/5"
          )}
          title="點擊切換篩選：已完成結案"
        >
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">已完成結案</span>
              {statusFilter === 'completed' && (
                <span className="text-[10px] px-1.5 py-0.2 bg-emerald-500/30 text-emerald-200 rounded font-extrabold">已選</span>
              )}
            </div>
            <div className="text-2xl font-black text-emerald-400 mt-0.5">{stats.completedCount} <span className="text-xs font-normal text-slate-400">單</span></div>
          </div>
          <div className="p-2.5 bg-emerald-500/10 rounded-xl text-emerald-400 group-hover:scale-110 transition-transform">
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
          <div className="flex flex-col gap-3 bg-[#0f172a] p-3 rounded-xl border border-white/10">
            {/* Top Row: Search and Status/Vendor filters */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="搜尋採購單號、發票單據號、品名、廠商、備註..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-[#1e293b] border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500 font-medium"
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
                className="bg-[#1e293b] border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500 max-w-[180px] truncate font-medium"
              >
                <option value="ALL">所有供應商 ({allKnownVendors.length})</option>
                {allKnownVendors.map(v => (
                  <option key={v.vendor_id} value={v.vendor_id}>{v.vendor_name}</option>
                ))}
              </select>
            </div>

            {/* Bottom Row: Sorting, Invoice Number Filter, Photo Filter, and Reset */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/5 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                {/* Sort Order Selector (No PO ID per request) */}
                <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1.5 rounded-lg border border-white/10">
                  <ArrowUpDown className="w-3.5 h-3.5 text-sky-400" />
                  <span className="text-[11px] text-slate-400 font-bold">排序:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as any)}
                    className="bg-transparent text-slate-200 text-xs focus:outline-none cursor-pointer font-medium"
                  >
                    <option value="order_date_desc" className="bg-slate-900 text-slate-200">下單日期：新 ➔ 舊 (預設)</option>
                    <option value="order_date_asc" className="bg-slate-900 text-slate-200">下單日期：舊 ➔ 新</option>
                    <option value="expected_date_asc" className="bg-slate-900 text-slate-200">預計到貨：近 ➔ 遠</option>
                    <option value="expected_date_desc" className="bg-slate-900 text-slate-200">預計到貨：遠 ➔ 近</option>
                    <option value="cost_desc" className="bg-slate-900 text-slate-200">採購金額：高 ➔ 低</option>
                    <option value="cost_asc" className="bg-slate-900 text-slate-200">採購金額：低 ➔ 高</option>
                  </select>
                </div>

                {/* Invoice / Document Number Filter */}
                <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1.5 rounded-lg border border-white/10">
                  <Filter className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-[11px] text-slate-400 font-bold">單據/發票號:</span>
                  <select
                    value={invoiceFilter}
                    onChange={(e) => setInvoiceFilter(e.target.value as any)}
                    className="bg-transparent text-slate-200 text-xs focus:outline-none cursor-pointer font-medium"
                  >
                    <option value="ALL" className="bg-slate-900 text-slate-200">全部單據狀態</option>
                    <option value="missing_invoice" className="bg-slate-900 text-amber-300">⚠️ 缺單據/發票號 (需補充)</option>
                    <option value="has_invoice" className="bg-slate-900 text-sky-300">✅ 已填單據/發票號</option>
                  </select>
                </div>

                {/* Photo Filter */}
                <div className="flex items-center gap-1.5 bg-white/5 px-2.5 py-1.5 rounded-lg border border-white/10">
                  <Camera className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[11px] text-slate-400 font-bold">單據照片:</span>
                  <select
                    value={photoFilter}
                    onChange={(e) => setPhotoFilter(e.target.value as any)}
                    className="bg-transparent text-slate-200 text-xs focus:outline-none cursor-pointer font-medium"
                  >
                    <option value="ALL" className="bg-slate-900 text-slate-200">全部</option>
                    <option value="has_photo" className="bg-slate-900 text-emerald-300">📷 有照片存檔</option>
                    <option value="no_photo" className="bg-slate-900 text-slate-400">無照片 (待補傳)</option>
                  </select>
                </div>
              </div>

              {/* Active Filter Count & Reset */}
              <div className="flex items-center gap-2">
                {(statusFilter !== 'ALL' || vendorFilter !== 'ALL' || invoiceFilter !== 'ALL' || photoFilter !== 'ALL' || searchTerm.trim() || sortBy !== 'order_date_desc') && (
                  <button
                    onClick={() => {
                      setStatusFilter('ALL');
                      setVendorFilter('ALL');
                      setInvoiceFilter('ALL');
                      setPhotoFilter('ALL');
                      setSearchTerm('');
                      setSortBy('order_date_desc');
                    }}
                    className="flex items-center gap-1 px-2.5 py-1 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer text-[11px]"
                    title="重設所有篩選與排序條件"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>重設條件</span>
                  </button>
                )}
                <span className="text-slate-400 text-xs">
                  顯示 <strong className="text-white">{filteredPOs.length}</strong> / {purchaseOrders.length} 筆
                </span>
              </div>
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

                        {/* Invoice Number Badge / Quick Add */}
                        {po.invoice_number && po.invoice_number.trim() ? (
                          <span 
                            onClick={() => {
                              setSelectedPO(po);
                              setIsEditingPO(true);
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 px-2.5 py-0.5 rounded-full cursor-pointer hover:bg-amber-500/25 transition-colors shadow-sm"
                            title="發票/單據號碼（點擊可修改並自動同步更新交易紀錄）"
                          >
                            <FileText className="w-3 h-3 text-amber-400" />
                            <span>發票/單據: {po.invoice_number}</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPO(po);
                              setIsEditingPO(true);
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-bold bg-white/5 hover:bg-amber-500/15 text-slate-400 hover:text-amber-300 border border-dashed border-white/20 hover:border-amber-500/30 px-2 py-0.5 rounded-full transition-colors cursor-pointer"
                            title={po.status === 'completed' ? '此已結案採購單尚未填寫發票號/單據號，點擊可立即補填並同步交易紀錄' : '補充填寫發票/單據號'}
                          >
                            <Plus className="w-3 h-3 text-amber-400" />
                            <span>補充發票號/單據號</span>
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {/* Invoice Photo & Upload Button */}
                        {(() => {
                          const photoCount = po.invoice_image_url
                            ? po.invoice_image_url.split('\n').filter(Boolean).length
                            : 0;
                          
                          if (photoCount > 0) {
                            return (
                              <button
                                onClick={() => setPhotoModalPO(po)}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 rounded-lg text-xs font-bold border border-sky-500/30 transition-all cursor-pointer shadow-sm"
                                title="檢視、管理或補傳單據照片"
                              >
                                <Camera className="w-3.5 h-3.5 text-sky-400" />
                                <span>單據照片 ({photoCount})</span>
                              </button>
                            );
                          } else {
                            return (
                              <button
                                onClick={() => setPhotoModalPO(po)}
                                className="flex items-center gap-1 px-2.5 py-1.5 bg-white/5 hover:bg-sky-500/10 text-slate-300 hover:text-sky-300 rounded-lg text-xs font-bold border border-dashed border-white/20 hover:border-sky-400/40 transition-all cursor-pointer"
                                title={po.status === 'completed' ? '此已結案採購單尚未存檔照片，點擊可補傳' : '上傳此採購單單據照片'}
                              >
                                <Camera className="w-3.5 h-3.5 text-slate-400" />
                                <span>補傳單據</span>
                              </button>
                            );
                          }
                        })()}

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

                        {/* One-Click Complete & Stock In */}
                        {po.status !== 'completed' && (
                          <button
                            onClick={async () => {
                              if (window.confirm(`確定要將採購單 ${po.po_id} 全部品項直接全數驗收入庫並完成結案嗎？\n系統將自動建立對應的進貨交易紀錄並更新庫存！`)) {
                                await completeAndStockInAllRemainingPO(po.po_id);
                              }
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-lg text-xs font-black shadow-md shadow-sky-500/20 transition-all cursor-pointer"
                            title="一鍵將此單全部品項入庫並自動完成結案，確保交易紀錄完整"
                          >
                            <Boxes className="w-4 h-4 stroke-[2.5]" />
                            <span>一鍵全數入庫結案</span>
                          </button>
                        )}

                        {/* Check-In / Add Missing Items Button */}
                        <button
                          onClick={() => handleStartCheckInForPO(po)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg text-xs font-extrabold shadow-md shadow-emerald-500/20 transition-all cursor-pointer"
                          title="開啟核對清單，自訂本次入庫數量或補登缺漏商品"
                        >
                          <Check className="w-4 h-4 stroke-[3]" />
                          <span>{po.status === 'completed' ? '補登進貨品項' : '核對入庫'}</span>
                        </button>

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

                    {/* Linked Transactions Section */}
                    {(() => {
                      const relatedTransactions = (transactions || []).filter(t => 
                        t.po_id === po.po_id || 
                        (t.transaction_id && t.transaction_id === po.po_id) ||
                        (t.transaction_id && t.transaction_id.startsWith(po.po_id)) ||
                        (t.batch_id && t.batch_id === po.po_id) ||
                        (t.note && (t.note.includes(`[採購單: ${po.po_id}]`) || t.note.includes(`採購單號: ${po.po_id}`) || t.note.includes(po.po_id)))
                      );
                      const totalTxQty = relatedTransactions.reduce((sum, t) => sum + Number(t.quantity || 0), 0);
                      const uniqueBatchIds = Array.from(new Set(relatedTransactions.map(t => t.batch_id || t.batch_tx_id || t.transaction_id).filter(Boolean)));
                      
                      const checkedProductIds = new Set(relatedTransactions.map(t => t.product_id));
                      const missingItems = (po.items || []).filter(it => !checkedProductIds.has(it.product_id));

                      return (
                        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                                <ArrowDownToLine className="w-3.5 h-3.5 text-sky-400" />
                                關聯進貨交易紀錄 ({relatedTransactions.length} 筆明細 / 總入庫 {totalTxQty} 件)
                              </span>
                              {uniqueBatchIds.length > 0 && (
                                <span className="font-mono text-[10px] bg-sky-500/10 text-sky-300 border border-sky-500/20 px-2 py-0.5 rounded">
                                  批次號: {uniqueBatchIds.join(', ')}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              {relatedTransactions.length > 0 && (
                                <Link
                                  to="/transactions"
                                  className="text-[11px] text-sky-400 hover:text-sky-300 font-bold flex items-center gap-1 hover:underline"
                                >
                                  <Eye className="w-3 h-3" />
                                  在交易紀錄查看
                                </Link>
                              )}
                              <button
                                onClick={() => handleStartCheckInForPO(po)}
                                className="text-[11px] bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-lg font-bold flex items-center gap-1 cursor-pointer transition-colors"
                                title="追加或補登此採購單品項入庫"
                              >
                                <Plus className="w-3 h-3" />
                                補登/追加入庫
                              </button>
                            </div>
                          </div>

                          {relatedTransactions.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5 pt-1">
                              {relatedTransactions.map((tx, txIdx) => (
                                <div key={tx.id || tx.transaction_id || txIdx} className="bg-black/30 border border-white/5 rounded-lg p-2 text-xs flex justify-between items-center">
                                  <div className="min-w-0 flex-1 pr-2">
                                    <div className="font-bold text-white truncate">{tx.product_name || tx.product_id}</div>
                                    <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                                      <span>{tx.specification || tx.product_id}</span>
                                      <span>•</span>
                                      <span>{tx.date ? String(tx.date).slice(5, 16) : ''}</span>
                                    </div>
                                  </div>
                                  <div className="font-mono font-black text-sky-400 text-sm shrink-0">
                                    +{tx.quantity}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-[11px] text-slate-500 flex items-center justify-between py-1">
                              <span>尚無已關聯的入庫交易紀錄。</span>
                              {po.status === 'completed' && (
                                <span className="text-amber-400">⚠️ 此單已標記結案但尚未產生進貨紀錄，若需入庫請點擊「補登/追加入庫」或「一鍵全數入庫結案」。</span>
                              )}
                            </div>
                          )}

                          {missingItems.length > 0 && relatedTransactions.length > 0 && (
                            <div className="text-[11px] text-amber-300/90 bg-amber-500/10 p-2 rounded-lg border border-amber-500/20 flex flex-wrap items-center justify-between gap-2">
                              <span>⚠️ 提示：此採購單尚有 {missingItems.length} 款商品未登錄至進貨紀錄（{missingItems.map(m => m.name).join('、')}）</span>
                              <button
                                onClick={() => handleStartCheckInForPO(po)}
                                className="text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-2.5 py-0.5 rounded-lg cursor-pointer shrink-0"
                              >
                                立即補登缺漏品項
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })()}

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

      {/* TAB 2: AI / LOCAL SCANNER & INVOICE OCR (MULTI-IMAGE SUPPORT) */}
      {activeTab === 'scan' && (
        <div className="space-y-6" onPaste={handlePasteImage}>
          <div className="bg-[#0f172a] border border-white/10 rounded-2xl p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Camera className="w-5 h-5 text-sky-400" />
                  進貨單據拍照 / 雙引擎智慧辨識（支援多張 / 跨頁單據）
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  支援選取或連續拍攝 <span className="text-sky-300 font-bold">2 張以上多頁進貨單、出貨單、發票</span>。可使用「⚡ 本地離線辨識」或「✨ 雲端 AI 跨頁深度解析」，辨識後自動將所有頁面商品整合入庫。
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
                  <span>選取檔案 (可多選)</span>
                </button>
              </div>
            </div>

            {/* Hidden native inputs with multiple selection enabled */}
            <input
              type="file"
              ref={cameraInputRef}
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleSelectImageFiles(e.target.files);
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
                  handleSelectImageFiles(e.target.files);
                }
                e.target.value = '';
              }}
            />

            {/* Upload Area / Image Preview Gallery */}
            {imagePreviewUrls.length === 0 ? (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-white/20 hover:border-sky-500/50 bg-white/[0.02] hover:bg-sky-500/[0.03] rounded-2xl p-10 text-center cursor-pointer transition-all space-y-3"
              >
                <div className="w-16 h-16 mx-auto rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                  <Images className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-white">點擊選取或拖曳進貨單據圖片至此（支援一次選取多張圖片）</p>
                  <p className="text-xs text-slate-400">若有第1頁、第2頁或同批多張單據，可一次選取或連續拍照，AI 將自動統整全部品項（支援 Ctrl+V 貼上截圖）</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Multi-Image Thumbnail Row */}
                <div className="flex items-center gap-3 overflow-x-auto pb-2 custom-scrollbar">
                  {imagePreviewUrls.map((url, idx) => (
                    <div 
                      key={idx}
                      onClick={() => setActiveImageIndex(idx)}
                      className={cn(
                        "relative shrink-0 w-24 h-24 rounded-xl overflow-hidden border-2 cursor-pointer transition-all group bg-black/40",
                        activeImageIndex === idx ? "border-sky-400 shadow-md shadow-sky-500/20 scale-105" : "border-white/10 hover:border-white/30 opacity-70 hover:opacity-100"
                      )}
                    >
                      <img src={url} alt={`單據 ${idx + 1}`} className="w-full h-full object-cover" />
                      <div className="absolute top-1 left-1 bg-black/80 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded text-white border border-white/10">
                        #{idx + 1}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveImage(idx);
                        }}
                        className="absolute top-1 right-1 p-1 bg-black/80 sm:bg-red-600/90 hover:bg-red-600 text-white rounded-full transition-opacity opacity-100 sm:opacity-0 sm:group-hover:opacity-100 shadow"
                        title="移除此張圖片"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}

                  {/* Add more images button */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-24 h-24 rounded-xl border-2 border-dashed border-sky-500/40 hover:border-sky-400 hover:bg-sky-500/10 flex flex-col items-center justify-center gap-1.5 text-sky-400 text-xs font-bold transition-all cursor-pointer"
                      title="加選其他單據圖片"
                    >
                      <Plus className="w-5 h-5" />
                      <span>加選圖片</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="w-24 h-24 rounded-xl border-2 border-dashed border-emerald-500/40 hover:border-emerald-400 hover:bg-emerald-500/10 flex flex-col items-center justify-center gap-1.5 text-emerald-400 text-xs font-bold transition-all cursor-pointer"
                      title="拍照追加下一頁"
                    >
                      <Camera className="w-5 h-5" />
                      <span>拍照續拍</span>
                    </button>
                  </div>
                </div>

                {/* Main Active Image Large Preview */}
                <div className="relative rounded-2xl overflow-hidden bg-black/50 border border-white/10 max-h-[480px] flex items-center justify-center">
                  <img
                    src={imagePreviewUrls[activeImageIndex] || imagePreviewUrls[0]}
                    alt={`單據大圖預覽 ${activeImageIndex + 1}`}
                    className="max-h-[480px] w-auto object-contain"
                  />
                  
                  {/* Overlay badge with page information */}
                  <div className="absolute top-3 left-3 bg-black/80 backdrop-blur-sm border border-white/10 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-200 flex items-center gap-2">
                    <Images className="w-3.5 h-3.5 text-sky-400" />
                    <span>單據第 {activeImageIndex + 1} / {imagePreviewUrls.length} 張</span>
                  </div>

                  {/* Navigation Arrows if multiple images */}
                  {imagePreviewUrls.length > 1 && (
                    <div className="absolute bottom-3 right-3 flex items-center gap-2">
                      <button
                        onClick={() => setActiveImageIndex(prev => Math.max(0, prev - 1))}
                        disabled={activeImageIndex === 0}
                        className="px-3 py-1.5 bg-black/80 hover:bg-black text-white text-xs font-bold rounded-xl border border-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        ◀ 上一張
                      </button>
                      <button
                        onClick={() => setActiveImageIndex(prev => Math.min(imagePreviewUrls.length - 1, prev + 1))}
                        disabled={activeImageIndex === imagePreviewUrls.length - 1}
                        className="px-3 py-1.5 bg-black/80 hover:bg-black text-white text-xs font-bold rounded-xl border border-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        下一張 ▶
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => handleRemoveImage(activeImageIndex)}
                    className="absolute top-3 right-3 p-2 bg-black/70 hover:bg-red-600 text-white rounded-full transition-colors"
                    title="移除目前顯示的單據"
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
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleClearAllImages}
                      className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      清空所有圖片
                    </button>
                    <span className="text-xs text-slate-400">
                      已就緒：<strong className="text-white">{imagePreviewUrls.length}</strong> 張單據
                    </span>
                  </div>

                  <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                    {/* Primary Button: Local Offline OCR */}
                    <button
                      onClick={handleStartLocalOCR}
                      disabled={isScanning}
                      className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black rounded-xl text-xs shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50 cursor-pointer"
                      title="在瀏覽器本地離線執行逐頁辨識，不消耗任何網路 AI 額度"
                    >
                      {isScanning && scanEngineType === 'local' ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>本地辨識中 ({ocrProgressPercent}%)...</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4 fill-current stroke-[2.5]" />
                          <span>⚡ 本地離線快速辨識 ({imagePreviewUrls.length} 張)</span>
                        </>
                      )}
                    </button>

                    {/* Secondary Button: Cloud AI Fallback */}
                    <button
                      onClick={handleStartAIOCR}
                      disabled={isScanning}
                      className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-slate-950 font-black rounded-xl text-xs shadow-lg shadow-sky-500/20 transition-all disabled:opacity-50 cursor-pointer"
                      title="使用 Google Gemini 視覺大模型，跨頁聯合解析所有圖片"
                    >
                      {isScanning && scanEngineType === 'ai' ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>AI 跨頁解析中...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 stroke-[2.5]" />
                          <span>✨ 雲端 AI 深度解析 ({imagePreviewUrls.length} 張單據)</span>
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Plus className="w-5 h-5 text-indigo-400" />
                  建立供應商採購訂單 (在途庫存登記)
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  向廠商訂貨後建立此紀錄，系統會自動在「網路訂單管理」中計入在途庫存，避免隔天新訂單重複下單採購。
                </p>
              </div>

              {/* Import Excel Order Button */}
              <button
                type="button"
                onClick={() => setIsExcelImportModalOpen(true)}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black rounded-xl text-xs shadow-lg shadow-emerald-600/25 border border-emerald-400/30 transition-all cursor-pointer active:scale-95 shrink-0"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
                <span>📊 匯入 EXCEL 訂單</span>
              </button>
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

            {/* Product Picker Section */}
            <div className="space-y-3 bg-white/[0.02] border border-white/10 rounded-2xl p-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-indigo-400" />
                  <label className="text-xs font-bold text-white">挑選商品加入採購清單</label>
                  <span className="text-[11px] px-2 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full font-mono font-bold">
                    已加入 {newPOItems.length} 項商品
                  </span>
                </div>

                {/* Main Action Buttons */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setIsProductCatalogModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>瀏覽/挑選商品目錄 ({products.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleAddCustomItemToNewPO}
                    className="flex items-center gap-1 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/15 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-indigo-400" />
                    <span>手動新增自訂品項</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsExcelImportModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                    <span>匯入 Excel 採購單</span>
                  </button>
                </div>
              </div>

              {/* Vendor-associated Quick Chips (if current vendor has known products) */}
              {currentVendorProducts.length > 0 && (
                <div className="p-2.5 bg-indigo-950/30 border border-indigo-500/20 rounded-xl space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] text-indigo-300 font-bold">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    <span>「{newPOVendorName}」常購商品快速點選加入：</span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap max-h-24 overflow-y-auto custom-scrollbar">
                    {currentVendorProducts.slice(0, 10).map(p => {
                      const isAdded = newPOItems.some(it => it.product_id === p.product_id);
                      const inStock = productTotalStockMap.get(p.product_id) || 0;
                      const onOrderQty = getOnOrderStockQty(purchaseOrders, p.product_id, p.specification);
                      return (
                        <button
                          key={p.product_id}
                          type="button"
                          onClick={() => handleAddProductToNewPO(p, 1)}
                          className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                            isAdded
                              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 font-bold'
                              : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300 hover:text-white'
                          }`}
                        >
                          <span>{isAdded ? '✓' : '+'}</span>
                          <span>{p.name}</span>
                          {p.specification && <span className="text-[10px] text-slate-400">({p.specification})</span>}
                          <span className="text-[10px] text-sky-300 font-mono">現存:{inStock}</span>
                          {onOrderQty > 0 ? (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-300 font-mono font-bold bg-amber-500/20 px-1 rounded">
                              <Truck className="w-2.5 h-2.5" />在途:{onOrderQty}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-500 font-mono">在途:0</span>
                          )}
                          <span className="text-[10px] text-amber-300 font-mono">${p.cost_price || 0}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Real-time Search Box */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="輸入關鍵字即時搜尋商品品名、規格、貨號、條碼..."
                  value={productSearchTerm}
                  onFocus={() => setIsSearchFocused(true)}
                  onChange={(e) => {
                    setProductSearchTerm(e.target.value);
                    setIsSearchFocused(true);
                  }}
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-900 border border-white/15 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:bg-slate-900/90 transition-all"
                />
                {productSearchTerm && (
                  <button
                    type="button"
                    onClick={() => setProductSearchTerm('')}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Instant Search Suggestions Dropdown */}
              {(productSearchTerm.trim() || (isSearchFocused && products.length > 0)) && (
                <div className="max-h-60 overflow-y-auto bg-slate-900 border border-indigo-500/30 rounded-xl p-2 space-y-1 divide-y divide-white/5 custom-scrollbar shadow-xl animate-in fade-in duration-150">
                  {(() => {
                    const term = productSearchTerm.trim().toLowerCase();
                    const matchedList = products.filter(p => {
                      if (!term) return true; // Show all / top items if focused
                      const pName = (p.name || '').toLowerCase();
                      const pId = (p.product_id || '').toLowerCase();
                      const pSpec = (p.specification || '').toLowerCase();
                      const pBarcode = (p.barcode || '').toLowerCase();
                      const pCategory = (p.category || '').toLowerCase();
                      return pName.includes(term) || pId.includes(term) || pSpec.includes(term) || pBarcode.includes(term) || pCategory.includes(term);
                    }).slice(0, 10);

                    if (matchedList.length === 0) {
                      return (
                        <div className="p-4 text-center space-y-2">
                          <p className="text-xs text-slate-400">找不到包含「{productSearchTerm}」的商品</p>
                          <button
                            type="button"
                            onClick={() => {
                              handleAddCustomItemToNewPO();
                              setProductSearchTerm('');
                              setIsSearchFocused(false);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>直接以「{productSearchTerm}」新增為自訂品項</span>
                          </button>
                        </div>
                      );
                    }

                    return (
                      <>
                        <div className="px-2 py-1 flex items-center justify-between text-[11px] text-slate-400">
                          <span>{term ? `搜尋到 ${matchedList.length} 筆符合商品：` : '💡 常用庫存商品推薦（點擊即可加入）：'}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setIsProductCatalogModalOpen(true);
                              setIsSearchFocused(false);
                            }}
                            className="text-indigo-400 hover:underline text-[11px] cursor-pointer"
                          >
                            開啟完整目錄 »
                          </button>
                        </div>
                        {matchedList.map(p => {
                          const existingItem = newPOItems.find(it => it.product_id === p.product_id);
                          const inStock = productTotalStockMap.get(p.product_id) || 0;
                          const onOrderQty = getOnOrderStockQty(purchaseOrders, p.product_id, p.specification);

                          return (
                            <div
                              key={p.product_id}
                              onClick={() => {
                                handleAddProductToNewPO(p, 1);
                              }}
                              className="flex items-center justify-between p-2 hover:bg-indigo-500/15 rounded-lg cursor-pointer transition-colors group pt-2"
                            >
                              <div className="space-y-0.5 flex-1 pr-3">
                                <div className="font-bold text-xs text-white group-hover:text-indigo-200 flex items-center gap-2">
                                  <span>{p.name}</span>
                                  {existingItem && (
                                    <span className="text-[10px] px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded font-mono font-bold">
                                      已加入 x{existingItem.ordered_quantity}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 flex items-center gap-2 flex-wrap">
                                  <span className="font-mono text-slate-500">{p.product_id}</span>
                                  {p.specification && <span>• 規格: {p.specification}</span>}
                                  <span>• 現存: <strong className="text-sky-300 font-mono">{inStock}</strong></span>
                                  {onOrderQty > 0 ? (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded font-mono font-bold">
                                      <Truck className="w-2.5 h-2.5 text-amber-400 shrink-0" />
                                      <span>在途: {onOrderQty}</span>
                                    </span>
                                  ) : (
                                    <span className="text-slate-500 font-mono">• 在途: 0</span>
                                  )}
                                  <span className="text-amber-300 font-mono font-bold">• 預設進價: ${p.cost_price || 0}</span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAddProductToNewPO(p, 1);
                                }}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all shrink-0 ${
                                  existingItem
                                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
                                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm'
                                }`}
                              >
                                {existingItem ? `+ 累加 (${existingItem.ordered_quantity})` : '+ 加入'}
                              </button>
                            </div>
                          );
                        })}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* Selected Items Table */}
            {newPOItems.length === 0 ? (
              <div className="p-8 border border-dashed border-white/15 rounded-2xl text-center space-y-3 bg-white/[0.01]">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto">
                  <ShoppingCart className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-slate-300">尚未挑選任何採購商品</h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                    您可以點擊上方「<strong className="text-indigo-400">瀏覽/挑選商品目錄</strong>」勾選庫存商品，或透過搜尋框即時加入，亦可直接點擊「<strong className="text-slate-300">手動新增自訂品項</strong>」或「<strong className="text-emerald-400">匯入 Excel 採購單</strong>」。
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsProductCatalogModalOpen(true)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/20 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Search className="w-3.5 h-3.5" />
                    <span>挑選商品目錄 ({products.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleAddCustomItemToNewPO}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>手動自訂品項</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="overflow-x-auto border border-white/10 rounded-2xl bg-slate-900/60 shadow-lg">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-white/5 text-slate-400 font-bold border-b border-white/10">
                        <th className="py-2.5 px-3 w-10 text-center">#</th>
                        <th className="py-2.5 px-3 min-w-[180px]">商品品名 / 貨號</th>
                        <th className="py-2.5 px-2 min-w-[110px]">規格 / 型號</th>
                        <th className="py-2.5 px-2 w-20 text-center">現存庫存</th>
                        <th className="py-2.5 px-2 w-24 text-center">在途採購量</th>
                        <th className="py-2.5 px-2 w-32 text-center">訂購數量</th>
                        <th className="py-2.5 px-2 w-28 text-center">約定進價(單價)</th>
                        <th className="py-2.5 px-2 w-24 text-right">小計</th>
                        <th className="py-2.5 px-2 min-w-[130px]">備註說明</th>
                        <th className="py-2.5 px-2 w-12 text-center">刪除</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {newPOItems.map((item, idx) => {
                        const inStock = productTotalStockMap.get(item.product_id) || 0;
                        const onOrder = getOnOrderStockQty(purchaseOrders, item.product_id, item.specification);

                        return (
                          <tr key={item.temp_id} className="hover:bg-white/[0.02] transition-colors">
                            <td className="py-2.5 px-3 text-center text-slate-500 font-mono text-[11px]">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3">
                              <input
                                type="text"
                                value={item.name}
                                placeholder="請輸入品名..."
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setNewPOItems(prev => prev.map((it, i) => i === idx ? { ...it, name: val } : it));
                                }}
                                className="w-full bg-transparent hover:bg-white/5 focus:bg-white/10 border border-transparent focus:border-white/20 rounded px-1.5 py-1 text-xs text-white font-bold focus:outline-none"
                              />
                              <span className="block text-[10px] font-mono text-slate-500 px-1.5">{item.product_id}</span>
                            </td>
                            <td className="py-2.5 px-2">
                              <input
                                type="text"
                                value={item.specification}
                                placeholder="規格 (選填)"
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setNewPOItems(prev => prev.map((it, i) => i === idx ? { ...it, specification: val } : it));
                                }}
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                              />
                            </td>
                            {/* In-stock */}
                            <td className="py-2.5 px-2 text-center">
                              <span className="font-mono font-bold text-sky-300 text-xs">
                                {inStock}
                              </span>
                            </td>
                            {/* In-transit / On-order */}
                            <td className="py-2.5 px-2 text-center">
                              {onOrder > 0 ? (
                                <span 
                                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-full font-mono font-bold text-xs shadow-sm"
                                  title={`目前未結案採購單中共有 ${onOrder} 件在途中`}
                                >
                                  <Truck className="w-3 h-3 text-amber-400 shrink-0" />
                                  <span>{onOrder}</span>
                                </span>
                              ) : (
                                <span className="text-slate-500 font-mono text-xs">0</span>
                              )}
                            </td>
                            <td className="py-2.5 px-2">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleUpdatePOItemQuantity(item.product_id, -1)}
                                  className="w-6 h-6 rounded bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white flex items-center justify-center font-bold text-xs"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  min="1"
                                  value={item.ordered_quantity}
                                  onChange={(e) => {
                                    const val = Math.max(1, Number(e.target.value) || 1);
                                    setNewPOItems(prev => prev.map((it, i) => i === idx ? { ...it, ordered_quantity: val } : it));
                                  }}
                                  className="w-14 bg-white/5 border border-white/10 rounded-lg px-1.5 py-1 text-xs text-center text-white font-mono font-bold focus:outline-none focus:border-indigo-500"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleUpdatePOItemQuantity(item.product_id, 1)}
                                  className="w-6 h-6 rounded bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white flex items-center justify-center font-bold text-xs"
                                >
                                  +
                                </button>
                              </div>
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">$</span>
                                <input
                                  type="number"
                                  min="0"
                                  value={item.cost_price}
                                  onChange={(e) => {
                                    const val = Math.max(0, Number(e.target.value) || 0);
                                    setNewPOItems(prev => prev.map((it, i) => i === idx ? { ...it, cost_price: val } : it));
                                  }}
                                  className="w-22 pl-4 pr-1.5 py-1 bg-white/5 border border-white/10 rounded-lg text-xs text-center text-white font-mono focus:outline-none focus:border-indigo-500"
                                />
                              </div>
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono font-bold text-amber-300 pr-3">
                              ${(item.ordered_quantity * item.cost_price).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-2">
                              <input
                                type="text"
                                value={item.note || ''}
                                placeholder="備註說明..."
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setNewPOItems(prev => prev.map((it, i) => i === idx ? { ...it, note: val } : it));
                                }}
                                className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                              />
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => setNewPOItems(prev => prev.filter((_, i) => i !== idx))}
                                className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-white/5 transition-colors cursor-pointer"
                                title="刪除此項"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Table Bottom Quick Actions */}
                <div className="flex items-center justify-between text-xs pt-1 px-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleAddCustomItemToNewPO}
                      className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-bold cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>+ 繼續新增一行自訂品項</span>
                    </button>
                    <span className="text-slate-600">•</span>
                    <button
                      type="button"
                      onClick={() => setIsProductCatalogModalOpen(true)}
                      className="text-xs text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
                    >
                      <Search className="w-3.5 h-3.5 text-indigo-400" />
                      <span>開啟目錄挑選更多</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('確定要清空已加入的所有採購品項嗎？')) {
                        setNewPOItems([]);
                      }
                    }}
                    className="text-slate-500 hover:text-red-400 text-[11px] cursor-pointer"
                  >
                    清空清單
                  </button>
                </div>
              </div>
            )}

            {/* Bottom Actions */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-3 pt-3 border-t border-white/5">
              <div className="flex items-center gap-4 text-xs text-slate-400">
                <div>
                  品項數：<span className="font-bold text-white">{newPOItems.length} 種</span>
                </div>
                <div>
                  總訂購數量：<span className="font-bold text-white">{newPOItems.reduce((acc, it) => acc + (Number(it.ordered_quantity) || 0), 0)} 件</span>
                </div>
                <div>
                  預估總金額：
                  <span className="text-base font-mono font-bold text-amber-300 ml-1">
                    ${newPOItems.reduce((acc, it) => acc + (it.ordered_quantity * it.cost_price), 0).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="flex gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setActiveTab('list')}
                  className="flex-1 sm:flex-none px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 rounded-xl text-xs font-bold cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSaveNewPO}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold rounded-xl text-xs shadow-lg shadow-indigo-600/25 cursor-pointer"
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>儲存採購單 (登記在途庫存)</span>
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

                <div className="col-span-2">
                  <label className="block text-slate-400 font-bold mb-1">關聯採購訂單 (在途扣抵)</label>
                  <select
                    value={confirmSelectedPOId}
                    onChange={(e) => setConfirmSelectedPOId(e.target.value)}
                    className="w-full bg-[#1e293b] border border-white/10 rounded-lg px-2.5 py-1.5 text-white"
                  >
                    <option value="">無關聯 (獨立進貨)</option>
                    {purchaseOrders
                      .filter(po => po.status === 'pending' || po.status === 'partial')
                      .map(po => {
                        const itemsCount = po.items?.length || 0;
                        const totalQty = po.items?.reduce((sum, item) => sum + Number(item.ordered_quantity || 0), 0) || 0;
                        const statusLabel = po.status === 'pending' ? '待到貨' : '部分到貨';
                        return (
                          <option key={po.po_id} value={po.po_id}>
                            【{statusLabel}】{po.po_id} - {po.vendor_name || '廠商'} (共 {itemsCount} 款 {totalQty} 件)
                          </option>
                        );
                      })}
                  </select>
                  
                  {/* 微型採購單明細卡片 (供人工核對用) */}
                  {confirmSelectedPOId && (() => {
                    const selectedPO = purchaseOrders.find(po => po.po_id === confirmSelectedPOId);
                    if (!selectedPO) return null;
                    return (
                      <div className="mt-2 p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-1.5">
                        <div className="text-[11px] font-bold text-emerald-300 flex items-center justify-between">
                          <span>📋 採購單預期內容 (供核對參考，不會覆蓋下方辨識結果)</span>
                          <span>預計到貨: {selectedPO.expected_date}</span>
                        </div>
                        <div className="space-y-1 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                          {(selectedPO.items || []).map((item, idx) => {
                            const remaining = Math.max(0, Number(item.ordered_quantity || 0) - Number(item.received_quantity || 0));
                            return (
                              <div key={idx} className="flex justify-between items-center text-[11px] bg-black/20 p-1.5 rounded-lg border border-white/5">
                                <div className="flex-1 truncate pr-2">
                                  <span className="text-white font-bold">{item.name}</span>
                                  {item.product_id && <span className="text-slate-400 font-mono ml-1">({item.product_id})</span>}
                                </div>
                                <div className="shrink-0 font-mono">
                                  <span className="text-emerald-300 font-black">待到: {remaining}</span>
                                  <span className="text-slate-500 ml-1">/ 總定: {item.ordered_quantity}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Multi-Invoice Source Photos Viewer (Collapsible / Switchable) */}
              {confirmImageUrls.length > 0 && (
                <div className="bg-black/30 border border-white/10 rounded-xl p-3.5 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                      <Images className="w-4 h-4 text-sky-400" />
                      <span>進貨單據原圖核對（共 {confirmImageUrls.length} 張單據）</span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {confirmImageUrls.map((_, pIdx) => (
                        <button
                          key={pIdx}
                          type="button"
                          onClick={() => setConfirmActiveImageIndex(pIdx)}
                          className={cn(
                            "px-2.5 py-1 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer",
                            confirmActiveImageIndex === pIdx 
                              ? "bg-sky-500 text-slate-950 shadow-md shadow-sky-500/20" 
                              : "bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10"
                          )}
                        >
                          第 {pIdx + 1} 頁
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="relative rounded-xl overflow-hidden bg-black/60 border border-white/10 max-h-56 flex items-center justify-center group">
                    <img 
                      src={confirmImageUrls[confirmActiveImageIndex] || confirmImageUrls[0]} 
                      alt={`單據原圖 ${confirmActiveImageIndex + 1}`}
                      className="max-h-56 w-auto object-contain cursor-zoom-in"
                      onClick={() => setPreviewImage(confirmImageUrls[confirmActiveImageIndex] || confirmImageUrls[0])}
                    />
                    <div className="absolute bottom-2 right-2 bg-black/80 px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-300 border border-white/10 flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <ZoomIn className="w-3.5 h-3.5 text-sky-400" />
                      <span>點擊放大檢視第 {confirmActiveImageIndex + 1} 頁</span>
                    </div>
                  </div>
                </div>
              )}

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

      {/* Import Excel Order Modal */}
      <ImportExcelOrderModal
        isOpen={isExcelImportModalOpen}
        onClose={() => setIsExcelImportModalOpen(false)}
        products={products}
        allKnownVendors={allKnownVendors}
        currentItemsCount={newPOItems.length}
        onImportItems={handleImportExcelOrderItems}
        showToast={showToast}
      />

      {/* Product Catalog Picker Modal */}
      <ProductCatalogPickerModal
        isOpen={isProductCatalogModalOpen}
        onClose={() => setIsProductCatalogModalOpen(false)}
        products={products}
        vendors={vendors}
        stockMap={productTotalStockMap}
        vendorMap={vendorMap}
        selectedItems={newPOItems}
        onAddProduct={handleAddProductToNewPO}
        onUpdateQuantity={handleUpdatePOItemQuantity}
        onAddCustomItem={handleAddCustomItemToNewPO}
        defaultVendorName={newPOVendorName}
      />

      {/* PO Invoice Photo Management / Upload Modal */}
      <PurchaseOrderPhotoModal
        po={photoModalPO}
        isOpen={!!photoModalPO}
        onClose={() => setPhotoModalPO(null)}
        onSaveImages={async (poId, imageUrls) => {
          await updatePurchaseOrder(poId, { invoice_image_url: imageUrls });
        }}
        uploadInvoiceImage={uploadInvoiceImage}
        vendorName={photoModalPO ? (photoModalPO.vendor_name || vendorMap.get(photoModalPO.vendor_id || '') || '') : ''}
        showToast={showToast}
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
