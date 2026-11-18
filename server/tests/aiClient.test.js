import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The SDK adapters are mocked; provider selection, JSON parsing, validation and
// retry/error handling in aiClient + aiConfig are real.
const providerMock = vi.hoisted(() => ({ completeText: vi.fn() }));
vi.mock("../lib/aiProviders.js", () => providerMock);

const { generateJSON } = await import("../lib/aiClient.js");
const { getAIProvider, getAIModel, getAIKeyName, isAIConfigured, classifyAIError, aiFailureMessage } = await import("../lib/aiConfig.js");

const ENV_KEYS = ["AI_PROVIDER", "AI_MODEL", "COMETAPI_KEY", "GEMINI_API_KEY", "ANTHROPIC_API_KEY"];
let savedEnv;

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  ENV_KEYS.forEach((k) => delete process.env[k]);
  providerMock.completeText.mockReset();
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const apiError = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });

describe("AI provider selection", () => {
  it("defaults to CometAPI with a Gemini Flash model", () => {
    expect(getAIProvider()).toBe("cometapi");
    expect(getAIModel()).toBe("gemini-3.6-flash");
    expect(getAIKeyName()).toBe("COMETAPI_KEY");
  });

  it("uses AI_PROVIDER and AI_MODEL from the environment", () => {
    process.env.AI_PROVIDER = "Gemini";
    process.env.AI_MODEL = "gemini-3.5-flash";
    expect(getAIProvider()).toBe("gemini");
    expect(getAIModel()).toBe("gemini-3.5-flash");
    expect(getAIKeyName()).toBe("GEMINI_API_KEY");

    process.env.AI_PROVIDER = "anthropic";
    delete process.env.AI_MODEL;
    expect(getAIModel()).toBe("claude-sonnet-5-5");
  });

  it("falls back to the default provider for an unknown AI_PROVIDER", () => {
    process.env.AI_PROVIDER = "not-a-provider";
    expect(getAIProvider()).toBe("cometapi");
  });

  it("is configured only when the active provider's key is set", () => {
    process.env.GEMINI_API_KEY = "g-key";
    expect(isAIConfigured()).toBe(false); // provider is cometapi
    process.env.AI_PROVIDER = "gemini";
    expect(isAIConfigured()).toBe(true);
    process.env.GEMINI_API_KEY = "   ";
    expect(isAIConfigured()).toBe(false);
  });
});

describe("AI error classification and messages", () => {
  it("classifies rate limits, credits, auth, bad requests and timeouts", () => {
    expect(classifyAIError(apiError(429, "Too Many Requests"))).toBe("rate_limited");
    expect(classifyAIError(apiError(429, "RESOURCE_EXHAUSTED: quota exceeded per minute"))).toBe("rate_limited");
    expect(classifyAIError(apiError(402, "Payment Required"))).toBe("no_credits");
    expect(classifyAIError(apiError(429, "You exceeded your current quota", { code: "insufficient_quota" }))).toBe("no_credits");
    expect(classifyAIError(apiError(403, "insufficient balance on this token"))).toBe("no_credits");
    expect(classifyAIError(apiError(401, "invalid token"))).toBe("auth_failed");
    expect(classifyAIError(apiError(400, "API key not valid. Please pass a valid API key."))).toBe("auth_failed");
    expect(classifyAIError(apiError(400, "response_format not supported"))).toBe("bad_request");
    expect(classifyAIError(Object.assign(new Error("Request was aborted."), { name: "APIUserAbortError" }))).toBe("timeout");
    expect(classifyAIError(new Error("socket hang up"))).toBe("ai_error");
  });

  it("builds friendly messages naming the active provider's key", () => {
    const texts = { notConfigured: "Interview prep isn't configured yet.", failed: "It failed." };
    expect(aiFailureMessage("not_configured", texts)).toBe("Interview prep isn't configured yet. Add COMETAPI_KEY to your server's .env file to enable it.");
    expect(aiFailureMessage("rate_limited", texts)).toBe("AI is busy, try again in a minute.");
    expect(aiFailureMessage("no_credits", texts)).toMatch(/^AI credits used up/);
    expect(aiFailureMessage("timeout", texts)).toBe("It failed.");
  });
});

