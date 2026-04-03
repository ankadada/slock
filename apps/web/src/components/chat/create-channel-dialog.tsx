import { useState } from "react";
import { Dialog, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChannelStore } from "@/stores/channel-store";
import { cn } from "@/lib/utils";

interface CreateChannelDialogProps {
  open: boolean;
  onClose: () => void;
}

export function CreateChannelDialog({ open, onClose }: CreateChannelDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"public" | "private">("public");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const createChannel = useChannelStore((s) => s.createChannel);
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    setError("");
    try {
      const channel = await createChannel(name.trim(), description.trim() || undefined, type);
      setActiveChannel(channel.id);
      setName("");
      setDescription("");
      setType("public");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create channel");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Create a channel</DialogTitle>
      <DialogDescription>
        Channels are where your team communicates. They are best organized around
        a topic.
      </DialogDescription>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-sm font-medium text-foreground">Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. product-design"
            className="mt-1"
            autoFocus
          />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground">
            Description (optional)
          </label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this channel about?"
            className="mt-1"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-foreground">Visibility</label>
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={() => setType("public")}
              className={cn(
                "flex-1 rounded-md border px-3 py-2 text-sm transition-colors",
                type === "public"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input text-muted-foreground hover:bg-accent"
              )}
            >
              Public
            </button>
            <button
              type="button"
              onClick={() => setType("private")}
              className={cn(
                "flex-1 rounded-md border px-3 py-2 text-sm transition-colors",
                type === "private"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-input text-muted-foreground hover:bg-accent"
              )}
            >
              Private
            </button>
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim() || isSubmitting}>
            {isSubmitting ? "Creating..." : "Create Channel"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
