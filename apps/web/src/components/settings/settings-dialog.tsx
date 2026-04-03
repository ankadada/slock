import { useState, useEffect } from "react";
import { Dialog, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, Key, AlertCircle, Globe, Zap } from "lucide-react";
import { PROVIDER_LABELS } from "@slock/shared";
import type { ModelProvider } from "@slock/shared";
import { cn } from "@/lib/utils";
import * as api from "@/lib/api";
import { InviteSection } from "@/components/settings/invite-section";

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

interface ProviderState {
  apiKey: string;
  baseUrl: string;
  hasKey: boolean;
  maskedKey: string;
  source: string; // "manual" | "auto" | "none"
}

const PROVIDER_IDS: ModelProvider[] = ["anthropic", "openai", "openai-compatible"];

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manually configured",
  auto: "Auto-detected from CLI/env",
  env: "Auto-detected from environment",
  "cli-config": "Auto-detected from CLI config",
  "cli-binary": "CLI installed (no key found)",
  none: "",
};

export function SettingsDialog({ open, onClose }: SettingsDialogProps) {
  const [activeProvider, setActiveProvider] = useState<ModelProvider>("anthropic");
  const [providers, setProviders] = useState<Record<string, ProviderState>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      api.getSettings().then((settings: any) => {
        const p = settings.providers || {};
        const state: Record<string, ProviderState> = {};
        for (const id of PROVIDER_IDS) {
          const provider = p[id] || {};
          state[id] = {
            apiKey: "",
            baseUrl: provider.baseUrl || "",
            hasKey: provider.hasKey || false,
            maskedKey: provider.apiKey || "",
            source: provider.source || "none",
          };
        }
        setProviders(state);
        setSaved(false);
        setError("");
      }).catch(() => setError("Failed to load settings"));
    }
  }, [open]);

  const current = providers[activeProvider];
  if (!current) return null;

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const payload: Record<string, string> = { provider: activeProvider };
      if (current.apiKey) payload.apiKey = current.apiKey;
      payload.baseUrl = current.baseUrl;

      if (!current.apiKey && current.baseUrl === (providers[activeProvider]?.baseUrl || "")) {
        setSaving(false);
        return;
      }

      await api.updateSettings(payload as any);
      setSaved(true);

      // Reload
      const settings: any = await api.getSettings();
      const p = settings.providers?.[activeProvider] || {};
      setProviders((prev) => ({
        ...prev,
        [activeProvider]: {
          ...prev[activeProvider],
          apiKey: "",
          hasKey: p.hasKey || false,
          maskedKey: p.apiKey || "",
          baseUrl: p.baseUrl || "",
          source: p.source || "none",
        },
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: "apiKey" | "baseUrl", value: string) => {
    setSaved(false);
    setProviders((prev) => ({
      ...prev,
      [activeProvider]: { ...prev[activeProvider], [field]: value },
    }));
  };

  const isAutoDetected = current.source === "auto" || current.source === "env" || current.source === "cli-config";

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Settings</DialogTitle>
      <DialogDescription>
        Configure API keys for each AI provider. Auto-detected credentials are used by default.
      </DialogDescription>

      {/* Provider tabs */}
      <div className="flex gap-1 mt-2 mb-4 border-b">
        {PROVIDER_IDS.map((id) => (
          <button
            key={id}
            onClick={() => { setActiveProvider(id); setSaved(false); setError(""); }}
            className={cn(
              "px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeProvider === id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {PROVIDER_LABELS[id]}
            {providers[id]?.hasKey && (
              <Check className="h-3 w-3 inline ml-1 text-green-500" />
            )}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {/* Auto-detection badge */}
        {isAutoDetected && current.hasKey && (
          <div className="flex items-center gap-2 rounded-md bg-green-500/10 border border-green-500/20 px-3 py-2">
            <Zap className="h-4 w-4 text-green-500 flex-shrink-0" />
            <span className="text-sm text-green-600 dark:text-green-400">
              {SOURCE_LABELS[current.source] || "Auto-detected"}
            </span>
          </div>
        )}

        {/* Base URL */}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <label className="text-sm font-medium text-foreground">Base URL</label>
          </div>
          <Input
            value={current.baseUrl}
            onChange={(e) => updateField("baseUrl", e.target.value)}
            placeholder={
              activeProvider === "anthropic"
                ? "https://api.anthropic.com"
                : activeProvider === "openai"
                  ? "https://api.openai.com/v1"
                  : "https://your-api-endpoint.com/v1"
            }
          />
          <p className="text-xs text-muted-foreground mt-1">
            {activeProvider === "openai-compatible"
              ? "Your OpenAI-compatible API endpoint (required)"
              : "Leave empty for default. Use for proxies or custom endpoints."}
          </p>
        </div>

        {/* API Key */}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Key className="h-4 w-4 text-muted-foreground" />
            <label className="text-sm font-medium text-foreground">API Key</label>
            {current.hasKey && (
              <span className="flex items-center gap-1 text-xs text-green-500">
                <Check className="h-3 w-3" />
                {current.source === "manual" ? "Configured" : "Auto-detected"}
              </span>
            )}
          </div>
          {current.maskedKey && !current.apiKey && (
            <p className="text-xs text-muted-foreground mb-1">Current: {current.maskedKey}</p>
          )}
          <Input
            type="password"
            value={current.apiKey}
            onChange={(e) => updateField("apiKey", e.target.value)}
            placeholder={
              current.hasKey
                ? isAutoDetected
                  ? "Enter key to override auto-detected..."
                  : "Enter new key to update..."
                : "Enter API key..."
            }
          />
          {isAutoDetected && (
            <p className="text-xs text-muted-foreground mt-1">
              A key was auto-detected. You can override it by entering a new one above.
            </p>
          )}
        </div>

        {/* Messages */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" /> {error}
          </div>
        )}
        {saved && (
          <div className="flex items-center gap-2 text-sm text-green-500">
            <Check className="h-4 w-4" /> Settings saved!
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button onClick={handleSave} disabled={saving || (!current.apiKey && !current.baseUrl)}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* Invite Links */}
      <div className="border-t mt-6 pt-4">
        <InviteSection />
      </div>
    </Dialog>
  );
}