describe("generateJSON", () => {
  beforeEach(() => {
    process.env.COMETAPI_KEY = "test-key";
  });

  it("returns not_configured without calling a provider when the key is missing", async () => {
    delete process.env.COMETAPI_KEY;
    expect(await generateJSON({ prompt: "x" })).toEqual({ ok: false, reason: "not_configured" });
    expect(providerMock.completeText).not.toHaveBeenCalled();
  });

  it("calls the active provider in strict JSON mode and parses JSON wrapped in prose or code fences", async () => {
    providerMock.completeText.mockResolvedValue('Here you go:\n```json\n{"letter": "Dear team"}\n```');
    const result = await generateJSON({ prompt: "write", maxTokens: 900, validate: (p) => typeof p.letter === "string" });
    expect(result).toEqual({ ok: true, data: { letter: "Dear team" } });

    const [provider, opts] = providerMock.completeText.mock.calls[0];
    expect(provider).toBe("cometapi");
    expect(opts).toMatchObject({ apiKey: "test-key", model: "gemini-3.6-flash", prompt: "write", maxTokens: 900, strict: true });
  });

  it("routes to the provider named in AI_PROVIDER with its own key", async () => {
    process.env.AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "sk-ant";
    providerMock.completeText.mockResolvedValue('{"a":1}');
    await generateJSON({ prompt: "x" });
    const [provider, opts] = providerMock.completeText.mock.calls[0];
    expect(provider).toBe("anthropic");
    expect(opts.apiKey).toBe("sk-ant");
    expect(opts.model).toBe("claude-sonnet-5-5");
  });

  it("rejects output that fails validation, and output with no JSON", async () => {
    providerMock.completeText.mockResolvedValue('{"wrong": true}');
    expect((await generateJSON({ prompt: "x", validate: (p) => Boolean(p.letter) })).reason).toBe("schema_validation_failed");
    providerMock.completeText.mockResolvedValue("Sorry, I can't help with that.");
    expect((await generateJSON({ prompt: "x" })).reason).toBe("no_json_found");
    providerMock.completeText.mockResolvedValue("");
    expect((await generateJSON({ prompt: "x" })).reason).toBe("empty_response");
  });

  it("retries once after a short wait on a 429 and succeeds", async () => {
    providerMock.completeText.mockRejectedValueOnce(apiError(429, "Too Many Requests")).mockResolvedValueOnce('{"ok":1}');
    const started = Date.now();
    const result = await generateJSON({ prompt: "x", timeoutMs: 20000 });
    expect(result).toEqual({ ok: true, data: { ok: 1 } });
    expect(providerMock.completeText).toHaveBeenCalledTimes(2);
    expect(Date.now() - started).toBeGreaterThanOrEqual(1900);
  });

  it("returns rate_limited when the retry is also rate limited", async () => {
    providerMock.completeText.mockRejectedValue(apiError(429, "Too Many Requests"));
    const result = await generateJSON({ prompt: "x", timeoutMs: 20000 });
    expect(result.reason).toBe("rate_limited");
    expect(providerMock.completeText).toHaveBeenCalledTimes(2);
  });

  it("doesn't wait out a rate limit when the time budget is too short", async () => {
    providerMock.completeText.mockRejectedValue(apiError(429, "Too Many Requests"));
    const result = await generateJSON({ prompt: "x", timeoutMs: 4000 });
    expect(result.reason).toBe("rate_limited");
    expect(providerMock.completeText).toHaveBeenCalledTimes(1);
  });

  it("does not retry when credits are used up", async () => {
    providerMock.completeText.mockRejectedValue(apiError(402, "Insufficient credits"));
    expect((await generateJSON({ prompt: "x" })).reason).toBe("no_credits");
    expect(providerMock.completeText).toHaveBeenCalledTimes(1);
  });

  it("retries a 400 without strict JSON mode", async () => {
    providerMock.completeText.mockRejectedValueOnce(apiError(400, "response_format is not supported")).mockResolvedValueOnce('{"ok":1}');
    expect((await generateJSON({ prompt: "x" })).ok).toBe(true);
    expect(providerMock.completeText.mock.calls[0][1].strict).toBe(true);
    expect(providerMock.completeText.mock.calls[1][1].strict).toBe(false);
  });

  it("retries once on malformed JSON, then gives up", async () => {
    providerMock.completeText.mockResolvedValue('{"broken": }');
    const result = await generateJSON({ prompt: "x" });
    expect(result.reason).toBe("ai_error");
    expect(providerMock.completeText).toHaveBeenCalledTimes(2);
  });

  it("reports a timeout without retrying", async () => {
    providerMock.completeText.mockImplementation(
      (_provider, { signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))))
    );
    const result = await generateJSON({ prompt: "x", timeoutMs: 50 });
    expect(result.reason).toBe("timeout");
    expect(providerMock.completeText).toHaveBeenCalledTimes(1);
  });
});
