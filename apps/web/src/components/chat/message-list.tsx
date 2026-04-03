import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageItem } from "@/components/chat/message-item";
import { TypingIndicator } from "@/components/chat/typing-indicator";
import { useMessageStore } from "@/stores/message-store";
import { useAgentStore } from "@/stores/agent-store";
import { useChannelStore } from "@/stores/channel-store";
import { Loader2 } from "lucide-react";

const EMPTY_MESSAGES: import("@slock/shared").Message[] = [];
const EMPTY_TYPING: string[] = [];

interface MessageListProps {
  onStartThread?: (messageId: string) => void;
}

export function MessageList({ onStartThread }: MessageListProps) {
  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const messagesByChannel = useMessageStore((s) => s.messagesByChannel);
  const messages = activeChannelId
    ? messagesByChannel[activeChannelId] || EMPTY_MESSAGES
    : EMPTY_MESSAGES;
  const streamingMessages = useMessageStore((s) => s.streamingMessages);
  const isLoading = useMessageStore((s) => s.isLoading);
  const typingAgentsMap = useAgentStore((s) => s.typingAgents);
  const typingAgents = activeChannelId
    ? typingAgentsMap[activeChannelId] || EMPTY_TYPING
    : EMPTY_TYPING;
  const agents = useAgentStore((s) => s.agents);

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, Object.keys(streamingMessages).length]);

  if (!activeChannelId) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background">
        <div className="text-center">
          <h3 className="text-lg font-medium mb-1 text-foreground">Welcome to Slock</h3>
          <p className="text-sm text-muted-foreground">Select a channel to start chatting</p>
        </div>
      </div>
    );
  }

  if (isLoading && messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const typingAgentNames = typingAgents
    .map((id) => agents.find((a) => a.id === id)?.name)
    .filter(Boolean) as string[];

  // Filter messages to only show top-level messages (no thread replies)
  const topLevelMessages = messages.filter((m) => !m.parentId);

  return (
    <ScrollArea ref={scrollRef} className="flex-1">
      <div className="py-4">
        {topLevelMessages.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">No messages yet. Be the first to say something!</p>
            </div>
          </div>
        )}
        {topLevelMessages.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            isStreaming={!!streamingMessages[message.id]}
            streamContent={streamingMessages[message.id]}
            onStartThread={onStartThread}
          />
        ))}
        {typingAgentNames.length > 0 && (
          <TypingIndicator names={typingAgentNames} />
        )}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
