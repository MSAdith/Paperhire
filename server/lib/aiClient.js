import { completeText } from "./aiProviders.js";
import { getAIProvider, getAIModel, getAIKey, getAIKeyName, isAIConfigured, classifyAIError } from "./aiConfig.js";
import { trackAiCall } from "./events.js";

export { isAIConfigured };

const DEFAULT_TIMEOUT_MS = 25000;
const RATE_LIMIT_RETRY_MS = 2000;
// Don't start a retry with less than this left in the time budget.
const MIN_RETRY_BUDGET_MS = 5000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Calls the configured AI provider (AI_PROVIDER in .env) expecting a strict JSON
// object response. Returns { ok: true, data } or { ok: false, reason, error? } —
// never throws. reason is one of: not_configured, empty_response, no_json_found,
// schema_validation_failed, timeout, rate_limited, no_credits, ai_error.
//
// Retries at most once, all within timeoutMs total so the worst case fits
// Vercel's maxDuration (60s in vercel.json):
// - 429 rate limit: wait RATE_LIMIT_RETRY_MS, then retry.
// - 400 bad request: retry without strict JSON mode / tuning options.
// - unparseable JSON or other API errors: retry immediately.
// - timeout, no credits, bad API key: no retry.
//
// `analytics` ({ context, name }) records an ai_call event with the result
// bucket and duration only; the prompt and the output are never recorded.
export async function generateJSON({ analytics, ...options }) {
  if (!isAIConfigured()) {
    return { ok: false, reason: "not_configured" };
  }
  const startedAt = Date.now();
  const result = await runGenerateJSON(options);
  trackAiCall(analytics?.context || {}, analytics?.name || "unknown", result.ok ? "ok" : result.reason, Date.now() - startedAt);
  return result;
}

async function runGenerateJSON({ prompt, maxTokens = 1500, validate, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const provider = getAIProvider();
  const model = getAIModel(provider);
  const apiKey = getAIKey(provider);
  const deadline = Date.now() + timeoutMs;

  const attempt = async (attemptNum, strict) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), Math.max(deadline - Date.now(), 1));

    try {
      const content = await completeText(provider, { apiKey, model, prompt, maxTokens, signal: controller.signal, strict });
      if (!content) return { ok: false, reason: "empty_response" };

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { ok: false, reason: "no_json_found" };

      const parsed = JSON.parse(jsonMatch[0]);

      if (typeof validate === "function" && !validate(parsed)) {
        return { ok: false, reason: "schema_validation_failed" };
      }

      return { ok: true, data: parsed };
    } catch (err) {
      const kind = err instanceof SyntaxError ? "ai_error" : classifyAIError(err);
      const canRetry = attemptNum === 1 && deadline - Date.now() > MIN_RETRY_BUDGET_MS;

      if (kind === "timeout") {
        console.warn(`AI client (${provider}) timed out after`, timeoutMs, "ms");
        return { ok: false, reason: "timeout" };
      }
      if (kind === "no_credits") {
        console.warn(`AI client (${provider}): out of credits or quota:`, err.message);
        return { ok: false, reason: "no_credits", error: err.message };
      }
      if (kind === "auth_failed") {
        console.warn(`AI client (${provider}): API key rejected. Check ${getAIKeyName(provider)}.`, err.message);
        return { ok: false, reason: "ai_error", error: err.message };
      }
      if (kind === "rate_limited") {
        if (canRetry && deadline - Date.now() > RATE_LIMIT_RETRY_MS + MIN_RETRY_BUDGET_MS) {
          await sleep(RATE_LIMIT_RETRY_MS);
          return attempt(2, strict);
        }
        console.warn(`AI client (${provider}) rate limited:`, err.message);
        return { ok: false, reason: "rate_limited", error: err.message };
      }
      if (canRetry) {
        return attempt(2, kind === "bad_request" ? false : strict);
      }
      console.warn(`AI client (${provider}) fallback triggered:`, err.message);
      return { ok: false, reason: "ai_error", error: err.message };
    } finally {
      clearTimeout(timeoutId);
    }
  };

  return attempt(1, true);
}
