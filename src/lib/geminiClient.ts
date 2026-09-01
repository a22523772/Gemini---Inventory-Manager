import { GoogleGenAI } from "@google/genai";

// We store the key in localStorage.
export function getGeminiAPIKey(): string | null {
  return localStorage.getItem('gemini_api_key');
}

export function setGeminiAPIKey(key: string) {
  localStorage.setItem('gemini_api_key', key);
}

export function clearGeminiAPIKey() {
  localStorage.removeItem('gemini_api_key');
}

export async function scanInvoiceOCR(base64Images: string | string[], prompt: string): Promise<string> {
  const apiKey = getGeminiAPIKey();
  if (!apiKey) {
    throw new Error('未設定 Gemini API 金鑰。請先至「設定」頁面完成設定。');
  }

  // Initialize the client
  const ai = new GoogleGenAI({ apiKey });

  const imageList = Array.isArray(base64Images) ? base64Images : [base64Images];
  if (imageList.length === 0) {
    throw new Error('未提供任何單據圖片');
  }

  const parts: any[] = [{ text: prompt }];

  for (const img of imageList) {
    let cleanBase64 = img;
    let mimeType = 'image/jpeg'; // default
    
    const match = img.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      mimeType = match[1];
      cleanBase64 = match[2];
    }

    parts.push({
      inlineData: {
        data: cleanBase64,
        mimeType: mimeType
      }
    });
  }

  let retries = 3;
  let delay = 1000;

  while (retries > 0) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.7-flash",
        contents: [
          {
            role: "user",
            parts: parts
          }
        ],
        config: {
          temperature: 0.1, // Low temp for more deterministic JSON output
          responseMimeType: "application/json",
        }
      });

      if (!response.text) {
        throw new Error("模型回傳空白結果");
      }

      return response.text;
    } catch (error: any) {
      console.error("Gemini OCR Error:", error);
      
      const isTransientError = error.message && (
        error.message.includes('503') || 
        error.message.includes('429') ||
        error.message.includes('UNAVAILABLE') ||
        error.message.includes('high demand')
      );

      if (isTransientError && retries > 1) {
        retries--;
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
        continue;
      }

      throw new Error(error.message || "單據辨識失敗，請重試");
    }
  }
  
  throw new Error("單據辨識失敗，請重試");
}
