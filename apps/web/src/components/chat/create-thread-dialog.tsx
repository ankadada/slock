import { useState } from "react";
import { Dialog, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useThreadStore } from "@/stores/thread-store";
import { useChannelStore } from "@/stores/channel-store";
import { cn } from "@/lib/utils";

interface CreateThreadDialogProps {
  open: boolean;
  onClose: () => void;
  sourceMessageId?: string;
}

export function CreateThreadDialog({
  open,
  onClose,
  sourceMessageId,
}: CreateThreadDialogProps) {
  const [name, setName] = useState("");
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const createThread = useThreadStore((s) => s.createThread);
  const setActiveThread = useThreadStore((s) => s.setActiveThread);
  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const activeChannel = useChannelStore((s) => {
    const id = s.activeChannelId;
    return s.channels.find((c) => c.id === id);
  });

  const channelAgents = activeChannel?.agents || [];

  const toggleAgent = (agentId: string) => {
    setSelectedAgentIds((prev) =>
      prev.includes(agentId)
        ? prev.filter((id) => id !== agentId)
        : [...prev, agentId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !activeChannelId) return;

    setIsSubmitting(true);
    setError("");
    try {
      const thread = await createThread(
        activeChannelId,
        name.trim(),
        sourceMessageId,
        selectedAgentIds.length > 0 ? selectedAgentIds : undefined
      );
      setActiveThread(thread.id);
      setName("");
      setSelectedAgentIds([]);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create thread");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Start a thread</DialogTitle>
      <DialogDescription>
        Threads keep conversations organized without cluttering the main channel.
      </DialogDescription>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm font-medium text-foreground">
            Thread name
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. discuss-feature-x"
            className="mt-1"
            autoFocus
          />
        </div>

        {channelAgents.length > 0 && (
          <div>
            <label className="text-sm font-medium text-foreground">
              Include AI Agents (optional)
            </label>
            <div className="mt-2 space-y-1">
              {channelAgents.map((agent) => (
                <label
                  key={agent.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                    selectedAgentIds.includes(agent.id)
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-input text-muted-foreground hover:bg-accent"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selectedAgentIds.includes(agent.id)}
                    onChange={() => toggleAgent(agent.id)}
                    className="sr-only"
                  />
                  <span className="flex h-5 w-5 items-center justify-center rounded bg-purple-500/20 text-[10px] font-medium text-purple-400">
                    AI
                  </span>
                  <span className="font-medium">{agent.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim() || isSubmitting}>
            {isSubmitting ? "Creating..." : "Start Thread"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
