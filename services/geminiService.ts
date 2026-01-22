import { SYSTEM_INSTRUCTION } from "../constants";

// --- API KEY MANAGEMENT ---
const API_KEYS = [
  "AIzaSyDHsKZv9zk5VN9tlqZ9Ffhl294i-BunRD0",
  "AIzaSyAdmzKq5c0PVqur7WygvyblnfsBY8e1rzE",
  "AIzaSyDlazOs2TixDhZrvP9pKZ2F23aABhnhDnw"
];

const MODEL_ID = "gemini-1.5-flash";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent`;

let currentKeyIndex = 0;

// --- TYPES ---
interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string; inline_data?: { mime_type: string; data: string } }[];
}

// --- INTERNAL HELPERS ---

const rotateKey = () => {
  currentKeyIndex = (currentKeyIndex + 1) % API_KEYS.length;
  console.log(`[Mentor System] Switching to frequency channel: ${currentKeyIndex}`);
};

const getCurrentKey = () => API_KEYS[currentKeyIndex];

/**
 * Raw Fetch implementation to bypass SDK issues.
 */
const callGeminiRaw = async (payload: any): Promise<string> => {
  let attempts = 0;
  const maxAttempts = API_KEYS.length;

  while (attempts < maxAttempts) {
    try {
      const key = getCurrentKey();
      const response = await fetch(`${API_URL}?key=${key}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(`Error on key ${currentKeyIndex}:`, response.status, errorData);
        
        // If it's a 429 (Rate Limit) or 500/503 (Server Error), rotate and retry
        // If it's 400 (Bad Request), it might be the content, but we retry anyway to be safe
        throw new Error(`HTTP Error: ${response.status}`);
      }

      const data = await response.json();

      // Check for safety blocks in the response
      if (data.promptFeedback?.blockReason) {
        return "O Mentor foi bloqueado por seus próprios filtros de segurança. Reformule com menos intensidade.";
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!text) {
        // Sometimes valid response has no text if filtered
        if (data.candidates?.[0]?.finishReason !== "STOP") {
             return "Mensagem interceptada ou filtrada. Tente novamente.";
        }
        throw new Error("Empty response from AI");
      }

      return text;

    } catch (error) {
      console.warn(`Attempt ${attempts + 1} failed. Rotating key.`);
      attempts++;
      rotateKey();
      // Small delay before retry
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  throw new Error("All keys failed");
};

// --- PUBLIC METHODS ---

export const sendMessageToGemini = async (
  message: string,
  imagePart?: { mimeType: string; data: string }
): Promise<string> => {
  
  // Construct the payload manually
  // This ensures we are sending EXACTLY what the API expects for Safety Settings
  const payload = {
    contents: [
      {
        role: "user",
        parts: [
          { text: message },
          ...(imagePart ? [{ inline_data: { mime_type: imagePart.mimeType, data: imagePart.data } }] : [])
        ]
      }
    ],
    system_instruction: {
      parts: [{ text: SYSTEM_INSTRUCTION }]
    },
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 1000,
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
    ]
  };

  try {
    return await callGeminiRaw(payload);
  } catch (e) {
    return "ERRO CRÍTICO: Sistema sobrecarregado. Aguarde 1 minuto e tente novamente.";
  }
};

export const generateMindMapText = async (topic: string): Promise<string | null> => {
  const prompt = `
    ATUE COMO UM ESTRATEGISTA DE ELITE.
    Crie um Mapa Mental hierárquico (formato de texto identado) para resolver esta confusão: "${topic}".
    
    REGRAS:
    1. Use apenas texto puro.
    2. Use hierarquia com marcadores (-, *, +).
    3. Seja brutalmente prático. Nada de teoria. Apenas ações.
    
    Retorne APENAS o mapa.
  `;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.5,
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
    ]
  };

  try {
    return await callGeminiRaw(payload);
  } catch (error) {
    return null;
  }
};