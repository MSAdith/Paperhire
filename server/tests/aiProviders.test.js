import { describe, it, expect, vi, beforeEach } from "vitest";

// The three SDKs are mocked so we can check each adapter sends the right request
// shape (base URL, model, JSON mode, no SDK retries) and reads the reply text.
const sdk = vi.hoisted(() => ({
  openaiOptions: null,
  openaiCreate: vi.fn(),
  genaiOptions: null,
  genaiGenerate: vi.fn(),
  anthropicOptions: null,
  anthropicCreate: vi.fn()
}));

vi.mock("openai", () => ({
  default: class {
    constructor(opts) {
      sdk.openaiOptions = opts;
      this.chat = { completions: { create: sdk.openaiCreate } };
    }
  }
}));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    constructor(opts) {
      sdk.genaiOptions = opts;
      this.models = { generateContent: sdk.genaiGenerate };
    }
  }
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    constructor(opts) {
      sdk.anthropicOptions = opts;
      this.messages = { create: sdk.anthropicCreate };
    }
  }
}));

const { completeText } = await import("../lib/aiProviders.js");

beforeEach(() => {
  sdk.openaiCreate.mockReset();
  sdk.genaiGenerate.mockReset();
  sdk.anthropicCreate.mockReset();
});

const signal = new AbortController().signal;

describe("CometAPI adapter (OpenAI-compatible)", () => {
  it("calls chat.completions.create on api.cometapi.com with JSON mode", async () => {
    sdk.openaiCreate.mockResolvedValue({ choices: [{ message: { content: '{"a":1}' } }] });
    const text = await completeText("cometapi", { apiKey: "k", model: "gemini-3.6-flash", prompt: "p", maxTokens: 1000, signal, strict: true });

    expect(text).toBe('{"a":1}');
    expect(sdk.openaiOptions).toEqual({ apiKey: "k", baseURL: "https://api.cometapi.com/v1", maxRetries: 0 });
    const [body, reqOpts] = sdk.openaiCreate.mock.calls[0];
    expect(body.model).toBe("gemini-3.6-flash");
    expect(body.messages).toEqual([{ role: "user", content: "p" }]);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.max_tokens).toBeGreaterThan(1000); // headroom for Gemini thinking tokens
    expect(reqOpts.signal).toBe(signal);
  });

  it("omits JSON mode in non-strict mode and returns '' for an empty reply", async () => {
    sdk.openaiCreate.mockResolvedValue({ choices: [] });
    const text = await completeText("cometapi", { apiKey: "k", model: "gpt-x", prompt: "p", maxTokens: 500, signal, strict: false });
    expect(text).toBe("");
    const [body] = sdk.openaiCreate.mock.calls[0];
    expect(body.response_format).toBeUndefined();
    expect(body.max_tokens).toBe(500);
  });
});

describe("Gemini adapter (@google/genai)", () => {
  it("requests application/json with SDK retries off and returns response.text", async () => {
    sdk.genaiGenerate.mockResolvedValue({ text: '{"b":2}' });
    const text = await completeText("gemini", { apiKey: "g", model: "gemini-3.6-flash", prompt: "p", maxTokens: 1000, signal, strict: true });

    expect(text).toBe('{"b":2}');
    expect(sdk.genaiOptions).toEqual({ apiKey: "g", httpOptions: { retryOptions: { attempts: 1 } } });
    const [req] = sdk.genaiGenerate.mock.calls[0];
    expect(req.model).toBe("gemini-3.6-flash");
    expect(req.contents).toBe("p");
    expect(req.config.responseMimeType).toBe("application/json");
    expect(req.config.abortSignal).toBe(signal);
    expect(req.config.thinkingConfig).toEqual({ thinkingLevel: "LOW" });
  });

  it("drops JSON mode and thinking config in non-strict mode", async () => {
    sdk.genaiGenerate.mockResolvedValue({ text: undefined });
    expect(await completeText("gemini", { apiKey: "g", model: "gemini-3.6-flash", prompt: "p", maxTokens: 1000, signal, strict: false })).toBe("");
    const [req] = sdk.genaiGenerate.mock.calls[0];
    expect(req.config.responseMimeType).toBeUndefined();
    expect(req.config.thinkingConfig).toBeUndefined();
  });
});

describe("Anthropic adapter", () => {
  it("still calls messages.create and returns the first text block", async () => {
    sdk.anthropicCreate.mockResolvedValue({ content: [{ text: '{"c":3}' }] });
    const text = await completeText("anthropic", { apiKey: "a", model: "claude-sonnet-5-5", prompt: "p", maxTokens: 800, signal, strict: true });

    expect(text).toBe('{"c":3}');
    expect(sdk.anthropicOptions).toEqual({ apiKey: "a", maxRetries: 0 });
    const [body, reqOpts] = sdk.anthropicCreate.mock.calls[0];
    expect(body).toEqual({ model: "claude-sonnet-5-5", max_tokens: 800, messages: [{ role: "user", content: "p" }] });
    expect(reqOpts.signal).toBe(signal);
  });
});
