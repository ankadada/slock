import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

// ============================================================
// Types
// ============================================================

export interface DetectedProvider {
  id: string;                // "anthropic", "openai", "gemini", "ollama"
  name: string;              // "Anthropic (Claude)"
  source: "env" | "cli-config" | "cli-binary" | "manual";
  apiKey?: string;           // from env or config file
  baseUrl?: string;          // from env or config file
  models: string[];          // available models
  cliPath?: string;          // path to CLI binary
}

// ============================================================
// Helpers
// ============================================================

const HOME = process.env.HOME || process.env.USERPROFILE || "";

function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function readJsonSafe(filePath: string): Record<string, unknown> | null {
  try {
    if (!fileExists(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Find a binary by name using known standard paths.
 * Avoids shell execution entirely for safety.
 */
function findBinary(name: string): string | undefined {
  const searchPaths = [
    path.join(HOME, ".local", "bin"),
    path.join(HOME, ".volta", "bin"),
    "/usr/local/bin",
    "/opt/homebrew/bin",
    "/usr/bin",
  ];

  for (const dir of searchPaths) {
    const fullPath = path.join(dir, name);
    if (fileExists(fullPath)) {
      return fullPath;
    }
  }
  return undefined;
}

// ============================================================
// Fallback model lists
// ============================================================

const OPENAI_FALLBACK_MODELS = [
  "gpt-5.4",
  "gpt-5.4-mini",
];

// ============================================================
// Per-provider detection
// ============================================================

function detectAnthropic(): DetectedProvider | null {
  const provider: DetectedProvider = {
    id: "anthropic",
    name: "Anthropic (Claude)",
    source: "env",
    models: [
      "claude-sonnet-4-6",
      "claude-opus-4-6",
      "claude-haiku-4-5",
    ],
  };

  // 1. Environment variable
  const envKey = process.env.ANTHROPIC_API_KEY;
  const envBase = process.env.ANTHROPIC_BASE_URL;
  if (envKey) {
    provider.apiKey = envKey;
    provider.baseUrl = envBase;
    provider.source = "env";
  }

  // 2. Claude CLI binary
  const cliPath = findBinary("claude");
  if (cliPath) {
    provider.cliPath = cliPath;
    if (!provider.apiKey) {
      provider.source = "cli-binary";
    }
  }

  // Only return if we actually found something
  if (provider.apiKey || provider.cliPath) {
    return provider;
  }
  return null;
}

function detectOpenAI(): DetectedProvider | null {
  const provider: DetectedProvider = {
    id: "openai",
    name: "OpenAI (GPT)",
    source: "env",
    models: OPENAI_FALLBACK_MODELS,
  };

  // 1. Environment variable
  const envKey = process.env.OPENAI_API_KEY;
  const envBase = process.env.OPENAI_BASE_URL;
  if (envKey) {
    provider.apiKey = envKey;
    provider.baseUrl = envBase;
    provider.source = "env";
  }

  // 2. Codex CLI config (~/.codex/auth.json)
  const codexAuthPath = path.join(HOME, ".codex", "auth.json");
  const codexAuth = readJsonSafe(codexAuthPath);
  if (codexAuth && !provider.apiKey) {
    // First check for direct API key
    const directKey = codexAuth.OPENAI_API_KEY;
    if (typeof directKey === "string" && directKey && directKey !== "None") {
      provider.apiKey = directKey;
      provider.source = "cli-config";
    }

    // If no direct key, use OAuth access_token from Codex CLI (ChatGPT login)
    // The access_token is a valid Bearer token for https://api.openai.com/v1
    if (!provider.apiKey) {
      const tokens = codexAuth.tokens as Record<string, unknown> | undefined;
      if (tokens?.access_token && typeof tokens.access_token === "string") {
        provider.apiKey = tokens.access_token;
        provider.source = "cli-config";
      }
    }
  }

  // 3. Codex CLI binary
  const codexPath = findBinary("codex");
  if (codexPath) {
    provider.cliPath = codexPath;
    if (!provider.apiKey) {
      provider.source = "cli-binary";
    }
  }

  if (provider.apiKey || provider.cliPath) {
    return provider;
  }
  return null;
}

function detectGemini(): DetectedProvider | null {
  const provider: DetectedProvider = {
    id: "gemini",
    name: "Google (Gemini)",
    source: "env",
    models: [
      "gemini-3.1-pro-preview",
      "gemini-3-flash-preview",
    ],
  };

  // Gemini goes through the same LiteLLM proxy as OpenAI, using the same API key.
  // Check for the OpenAI/Anthropic key that the proxy accepts.
  const envKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (envKey) {
    provider.apiKey = envKey;
    provider.source = "env";
    return provider;
  }

  // Fall back: reuse the OpenAI key since Gemini goes through the same proxy
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    provider.apiKey = openaiKey;
    provider.source = "env";
    return provider;
  }

  // Fall back: reuse the Anthropic key since everything goes through the LiteLLM proxy
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    provider.apiKey = anthropicKey;
    provider.source = "env";
    return provider;
  }

  // Gemini CLI binary
  const cliPath = findBinary("gemini");
  if (cliPath) {
    provider.cliPath = cliPath;
    provider.source = "cli-binary";
    return provider;
  }

  return null;
}

function detectOllama(): DetectedProvider | null {
  const provider: DetectedProvider = {
    id: "ollama",
    name: "Ollama (Local)",
    source: "cli-binary",
    baseUrl: "http://localhost:11434/v1",
    apiKey: "ollama", // Ollama accepts any API key
    models: [],
  };

  // Check if ollama binary exists
  const cliPath = findBinary("ollama");
  if (!cliPath) return null;

  provider.cliPath = cliPath;

  // Try to get list of models from running Ollama instance
  try {
    const result = execFileSync(cliPath, ["list"], {
      encoding: "utf-8",
      timeout: 3000,
    });
    const lines = result.trim().split("\n").slice(1); // skip header
    provider.models = lines
      .map((l) => l.split(/\s+/)[0])
      .filter((name) => name && name !== "NAME");
  } catch {
    // Ollama might not be running; still report it as available
    provider.models = [];
  }

  return provider;
}

// ============================================================
// Dynamic model fetching
// ============================================================

/**
 * Fetch available models from the OpenAI /v1/models API.
 * Filters to chat-capable models (gpt-*, o1-*, o3-*, o4-*).
 * Returns null on failure so the caller can fall back to the hardcoded list.
 */
async function fetchOpenAIModels(
  apiKey: string,
  baseUrl?: string
): Promise<string[] | null> {
  try {
    const url = `${baseUrl || "https://api.openai.com/v1"}/models`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;

    const data = (await response.json()) as {
      data: { id: string }[];
    };

    return data.data
      .map((m) => m.id)
      .filter(
        (id) =>
          id.includes("gpt") ||
          id.startsWith("o1") ||
          id.startsWith("o3") ||
          id.startsWith("o4")
      )
      .sort();
  } catch {
    return null;
  }
}

// ============================================================
// Provider cache
// ============================================================

let providerCache: { providers: DetectedProvider[]; timestamp: number } | null =
  null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ============================================================
// Public API
// ============================================================

/**
 * Auto-detect all available AI providers on this machine.
 * Checks: CLI config files > env vars > CLI binaries.
 * For OpenAI, dynamically fetches the model list from the API.
 * Results are cached for 5 minutes.
 */
export async function detectProviders(): Promise<DetectedProvider[]> {
  if (providerCache && Date.now() - providerCache.timestamp < CACHE_TTL) {
    return providerCache.providers;
  }

  const providers: DetectedProvider[] = [];

  // Synchronous detectors
  for (const detect of [detectAnthropic, detectGemini, detectOllama]) {
    try {
      const result = detect();
      if (result) providers.push(result);
    } catch {
      // Skip failed detections
    }
  }

  // OpenAI: synchronous detection + async model fetch
  try {
    const openai = detectOpenAI();
    if (openai) {
      if (openai.apiKey) {
        const dynamicModels = await fetchOpenAIModels(
          openai.apiKey,
          openai.baseUrl
        );
        if (dynamicModels && dynamicModels.length > 0) {
          openai.models = dynamicModels;
        } else {
          // API call failed or returned empty; keep the fallback list
          openai.models = OPENAI_FALLBACK_MODELS;
        }
      }
      providers.push(openai);
    }
  } catch {
    // Skip
  }

  providerCache = { providers, timestamp: Date.now() };
  return providers;
}

/**
 * Resolve credentials for a specific provider via auto-detection.
 * Priority: CLI config > env vars > CLI binary presence
 *
 * NOTE: Manual settings are checked by the caller (settings.ts).
 * This function handles auto-detection fallback only.
 */
export function resolveAutoCredentials(
  providerId: string
): { apiKey?: string; baseUrl?: string } {
  switch (providerId) {
    case "anthropic": {
      const p = detectAnthropic();
      return { apiKey: p?.apiKey, baseUrl: p?.baseUrl };
    }
    case "openai": {
      const p = detectOpenAI();
      return { apiKey: p?.apiKey, baseUrl: p?.baseUrl };
    }
    case "gemini": {
      const p = detectGemini();
      return { apiKey: p?.apiKey, baseUrl: p?.baseUrl };
    }
    case "ollama": {
      return { apiKey: "ollama", baseUrl: "http://localhost:11434/v1" };
    }
    default:
      return {};
  }
}

/**
 * Mask an API key for safe display.
 */
export function maskApiKey(key: string | undefined): string {
  if (!key) return "";
  if (key.length <= 8) return "***";
  return `...${key.slice(-8)}`;
}
