import { Hash, Lock, Users, Bot, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { useChannelStore } from "@/stores/channel-store";

interface ChannelHeaderProps {
  onToggleMembers: () => void;
  showMembers: boolean;
}

export function ChannelHeader({ onToggleMembers, showMembers }: ChannelHeaderProps) {
  const activeChannel = useChannelStore((s) => {
    const id = s.activeChannelId;
    return s.channels.find((c) => c.id === id);
  });

  if (!activeChannel) {
    return (
      <div className="flex h-14 items-center border-b px-4">
        <span className="text-muted-foreground">Select a channel</span>
      </div>
    );
  }

  const Icon = activeChannel.type === "private" ? Lock : Hash;
  const agentCount = activeChannel.agents?.length ?? 0;

  return (
    <div className="flex h-14 items-center justify-between border-b px-4">
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
        <h2 className="font-semibold text-foreground truncate">
          {activeChannel.name}
        </h2>
        {activeChannel.description && (
          <>
            <span className="text-muted-foreground mx-1">|</span>
            <span className="text-sm text-muted-foreground truncate">
              {activeChannel.description}
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-1">
        {agentCount > 0 && (
          <Tooltip content={`${agentCount} AI agent${agentCount > 1 ? "s" : ""}`} side="bottom">
            <div className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground">
              <Bot className="h-3.5 w-3.5" />
              <span>{agentCount}</span>
            </div>
          </Tooltip>
        )}
        <Tooltip content="Members" side="bottom">
          <Button
            variant={showMembers ? "secondary" : "ghost"}
            size="icon"
            onClick={onToggleMembers}
            className="h-8 w-8"
          >
            <Users className="h-4 w-4" />
          </Button>
        </Tooltip>
      </div>
    </div>
  );
}
