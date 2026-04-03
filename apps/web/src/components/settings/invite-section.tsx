import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, Trash2, Link, Plus, AlertCircle } from "lucide-react";
import * as api from "@/lib/api";
import type { Invite } from "@/lib/api";

export function InviteSection() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadInvites = async () => {
    try {
      const data = await api.getInvites();
      setInvites(data);
    } catch {
      setError("Failed to load invites");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInvites();
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    setError("");
    try {
      await api.createInvite();
      await loadInvites();
    } catch {
      setError("Failed to create invite");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError("");
    try {
      await api.deleteInvite(id);
      setInvites((prev) => prev.filter((inv) => inv.id !== id));
    } catch {
      setError("Failed to deactivate invite");
    }
  };

  const handleCopy = (invite: Invite) => {
    const url = `${window.location.origin}/invite/${invite.code}`;
    navigator.clipboard.writeText(url);
    setCopiedId(invite.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const activeInvites = invites.filter((inv) => inv.isActive);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-foreground">Invite Links</h3>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCreate}
          disabled={creating}
        >
          <Plus className="h-3.5 w-3.5 mr-1" />
          {creating ? "Creating..." : "Generate Link"}
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading invites...</p>
      ) : activeInvites.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No active invites. Generate one to invite people to the workspace.
        </p>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {activeInvites.map((invite) => {
            const url = `${window.location.origin}/invite/${invite.code}`;
            const isExpired = invite.expiresAt && new Date(invite.expiresAt) < new Date();
            const isMaxed = invite.maxUses > 0 && invite.uses >= invite.maxUses;

            return (
              <div
                key={invite.id}
                className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-xs truncate text-foreground">{url}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">
                      {invite.uses} use{invite.uses !== 1 ? "s" : ""}
                      {invite.maxUses > 0 ? ` / ${invite.maxUses} max` : ""}
                    </span>
                    {isExpired && (
                      <span className="text-xs text-destructive">Expired</span>
                    )}
                    {isMaxed && (
                      <span className="text-xs text-destructive">Max reached</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => handleCopy(invite)}
                    className="p-1.5 rounded-md hover:bg-muted transition-colors"
                    title="Copy link"
                  >
                    {copiedId === invite.id ? (
                      <Check className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </button>
                  <button
                    onClick={() => handleDelete(invite.id)}
                    className="p-1.5 rounded-md hover:bg-muted transition-colors"
                    title="Deactivate"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
