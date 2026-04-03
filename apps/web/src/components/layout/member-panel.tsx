import { X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChannelStore } from "@/stores/channel-store";
import { useAgentStore } from "@/stores/agent-store";
import { AGENT_ROLE_LABELS } from "@slock/shared";
import type { AgentRole } from "@slock/shared";

interface MemberPanelProps {
  onClose: () => void;
}

export function MemberPanel({ onClose }: MemberPanelProps) {
  const activeChannel = useChannelStore((s) => {
    const id = s.activeChannelId;
    return s.channels.find((c) => c.id === id);
  });
  const agents = useAgentStore((s) => s.agents);

  if (!activeChannel) return null;

  const members = activeChannel.members || [];
  const channelAgents = (activeChannel.agents || []).map((a) => {
    const full = agents.find((ag) => ag.id === a.id);
    return full || a;
  });

  return (
    <div className="flex h-full w-64 flex-col border-l bg-card">
      <div className="flex h-14 items-center justify-between border-b px-4">
        <h3 className="font-semibold text-foreground text-sm">Members</h3>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-7 w-7">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1 p-3">
        {/* Human members */}
        {members.length > 0 && (
          <div className="mb-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              People ({members.length})
            </h4>
            <div className="space-y-1">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5"
                >
                  <Avatar
                    name={member.user?.username || "Unknown"}
                    isOnline={member.user?.isOnline}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {member.user?.username || "Unknown"}
                    </p>
                    {member.role === "admin" && (
                      <p className="text-xs text-muted-foreground">Admin</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Agents */}
        {channelAgents.length > 0 && (
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              AI Agents ({channelAgents.length})
            </h4>
            <div className="space-y-1">
              {channelAgents.map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5"
                >
                  <Avatar
                    name={agent.name}
                    isAgent={true}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {agent.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {AGENT_ROLE_LABELS[(agent as { role: AgentRole }).role] || agent.role}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
