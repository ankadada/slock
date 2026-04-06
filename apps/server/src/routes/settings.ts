import { Router, Request, Response } from "express";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  detectProviders,
  resolveAutoCredentials,
  maskApiKey,
  type DetectedProvider,
} from "../services/provider-detector.js";

export const settingsRouter = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SETTINGS_FILE = path.join(__dirname, "../../settings.json");

interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
}

interface AppSettings {
  providers: {
    anthropic?: ProviderConfig;
    openai?: ProviderConfig;
    gemini?: ProviderConfig;
    "openai-compatible"?: ProviderConfig;
  };
}

function loadSettings(): AppSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
      // Handle migration from old format
      if (raw.anthropicApiKey || raw.anthropicBaseUrl) {
        return {
          providers: {
            anthropic: {
              apiKey: raw.anthropicApiKey,
              baseUrl: raw.anthropicBaseUrl,
            },
            openai: raw.openaiApiKey ? { apiKey: raw.openaiApiKey } : undefined,
          },
        };
      }
      return raw;
    }
  } catch {
    // ignore
  }
  return { providers: {} };
}

function saveSettings(settings: AppSettings): void {
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

function maskKey(key: string | undefined): string {
  return maskApiKey(key);
}

// Resolve the effective credentials for a provider:
// manual settings > auto-detected (CLI config / env)
function resolveEffective(
  providerId: string,
  manual: ProviderConfig | undefined
): { apiKey?: string; baseUrl?: string; source: string } {
  // Manual settings take priority
  if (manual?.apiKey) {
    return { apiKey: manual.apiKey, baseUrl: manual.baseUrl, source: "manual" };
  }

  // Fall back to auto-detection
  const auto = resolveAutoCredentials(providerId);
  return {
    apiKey: manual?.apiKey || auto.apiKey,
    baseUrl: manual?.baseUrl || auto.baseUrl,
    source: auto.apiKey ? "auto" : "none",
  };
}

// Get current settings (masks API keys)
settingsRouter.get("/", (_req: Request, res: Response) => {
  const settings = loadSettings();
  const p = settings.providers;

  const makeEntry = (id: string) => {
    const manual = p[id as keyof typeof p];
    const effective = resolveEffective(id, manual);
    return {
      apiKey: maskKey(effective.apiKey),
      hasKey: !!effective.apiKey,
      baseUrl: effective.baseUrl || "",
      source: effective.source, // "manual" | "auto" | "none"
    };
  };

  res.json({
    data: {
      providers: {
        anthropic: makeEntry("anthropic"),
        openai: makeEntry("openai"),
        gemini: makeEntry("gemini"),
        "openai-compatible": makeEntry("openai-compatible"),
      },
    },
  });
});

// GET /api/settings/providers — auto-detected providers with masked keys
settingsRouter.get("/providers", async (_req: Request, res: Response) => {
  try {
    const settings = loadSettings();
    const detected = await detectProviders();

    // Merge with manual settings: mark manual ones
    const result = detected.map((dp) => {
      const manual =
        settings.providers[dp.id as keyof typeof settings.providers];
      const isManual = !!(manual?.apiKey);
      const effectiveKey = isManual ? manual.apiKey : dp.apiKey;
      return {
        id: dp.id,
        name: dp.name,
        source: isManual ? "manual" as const : dp.source,
        maskedKey: maskKey(effectiveKey),
        hasKey: !!effectiveKey,
        baseUrl: (isManual ? manual.baseUrl : dp.baseUrl) || "",
        models: dp.models,
        cliPath: dp.cliPath,
      };
    });

    // Also include openai-compatible if manually configured
    const oaiCompat = settings.providers["openai-compatible"];
    if (oaiCompat?.apiKey || oaiCompat?.baseUrl) {
      const exists = result.find((r) => r.id === "openai-compatible");
      if (!exists) {
        result.push({
          id: "openai-compatible",
          name: "OpenAI Compatible",
          source: "manual",
          maskedKey: maskKey(oaiCompat.apiKey),
          hasKey: !!oaiCompat.apiKey,
          baseUrl: oaiCompat.baseUrl || "",
          models: [],
          cliPath: undefined,
        });
      }
    }

    res.json({ data: result });
  } catch (err) {
    console.error("Provider detection error:", err);
    res.status(500).json({ error: "Failed to detect providers" });
  }
});

// Update provider settings
const updateSchema = z.object({
  provider: z.enum(["anthropic", "openai", "gemini", "openai-compatible"]),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
});

settingsRouter.put("/", (req: Request, res: Response) => {
  try {
    const body = updateSchema.parse(req.body);
    const settings = loadSettings();

    if (!settings.providers[body.provider]) {
      settings.providers[body.provider] = {};
    }

    const config = settings.providers[body.provider]!;
    if (body.apiKey !== undefined) config.apiKey = body.apiKey || undefined;
    if (body.baseUrl !== undefined) config.baseUrl = body.baseUrl || undefined;

    saveSettings(settings);

    res.json({
      message: "Settings updated",
      data: { provider: body.provider, hasKey: !!config.apiKey, hasBaseUrl: !!config.baseUrl },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    res.status(500).json({ error: "Failed to update settings" });
  }
});

// Utilities for agent service
export function getProviderConfig(provider: string): ProviderConfig {
  const settings = loadSettings();

  // Gemini uses the same proxy credentials as openai (OpenAI-compatible endpoint)
  // Both go through the LiteLLM proxy at /v1/chat/completions
  // Gemini and "other" models use the same proxy credentials as openai
  const lookupProvider = (provider === "gemini" || provider === "other") ? "openai" : provider;
  const manual = settings.providers[lookupProvider as keyof typeof settings.providers] || {};

  // Manual settings first
  if (manual.apiKey) {
    return {
      apiKey: manual.apiKey,
      baseUrl: manual.baseUrl,
    };
  }

  // Fall back to auto-detected credentials
  const auto = resolveAutoCredentials(lookupProvider);
  return {
    apiKey: manual.apiKey || auto.apiKey,
    baseUrl: manual.baseUrl || auto.baseUrl,
  };
}

// Keep backward compat exports
export function getAnthropicApiKey(): string | undefined {
  return getProviderConfig("anthropic").apiKey;
}

export function getAnthropicBaseUrl(): string | undefined {
  return getProviderConfig("anthropic").baseUrl;
}
