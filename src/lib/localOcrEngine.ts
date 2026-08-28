import { createWorker } from 'tesseract.js';
import { Product, Vendor } from './db';

export interface LocalOcrItemResult {
  raw_product_name: string;
  specification: string;
  quantity: number;
  cost_price: number;
  total_amount: number;
  matched_product_id?: string;
  matched_product_name?: string;
  confidence: 'high' | 'medium' | 'low';
  note?: string;
  matched_product?: Product;
}

export interface LocalOcrScanResult {
  vendor_name: string;
  vendor_id?: string;
  invoice_number?: string;
  invoice_date?: string;
  total_amount?: number;
  items: LocalOcrItemResult[];
  raw_text: string;
  engine: 'local';
}

// Compute string similarity using Levenshtein Distance (0 to 1)
export function calculateSimilarity(s1: string, s2: string): number {
  if (!s1 || !s2) return 0;
  const str1 = s1.trim().toLowerCase().replace(/\s+/g, '');
  const str2 = s2.trim().toLowerCase().replace(/\s+/g, '');
  if (str1 === str2) return 1.0;
  if (str1.includes(str2) || str2.includes(str1)) {
    const minLen = Math.min(str1.length, str2.length);
    const maxLen = Math.max(str1.length, str2.length);
    return 0.8 + (minLen / maxLen) * 0.2;
  }

  const track = Array(str2.length + 1).fill(null).map(() =>
    Array(str1.length + 1).fill(null));
  for (let i = 0; i <= str1.length; i += 1) {
    track[0][i] = i;
  }
  for (let j = 0; j <= str2.length; j += 1) {
    track[j][0] = j;
  }
  for (let j = 1; j <= str2.length; j += 1) {
    for (let i = 1; i <= str1.length; i += 1) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1, // deletion
        track[j - 1][i] + 1, // insertion
        track[j - 1][i - 1] + indicator, // substitution
      );
    }
  }
  const distance = track[str2.length][str1.length];
  const maxLen = Math.max(str1.length, str2.length);
  return Math.max(0, 1 - distance / maxLen);
}

// Optimize image before sending to Cloud API (resizes large camera shots to ~1600px JPEG to avoid payload limits & latency)
export async function optimizeImageForUpload(imageSrc: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(imageSrc);
        return;
      }

      const maxDim = 1600;
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }

      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => resolve(imageSrc);
    img.src = imageSrc;
  });
}

// Image pre-processing for dot-matrix printing & receipt contrast
export async function preprocessInvoiceImage(imageSrc: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(imageSrc);
        return;
      }

      // Max dimension limit for OCR efficiency
      const maxDim = 1800;
      let w = img.width;
      let h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w > h) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
      }

      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);

      try {
        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;

        // 1. Grayscale & Contrast enhancement
        // Dot matrix and carbon copy paper often have tinted background (pink/blue/yellow)
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          // Luminance formula
          let gray = 0.299 * r + 0.587 * g + 0.114 * b;

          // Increase contrast (stretch histogram)
          gray = (gray - 128) * 1.35 + 128;

          // Whiten background (filter out faint tint)
          if (gray > 175) {
            gray = 255;
          } else if (gray < 75) {
            gray = Math.max(0, gray * 0.7);
          }

          data[i] = gray;
          data[i + 1] = gray;
          data[i + 2] = gray;
        }

        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        console.warn('Canvas preprocess fallback:', err);
        resolve(imageSrc);
      }
    };

    img.onerror = () => {
      resolve(imageSrc);
    };

    img.src = imageSrc;
  });
}

