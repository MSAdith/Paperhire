import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";

// One adapter per provider. Each takes the same input and returns the model's
// raw text (or "" when empty); errors are thrown as-is for aiClient to classify.
// SDK-level retries are disabled everywhere so aiClient controls retry timing.
//
// `strict: true` asks for strict JSON output and sends provider tuning options
// (Gemini thinking level). If a provider or model rejects them with a 400,
// aiClient retries once with `strict: false`, a plain chat request.
// The prompts always describe the JSON shape too, and aiClient parses leniently,
// so a provider that ignores JSON mode still works.

const COMETAPI_BASE_URL = "https://api.cometapi.com/v1";

// Gemini 3.x models "think" before answering and those tokens count toward
// the output limit, so give them headroom beyond the JSON budget the caller set.
const THINKING_HEADROOM_TOKENS = 4096;

const isGeminiModel = (model) => /^gemini-/i.test(model);

async function completeWithCometAPI({ apiKey, model, prompt, maxTokens, signal, strict }) {
  const client = new OpenAI({ apiKey, baseURL: COMETAPI_BASE_URL, maxRetries: 0 });
  const response = await client.chat.completions.create(
    {
      model,
      max_tokens: isGeminiModel(model) ? maxTokens + THINKING_HEADROOM_TOKENS : maxTokens,
      messages: [{ role: "user", content: prompt }],
      ...(strict ? { response_format: { type: "json_object" } } : {})
    },
    { signal }
  );
  return response.choices?.[0]?.message?.content || "";
}

async function completeWithGemini({ apiKey, model, prompt, maxTokens, signal, strict }) {
  const ai = new GoogleGenAI({ apiKey, httpOptions: { retryOptions: { attempts: 1 } } });
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      maxOutputTokens: maxTokens + THINKING_HEADROOM_TOKENS,
      abortSignal: signal,
      ...(strict ? { responseMimeType: "application/json" } : {}),
      ...(strict && /^gemini-3/i.test(model) ? { thinkingConfig: { thinkingLevel: "LOW" } } : {})
    }
  });
  return response.text || "";
}

// Anthropic has no JSON mode on the Messages API; the prompt asks for JSON.
async function completeWithAnthropic({ apiKey, model, prompt, maxTokens, signal }) {
  const anthropic = new Anthropic({ apiKey, maxRetries: 0 });
  const response = await anthropic.messages.create(
    {
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }]
    },
    { signal }
  );
  return response.content[0]?.text || "";
}

export const PROVIDER_ADAPTERS = {
  cometapi: completeWithCometAPI,
  gemini: completeWithGemini,
  anthropic: completeWithAnthropic
};

export function completeText(provider, options) {
  return PROVIDER_ADAPTERS[provider](options);
}
