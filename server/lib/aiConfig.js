// Which AI provider and model the server uses, chosen from .env, plus the
// friendly user-facing messages for AI failures. No SDK imports here, so this
// module is cheap to load and safe to use in tests without network access.

export const PROVIDERS = {
  cometapi: { label: "CometAPI", keyEnv: "COMETAPI_KEY", defaultModel: "gemini-3.6-flash" },
  gemini: { label: "Google Gemini", keyEnv: "GEMINI_API_KEY", defaultModel: "gemini-3.6-flash" },
  anthropic: { label: "Anthropic", keyEnv: "ANTHROPIC_API_KEY", defaultModel: "claude-sonnet-5-5" }
};

export const DEFAULT_PROVIDER = "cometapi";

let warnedUnknownProvider = false;

export function getAIProvider() {
  const raw = (process.env.AI_PROVIDER || "").trim().toLowerCase();
  if (!raw) return DEFAULT_PROVIDER;
  if (PROVIDERS[raw]) return raw;
  if (!warnedUnknownProvider) {
    console.warn(`Unknown AI_PROVIDER "${raw}"; falling back to "${DEFAULT_PROVIDER}". Use one of: ${Object.keys(PROVIDERS).join(", ")}.`);
    warnedUnknownProvider = true;
  }
  return DEFAULT_PROVIDER;
}

export function getAIModel(provider = getAIProvider()) {
  const model = (process.env.AI_MODEL || "").trim();
  return model || PROVIDERS[provider].defaultModel;
}

export function getAIKeyName(provider = getAIProvider()) {
  return PROVIDERS[provider].keyEnv;
}

export function getAIKey(provider = getAIProvider()) {
  const key = process.env[getAIKeyName(provider)];
  return key && key.trim() !== "" ? key.trim() : null;
}

export function isAIConfigured() {
  return getAIKey() !== null;
}

const NO_CREDITS_PATTERN = /insufficient[_\s-]*(quota|balance|credit|funds)|credits?\s+(exhausted|used up|depleted)|out of credits?|balance (is )?(insufficient|not enough)/i;

// Maps any SDK error (OpenAI, Google GenAI, Anthropic all expose .status) to one
// of: "timeout", "no_credits", "rate_limited", "auth_failed", "bad_request", "ai_error".
// Credits are checked before 429 because OpenAI-style APIs send
// "insufficient_quota" with a 429 status, and that won't clear with a retry.
export function classifyAIError(err) {
  if (!err) return "ai_error";
  const message = `${err.message || ""} ${err.code || ""} ${err.error?.code || ""} ${err.error?.type || ""}`;

  if (err.name === "AbortError" || err.name === "APIUserAbortError" || /abort/i.test(err.message || "")) return "timeout";

  const status = Number(err.status ?? err.statusCode ?? err.response?.status);
  if (status === 402 || NO_CREDITS_PATTERN.test(message)) return "no_credits";
  if (status === 429 || /RESOURCE_EXHAUSTED|rate limit|too many requests/i.test(message)) return "rate_limited";
  // Gemini reports a bad key as 400 INVALID_ARGUMENT "API key not valid".
  if (status === 401 || status === 403 || /API key not valid|API_KEY_INVALID|invalid api key/i.test(message)) return "auth_failed";
  if (status === 400 || status === 422) return "bad_request";
  return "ai_error";
}

export const AI_BUSY_MESSAGE = "AI is busy, try again in a minute.";
export const AI_NO_CREDITS_MESSAGE = "AI credits used up. The site owner needs to top up the AI provider account before AI features work again.";

// Picks the message for a failed generateJSON result. `notConfigured` is the
// feature-specific lead ("Resume tailoring isn't configured yet."), `failed` is
// the feature-specific generic failure message.
export function aiFailureMessage(reason, { notConfigured, failed }) {
  if (reason === "not_configured") {
    return `${notConfigured} Add ${getAIKeyName()} to your server's .env file to enable it.`;
  }
  if (reason === "rate_limited") return AI_BUSY_MESSAGE;
  if (reason === "no_credits") return AI_NO_CREDITS_MESSAGE;
  return failed;
}
