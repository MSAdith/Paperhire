// Must stay the first import: loads .env before any module reads process.env.
import { loadedEnvFiles, foundKeyNames, REPORTED_KEYS } from "./lib/loadEnv.js";
import path from "path";
import app from "./app.js";
import { getAIProvider, getAIModel, getAIKeyName, isAIConfigured } from "./lib/aiConfig.js";
import { getAdminEmails, isSupabaseConfigured } from "./lib/supabase.js";

// Startup report: which .env files were read and which keys are set. Names only, never values.
{
  const found = foundKeyNames();
  const files = loadedEnvFiles.map((f) => path.relative(process.cwd(), f) || f);
  console.log(`[env] .env files loaded: ${files.length ? files.join(", ") : "none (expected server/.env)"}`);
  console.log(`[env] keys found: ${found.join(", ") || "none"}; missing: ${REPORTED_KEYS.filter((k) => !found.includes(k)).join(", ") || "none"}`);
  console.log(`[env] AI provider: ${getAIProvider()} (model ${getAIModel()}, ${getAIKeyName()} ${isAIConfigured() ? "found" : "MISSING"})`);
  console.log(`[env] Sign-in: ${isSupabaseConfigured() ? "Supabase configured" : "NOT configured: feature endpoints will return 503"}; admins: ${getAdminEmails().length}`);
}

const PORT = process.env.PORT || 5000;

export default app;

if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`Paperhire backend running on http://localhost:${PORT}`);
  });
}
