import { GoogleGenAI, Type } from "@google/genai";
import { BiblePassage } from "../types";

const apiKey = process.env.GEMINI_API_KEY || "";
if (!apiKey) {
  console.warn("GEMINI_API_KEY não encontrada. Verifique as configurações.");
}
const ai = new GoogleGenAI({ apiKey });

export async function generateVisualPrompt(passage: BiblePassage): Promise<{ text: string; visualPrompt: string }> {
  const model = "gemini-3.1-pro-preview";
  const prompt = `
    Extraia o texto bíblico de ${passage.book} ${passage.chapter}:${passage.verse} (em português).
    Em seguida, gere uma descrição visual rica de aproximadamente 500 caracteres para um modelo de geração de imagens.
    Foque em:
    - Iluminação (ex: luz de Rembrandt, luz natural, sombras dramáticas)
    - Vestimentas da época (precisão histórica)
    - Atmosfera e estilo (ex: cinematográfico, épico, realista)
    - Detalhes do cenário e personagens.
    - Composição otimizada para formato vertical (9:16), ideal para Stories.
    
    Retorne o resultado em formato JSON com as chaves:
    - "text": O texto bíblico original.
    - "visualPrompt": A descrição visual detalhada.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          visualPrompt: { type: Type.STRING },
        },
        required: ["text", "visualPrompt"],
      },
    },
  });

  const result = JSON.parse(response.text || "{}");
  return {
    text: result.text || "",
    visualPrompt: result.visualPrompt || "",
  };
}

export async function generateImageFromPrompt(visualPrompt: string): Promise<string> {
  const model = "gemini-2.5-flash-image";
  const response = await ai.models.generateContent({
    model,
    contents: {
      parts: [{ text: visualPrompt }],
    },
    config: {
      imageConfig: {
        aspectRatio: "9:16",
      },
    },
  });

  for (const part of response.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }

  throw new Error("Não foi possível gerar a imagem.");
}

export function generateMetadata(passage: BiblePassage, text: string) {
  const hashtags = [
    "#Biblia",
    `#${passage.book.replace(/\s/g, "")}`,
    "#ArteCrista",
    "#IA",
    "#Fe"
  ];
  const shortCitation = `${passage.book} ${passage.chapter}:${passage.verse}`;
  
  return { hashtags, shortCitation };
}
