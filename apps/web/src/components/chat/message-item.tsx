import { useState } from "react";
import { MessageSquare, GitBranch } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn, formatTimestamp } from "@/lib/utils";
import { useMessageStore } from "@/stores/message-store";
import type { Message } from "@slock/shared";
import { AgentMessageContent } from "@/components/agent/agent-message-content";

interface MessageItemProps {
  message: Message;
  isStreaming?: boolean;
  streamContent?: string;
  onStartThread?: (messageId: string) => void;
}

export function MessageItem({ message, isStreaming, streamContent, onStartThread }: MessageItemProps) {
  const [hovering, setHovering] = useState(false);
  const setActiveThread = useMessageStore((s) => s.setActiveThread);

  const isAgent = message.type === "agent";
  const isSystem = message.type === "system";
  const senderName = isAgent
    ? message.agent?.name || "AI Agent"
    : message.user?.username || "Unknown";

  const displayContent = isStreaming && streamContent ? streamContent : message.content;
  const replyCount = message.replies?.length || 0;

  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group relative flex gap-3 px-4 py-1.5 hover:bg-accent/30 transition-colors",
        isStreaming && "bg-accent/20"
      )}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <Avatar
        name={senderName}
        src={isAgent ? message.agent?.avatar : message.user?.avatar}
        isAgent={isAgent}
        size="md"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className={cn(
              "text-sm font-semibold",
              isAgent ? "text-purple-400" : "text-foreground"
            )}
          >
            {senderName}
          </span>
          {isAgent && (
            <span className="rounded bg-purple-500/20 px-1 py-0.5 text-[10px] font-medium text-purple-400">
              AI
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {formatTimestamp(message.createdAt)}
          </span>
        </div>
        <div className="mt-0.5">
          {isAgent ? (
            <AgentMessageContent
              content={displayContent}
              uiComponent={message.uiComponent}
              isStreaming={isStreaming}
            />
          ) : (
            <p className="text-sm text-foreground whitespace-pre-wrap break-words">
              {renderMessageContent(displayContent)}
            </p>
          )}
        </div>

        {/* Thread indicator */}
        {replyCount > 0 && !message.parentId && (
          <button
            onClick={() => setActiveThread(message.id)}
            className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <MessageSquare className="h-3 w-3" />
            <span>
              {replyCount} {replyCount === 1 ? "reply" : "replies"}
            </span>
          </button>
        )}

        {isStreaming && (
          <span className="streaming-cursor text-sm" />
        )}
      </div>

      {/* Hover actions */}
      {hovering && !isStreaming && !message.parentId && (
        <div className="absolute -top-3 right-4 flex items-center gap-0.5 rounded-md border bg-card shadow-sm p-0.5">
          <button
            onClick={() => setActiveThread(message.id)}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            title="Reply in thread"
          >
            <MessageSquare className="h-3.5 w-3.5" />
          </button>
          {onStartThread && (
            <button
              onClick={() => onStartThread(message.id)}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              title="Start sub-conversation"
            >
              <GitBranch className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function renderMessageContent(content: string): React.ReactNode {
  // Render @mentions with highlighting
  const parts = content.split(/(@\w+)/g);
  return parts.map((part, i) => {
    if (part.startsWith("@")) {
      return (
        <span
          key={i}
          className="rounded bg-primary/20 px-1 py-0.5 text-primary font-medium"
        >
          {part}
        </span>
      );
    }
    return part;
  });
}
