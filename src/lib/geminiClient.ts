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

export async function scanInvoiceOCR(base64Image: string, prompt: string): Promise<string> {
  const apiKey = getGeminiAPIKey();
  if (!apiKey) {
    throw new Error('未設定 Gemini API 金鑰。請先至「設定」頁面完成設定。');
  }

  // Initialize the client
  const ai = new GoogleGenAI({ apiKey });

  // Remove the data URI prefix if present (e.g. "data:image/jpeg;base64,")
  let cleanBase64 = base64Image;
  let mimeType = 'image/jpeg'; // default
  
  const match = base64Image.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    mimeType = match[1];
    cleanBase64 = match[2];
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                data: cleanBase64,
                mimeType: mimeType
              }
            }
          ]
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
    throw new Error(error.message || "單據辨識失敗，請重試");
  }
}
