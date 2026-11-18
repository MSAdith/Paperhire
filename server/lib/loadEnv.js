import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

// Loads .env by absolute path, so it works whichever folder the server is
// started from (npm run dev runs in server/, `node server/index.js` in the repo
// root, Vercel in /var/task). server/.env is the documented location; a
// repo-root .env is also read as a fallback. Neither overrides variables that
// are already set (e.g. Vercel environment variables), and server/.env wins
// over the root file when both define the same key.

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const ENV_FILE_CANDIDATES = [path.join(SERVER_DIR, ".env"), path.join(SERVER_DIR, "..", ".env")];

// Variable names worth reporting at startup. Values are never logged.
export const REPORTED_KEYS = [
  "AI_PROVIDER", "AI_MODEL", "COMETAPI_KEY", "GEMINI_API_KEY", "ANTHROPIC_API_KEY", "JSEARCH_API_KEY",
  "SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "ADMIN_EMAILS"
];

export function loadEnvFiles(candidates = ENV_FILE_CANDIDATES) {
  const loaded = [];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    dotenv.config({ path: file, override: false });
    loaded.push(file);
  }
  return loaded;
}

// Names (never values) of the reported keys that are set and non-empty.
export function foundKeyNames(env = process.env) {
  return REPORTED_KEYS.filter((name) => typeof env[name] === "string" && env[name].trim() !== "");
}

export const loadedEnvFiles = loadEnvFiles();
