import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY || '',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

function cleanAndParseJson(raw: string): any {
  let str = raw.trim();
  // Strip markdown code fences if any
  if (str.startsWith('```')) {
    str = str.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  // Find boundaries of outer JSON object
  const firstBrace = str.indexOf('{');
  const lastBrace = str.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    str = str.slice(firstBrace, lastBrace + 1);
  }

  // 1. Try direct standard parse
  try {
    return JSON.parse(str);
  } catch (initialErr) {
    console.warn('Initial JSON.parse failed, attempting repair...', initialErr);
  }

  // 2. Remove unescaped control characters
  let sanitized = str.replace(/[\u0000-\u001F\u007F-\u009F]/g, (c) => (c === '\n' || c === '\r' || c === '\t' ? ' ' : ''));
  try {
    return JSON.parse(sanitized);
  } catch (_) {}

  // 3. Repair incomplete/truncated JSON output
  try {
    // If quote is unbalanced, add closing quote
    const quoteCount = (sanitized.match(/(?<!\\)"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      sanitized += '"';
    }

    // Cut trailing incomplete item back to last valid '}'
    const lastObjectClose = sanitized.lastIndexOf('}');
    if (lastObjectClose > 0) {
      const truncatedCandidate = sanitized.slice(0, lastObjectClose + 1);
      // Check if candidate needs closing brackets for items array
      try {
        return JSON.parse(truncatedCandidate);
      } catch (_) {}
      try {
        return JSON.parse(truncatedCandidate + ']}');
      } catch (_) {}
      try {
        return JSON.parse(truncatedCandidate + '}');
      } catch (_) {}
    }
  } catch (_) {}

  // 4. Return safe fallback object
  return {
    vendor_name: '',
    invoice_number: '',
    invoice_date: '',
    total_amount: 0,
    items: [],
    note: 'JSON 格式自動修復解析',
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Support JSON payload up to 25MB for high-res photo scan
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));

  // API: Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // API: AI Invoice OCR scan
  app.post('/api/scan-invoice', async (req, res) => {
    try {
      const { imageBase64, mimeType: providedMimeType, products = [], vendors = [] } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ success: false, error: '請提供單據圖片 base64 資料' });
      }

      const ai = getGeminiClient();

      // Extract real mime type if present in data URL
      let mimeType = providedMimeType || 'image/jpeg';
      const mimeMatch = imageBase64.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
      if (mimeMatch) {
        mimeType = mimeMatch[1];
      }

      const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');

      // Context for product catalogue (top matched context, max 60 items to prevent oversized context)
      const productCatalogContext = Array.isArray(products) && products.length > 0
        ? `系統現有商品參考庫（共 ${products.length} 筆，僅供比對 ID 與名稱，切勿全部輸出）：\n` +
          products.slice(0, 60).map((p: any) => `- ID: "${p.product_id}", 名稱: "${p.name}", 規格: "${p.specification || ''}", 預設進價: ${p.cost_price || 0}`).join('\n')
        : '無現有商品資料庫';

      const vendorCatalogContext = Array.isArray(vendors) && vendors.length > 0
        ? `系統現有供應商清單：\n` + vendors.slice(0, 30).map((v: any) => `- ID: "${v.vendor_id}", 名稱: "${v.vendor_name || v.name || ''}"`).join('\n')
        : '無供應商清單';

      const prompt = `你是一位專業的「進貨單據 / 送貨單 / 銷貨憑單 / 驗收單」視覺解析與資料抽取專家。
請仔細分析這張進貨單據圖片（可能是印刷表格、POS熱感收據或手寫單據）。

【重要規則】：
- 請「只」萃取單據圖片上實際存在的明細項目（通常只有 1~25 行），嚴禁複製或列出系統參考資料庫中未出現在圖片上的商品！
- 數值欄位請確保為有效數字，避免多餘文字。

【萃取與比對指引】：
1. 供應商名稱 (vendor_name)：辨識單據頂部、抬頭、銷貨方或章戳中的廠商名稱。若與系統現有供應商吻合，一併填寫 vendor_id。
2. 單據號碼 (invoice_number)：如銷貨單號、送貨單號、發票號碼等。
3. 單據日期 (invoice_date)：格式請統一為 YYYY-MM-DD，若單據無年份請依現行年份推定。
4. 進貨商品明細 (items)：
   - raw_product_name: 單據上印刷或手寫的原始品名。
   - specification: 規格/尺寸/顏色/型號（若無則留空字串 ""）。
   - quantity: 進貨數量（數值，必須 > 0）。
   - cost_price: 單價 / 進價（數值，若無標示則為 0）。
   - total_amount: 該品項小計金額（數值）。
   - matched_product_id: 請根據品名比對系統商品清單，若高度匹配則填入該商品之 product_id，若無法確定則留空字串 ""。
   - matched_product_name: 匹配到的系統商品名稱，若無則留空字串 ""。
   - note: 備註（如贈品、破損、折讓等）。
5. 總金額 (total_amount)：整張單據的總計金額。
6. 整單備註 (note)：如付款條件、送貨備註等。

${vendorCatalogContext}

${productCatalogContext}

請以繁體中文與嚴格 JSON 格式輸出。`;

      const contents = {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: cleanBase64,
            },
          },
          {
            text: prompt,
          },
        ],
      };

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          vendor_name: { type: Type.STRING, description: '供應商/開單廠商名稱' },
          vendor_id: { type: Type.STRING, description: '若匹配到系統供應商ID則填寫，否則留空' },
          invoice_number: { type: Type.STRING, description: '出貨單號/發票號/銷貨單號' },
          invoice_date: { type: Type.STRING, description: '單據日期 yyyy-MM-dd' },
          total_amount: { type: Type.NUMBER, description: '單據總金額' },
          note: { type: Type.STRING, description: '單據備註' },
          items: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                raw_product_name: { type: Type.STRING, description: '單據上的原始商品名稱' },
                specification: { type: Type.STRING, description: '規格/型號/顏色/尺寸' },
                quantity: { type: Type.NUMBER, description: '進貨數量' },
                cost_price: { type: Type.NUMBER, description: '進貨單價' },
                total_amount: { type: Type.NUMBER, description: '小計金額' },
                matched_product_id: { type: Type.STRING, description: '匹配到的系統商品ID' },
                matched_product_name: { type: Type.STRING, description: '匹配到的系統商品名稱' },
                confidence: { type: Type.STRING, description: 'high, medium, 或 low' },
                note: { type: Type.STRING, description: '品項備註' },
              },
              required: ['raw_product_name', 'quantity', 'cost_price'],
            },
          },
        },
        required: ['items'],
      };

      // Candidate models for automatic fallback during high demand (503/429)
      // Ordered starting with fast lite models to high-capacity models
      const candidateModels = [
        'gemini-3.1-flash-lite',
        'gemini-3.7-flash',
        'gemini-flash-latest',
        'gemini-3.1-pro-preview',
      ];
      let lastError: any = null;
      let text = '';

      for (const modelName of candidateModels) {
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const response = await ai.models.generateContent({
              model: modelName,
              contents,
              config: {
                responseMimeType: 'application/json',
                responseSchema,
                temperature: 0.1,
                maxOutputTokens: 8192,
              },
            });

            text = response.text || '{}';
            if (text && text !== '{}') break;
          } catch (err: any) {
            lastError = err;
            const isTransient = err?.status === 503 ||
              err?.status === 429 ||
              err?.code === 503 ||
              err?.code === 429 ||
              String(err?.message || '').includes('503') ||
              String(err?.message || '').includes('high demand') ||
              String(err?.message || '').includes('UNAVAILABLE') ||
              String(err?.message || '').includes('RESOURCE_EXHAUSTED');

            console.warn(`[AI OCR] Model ${modelName} attempt ${attempt} failed:`, err?.message || err);

            if (isTransient && attempt < 2) {
              await new Promise(r => setTimeout(r, 1500));
            } else {
              break;
            }
          }
        }

        if (text && text !== '{}') break;
      }

      if (!text || text === '{}') {
        throw lastError || new Error('AI 辨識服務目前忙碌，請稍候重試。');
      }

      const parsedData = cleanAndParseJson(text);
      return res.json({ success: true, data: parsedData });
    } catch (error: any) {
      console.error('Invoice scanning error:', error);
      let userFriendlyMsg = error?.message || String(error);
      const is503 = userFriendlyMsg.includes('503') || userFriendlyMsg.includes('high demand') || userFriendlyMsg.includes('UNAVAILABLE');
      if (is503) {
        userFriendlyMsg = 'Google AI 雲端伺服器目前處於全域尖峰時段（503），建議直接切換使用「⚡ 本地離線快速辨識」進行即時解析與入庫！';
      }
      return res.status(500).json({
        success: false,
        error: '辨識進貨單時發生錯誤: ' + userFriendlyMsg,
        isHighDemand: is503,
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
