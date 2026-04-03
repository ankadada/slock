import { useEffect } from "react";
import { X, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageItem } from "@/components/chat/message-item";
import { MessageInput } from "@/components/chat/message-input";
import { useMessageStore } from "@/stores/message-store";
import { useSocket } from "@/hooks/use-socket";
import { useChannelStore } from "@/stores/channel-store";

export function ThreadPanel() {
  const activeThreadId = useMessageStore((s) => s.activeThreadId);
  const setActiveThread = useMessageStore((s) => s.setActiveThread);
  const fetchThreadMessages = useMessageStore((s) => s.fetchThreadMessages);
  const threadMessages = useMessageStore((s) =>
    activeThreadId ? s.threadMessages[activeThreadId] || [] : []
  );
  const activeChannelId = useChannelStore((s) => s.activeChannelId);

  // Find the parent message across all channels
  const parentMessage = useMessageStore((s) => {
    if (!activeThreadId) return null;
    for (const msgs of Object.values(s.messagesByChannel)) {
      const found = msgs.find((m) => m.id === activeThreadId);
      if (found) return found;
    }
    return null;
  });

  const { sendMessage, sendTyping } = useSocket(activeChannelId);

  useEffect(() => {
    if (activeThreadId) {
      fetchThreadMessages(activeThreadId);
    }
  }, [activeThreadId, fetchThreadMessages]);

  if (!activeThreadId || !parentMessage) return null;

  return (
    <div className="flex h-full w-80 flex-col border-l bg-card">
      <div className="flex h-14 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold text-foreground text-sm">Thread</h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setActiveThread(null)}
          className="h-7 w-7"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="py-2">
          {/* Parent message */}
          <div className="border-b pb-2 mb-2">
            <MessageItem message={parentMessage} />
          </div>

          {/* Thread replies */}
          {threadMessages.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <p className="text-xs">No replies yet</p>
            </div>
          ) : (
            threadMessages.map((msg) => (
              <MessageItem key={msg.id} message={msg} />
            ))
          )}
        </div>
      </ScrollArea>

      <MessageInput
        onSend={(content) => sendMessage(content, activeThreadId)}
        onTyping={sendTyping}
        placeholder="Reply in thread..."
      />
    </div>
  );
}
