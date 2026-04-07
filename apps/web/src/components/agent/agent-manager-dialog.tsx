import { useState, useEffect } from "react";
import { Dialog, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAgentStore } from "@/stores/agent-store";
import { useChannelStore } from "@/stores/channel-store";
import { AGENT_ROLE_LABELS, MODEL_OPTIONS, MODEL_CATEGORY_LABELS, THINKING_LEVEL_LABELS } from "@slock/shared";
import type { AgentRole, ModelCategory, CreateAgentRequest, AgentDefinition, ThinkingLevel } from "@slock/shared";
import { Plus, Trash2, UserPlus, UserMinus, Bot, Wrench, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import * as api from "@/lib/api";
import { AgentSkillsEditor } from "./agent-skills-editor";

interface AgentManagerDialogProps {
  open: boolean;
  onClose: () => void;
}

type Tab = "list" | "create" | "edit" | "skills";

export function AgentManagerDialog({ open, onClose }: AgentManagerDialogProps) {
  const [tab, setTab] = useState<Tab>("list");
  const [selectedAgent, setSelectedAgent] = useState<AgentDefinition | null>(null);
  const agents = useAgentStore((s) => s.agents);
  const fetchAgents = useAgentStore((s) => s.fetchAgents);
  const deleteAgent = useAgentStore((s) => s.deleteAgent);
  const updateAgent = useAgentStore((s) => s.updateAgent);
  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const activeChannel = useChannelStore((s) => {
    const id = s.activeChannelId;
    return s.channels.find((c) => c.id === id);
  });
  const fetchChannels = useChannelStore((s) => s.fetchChannels);

  useEffect(() => {
    if (open) {
      fetchAgents();
    }
  }, [open, fetchAgents]);

  const channelAgentIds = new Set(
    (activeChannel?.agents || []).map((a) => a.id)
  );

  const handleAddToChannel = async (agentId: string) => {
    if (!activeChannelId) return;
    try {
      await api.addAgentToChannel(activeChannelId, agentId);
      await fetchChannels();
    } catch {
      // ignore
    }
  };

  const handleRemoveFromChannel = async (agentId: string) => {
    if (!activeChannelId) return;
    try {
      await api.removeAgentFromChannel(activeChannelId, agentId);
      await fetchChannels();
    } catch {
      // ignore
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteAgent(id);
    } catch {
      // ignore
    }
  };

  const handleOpenSkills = (agent: AgentDefinition) => {
    setSelectedAgent(agent);
    setTab("skills");
  };

  const handleEditAgent = (agent: AgentDefinition) => {
    setSelectedAgent(agent);
    setTab("edit");
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>AI Agents</DialogTitle>
      <DialogDescription>
        Manage AI agents and add them to channels. Agents respond when @mentioned.
      </DialogDescription>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab("list")}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm transition-colors",
            tab === "list"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent"
          )}
        >
          All Agents
        </button>
        <button
          onClick={() => setTab("create")}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm transition-colors",
            tab === "create"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent"
          )}
        >
          <Plus className="h-3.5 w-3.5 inline mr-1" />
          Create New
        </button>
        {selectedAgent && (
          <button
            onClick={() => setTab("skills")}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              tab === "skills"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent"
            )}
          >
            <Wrench className="h-3.5 w-3.5 inline mr-1" />
            Skills
          </button>
        )}
      </div>

      {tab === "list" ? (
        <ScrollArea className="max-h-80">
          {agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Bot className="h-8 w-8 mb-2" />
              <p className="text-sm">No agents yet. Create one to get started.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {agents.map((agent) => {
                const inChannel = channelAgentIds.has(agent.id);
                return (
                  <div
                    key={agent.id}
                    className="flex items-center gap-3 rounded-lg border p-3"
                  >
                    <Avatar name={agent.name} isAgent size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {agent.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {AGENT_ROLE_LABELS[agent.role as AgentRole] || agent.role}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditAgent(agent)}
                        className="h-7 w-7 text-muted-foreground hover:text-primary"
                        title="Edit Agent"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenSkills(agent)}
                        className="h-7 w-7 text-muted-foreground hover:text-primary"
                        title="Manage Skills"
                      >
                        <Wrench className="h-3.5 w-3.5" />
                      </Button>
                      {activeChannelId && (
                        <Button
                          variant={inChannel ? "secondary" : "outline"}
                          size="sm"
                          onClick={() =>
                            inChannel
                              ? handleRemoveFromChannel(agent.id)
                              : handleAddToChannel(agent.id)
                          }
                          className="h-7 text-xs"
                        >
                          {inChannel ? (
                            <>
                              <UserMinus className="h-3 w-3 mr-1" />
                              Remove
                            </>
                          ) : (
                            <>
                              <UserPlus className="h-3 w-3 mr-1" />
                              Add
                            </>
                          )}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(agent.id)}
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      ) : tab === "skills" && selectedAgent ? (
        <ScrollArea className="max-h-96">
          <div className="mb-3">
            <p className="text-sm text-muted-foreground">
              Configure skills for <strong>{selectedAgent.name}</strong> ({AGENT_ROLE_LABELS[selectedAgent.role as AgentRole] || selectedAgent.role})
            </p>
          </div>
          <AgentSkillsEditor
            agentId={selectedAgent.id}
            role={selectedAgent.role as AgentRole}
            currentTools={selectedAgent.tools || []}
            onSave={async (tools) => {
              await updateAgent(selectedAgent.id, { tools });
              const updatedAgents = await api.getAgents();
              const updated = updatedAgents.find((a) => a.id === selectedAgent.id);
              if (updated) setSelectedAgent(updated);
            }}
          />
        </ScrollArea>
      ) : tab === "edit" && selectedAgent ? (
        <ScrollArea className="max-h-[60vh]">
          <EditAgentForm
            agent={selectedAgent}
            onSaved={() => {
              setTab("list");
              setSelectedAgent(null);
              fetchAgents();
            }}
          />
        </ScrollArea>
      ) : (
        <ScrollArea className="max-h-[60vh]">
          <CreateAgentForm
            onCreated={() => {
              setTab("list");
              fetchAgents();
            }}
          />
        </ScrollArea>
      )}
    </Dialog>
  );
}

function CreateAgentForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<string>("custom");
  const [customRole, setCustomRole] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ModelCategory>("anthropic");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>("none");
  const [autoRespond, setAutoRespond] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const createAgent = useAgentStore((s) => s.createAgent);

  const roles = Object.entries(AGENT_ROLE_LABELS) as [AgentRole, string][];
  const categories = Object.entries(MODEL_CATEGORY_LABELS) as [ModelCategory, string][];

  const availableModels = MODEL_OPTIONS.filter((m) => m.provider === category);

  const handleCategoryChange = (c: ModelCategory) => {
    setCategory(c);
    const firstModel = MODEL_OPTIONS.find((m) => m.provider === c);
    setModel(firstModel?.id || "");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !description.trim() || !model) return;

    setIsSubmitting(true);
    setError("");
    try {
      const capabilities = ["chat"];
      if (autoRespond) capabilities.push("auto_respond");

      await createAgent({
        name: name.trim(),
        role: customRole.trim() || role,
        description: description.trim(),
        provider: category,
        model,
        thinkingLevel,
        capabilities,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium text-foreground">Name</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Aria"
          className="mt-1"
          autoFocus
        />
      </div>
      <div>
        <label className="text-sm font-medium text-foreground">Role</label>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {roles.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => { setRole(value); setCustomRole(""); }}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                role === value && !customRole
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input text-muted-foreground hover:bg-accent"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-2">
          <Input
            value={customRole}
            onChange={(e) => {
              setCustomRole(e.target.value);
              if (e.target.value) setRole("custom");
            }}
            placeholder="Or type a custom role: e.g. 3D Artist, Copywriter, DevOps..."
            className="text-sm"
          />
        </div>
      </div>

      {/* Model category selection */}
      <div>
        <label className="text-sm font-medium text-foreground">Model Category</label>
        <div className="mt-1 flex flex-wrap gap-2">
          {categories.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => handleCategoryChange(id)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs transition-colors",
                category === id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input text-muted-foreground hover:bg-accent"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Model selection */}
      <div>
        <label className="text-sm font-medium text-foreground">Model</label>
        <div className="mt-1 space-y-1.5">
          {availableModels.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setModel(m.id)}
              className={cn(
                "flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm text-left transition-colors",
                model === m.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input text-muted-foreground hover:bg-accent"
              )}
            >
              <span className="font-medium">{m.name}</span>
              {m.description && (
                <span className="text-xs opacity-60">{m.description}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Thinking level selector */}
      <div>
        <label className="text-sm font-medium text-foreground">Thinking Level</label>
        <p className="text-xs text-muted-foreground mt-0.5 mb-1.5">
          Controls reasoning depth. Higher = slower but more thorough.
        </p>
        <div className="flex rounded-md border border-input overflow-hidden">
          {(Object.entries(THINKING_LEVEL_LABELS) as [ThinkingLevel, string][]).map(
            ([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setThinkingLevel(value)}
                className={cn(
                  "flex-1 px-3 py-1.5 text-xs transition-colors border-r last:border-r-0",
                  thinkingLevel === value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent"
                )}
              >
                {label.split(" (")[0]}
              </button>
            )
          )}
        </div>
      </div>

      {/* Auto-respond toggle */}
      <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
        <div>
          <p className="text-sm font-medium text-foreground">Auto-respond</p>
          <p className="text-xs text-muted-foreground">Agent reads all messages and decides whether to respond</p>
        </div>
        <button
          type="button"
          onClick={() => setAutoRespond(!autoRespond)}
          className={cn(
            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors",
            autoRespond ? "bg-primary" : "bg-muted"
          )}
        >
          <span
            className={cn(
              "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform mt-0.5",
              autoRespond ? "translate-x-4" : "translate-x-0.5"
            )}
          />
        </button>
      </div>

      <div>
        <label className="text-sm font-medium text-foreground">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does this agent do?"
          className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          rows={3}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button
          type="submit"
          disabled={
            !name.trim() ||
            !description.trim() ||
            !model ||
            isSubmitting
          }
        >
          {isSubmitting ? "Creating..." : "Create Agent"}
        </Button>
      </div>
    </form>
  );
}

function EditAgentForm({ agent, onSaved }: { agent: AgentDefinition; onSaved: () => void }) {
  const [name, setName] = useState(agent.name);
  const [description, setDescription] = useState(agent.description);
  const [category, setCategory] = useState<ModelCategory>(
    (["anthropic", "openai", "gemini", "other"].includes(agent.provider) ? agent.provider : "anthropic") as ModelCategory
  );
  const [model, setModel] = useState(agent.model);
  const [thinkingLevel, setThinkingLevel] = useState<ThinkingLevel>(agent.thinkingLevel || "none");
  const [autoRespond, setAutoRespond] = useState(agent.capabilities?.includes("auto_respond") ?? true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const updateAgent = useAgentStore((s) => s.updateAgent);

  const categories = Object.entries(MODEL_CATEGORY_LABELS) as [ModelCategory, string][];
  const availableModels = MODEL_OPTIONS.filter((m) => m.provider === category);

  const handleCategoryChange = (c: ModelCategory) => {
    setCategory(c);
    const firstModel = MODEL_OPTIONS.find((m) => m.provider === c);
    setModel(firstModel?.id || model);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !description.trim()) return;

    setIsSaving(true);
    setError("");
    setSaved(false);
    try {
      const capabilities = agent.capabilities?.filter((c) => c !== "auto_respond" && c !== "chat") || [];
      capabilities.unshift("chat");
      if (autoRespond) capabilities.push("auto_respond");

      await updateAgent(agent.id, {
        name: name.trim(),
        description: description.trim(),
        provider: category,
        model,
        thinkingLevel,
        capabilities,
      });
      setSaved(true);
      setTimeout(onSaved, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update agent");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div>
        <label className="text-sm font-medium text-foreground">Name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
      </div>

      <div>
        <label className="text-sm font-medium text-foreground">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          rows={3}
        />
      </div>

      {/* Model category */}
      <div>
        <label className="text-sm font-medium text-foreground">Model Category</label>
        <div className="mt-1 flex flex-wrap gap-2">
          {categories.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => handleCategoryChange(id)}
              className={cn(
                "rounded-md border px-3 py-1.5 text-xs transition-colors",
                category === id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input text-muted-foreground hover:bg-accent"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Model */}
      <div>
        <label className="text-sm font-medium text-foreground">Model</label>
        <div className="mt-1 space-y-1.5">
          {availableModels.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setModel(m.id)}
              className={cn(
                "flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm text-left transition-colors",
                model === m.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input text-muted-foreground hover:bg-accent"
              )}
            >
              <span className="font-medium">{m.name}</span>
              {m.description && <span className="text-xs opacity-60">{m.description}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Thinking level */}
      <div>
        <label className="text-sm font-medium text-foreground">Thinking Level</label>
        <div className="flex rounded-md border border-input overflow-hidden mt-1">
          {(Object.entries(THINKING_LEVEL_LABELS) as [ThinkingLevel, string][]).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setThinkingLevel(value)}
              className={cn(
                "flex-1 px-3 py-1.5 text-xs transition-colors border-r last:border-r-0",
                thinkingLevel === value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent"
              )}
            >
              {label.split(" (")[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Auto-respond */}
      <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
        <div>
          <p className="text-sm font-medium text-foreground">Auto-respond</p>
          <p className="text-xs text-muted-foreground">Auto-read messages and decide to respond</p>
        </div>
        <button
          type="button"
          onClick={() => setAutoRespond(!autoRespond)}
          className={cn(
            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors",
            autoRespond ? "bg-primary" : "bg-muted"
          )}
        >
          <span className={cn(
            "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform mt-0.5",
            autoRespond ? "translate-x-4" : "translate-x-0.5"
          )} />
        </button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {saved && <p className="text-sm text-green-500">Saved!</p>}

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={!name.trim() || !description.trim() || isSaving}>
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </form>
  );
}
