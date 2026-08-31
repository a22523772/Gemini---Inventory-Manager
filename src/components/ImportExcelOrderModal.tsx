import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Product } from '../lib/db';
import { 
  FileSpreadsheet, Upload, X, CheckCircle2, AlertCircle, 
  Download, ArrowRight, Layers, DollarSign, Package, Check, RefreshCw,
  Clipboard, HelpCircle, ArrowUpDown, ChevronDown, CheckCheck, Sparkles,
  Search, Trash2, Edit2
} from 'lucide-react';

export interface ParsedExcelOrderItem {
  temp_id: string;
  product_id: string;
  name: string;
  specification: string;
  ordered_quantity: number;
  cost_price: number;
  note: string;
  is_matched: boolean;
  matched_product?: Product;
}

interface ImportExcelOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  allKnownVendors: { vendor_id: string; vendor_name: string }[];
  currentItemsCount: number;
  onImportItems: (
    items: Array<{
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
  ) => void;
  showToast: (msg: string) => void;
}

// Helper to clean numbers from strings like "$ 1,200", "15 pcs", "NT$300", "２０"
const cleanNumber = (val: any, fallback = 0): number => {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'number') return isNaN(val) ? fallback : val;
  
  let str = String(val).trim();
  // Normalize full-width digits
  str = str.replace(/[\uff10-\uff19]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  // Remove currency, spaces, comma, unit labels
  str = str.replace(/[$,¥NTnt元件個箱組套包支把袋盒PCSkgKGpcs\s]/g, '');
  
  const num = parseFloat(str);
  return isNaN(num) ? fallback : num;
};

// Parser for multi-line shipment details in a single cell or text lines (e.g. "經典研磨咖啡豆 227g *5包")
interface ParsedShipmentDetailLine {
  name: string;
  specification: string;
  quantity: number;
  costPrice?: number;
}

const parseShipmentDetailLines = (text: string): ParsedShipmentDetailLine[] => {
  if (!text || typeof text !== 'string') return [];
  
  // Split by line breaks, semicolons or bullet points
  const rawLines = text.split(/\r?\n|;/).map(l => l.trim()).filter(Boolean);
  const results: ParsedShipmentDetailLine[] = [];

  for (const rawLine of rawLines) {
    let line = rawLine.trim();
    if (!line) continue;

    // Filter out title headers if copied along
    if (line === '出貨明細' || line === '商品明細' || line === '明細' || line.startsWith('===') || line.startsWith('---')) {
      continue;
    }

    // 1. Extract Quantity (e.g. *1個, *10個, *2個, x1, * 10, 10個, 2台, 1件)
    let qty = 1;
    
    // Pattern A: Asterisk or X followed by number: "*1個", "* 10 個", "x2", "*5"
    const starQtyMatch = line.match(/[*xX×]\s*(\d+)(?:\s*[個件台支入組袋箱套把包盒雙本條塊份PCSpcsPCS])?/i);
    if (starQtyMatch && starQtyMatch[1]) {
      qty = parseInt(starQtyMatch[1], 10) || 1;
      line = line.replace(starQtyMatch[0], '').trim();
    } else {
      // Pattern B: Trailing number with unit, e.g. " 10個", " 2台", " 1件"
      const endQtyMatch = line.match(/\s+(\d+)\s*[個件台支入組袋箱套把包盒雙本條塊份PCSpcsPCS]$/i);
      if (endQtyMatch && endQtyMatch[1]) {
        qty = parseInt(endQtyMatch[1], 10) || 1;
        line = line.slice(0, line.lastIndexOf(endQtyMatch[0])).trim();
      } else {
        // Pattern C: Trailing pure number separated by space, e.g. "品名型號 10"
        const trailingNumMatch = line.match(/\s+(\d+)$/);
        if (trailingNumMatch && trailingNumMatch[1]) {
          const possibleQty = parseInt(trailingNumMatch[1], 10);
          if (possibleQty > 0 && possibleQty <= 9999) {
            qty = possibleQty;
            line = line.slice(0, line.lastIndexOf(trailingNumMatch[0])).trim();
          }
        }
      }
    }

    // 2. Extract Specification (e.g. 【夜霧灰】, 【白色】, [黑色], (紅色))
    let spec = '';
    const bracketMatch = line.match(/【([^】]+)】|\[([^\]]+)\]|\(([^\)]+)\)|（([^）]+)）/);
    if (bracketMatch) {
      spec = (bracketMatch[1] || bracketMatch[2] || bracketMatch[3] || bracketMatch[4] || '').trim();
      // Also keep the clean brackets or clean string for matching
    }

    const finalName = line.trim();
    if (finalName) {
      results.push({
        name: finalName,
        specification: spec,
        quantity: Math.max(1, qty)
      });
    }
  }

  return results;
};

