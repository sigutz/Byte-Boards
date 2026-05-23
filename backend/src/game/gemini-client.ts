import { GoogleGenerativeAI } from '@google/generative-ai';
import type { GenerationConfig } from '@google/generative-ai';

function loadKeys(): string[] {
  const numbered = Object.entries(process.env)
    .filter(([k]) => /^GEMINI_\d+$/.test(k))
    .sort(([a], [b]) => {
      const na = parseInt(a.replace('GEMINI_', ''), 10);
      const nb = parseInt(b.replace('GEMINI_', ''), 10);
      return na - nb;
    })
    .map(([, v]) => v ?? '')
    .filter(v => v.length > 0);

  if (numbered.length > 0) return numbered;

  const fallback = process.env.GEMINI_API_KEY;
  return fallback ? [fallback] : [];
}

const keys = loadKeys();
let currentKeyIndex = 0;

export function hasGeminiKey(): boolean {
  return keys.length > 0;
}

const DEFAULT_CONFIG: GenerationConfig = {
  temperature: 0.7,
  maxOutputTokens: 200,
  responseMimeType: 'application/json',
};

export async function callGemini(
  userPrompt: string,
  systemInstruction: string,
  config?: Partial<GenerationConfig>,
): Promise<string> {
  if (keys.length === 0) throw new Error('No Gemini API keys configured');

  const generationConfig: GenerationConfig = { ...DEFAULT_CONFIG, ...config };
  let attempts = 0;

  while (attempts < keys.length) {
    const key = keys[currentKeyIndex];
    const client = new GoogleGenerativeAI(key);
    try {
      const model = client.getGenerativeModel({
        model: 'gemini-2.0-flash',
        systemInstruction,
        generationConfig,
      });

      const result = await Promise.race([
        model.generateContent(userPrompt),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 8000)
        ),
      ]);

      return result.response.text();
    } catch (err) {
      const msg = String((err as Error).message ?? '');
      const isRetryable =
        msg.includes('429') ||
        msg.includes('timeout') ||
        msg.includes('503') ||
        msg.includes('500');

      if (isRetryable && keys.length > 1) {
        currentKeyIndex = (currentKeyIndex + 1) % keys.length;
        attempts++;
        console.warn(`[GeminiClient] Rotated to key index ${currentKeyIndex}: ${msg}`);
      } else {
        throw err;
      }
    }
  }

  throw new Error('All Gemini keys exhausted');
}
