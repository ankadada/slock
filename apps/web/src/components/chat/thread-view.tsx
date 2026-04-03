import { useEffect, useRef } from "react";
import { ArrowLeft, Hash, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageItem } from "@/components/chat/message-item";
import { MessageInput } from "@/components/chat/message-input";
import { TypingIndicator } from "@/components/chat/typing-indicator";
import { useMessageStore } from "@/stores/message-store";
import { useAgentStore } from "@/stores/agent-store";
import { useThreadStore } from "@/stores/thread-store";
import { useChannelStore } from "@/stores/channel-store";
import { useSocket } from "@/hooks/use-socket";
import { archiveThread } from "@/lib/api";
import { Loader2 } from "lucide-react";
import type { Message } from "@slock/shared";

const EMPTY_MESSAGES: Message[] = [];
const EMPTY_TYPING: string[] = [];

interface ThreadViewProps {
  threadId: string;
}

export function ThreadView({ threadId }: ThreadViewProps) {
  const clearActiveThread = useThreadStore((s) => s.clearActiveThread);
  const activeChannel = useChannelStore((s) => {
    const id = s.activeChannelId;
    return s.channels.find((c) => c.id === id);
  });

  // Fetch thread details
  const threadsByChannel = useThreadStore((s) => s.threadsByChannel);
  const thread = Object.values(threadsByChannel)
    .flat()
    .find((t) => t.id === threadId);

  // Messages for this thread (threads are channels, so messages are stored by channelId=threadId)
  const messagesByChannel = useMessageStore((s) => s.messagesByChannel);
  const messages = messagesByChannel[threadId] || EMPTY_MESSAGES;
  const streamingMessages = useMessageStore((s) => s.streamingMessages);
  const isLoading = useMessageStore((s) => s.isLoading);
  const fetchMessages = useMessageStore((s) => s.fetchMessages);

  const typingAgentsMap = useAgentStore((s) => s.typingAgents);
  const typingAgents = typingAgentsMap[threadId] || EMPTY_TYPING;
  const agents = useAgentStore((s) => s.agents);

  const { sendMessage, sendTyping } = useSocket(threadId);

  const bottomRef = useRef<HTMLDivElement>(null);

  // Fetch messages for this thread on mount
  useEffect(() => {
    fetchMessages(threadId);
  }, [threadId, fetchMessages]);

  // Auto-scroll
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, Object.keys(streamingMessages).length]);

  const typingAgentNames = typingAgents
    .map((id) => agents.find((a) => a.id === id)?.name)
    .filter(Boolean) as string[];

  const handleArchive = async () => {
    try {
      await archiveThread(threadId);
      clearActiveThread();
    } catch {
      // ignore
    }
  };

  return (
    <div className="flex flex-1 flex-col min-w-0 bg-background">
      {/* Thread header */}
      <div className="flex h-14 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={clearActiveThread}
            className="h-8 w-8 shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Hash className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-sm text-muted-foreground truncate">
            {activeChannel?.name}
          </span>
          <span className="text-muted-foreground">/</span>
          <h2 className="font-semibold text-foreground truncate">
            {thread?.name || "Thread"}
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleArchive}
            className="h-8 w-8"
            title="Archive thread"
          >
            <Archive className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="py-4">
          {isLoading && messages.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  No messages yet. Start the conversation!
                </p>
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <MessageItem
                key={message.id}
                message={message}
                isStreaming={!!streamingMessages[message.id]}
                streamContent={streamingMessages[message.id]}
              />
            ))
          )}
          {typingAgentNames.length > 0 && (
            <TypingIndicator names={typingAgentNames} />
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <MessageInput
        onSend={sendMessage}
        onTyping={sendTyping}
        placeholder={`Message thread: ${thread?.name || ""}`}
      />
    </div>
  );
}