export default function ImportExcelOrderModal({
  isOpen,
  onClose,
  products,
  allKnownVendors,
  currentItemsCount,
  onImportItems,
  showToast
}: ImportExcelOrderModalProps) {
  const [activeTab, setActiveTab] = useState<'upload' | 'paste'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Workbook data
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [rawSheetRows, setRawSheetRows] = useState<any[][]>([]);

  // Column mapping states
  const [showAdvancedMapping, setShowAdvancedMapping] = useState(false);
  const [startRowIndex, setStartRowIndex] = useState<number>(1);
  const [nameColIndex, setNameColIndex] = useState<number>(-1);
  const [specColIndex, setSpecColIndex] = useState<number>(-1);
  const [qtyColIndex, setQtyColIndex] = useState<number>(-1);
  const [costColIndex, setCostColIndex] = useState<number>(-1);
  const [skuColIndex, setSkuColIndex] = useState<number>(-1);
  const [vendorColIndex, setVendorColIndex] = useState<number>(-1);
  const [noteColIndex, setNoteColIndex] = useState<number>(-1);
  const [detailColIndex, setDetailColIndex] = useState<number>(-1); // For "出貨明細" multi-line column

  // Parsed Items
  const [parsedItems, setParsedItems] = useState<ParsedExcelOrderItem[]>([]);
  const [detectedVendor, setDetectedVendor] = useState<{ vendor_id: string; vendor_name: string } | undefined>(undefined);
  const [detectedExpectedDate, setDetectedExpectedDate] = useState<string | undefined>(undefined);
  const [applyVendor, setApplyVendor] = useState(true);
  const [applyDate, setApplyDate] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  // Paste text state
  const [pastedText, setPastedText] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset when modal is reopened
  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Header keyword mappings
  const DETAIL_KEYWORDS = ['出貨明細', '出貨品項', '訂貨明細', '出貨內容', '出貨商品', '訂購明細', '出貨項目', '品項明細', '商品明細', '明細', '訂單明細'];
  const NAME_KEYWORDS = ['品名', '商品名稱', '商品品名', '產品名稱', '商品', '名稱', '項目', '品項', '內容', '產品', '貨品', '說明', 'item', 'description', 'product', 'title', 'name', 'desc'];
  const SPEC_KEYWORDS = ['規格', '規格名稱', '款式', '顏色', '型號', '尺寸', '選項', '顏色尺寸', '款式規格', '規格/顏色', '型號/規格', 'spec', 'specification', 'model', 'option', 'size', 'color'];
  const QTY_KEYWORDS = ['數量', '訂購數量', '訂單數量', '採購數量', '需求數量', '件數', '入庫量', '訂購量', '採購量', '訂量', '數 量', 'pcs', 'qty', 'quantity', 'amount', 'count'];
  const COST_KEYWORDS = ['進價', '單價', '採購價', '成本', '成本價', '價格', '進貨價', '單價(元)', '進價(元)', '成本(元)', '單價(未稅)', '單 價', '進 價', 'cost', 'price', 'unit price', 'unit_price'];
  const SKU_KEYWORDS = ['貨號', '商品貨號', '商品編號', '代碼', '條碼', '國際條碼', '料號', '物料編號', 'erp料號', '編號', 'sku', 'barcode', 'item code', 'product id', 'id', 'product_id'];
  const VENDOR_KEYWORDS = ['廠商', '供應商', '廠商名稱', '供應商名稱', '供貨商', '寄件人', '廠商代碼', 'vendor', 'supplier', 'vendor_name'];
  const NOTE_KEYWORDS = ['備註', '說明', '備註說明', '附註', '備 註', 'note', 'remark', 'comments'];

  const matchColIndex = (headers: string[], matchKeywords: string[]) => {
    return headers.findIndex(h => {
      if (!h || typeof h !== 'string') return false;
      const clean = h.trim().toLowerCase().replace(/[\s_\-():：]/g, '');
      return matchKeywords.some(kw => {
        const cleanKw = kw.toLowerCase().replace(/[\s_\-():：]/g, '');
        return clean === cleanKw || clean.includes(cleanKw) || cleanKw.includes(clean);
      });
    });
  };

  // Match a product from system product list using multiple smart strategies
  const matchProductFromSystem = (rawName: string, rawSpec: string, rawSku: string): Product | undefined => {
    if (!products || products.length === 0) return undefined;

    // Strategy 1: SKU or Barcode exact match
    if (rawSku) {
      const p = products.find(prod => 
        prod.product_id.toLowerCase() === rawSku.toLowerCase() || 
        (prod.barcode && prod.barcode.trim() === rawSku.trim())
      );
      if (p) return p;
    }

    if (!rawName) return undefined;

    const cleanRawName = rawName.trim().toLowerCase().replace(/[\s_\-()（）\[\]【】]/g, '');

    // Strategy 2: Exact Name + Spec
    let p = products.find(prod => {
      const prodName = prod.name.trim().toLowerCase();
      const nameEqual = prodName === rawName.trim().toLowerCase();
      if (!nameEqual) return false;
      if (rawSpec && prod.specification) {
        return prod.specification.trim().toLowerCase() === rawSpec.trim().toLowerCase();
      }
      return true;
    });
    if (p) return p;

    // Strategy 3: Exact Name
    p = products.find(prod => prod.name.trim().toLowerCase() === rawName.trim().toLowerCase());
    if (p) return p;

    // Strategy 4: Model/SKU substring in product name or ID (e.g. MS-A02, KAD-SD2652, KFC-SD2549, KPK-LN213G, FT-1801, XYFYK1513W, EX-001SS, CT-B301DL)
    // Extract potential model numbers like "MS-A02", "KAD-SD2652", "KFC-SD2549"
    const modelMatches = rawName.match(/[A-Za-z0-9]+-[A-Za-z0-9]+|[A-Za-z]{2,}\d{3,}/g);
    if (modelMatches && modelMatches.length > 0) {
      for (const m of modelMatches) {
        const cleanM = m.toLowerCase().trim();
        p = products.find(prod => 
          prod.product_id.toLowerCase().includes(cleanM) ||
          prod.name.toLowerCase().includes(cleanM) ||
          (prod.specification && prod.specification.toLowerCase().includes(cleanM))
        );
        if (p) return p;
      }
    }

    // Strategy 5: Product name inclusion
    p = products.find(prod => {
      const prodNameClean = prod.name.trim().toLowerCase().replace(/[\s_\-()（）\[\]【】]/g, '');
      return cleanRawName.includes(prodNameClean) || prodNameClean.includes(cleanRawName);
    });
    if (p) return p;

    // Strategy 6: Fuzzy key terms match (brand + key words)
    const words = rawName.split(/[\s,，、/]+/).filter(w => w.length >= 2);
    if (words.length >= 2) {
      p = products.find(prod => {
        const prodNameLower = prod.name.toLowerCase();
        const matchedWords = words.filter(w => prodNameLower.includes(w.toLowerCase()));
        return matchedWords.length >= Math.min(3, words.length);
      });
      if (p) return p;
    }

    return undefined;
  };

  // Build items from current column mappings and rows
  const generateItemsFromRows = (
    rows: any[][],
    sRow: number,
    nCol: number,
    sCol: number,
    qCol: number,
    cCol: number,
    skuCol: number,
    vCol: number,
    ntCol: number,
    dCol: number = -1,
    sourceFileName: string = ''
  ) => {
    if (!rows || rows.length === 0) return;

    let detectedVendorName = '';
    let detectedDateStr = '';

    // Check source file name for vendor & date (e.g. "供應商(出貨表) 2026.8.31.xlsx")
    if (sourceFileName) {
      const vNameMatch = sourceFileName.match(/(?:[XxX×]\s*([^\s.()（）_]+))|([^\s.()（）_]+(?=\(出貨表\)))/);
      if (vNameMatch && (vNameMatch[1] || vNameMatch[2])) {
        detectedVendorName = (vNameMatch[1] || vNameMatch[2]).trim();
      }
      const dMatch = sourceFileName.match(/(\d{4}[-./]\d{1,2}[-./]\d{1,2})/);
      if (dMatch && dMatch[1]) {
        detectedDateStr = dMatch[1].replace(/[/.]/g, '-');
      }
    }

    // Scan top header and meta rows for vendor or date
    for (let r = 0; r < Math.min(sRow + 3, rows.length); r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;
      for (const cell of row) {
        const str = String(cell || '').trim();
        if (!detectedVendorName) {
          const vMatch = str.match(/(?:廠商|供應商|供貨商|寄件人|Vendor|Supplier)[:：\s]+([^\s,;，；]+)/i);
          if (vMatch && vMatch[1]) {
            detectedVendorName = vMatch[1].trim();
          }
        }
        if (!detectedDateStr) {
          const dMatch = str.match(/(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})/);
          if (dMatch && dMatch[1]) {
            detectedDateStr = dMatch[1].replace(/[/.]/g, '-');
          }
        }
      }
    }

    const items: ParsedExcelOrderItem[] = [];
    const timestamp = Date.now();

    for (let r = sRow; r < rows.length; r++) {
      const row = rows[r];
      if (!Array.isArray(row) || row.length === 0) continue;

      const rawRowVendor = vCol >= 0 ? String(row[vCol] || '').trim() : '';
      if (!detectedVendorName && rawRowVendor) {
        // Extract vendor name from raw row
        detectedVendorName = rawRowVendor;
      }

      // Check if this row uses the "出貨明細" multi-line detail format (like the uploaded supplier template)
      const detailCellText = dCol >= 0 ? String(row[dCol] || '').trim() : '';
      const nameCellText = nCol >= 0 ? String(row[nCol] || '').trim() : '';

      // If detailCol is set or nameCol has multi-line formatted items with *1個
      const isMultiLineDetail = (dCol >= 0 && detailCellText) || (nameCellText.includes('\n') && (nameCellText.includes('*') || nameCellText.includes('個')));

      if (isMultiLineDetail) {
        const textToParse = dCol >= 0 && detailCellText ? detailCellText : nameCellText;
        const parsedLines = parseShipmentDetailLines(textToParse);
        const rowNote = ntCol >= 0 ? String(row[ntCol] || '').trim() : '';

        for (let lIdx = 0; lIdx < parsedLines.length; lIdx++) {
          const line = parsedLines[lIdx];
          const matchedProd = matchProductFromSystem(line.name, line.specification, '');
          
          const finalProductId = matchedProd 
            ? matchedProd.product_id 
            : `PO_IMP_${timestamp.toString().slice(-6)}_${items.length + 1}`;
          const finalName = matchedProd ? matchedProd.name : line.name;
          const finalSpec = line.specification || matchedProd?.specification || '';
          const finalCost = matchedProd ? Number(matchedProd.cost_price) || 0 : 0;

          items.push({
            temp_id: `EXCEL_ITEM_${timestamp}_${r}_${lIdx}`,
            product_id: finalProductId,
            name: finalName,
            specification: finalSpec,
            ordered_quantity: line.quantity,
            cost_price: finalCost,
            note: rowNote,
            is_matched: !!matchedProd,
            matched_product: matchedProd
          });
        }
        continue;
      }

      // Standard single-row column mapping
      const rawName = nCol >= 0 ? String(row[nCol] || '').trim() : '';
      const rawSpec = sCol >= 0 ? String(row[sCol] || '').trim() : '';
      const rawQty = qCol >= 0 ? cleanNumber(row[qCol], 1) : 1;
      const rawCost = cCol >= 0 ? cleanNumber(row[cCol], 0) : 0;
      const rawSku = skuCol >= 0 ? String(row[skuCol] || '').trim() : '';
      const rawNote = ntCol >= 0 ? String(row[ntCol] || '').trim() : '';

      // Skip empty or summary rows
      if (!rawName && !rawSku) continue;
      if (rawName.includes('合計') || rawName.includes('總計') || rawName.toLowerCase() === 'total' || rawName === '小計') continue;

      const validQty = rawQty <= 0 ? 1 : Math.round(rawQty);
      const validCost = rawCost < 0 ? 0 : rawCost;

      // Smart match against system products
      const matchedProduct = matchProductFromSystem(rawName, rawSpec, rawSku);

      const finalProductId = matchedProduct 
        ? matchedProduct.product_id 
        : (rawSku || `PO_IMP_${timestamp.toString().slice(-6)}_${items.length + 1}`);
      const finalName = matchedProduct ? matchedProduct.name : (rawName || rawSku);
      const finalSpec = rawSpec || matchedProduct?.specification || '';
      const finalCost = validCost > 0 ? validCost : (matchedProduct ? Number(matchedProduct.cost_price) || 0 : 0);

      items.push({
        temp_id: `EXCEL_ITEM_${timestamp}_${r}`,
        product_id: finalProductId,
        name: finalName,
        specification: finalSpec,
        ordered_quantity: validQty,
        cost_price: finalCost,
        note: rawNote,
        is_matched: !!matchedProduct,
        matched_product: matchedProduct
      });
    }

    if (detectedVendorName) {
      // Normalize vendor name if formatted with vendor code prefix
      const cleanVName = detectedVendorName.replace(/^A\d+[-_]/, '').trim();
      const found = allKnownVendors.find(v => 
        v.vendor_name.toLowerCase() === detectedVendorName.toLowerCase() ||
        v.vendor_name.toLowerCase() === cleanVName.toLowerCase() ||
        v.vendor_id.toLowerCase() === detectedVendorName.toLowerCase() ||
        cleanVName.toLowerCase().includes(v.vendor_name.toLowerCase()) ||
        v.vendor_name.toLowerCase().includes(cleanVName.toLowerCase())
      );
      setDetectedVendor(found || { vendor_id: `V_${timestamp.toString().slice(-6)}`, vendor_name: cleanVName || detectedVendorName });
    } else {
      setDetectedVendor(undefined);
    }

    if (detectedDateStr) {
      setDetectedExpectedDate(detectedDateStr);
    } else {
      setDetectedExpectedDate(undefined);
    }

    setParsedItems(items);
  };

  // Analyze raw rows to auto-detect header, vendor, shipment details, and column mappings
  const analyzeRowsAndMapColumns = (rows: any[][], sourceFileName: string = '') => {
    if (!rows || rows.length === 0) {
      setErrorMessage('工作表沒有可讀取的資料列！');
      return;
    }

    let headerRowIndex = -1;
    let maxMatches = 0;

    for (let r = 0; r < Math.min(15, rows.length); r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;
      const rowStrings = row.map(cell => String(cell || '').trim());
      
      let matches = 0;
      if (matchColIndex(rowStrings, DETAIL_KEYWORDS) >= 0) matches += 6; // High priority for "出貨明細"
      if (matchColIndex(rowStrings, NAME_KEYWORDS) >= 0) matches += 3;
      if (matchColIndex(rowStrings, QTY_KEYWORDS) >= 0) matches += 3;
      if (matchColIndex(rowStrings, SPEC_KEYWORDS) >= 0) matches += 2;
      if (matchColIndex(rowStrings, COST_KEYWORDS) >= 0) matches += 2;
      if (matchColIndex(rowStrings, SKU_KEYWORDS) >= 0) matches += 2;
      if (matchColIndex(rowStrings, VENDOR_KEYWORDS) >= 0) matches += 1;

      if (matches > maxMatches && matches >= 2) {
        maxMatches = matches;
        headerRowIndex = r;
      }
    }

    // Fallback if no header row clearly detected
    if (headerRowIndex === -1) {
      headerRowIndex = 0;
    }

    const headers = rows[headerRowIndex]?.map(cell => String(cell || '').trim()) || [];
    
    let dCol = matchColIndex(headers, DETAIL_KEYWORDS);
    let nCol = matchColIndex(headers, NAME_KEYWORDS);
    let sCol = matchColIndex(headers, SPEC_KEYWORDS);
    let qCol = matchColIndex(headers, QTY_KEYWORDS);
    let cCol = matchColIndex(headers, COST_KEYWORDS);
    let skuCol = matchColIndex(headers, SKU_KEYWORDS);
    let vCol = matchColIndex(headers, VENDOR_KEYWORDS);
    let ntCol = matchColIndex(headers, NOTE_KEYWORDS);

    // If "出貨明細" found (as in the uploaded supplier image where Column F is "出貨明細")
    if (dCol >= 0 && nCol === -1) {
      nCol = dCol;
    }

    // Check if any column in data rows contains multi-line shipment details (e.g. *1個)
    if (dCol === -1) {
      for (let c = 0; c < headers.length; c++) {
        const sampleCell = String(rows[headerRowIndex + 1]?.[c] || '');
        if (sampleCell.includes('\n') && (sampleCell.includes('*') || sampleCell.includes('個'))) {
          dCol = c;
          if (nCol === -1) nCol = c;
          break;
        }
      }
    }

    // Heuristic fallbacks if columns not found by name
    if (nCol === -1 && dCol === -1 && headers.length > 0) {
      nCol = 0;
    }
    if (qCol === -1 && dCol === -1 && headers.length > 1) {
      for (let c = 0; c < headers.length; c++) {
        if (c !== nCol && c !== sCol) {
          const sampleCell = rows[headerRowIndex + 1]?.[c];
          if (typeof sampleCell === 'number' || (sampleCell && !isNaN(cleanNumber(sampleCell)))) {
            qCol = c;
            break;
          }
        }
      }
    }

    const sRow = headerRowIndex + 1;

    setStartRowIndex(sRow);
    setNameColIndex(nCol);
    setSpecColIndex(sCol);
    setQtyColIndex(qCol);
    setCostColIndex(cCol);
    setSkuColIndex(skuCol);
    setVendorColIndex(vCol);
    setNoteColIndex(ntCol);
    setDetailColIndex(dCol);

    generateItemsFromRows(rows, sRow, nCol, sCol, qCol, cCol, skuCol, vCol, ntCol, dCol, sourceFileName);
  };

  const handleProcessWorkbook = (wb: XLSX.WorkBook, preferredSheet?: string, sourceFileName: string = '') => {
    setWorkbook(wb);
    setSheetNames(wb.SheetNames);
    
    const targetSheet = preferredSheet || wb.SheetNames[0];
    setSelectedSheet(targetSheet);

    const worksheet = wb.Sheets[targetSheet];
    if (!worksheet) {
      setErrorMessage('無法讀取工作表內容！');
      return;
    }

    // Convert sheet to array of arrays
    const rows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    setRawSheetRows(rows);
    analyzeRowsAndMapColumns(rows, sourceFileName);
  };

  const handleSheetChange = (newSheetName: string) => {
    if (!workbook) return;
    setSelectedSheet(newSheetName);
    const ws = workbook.Sheets[newSheetName];
    if (ws) {
      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      setRawSheetRows(rows);
      analyzeRowsAndMapColumns(rows, file?.name || '');
    }
  };

  const handleFileUpload = async (uploadedFile: File) => {
    setFile(uploadedFile);
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const buffer = await uploadedFile.arrayBuffer();
      // Read with type array which works for xlsx, xls, csv, etc.
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      
      if (!wb.SheetNames || wb.SheetNames.length === 0) {
        throw new Error('此試算表檔案內沒有任何工作表！');
      }

      handleProcessWorkbook(wb, undefined, uploadedFile.name);
      showToast('🎉 已成功讀取並解析 Excel 訂單檔案！');
    } catch (err: any) {
      console.error('Excel parse error:', err);
      // Fallback try reading as text CSV/TSV
      try {
        const text = await uploadedFile.text();
        const wb = XLSX.read(text, { type: 'string' });
        if (wb.SheetNames && wb.SheetNames.length > 0) {
          handleProcessWorkbook(wb, undefined, uploadedFile.name);
          showToast('🎉 已成功以文字格式讀取試算表！');
          return;
        }
      } catch (fallbackErr) {
        console.error('Fallback read text error:', fallbackErr);
      }

      setErrorMessage(`讀取檔案失敗: ${err.message || '檔案可能已損毀或格式受密碼保護'}`);
      showToast('❌ 檔案讀取失敗，請確認檔案格式或嘗試直接複製貼上內容！');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleParsePastedText = () => {
    if (!pastedText.trim()) {
      showToast('⚠️ 請先貼上表格文字或出貨明細內容！');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const text = pastedText.trim();
      
      // Check if text is direct multi-line shipment details (e.g. "經典原味奶茶 500ml *20瓶")
      if (text.includes('*') || text.includes('個') || text.includes('台') || text.includes('件')) {
        const parsedLines = parseShipmentDetailLines(text);
        if (parsedLines.length > 0) {
          const timestamp = Date.now();
          const items: ParsedExcelOrderItem[] = parsedLines.map((line, idx) => {
            const matchedProd = matchProductFromSystem(line.name, line.specification, '');
            const finalProductId = matchedProd 
              ? matchedProd.product_id 
              : `PO_IMP_${timestamp.toString().slice(-6)}_${idx + 1}`;
            const finalName = matchedProd ? matchedProd.name : line.name;
            const finalSpec = line.specification || matchedProd?.specification || '';
            const finalCost = matchedProd ? Number(matchedProd.cost_price) || 0 : 0;

            return {
              temp_id: `PASTE_ITEM_${timestamp}_${idx}`,
              product_id: finalProductId,
              name: finalName,
              specification: finalSpec,
              ordered_quantity: line.quantity,
              cost_price: finalCost,
              note: '',
              is_matched: !!matchedProd,
              matched_product: matchedProd
            };
          });

          setFile(new File([''], '已貼上出貨明細.txt'));
          setParsedItems(items);
          setRawSheetRows([['出貨明細'], ...parsedLines.map(l => [`${l.name} *${l.quantity}個`])]);
          setShowAdvancedMapping(false);
          showToast(`🎉 已成功解析出 ${items.length} 筆出貨明細商品！`);
          setIsProcessing(false);
          return;
        }
      }

      // XLSX can read tab-separated or csv text directly
      const wb = XLSX.read(pastedText, { type: 'string' });
      if (!wb.SheetNames || wb.SheetNames.length === 0) {
        throw new Error('無法解析貼上的表格文字');
      }

      setFile(new File([''], '已貼上表格資料.tsv'));
      handleProcessWorkbook(wb, undefined, '已貼上表格資料');
      showToast('🎉 已成功解析貼上的表格！');
    } catch (err: any) {
      console.error('Pasted text parse error:', err);
      setErrorMessage('無法辨識貼上的內容格式，請確認是否直接從 Excel 或試算表中複製整段表格！');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadSample = () => {
    try {
      const sampleData = [
        ['商品名稱', '規格/款式', '訂購數量', '進價(未稅)', '商品貨號/條碼', '備註說明'],
        ['【熱銷款】經典手作原味奶茶', '500ml / 微糖', 20, 35, 'TEA-001', '預計週五到貨'],
        ['極致黑深焙研磨咖啡豆', '半磅 (227g)', 15, 180, 'COF-002', '優先入庫'],
        ['有機天然洋甘菊舒壓茶包', '20入/盒', 30, 95, 'HERB-003', '需陰涼乾燥保存'],
        ['日式抹茶粉', '100g 精裝版', 10, 120, 'MAT-004', '低溫冷藏']
      ];

      const ws = XLSX.utils.aoa_to_sheet(sampleData);
      ws['!cols'] = [
        { wch: 25 },
        { wch: 15 },
        { wch: 10 },
        { wch: 12 },
        { wch: 15 },
        { wch: 20 }
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '採購明細範本');
      XLSX.writeFile(wb, `採購訂單匯入範本_${new Date().toISOString().slice(0, 10)}.xlsx`);
      showToast('📥 已成功下載 Excel 採購範本！');
    } catch (err: any) {
      console.error('Download sample error:', err);
      showToast('❌ 下載範本失敗');
    }
  };

  // Re-run item generation when user manually adjusts mapping
  const handleApplyCustomMapping = () => {
    if (rawSheetRows.length === 0) return;
    generateItemsFromRows(
      rawSheetRows,
      startRowIndex,
      nameColIndex,
      specColIndex,
      qtyColIndex,
      costColIndex,
      skuColIndex,
      vendorColIndex,
      noteColIndex,
      detailColIndex,
      file?.name || ''
    );
    showToast('🔄 已重新套用欄位對應並解析！');
  };

  const handleConfirmImport = (mode: 'append' | 'replace') => {
    if (parsedItems.length === 0) {
      showToast('⚠️ 尚無解析出任何商品項目可匯入！');
      return;
    }

    const formattedItems = parsedItems.map(it => ({
      temp_id: it.temp_id,
      product_id: it.product_id,
      name: it.name,
      specification: it.specification,
      ordered_quantity: it.ordered_quantity,
      cost_price: it.cost_price,
      note: it.note
    }));

    onImportItems(
      formattedItems,
      mode,
      applyVendor ? detectedVendor : undefined,
      applyDate ? detectedExpectedDate : undefined
    );

    showToast(`✅ 已${mode === 'replace' ? '替換' : '加入'} ${formattedItems.length} 項採購明細！`);
    onClose();
  };

  const totalQuantity = parsedItems.reduce((sum, it) => sum + (it.ordered_quantity || 0), 0);
  const totalEstimatedCost = parsedItems.reduce((sum, it) => sum + (it.ordered_quantity || 0) * (it.cost_price || 0), 0);
  const matchedCount = parsedItems.filter(it => it.is_matched).length;

  // Max column count for dropdowns
  const maxCols = rawSheetRows.reduce((max, row) => Math.max(max, row?.length || 0), 0);
  const colOptions = Array.from({ length: maxCols }, (_, idx) => {
    const colLetter = String.fromCharCode(65 + (idx % 26)) + (idx >= 26 ? Math.floor(idx / 26) : '');
    const headerName = rawSheetRows[startRowIndex - 1]?.[idx] ? ` (${String(rawSheetRows[startRowIndex - 1][idx]).slice(0, 15)})` : '';
    return { index: idx, label: `第 ${idx + 1} 欄 / 欄位 ${colLetter}${headerName}` };
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-[#0f172a] w-full max-w-5xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-emerald-500/15 via-slate-800/60 to-transparent">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base sm:text-lg flex items-center gap-2">
                匯入 EXCEL 採購訂單 / 供應商出貨表
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                  支援【出貨明細】格式
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                支援標準 Excel 訂單、供應商出貨明細（單一欄位多品項 *數量），自動解析商品、型號、規格與訂購量。
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto custom-scrollbar flex-1 space-y-5">
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3.5 bg-red-500/15 border border-red-500/30 rounded-xl flex items-start gap-3 text-xs text-red-200">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-red-300">{errorMessage}</p>
                <p className="text-slate-400">
                  建議：您可以直接在 Excel 中選取出貨明細文字後複製（Ctrl+C），切換至「複製貼上表格」分頁貼上即可直接解析！
                </p>
              </div>
            </div>
          )}

          {/* Initial State: Choose Mode (Upload or Paste) */}
          {!file || parsedItems.length === 0 ? (
            <div className="space-y-4">
              {/* Tab Selector */}
              <div className="flex bg-slate-900/80 p-1 rounded-xl border border-white/5 max-w-sm">
                <button
                  type="button"
                  onClick={() => setActiveTab('upload')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeTab === 'upload' 
                      ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20' 
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Upload className="w-4 h-4" />
                  <span>檔案上傳 (.xlsx, .xls, .csv)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('paste')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeTab === 'paste' 
                      ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20' 
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Clipboard className="w-4 h-4" />
                  <span>複製貼上明細 / 表格</span>
                </button>
              </div>

              {activeTab === 'upload' ? (
                /* Drag & Drop Upload Zone */
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const droppedFile = e.dataTransfer.files?.[0];
                    if (droppedFile) handleFileUpload(droppedFile);
                  }}
                  onClick={() => {
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                      fileInputRef.current.click();
                    }
                  }}
                  className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all ${
                    isDragging 
                      ? 'border-emerald-400 bg-emerald-500/10 scale-[1.01]' 
                      : 'border-white/20 hover:border-emerald-500/50 bg-white/[0.02] hover:bg-emerald-500/[0.03]'
                  }`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".xlsx,.xls,.csv,.tsv,.txt"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileUpload(f);
                    }}
                  />

                  <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4 shadow-lg shadow-emerald-500/10">
                    {isProcessing ? (
                      <RefreshCw className="w-8 h-8 animate-spin" />
                    ) : (
                      <Upload className="w-8 h-8" />
                    )}
                  </div>

                  <div className="space-y-2 max-w-md mx-auto">
                    <p className="text-sm font-bold text-white">
                      {isProcessing ? '正在讀取試算表並解析中...' : '點擊選取或拖曳供應商 Excel / 出貨表檔案至此'}
                    </p>
                    <p className="text-xs text-slate-400">
                      支援常見格式：<strong className="text-emerald-400">出貨明細（品名 型號 *數量）</strong>、標準 Excel 採購訂單、CSV 檔案
                    </p>
                    <div className="inline-flex items-center gap-1.5 text-[11px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2.5 py-1 rounded-lg mt-1">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      <span>已針對各類供應商出貨表、多行商品明細格式特別強化智慧解析！</span>
                    </div>
                  </div>
                </div>
              ) : (
                /* Paste Table Zone */
                <div className="space-y-3">
                  <div className="relative">
                    <textarea
                      value={pastedText}
                      onChange={(e) => setPastedText(e.target.value)}
                      placeholder="支援兩種複製貼上方式：&#10;1. 直接複製整段商品出貨明細文字（例如：經典研磨咖啡豆 227g *5包 ...）&#10;2. 在 Excel 中選取整段表格範圍複製後直接貼上 (Ctrl+V)..."
                      className="w-full h-48 bg-slate-900/90 border border-white/15 rounded-xl p-4 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 font-mono custom-scrollbar"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setPastedText(`經典手作原味奶茶 500ml *20瓶\n極致黑深焙研磨咖啡豆 半磅(227g) *15包\n有機天然洋甘菊舒壓茶包 20入/盒 *30盒\n日式低溫研磨抹茶粉 100g精裝版 *10罐\n多功能折疊烘鞋機 雙重定時款 *5台\n9吋靜音空氣循環扇 【夜霧灰】 *3台\n2.0L高硼矽玻璃快煮壺 KPK-200 *2台\n雙層防燙不鏽鋼快煮壺 1.5L白色 *4台`)}
                      className="text-xs text-indigo-400 hover:text-indigo-300 underline cursor-pointer"
                    >
                      帶入 複製貼上的範例 測試
                    </button>
                    <button
                      type="button"
                      onClick={handleParsePastedText}
                      disabled={!pastedText.trim() || isProcessing}
                      className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-black rounded-xl text-xs shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
                    >
                      {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      <span>解析貼上的內容</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Sample Template & Format Tips */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white/5 rounded-xl border border-white/5">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <AlertCircle className="w-4 h-4 text-sky-400 shrink-0" />
                  <span>提供標準出貨表與採購單 Excel 範本：</span>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadSample}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-bold transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>下載採購訂單 Excel 範本 (.xlsx)</span>
                </button>
              </div>
            </div>
          ) : (
            /* Parsed Result Preview & Controls */
            <div className="space-y-5">
              {/* Top Controls: File info, Sheet Switcher, Reset */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 bg-white/5 border border-white/10 rounded-xl">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5 text-xs text-white font-bold">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                    <span>{file?.name || '已載入檔案'}</span>
                  </div>

                  {/* Multi-Sheet Selector */}
                  {sheetNames.length > 1 && (
                    <div className="flex items-center gap-1.5 text-xs bg-slate-800/80 px-2.5 py-1 rounded-lg border border-white/10">
                      <span className="text-slate-400">工作表:</span>
                      <select
                        value={selectedSheet}
                        onChange={(e) => handleSheetChange(e.target.value)}
                        className="bg-transparent text-emerald-300 font-bold outline-none cursor-pointer"
                      >
                        {sheetNames.map(name => (
                          <option key={name} value={name} className="bg-slate-900 text-white">
                            {name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedMapping(!showAdvancedMapping)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      showAdvancedMapping 
                        ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30' 
                        : 'bg-white/5 text-slate-300 hover:text-white border border-white/5'
                    }`}
                  >
                    <span>自訂欄位對應</span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvancedMapping ? 'rotate-180' : ''}`} />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      setWorkbook(null);
                      setRawSheetRows([]);
                      setParsedItems([]);
                      setPastedText('');
                    }}
                    className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-white/5 cursor-pointer underline"
                  >
                    重新選擇檔案
                  </button>
                </div>
              </div>

              {/* Advanced Column Mapping Drawer */}
              {showAdvancedMapping && (
                <div className="p-4 bg-slate-900/90 border border-sky-500/20 rounded-xl space-y-4 animate-fadeIn">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                      <ArrowUpDown className="w-4 h-4" />
                      自訂 Excel 欄位對應（若自動辨識欄位不準確，可手動指派）
                    </span>
                    <button
                      type="button"
                      onClick={handleApplyCustomMapping}
                      className="px-3 py-1 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-lg text-xs transition-colors cursor-pointer"
                    >
                      套用對應
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">起始資料列 (從第幾列開始)</label>
                      <input
                        type="number"
                        min="1"
                        max={rawSheetRows.length || 100}
                        value={startRowIndex}
                        onChange={(e) => setStartRowIndex(Math.max(1, Number(e.target.value) || 1))}
                        className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1 font-bold text-emerald-300">出貨明細/品名 欄位 (*必選)</label>
                      <select
                        value={detailColIndex >= 0 ? detailColIndex : nameColIndex}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setDetailColIndex(val);
                          setNameColIndex(val);
                        }}
                        className="w-full bg-slate-800 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs"
                      >
                        <option value={-1}>-- 請選擇 --</option>
                        {colOptions.map(opt => (
                          <option key={opt.index} value={opt.index}>{opt.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1 font-bold text-sky-300">訂購數量 欄位</label>
                      <select
                        value={qtyColIndex}
                        onChange={(e) => setQtyColIndex(Number(e.target.value))}
                        className="w-full bg-slate-800 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs"
                      >
                        <option value={-1}>-- 從明細內自動解析 *數量 (預設1) --</option>
                        {colOptions.map(opt => (
                          <option key={opt.index} value={opt.index}>{opt.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1 font-bold text-amber-300">進價/成本 欄位</label>
                      <select
                        value={costColIndex}
                        onChange={(e) => setCostColIndex(Number(e.target.value))}
                        className="w-full bg-slate-800 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs"
                      >
                        <option value={-1}>-- 自動帶入系統商品成本或 0 --</option>
                        {colOptions.map(opt => (
                          <option key={opt.index} value={opt.index}>{opt.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">規格/款式 欄位</label>
                      <select
                        value={specColIndex}
                        onChange={(e) => setSpecColIndex(Number(e.target.value))}
                        className="w-full bg-slate-800 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs"
                      >
                        <option value={-1}>-- 從【規格】自動提取 --</option>
                        {colOptions.map(opt => (
                          <option key={opt.index} value={opt.index}>{opt.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">貨號/條碼 欄位</label>
                      <select
                        value={skuColIndex}
                        onChange={(e) => setSkuColIndex(Number(e.target.value))}
                        className="w-full bg-slate-800 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs"
                      >
                        <option value={-1}>-- 無 --</option>
                        {colOptions.map(opt => (
                          <option key={opt.index} value={opt.index}>{opt.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">寄件人/廠商 欄位</label>
                      <select
                        value={vendorColIndex}
                        onChange={(e) => setVendorColIndex(Number(e.target.value))}
                        className="w-full bg-slate-800 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs"
                      >
                        <option value={-1}>-- 無 --</option>
                        {colOptions.map(opt => (
                          <option key={opt.index} value={opt.index}>{opt.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">備註說明 欄位</label>
                      <select
                        value={noteColIndex}
                        onChange={(e) => setNoteColIndex(Number(e.target.value))}
                        className="w-full bg-slate-800 border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs"
                      >
                        <option value={-1}>-- 無 --</option>
                        {colOptions.map(opt => (
                          <option key={opt.index} value={opt.index}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-white/5 border border-white/10 rounded-xl">
                  <div className="text-[10px] text-slate-400">讀取商品項目</div>
                  <div className="text-lg font-bold text-white flex items-center gap-1 mt-0.5">
                    <Package className="w-4 h-4 text-emerald-400" />
                    <span>{parsedItems.length} 項</span>
                  </div>
                </div>

                <div className="p-3 bg-white/5 border border-white/10 rounded-xl">
                  <div className="text-[10px] text-slate-400">採購總件數</div>
                  <div className="text-lg font-bold text-sky-400 flex items-center gap-1 mt-0.5">
                    <Layers className="w-4 h-4" />
                    <span>{totalQuantity.toLocaleString()} 件</span>
                  </div>
                </div>

                <div className="p-3 bg-white/5 border border-white/10 rounded-xl">
                  <div className="text-[10px] text-slate-400">系統現有商品比對</div>
                  <div className="text-lg font-bold text-indigo-400 flex items-center gap-1 mt-0.5">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{matchedCount} / {parsedItems.length}</span>
                  </div>
                </div>

                <div className="p-3 bg-white/5 border border-white/10 rounded-xl">
                  <div className="text-[10px] text-slate-400">預估採購總金額</div>
                  <div className="text-lg font-bold text-amber-400 flex items-center gap-1 mt-0.5">
                    <DollarSign className="w-4 h-4" />
                    <span>${totalEstimatedCost.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Detected Meta Options (Vendor, Date) */}
              {(detectedVendor || detectedExpectedDate) && (
                <div className="p-3.5 bg-sky-500/10 border border-sky-500/20 rounded-xl space-y-2">
                  <div className="text-xs font-bold text-sky-300 flex items-center gap-1.5">
                    <Check className="w-4 h-4" />
                    <span>自動偵測到供應商 / 到貨資訊：</span>
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs">
                    {detectedVendor && (
                      <label className="flex items-center gap-2 text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={applyVendor}
                          onChange={(e) => setApplyVendor(e.target.checked)}
                          className="rounded border-white/20 bg-slate-800 text-sky-500 focus:ring-0"
                        />
                        <span>
                          自動套用供應商：<strong className="text-white underline">{detectedVendor.vendor_name}</strong>
                        </span>
                      </label>
                    )}
                    {detectedExpectedDate && (
                      <label className="flex items-center gap-2 text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={applyDate}
                          onChange={(e) => setApplyDate(e.target.checked)}
                          className="rounded border-white/20 bg-slate-800 text-sky-500 focus:ring-0"
                        />
                        <span>
                          自動套用預計到貨日：<strong className="text-white underline">{detectedExpectedDate}</strong>
                        </span>
                      </label>
                    )}
                  </div>
                </div>
              )}

              {/* Items Preview Table */}
              <div className="border border-white/10 rounded-xl overflow-hidden">
                <div className="p-3 bg-white/5 border-b border-white/10 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">
                    解析清單預覽 ({parsedItems.length} 項)
                  </span>
                  <span className="text-[11px] text-slate-400">
                    💡 您可以直接在表格中編輯修正品名、規格、數量或進價
                  </span>
                </div>

                {parsedItems.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs space-y-2">
                    <AlertCircle className="w-6 h-6 mx-auto text-amber-400" />
                    <p className="font-bold text-white">未能從目前欄位設定中解析出商品</p>
                    <p>請點擊上方的「自訂欄位對應」按鈕，手動指定「出貨明細」或「品名」位於哪一欄！</p>
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="sticky top-0 bg-[#1e293b] text-slate-400 font-bold border-b border-white/10 z-10">
                        <tr>
                          <th className="py-2.5 px-3">狀態</th>
                          <th className="py-2.5 px-3">商品品名 / 系統編號</th>
                          <th className="py-2.5 px-2">規格</th>
                          <th className="py-2.5 px-2 text-center w-24">數量</th>
                          <th className="py-2.5 px-2 text-center w-24">進價</th>
                          <th className="py-2.5 px-2 text-right">小計</th>
                          <th className="py-2.5 px-2 text-center w-10">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {parsedItems.map((item, idx) => (
                          <tr key={item.temp_id} className="hover:bg-white/[0.02]">
                            <td className="py-2 px-3">
                              {item.is_matched ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 whitespace-nowrap">
                                  <Check className="w-3 h-3" />
                                  系統商品
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 whitespace-nowrap">
                                  🆕 自訂商品
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                value={item.name}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setParsedItems(prev => prev.map((it, i) => i === idx ? { ...it, name: val } : it));
                                }}
                                className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white font-bold"
                              />
                              <span className="block text-[10px] font-mono text-slate-500 mt-0.5">{item.product_id}</span>
                            </td>
                            <td className="py-2 px-2">
                              <input
                                type="text"
                                value={item.specification}
                                placeholder="無"
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setParsedItems(prev => prev.map((it, i) => i === idx ? { ...it, specification: val } : it));
                                }}
                                className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white"
                              />
                            </td>
                            <td className="py-2 px-2 text-center">
                              <input
                                type="number"
                                min="1"
                                value={item.ordered_quantity}
                                onChange={(e) => {
                                  const val = Number(e.target.value) || 1;
                                  setParsedItems(prev => prev.map((it, i) => i === idx ? { ...it, ordered_quantity: val } : it));
                                }}
                                className="w-16 mx-auto bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-center text-white font-bold"
                              />
                            </td>
                            <td className="py-2 px-2 text-center">
                              <input
                                type="number"
                                min="0"
                                value={item.cost_price}
                                onChange={(e) => {
                                  const val = Number(e.target.value) || 0;
                                  setParsedItems(prev => prev.map((it, i) => i === idx ? { ...it, cost_price: val } : it));
                                }}
                                className="w-16 mx-auto bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-center text-white font-mono"
                              />
                            </td>
                            <td className="py-2 px-2 text-right font-mono font-bold text-amber-300">
                              ${(item.ordered_quantity * item.cost_price).toLocaleString()}
                            </td>
                            <td className="py-2 px-2 text-center">
                              <button
                                type="button"
                                onClick={() => setParsedItems(prev => prev.filter((_, i) => i !== idx))}
                                className="text-slate-500 hover:text-red-400 p-1 cursor-pointer"
                                title="移除此項"
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
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-white/10 bg-slate-900/90 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-400">
            {parsedItems.length > 0 ? (
              <span>
                準備匯入 <strong className="text-emerald-400">{parsedItems.length}</strong> 項商品 (共 <strong className="text-sky-400">{totalQuantity}</strong> 件，預估 <strong className="text-amber-400">${totalEstimatedCost.toLocaleString()}</strong>)
              </span>
            ) : (
              <span>請先選取 Excel 檔案或貼上表格內容進行解析</span>
            )}
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              取消
            </button>

            {parsedItems.length > 0 && currentItemsCount > 0 && (
              <button
                type="button"
                onClick={() => handleConfirmImport('append')}
                className="flex-1 sm:flex-none px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-xl text-xs shadow-lg shadow-indigo-600/20 transition-all cursor-pointer"
              >
                加入現有清單 (+累加)
              </button>
            )}

            <button
              type="button"
              disabled={parsedItems.length === 0}
              onClick={() => handleConfirmImport('replace')}
              className="flex-1 sm:flex-none px-5 py-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-black rounded-xl text-xs shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
            >
              {currentItemsCount > 0 ? '覆蓋並匯入採購清單' : '匯入採購清單'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
