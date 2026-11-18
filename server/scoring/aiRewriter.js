import { generateJSON, isAIConfigured } from "../lib/aiClient.js";

export async function generateAIRewrites(resumeText, weakBullets = [], analytics) {
  if (!isAIConfigured()) {
    return null; // Skip silently if no AI key is set
  }

  const targetBullets = weakBullets.length > 0 
    ? weakBullets.slice(0, 3) 
    : resumeText.split("\n")
        .map(l => l.trim())
        .filter(l => l.length > 25 && !l.toLowerCase().includes("education"))
        .slice(0, 3);

  if (targetBullets.length === 0) return null;

  const prompt = `You are an expert resume consultant and ATS specialist. 
Analyze the following bullet points from a resume and provide high-impact, action-verb driven, quantified rewrites. Also provide a concise 3-line overall summary of key improvements.

Bullets to rewrite:
${targetBullets.map((b, i) => `${i + 1}. ${b}`).join("\n")}

Respond strictly in valid JSON format with the following keys:
{
  "summary": ["Line 1 of summary", "Line 2 of summary", "Line 3 of summary"],
  "rewrites": [
    { "original": "original bullet 1", "rewritten": "improved bullet 1" }
  ]
}`;

  const result = await generateJSON({
    analytics: { context: analytics?.context, name: "ats_rewrite" },
    prompt,
    maxTokens: 1000,
    timeoutMs: 15000,
    validate: (parsed) => Array.isArray(parsed.summary) && Array.isArray(parsed.rewrites)
  });

  return result.ok ? result.data : null;
}
