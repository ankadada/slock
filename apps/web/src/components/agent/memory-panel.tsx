import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2, RefreshCw, Brain, Clock, Calendar, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import * as api from "@/lib/api";
import type { MemoryLayer, AgentMemoryEntry } from "@slock/shared";

interface MemoryPanelProps {
  open: boolean;
  onClose: () => void;
  agentId: string;
  agentName: string;
  channelId: string;
}

const LAYER_TABS: { key: MemoryLayer; label: string; icon: typeof Brain }[] = [
  { key: "session", label: "Session", icon: Clock },
  { key: "daily", label: "Daily", icon: Calendar },
  { key: "long_term", label: "Long-term", icon: Brain },
  { key: "shared", label: "Shared", icon: Users },
];

export function MemoryPanel({
  open,
  onClose,
  agentId,
  agentName,
  channelId,
}: MemoryPanelProps) {
  const [activeTab, setActiveTab] = useState<MemoryLayer>("long_term");
  const [memories, setMemories] = useState<AgentMemoryEntry[]>([]);
  const [sharedMemories, setSharedMemories] = useState<AgentMemoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMemories = useCallback(async () => {
    if (!agentId || !channelId) return;
    setLoading(true);
    setError(null);
    try {
      const [agentMems, shared] = await Promise.all([
        api.getAgentMemories(agentId, channelId),
        api.getSharedMemories(channelId),
      ]);
      setMemories(agentMems);
      setSharedMemories(shared);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch memories");
    } finally {
      setLoading(false);
    }
  }, [agentId, channelId]);

  useEffect(() => {
    if (open) {
      fetchMemories();
    }
  }, [open, fetchMemories]);

  const handleDelete = async (id: string) => {
    try {
      await api.deleteMemory(id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
      setSharedMemories((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete memory");
    }
  };

  const handleGenerateSummary = async () => {
    setSummarizing(true);
    setError(null);
    try {
      await api.generateDailySummary(agentId, channelId);
      await fetchMemories();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate summary");
    } finally {
      setSummarizing(false);
    }
  };

  const currentMemories =
    activeTab === "shared"
      ? sharedMemories
      : memories.filter((m) => m.layer === activeTab);

  const importanceColor = (importance: number): string => {
    if (importance >= 8) return "text-red-400";
    if (importance >= 5) return "text-yellow-400";
    if (importance >= 3) return "text-blue-400";
    return "text-muted-foreground";
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{agentName} — Memories</DialogTitle>

      {/* Tab bar */}
      <div className="flex gap-1 mb-4 border-b border-border">
        {LAYER_TABS.map((tab) => {
          const Icon = tab.icon;
          const count =
            tab.key === "shared"
              ? sharedMemories.length
              : memories.filter((m) => m.layer === tab.key).length;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors",
                activeTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
              {count > 0 && (
                <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Actions bar */}
      <div className="flex items-center gap-2 mb-3">
        <Button
          variant="outline"
          size="sm"
          onClick={fetchMemories}
          disabled={loading}
        >
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", loading && "animate-spin")} />
          Refresh
        </Button>
        {activeTab === "daily" && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerateSummary}
            disabled={summarizing}
          >
            <Calendar className={cn("h-3.5 w-3.5 mr-1.5", summarizing && "animate-spin")} />
            {summarizing ? "Generating..." : "Generate Summary"}
          </Button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-3 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Memory list */}
      <ScrollArea className="max-h-[400px]">
        {loading && currentMemories.length === 0 ? (
          <div className="text-center text-muted-foreground py-8 text-sm">
            Loading memories...
          </div>
        ) : currentMemories.length === 0 ? (
          <div className="text-center text-muted-foreground py-8 text-sm">
            No {activeTab.replace("_", "-")} memories yet.
          </div>
        ) : (
          <div className="space-y-2">
            {currentMemories.map((memory) => (
              <div
                key={memory.id}
                className="group rounded-md border border-border bg-muted/30 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs font-medium text-foreground truncate">
                        {memory.key}
                      </span>
                      <span
                        className={cn(
                          "text-xs font-mono",
                          importanceColor(memory.importance)
                        )}
                      >
                        [{memory.importance}]
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                      {memory.content}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground/70">
                      <span>
                        Updated{" "}
                        {new Date(memory.updatedAt).toLocaleDateString()}
                      </span>
                      {memory.expiresAt && (
                        <span>
                          Expires{" "}
                          {new Date(memory.expiresAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(memory.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                    title="Delete memory"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </Dialog>
  );
}