// Parse Republic of China (ROC) or standard year dates
function parseDateString(text: string): string {
  // e.g. 113/05/20 or 113.5.20 or 113-05-20
  const rocMatch = text.match(/(?:民國)?\s*([0-9]{2,3})[.\-/年]([0-9]{1,2})[.\-/月]([0-9]{1,2})[日號]?/);
  if (rocMatch) {
    const rocYear = parseInt(rocMatch[1], 10);
    const year = rocYear < 1900 ? rocYear + 1911 : rocYear;
    const month = String(parseInt(rocMatch[2], 10)).padStart(2, '0');
    const day = String(parseInt(rocMatch[3], 10)).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // e.g. 2024/05/20 or 2024-05-20
  const standardMatch = text.match(/(20[2-3][0-9])[.\-/年]([0-9]{1,2})[.\-/月]([0-9]{1,2})[日號]?/);
  if (standardMatch) {
    const year = standardMatch[1];
    const month = String(parseInt(standardMatch[2], 10)).padStart(2, '0');
    const day = String(parseInt(standardMatch[3], 10)).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return '';
}

// Extract potential invoice/PO numbers
function parseInvoiceNumber(text: string): string {
  // Taiwanese Uniform Invoice format (e.g. AB-12345678 or AB12345678)
  const guiMatch = text.match(/[A-Z]{2}[-\s]?[0-9]{8}/i);
  if (guiMatch) return guiMatch[0].replace(/[\s-]/g, '').toUpperCase();

  // Delivery order format: NO. 2024052001 or 單號：123456
  const numMatch = text.match(/(?:單號|NO|No|編號|號碼)[：:\s]*([A-Z0-9\-]{5,20})/i);
  if (numMatch) return numMatch[1].trim();

  return '';
}

// Clean OCR text line into candidate tokens
function cleanLineText(line: string): string {
  return line
    .replace(/[|｜\\/_{}[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Execute pure local client-side OCR using Tesseract.js
 * with automated product catalog & vendor fuzzy matching.
 */
export async function performLocalInvoiceOcr(
  imageSrc: string,
  products: Product[],
  vendors: Vendor[],
  onProgress?: (status: string, percent: number) => void
): Promise<LocalOcrScanResult> {
  onProgress?.('正在進行影像優化（對比度強化 & 點陣除噪）...', 10);
  const processedImage = await preprocessInvoiceImage(imageSrc);

  onProgress?.('正在載入本地離線 OCR 繁中辨識引擎...', 25);
  const worker = await createWorker('chi_tra+eng', undefined, {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        const p = 30 + Math.round((m.progress || 0) * 60);
        onProgress?.(`本地離線辨識中... ${Math.round((m.progress || 0) * 100)}%`, p);
      }
    },
  });

  onProgress?.('正在解析文字與單據結構...', 90);
  const { data } = await worker.recognize(processedImage);
  await worker.terminate();

  const rawText = data.text || '';
  const lines = rawText.split('\n').map(cleanLineText).filter(l => l.length > 1);

  // 1. Identify Date & Invoice Number
  const invoiceDate = parseDateString(rawText);
  const invoiceNumber = parseInvoiceNumber(rawText);

  // 2. Identify Vendor
  let detectedVendorName = '';
  let detectedVendorId = '';

  // Look for vendor keywords or fuzzy match against known vendors
  for (const line of lines.slice(0, 10)) {
    // Check known vendors list first
    for (const v of vendors) {
      const vName = v.vendor_name || v.name || '';
      if (!vName) continue;
      const sim = calculateSimilarity(line, vName);
      if (sim > 0.65) {
        detectedVendorName = vName;
        detectedVendorId = v.vendor_id;
        break;
      }
    }
    if (detectedVendorName) break;

    // Check header keywords
    const vendorMatch = line.match(/(?:廠商|客戶|銷貨人|公司|抬頭)[：:\s]*([\u4e00-\u9fa5A-Za-z0-9\s（）()]+)/);
    if (vendorMatch && vendorMatch[1].trim().length > 1) {
      detectedVendorName = vendorMatch[1].trim();
      break;
    }
  }

  // 3. Extract Item Rows and Fuzzy Match with Products Database
  const candidateItems: LocalOcrItemResult[] = [];
  const processedProductIds = new Set<string>();

  for (const line of lines) {
    // Skip header and footer lines
    if (/^(品名|數量|單價|金額|合計|小計|備註|發票|日期|電話|統編|地址|總計)/.test(line)) continue;
    if (line.includes('統一發票') || line.includes('營業人蓋用') || line.includes('收執聯')) continue;

    // Extract numbers from line (Quantity, Price, Subtotal)
    // Matches patterns like "商品名 10 50 500" or "商品名 12包 * 25"
    const numberMatches = line.match(/([0-9]+(?:\.[0-9]+)?)/g);
    const textPart = line.replace(/[0-9]+(?:\.[0-9]+)?/g, '').replace(/[*xX件包個支盒箱罐瓶元$]/g, '').trim();

    // Check if line matches any existing product by name or barcode
    let bestMatchProduct: Product | undefined;
    let bestScore = 0;

    for (const p of products) {
      if (!p.name) continue;
      // Exact / substring check
      if (line.toLowerCase().includes(p.name.toLowerCase())) {
        bestScore = 0.95;
        bestMatchProduct = p;
        break;
      }

      // Barcode check
      if (p.barcode && line.includes(p.barcode)) {
        bestScore = 0.99;
        bestMatchProduct = p;
        break;
      }

      // Fuzzy similarity calculation
      const sim = calculateSimilarity(textPart || line, p.name);
      if (sim > bestScore && sim >= 0.55) {
        bestScore = sim;
        bestMatchProduct = p;
      }
    }

    // Determine numbers
    let qty = 1;
    let price = bestMatchProduct ? (Number(bestMatchProduct.cost_price) || 0) : 0;
    let total = 0;

    if (numberMatches && numberMatches.length >= 1) {
      const nums = numberMatches.map(n => parseFloat(n)).filter(n => !isNaN(n) && n > 0);
      if (nums.length >= 3) {
        // e.g. [Qty, Price, Total]
        qty = nums[0];
        price = nums[1];
        total = nums[2];
      } else if (nums.length === 2) {
        qty = nums[0];
        price = nums[1];
        total = qty * price;
      } else if (nums.length === 1) {
        qty = nums[0];
        total = qty * price;
      }
    }

    if (bestMatchProduct || textPart.length >= 2) {
      const prodName = bestMatchProduct ? bestMatchProduct.name : textPart || line;
      const pid = bestMatchProduct ? bestMatchProduct.product_id : undefined;

      // Prevent duplicate exact line addition if already added
      if (pid && processedProductIds.has(pid)) {
        continue;
      }
      if (pid) processedProductIds.add(pid);

      candidateItems.push({
        raw_product_name: textPart || line,
        specification: bestMatchProduct?.specification || '',
        quantity: qty > 0 ? qty : 1,
        cost_price: price,
        total_amount: total || (qty * price),
        matched_product_id: pid,
        matched_product_name: prodName,
        confidence: bestScore >= 0.8 ? 'high' : (bestScore >= 0.55 ? 'medium' : 'low'),
        matched_product: bestMatchProduct,
      });
    }
  }

  onProgress?.('本地辨識完成！', 100);

  return {
    vendor_name: detectedVendorName,
    vendor_id: detectedVendorId,
    invoice_number: invoiceNumber,
    invoice_date: invoiceDate,
    total_amount: candidateItems.reduce((sum, it) => sum + (it.total_amount || 0), 0),
    items: candidateItems,
    raw_text: rawText,
    engine: 'local',
  };
}
