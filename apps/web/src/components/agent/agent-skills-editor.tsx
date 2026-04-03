import { useState, useEffect, useCallback } from "react";
import type { ToolDefinition, ToolParameter, AgentRole } from "@slock/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import * as api from "@/lib/api";
import { Wrench, Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";

interface AgentSkillsEditorProps {
  agentId: string;
  role: AgentRole;
  currentTools: ToolDefinition[];
  onSave: (tools: ToolDefinition[]) => Promise<void>;
}

export function AgentSkillsEditor({
  agentId,
  role,
  currentTools,
  onSave,
}: AgentSkillsEditorProps) {
  const [presets, setPresets] = useState<ToolDefinition[]>([]);
  const [tools, setTools] = useState<ToolDefinition[]>(currentTools);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [expandedTool, setExpandedTool] = useState<string | null>(null);

  const fetchPresets = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getSkillPresets(role);
      setPresets(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    fetchPresets();
  }, [fetchPresets]);

  const isToolEnabled = (name: string) => tools.some((t) => t.name === name);

  const togglePreset = (preset: ToolDefinition) => {
    if (isToolEnabled(preset.name)) {
      setTools(tools.filter((t) => t.name !== preset.name));
    } else {
      setTools([...tools, preset]);
    }
  };

  const removeCustomTool = (name: string) => {
    setTools(tools.filter((t) => t.name !== name));
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await onSave(tools);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const customTools = tools.filter((t) => !t.isBuiltIn);

  const hasChanges =
    JSON.stringify(tools) !== JSON.stringify(currentTools);

  return (
    <div className="space-y-4">
      {/* Preset Skills */}
      <div>
        <h4 className="text-sm font-medium text-foreground mb-2">
          Preset Skills for {role.replace("_", " ")}
        </h4>
        {loading ? (
          <p className="text-xs text-muted-foreground">Loading presets...</p>
        ) : presets.length === 0 ? (
          <p className="text-xs text-muted-foreground">No presets available for this role.</p>
        ) : (
          <div className="space-y-2">
            {presets.map((preset) => {
              const enabled = isToolEnabled(preset.name);
              return (
                <div
                  key={preset.name}
                  className="rounded-lg border p-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Wrench className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {preset.name}
                        </p>
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {preset.description}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => togglePreset(preset)}
                      className={cn(
                        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors",
                        enabled ? "bg-primary" : "bg-muted"
                      )}
                    >
                      <span
                        className={cn(
                          "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition-transform mt-0.5",
                          enabled ? "translate-x-4 ml-0.5" : "translate-x-0.5"
                        )}
                      />
                    </button>
                  </div>
                  {enabled && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedTool(
                          expandedTool === preset.name ? null : preset.name
                        )
                      }
                      className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {expandedTool === preset.name ? (
                        <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronRight className="h-3 w-3" />
                      )}
                      Parameters
                    </button>
                  )}
                  {enabled && expandedTool === preset.name && (
                    <div className="mt-2 pl-5 space-y-1">
                      {Object.entries(preset.parameters).map(([name, param]) => (
                        <div key={name} className="text-xs">
                          <span className="font-mono text-foreground">{name}</span>
                          <span className="text-muted-foreground">
                            {" "}
                            ({param.type}
                            {param.required ? ", required" : ""})
                          </span>
                          <span className="text-muted-foreground"> - {param.description}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Custom Skills */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium text-foreground">Custom Skills</h4>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowCustomForm(!showCustomForm)}
            className="h-7 text-xs"
          >
            <Plus className="h-3 w-3 mr-1" />
            Add Custom
          </Button>
        </div>

        {customTools.length > 0 && (
          <div className="space-y-2 mb-3">
            {customTools.map((tool) => (
              <div
                key={tool.name}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{tool.name}</p>
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {tool.description}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeCustomTool(tool.name)}
                  className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {showCustomForm && (
          <CustomSkillForm
            onAdd={(tool) => {
              setTools([...tools, tool]);
              setShowCustomForm(false);
            }}
            onCancel={() => setShowCustomForm(false)}
          />
        )}
      </div>

      {/* Save */}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={handleSave}
          disabled={!hasChanges || saving}
          size="sm"
        >
          {saving ? "Saving..." : "Save Skills"}
        </Button>
      </div>
    </div>
  );
}

function CustomSkillForm({
  onAdd,
  onCancel,
}: {
  onAdd: (tool: ToolDefinition) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [params, setParams] = useState<
    Array<{ name: string; type: ToolParameter["type"]; description: string; required: boolean }>
  >([]);

  const addParam = () => {
    setParams([...params, { name: "", type: "string", description: "", required: false }]);
  };

  const removeParam = (index: number) => {
    setParams(params.filter((_, i) => i !== index));
  };

  const updateParam = (
    index: number,
    field: string,
    value: string | boolean
  ) => {
    const updated = [...params];
    (updated[index] as Record<string, unknown>)[field] = value;
    setParams(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !description.trim()) return;

    const parameters: Record<string, ToolParameter> = {};
    for (const p of params) {
      if (p.name.trim()) {
        parameters[p.name.trim()] = {
          type: p.type,
          description: p.description,
          required: p.required,
        };
      }
    }

    onAdd({
      name: name.trim().toLowerCase().replace(/\s+/g, "_"),
      description: description.trim(),
      parameters,
      executorKey: "llm_freeform",
      isBuiltIn: false,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border p-3 space-y-3">
      <div>
        <label className="text-xs font-medium text-muted-foreground">Skill Name</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. summarize_text"
          className="mt-1 h-8 text-sm"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-muted-foreground">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does this skill do?"
          className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          rows={2}
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-muted-foreground">Parameters</label>
          <button
            type="button"
            onClick={addParam}
            className="text-xs text-primary hover:underline"
          >
            + Add Parameter
          </button>
        </div>
        {params.map((p, i) => (
          <div key={i} className="flex items-start gap-2 mb-2">
            <Input
              value={p.name}
              onChange={(e) => updateParam(i, "name", e.target.value)}
              placeholder="name"
              className="h-7 text-xs flex-1"
            />
            <select
              value={p.type}
              onChange={(e) =>
                updateParam(i, "type", e.target.value)
              }
              className="h-7 rounded-md border bg-background px-2 text-xs"
            >
              <option value="string">string</option>
              <option value="number">number</option>
              <option value="boolean">boolean</option>
            </select>
            <Input
              value={p.description}
              onChange={(e) => updateParam(i, "description", e.target.value)}
              placeholder="description"
              className="h-7 text-xs flex-1"
            />
            <label className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
              <input
                type="checkbox"
                checked={p.required}
                onChange={(e) => updateParam(i, "required", e.target.checked)}
              />
              req
            </label>
            <button
              type="button"
              onClick={() => removeParam(i)}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={!name.trim() || !description.trim()}
        >
          Add Skill
        </Button>
      </div>
    </form>
  );
}
