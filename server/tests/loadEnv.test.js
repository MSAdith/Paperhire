import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { ENV_FILE_CANDIDATES, loadEnvFiles, foundKeyNames } from "../lib/loadEnv.js";

const serverDir = path.resolve(import.meta.dirname, "..");
const TEST_KEYS = ["RL_TEST_ONLY_SERVER", "RL_TEST_ONLY_ROOT", "RL_TEST_ONLY_BOTH", "RL_TEST_ONLY_PRESET"];

afterEach(() => TEST_KEYS.forEach((k) => delete process.env[k]));

describe(".env loading", () => {
  it("looks for server/.env then the repo-root .env by absolute path, independent of the working directory", () => {
    expect(ENV_FILE_CANDIDATES).toEqual([path.join(serverDir, ".env"), path.join(serverDir, "..", ".env")]);
    expect(ENV_FILE_CANDIDATES.every((p) => path.isAbsolute(p))).toBe(true);
  });

  it("loads both files, server/.env wins, and existing env vars (e.g. Vercel's) are not overridden", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rl-env-"));
    const serverEnv = path.join(dir, "server.env");
    const rootEnv = path.join(dir, "root.env");
    fs.writeFileSync(serverEnv, "RL_TEST_ONLY_SERVER=s\nRL_TEST_ONLY_BOTH=from-server\nRL_TEST_ONLY_PRESET=from-file\n");
    fs.writeFileSync(rootEnv, "RL_TEST_ONLY_ROOT=r\nRL_TEST_ONLY_BOTH=from-root\n");
    process.env.RL_TEST_ONLY_PRESET = "from-platform";

    const loaded = loadEnvFiles([serverEnv, path.join(dir, "missing.env"), rootEnv]);

    expect(loaded).toEqual([serverEnv, rootEnv]);
    expect(process.env.RL_TEST_ONLY_SERVER).toBe("s");
    expect(process.env.RL_TEST_ONLY_ROOT).toBe("r");
    expect(process.env.RL_TEST_ONLY_BOTH).toBe("from-server");
    expect(process.env.RL_TEST_ONLY_PRESET).toBe("from-platform");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("reports key names that are set, never their values, and skips blank ones", () => {
    const names = foundKeyNames({ JSEARCH_API_KEY: "secret-value", COMETAPI_KEY: "  ", AI_PROVIDER: "cometapi" });
    expect(names).toEqual(["AI_PROVIDER", "JSEARCH_API_KEY"]);
    expect(names.join(" ")).not.toContain("secret-value");
  });
});
