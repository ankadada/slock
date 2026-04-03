import { useState, useRef, useCallback, type KeyboardEvent } from "react";
import { Send, Paperclip, AtSign } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAgentStore } from "@/stores/agent-store";
import { useChannelStore } from "@/stores/channel-store";
import type { AgentDefinition } from "@slock/shared";

interface MessageInputProps {
  onSend: (content: string) => void;
  onTyping: () => void;
  placeholder?: string;
  disabled?: boolean;
}

export function MessageInput({
  onSend,
  onTyping,
  placeholder = "Type a message...",
  disabled = false,
}: MessageInputProps) {
  const [content, setContent] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const agents = useAgentStore((s) => s.agents);
  const activeChannel = useChannelStore((s) => {
    const id = s.activeChannelId;
    return s.channels.find((c) => c.id === id);
  });

  const channelAgentIds = new Set(
    (activeChannel?.agents || []).map((a) => a.id)
  );
  const channelAgents = agents.filter((a) => channelAgentIds.has(a.id));

  const filteredAgents = channelAgents.filter((a) =>
    a.name.toLowerCase().includes(mentionFilter.toLowerCase())
  );

  const handleSubmit = useCallback(() => {
    const trimmed = content.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setContent("");
    setShowMentions(false);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [content, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setContent(value);
    onTyping();

    // Auto-resize
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }

    // Check for @mention trigger
    const lastAtIndex = value.lastIndexOf("@");
    if (lastAtIndex !== -1) {
      const afterAt = value.slice(lastAtIndex + 1);
      if (!afterAt.includes(" ")) {
        setShowMentions(true);
        setMentionFilter(afterAt);
        return;
      }
    }
    setShowMentions(false);
  };

  const insertMention = (agent: AgentDefinition) => {
    const lastAtIndex = content.lastIndexOf("@");
    const before = content.slice(0, lastAtIndex);
    const newContent = `${before}@${agent.name} `;
    setContent(newContent);
    setShowMentions(false);
    textareaRef.current?.focus();
  };

  return (
    <div className="relative border-t px-4 py-3">
      {/* Mention autocomplete */}
      {showMentions && filteredAgents.length > 0 && (
        <div className="absolute bottom-full left-4 right-4 mb-1 rounded-lg border bg-card shadow-lg overflow-hidden">
          {filteredAgents.map((agent) => (
            <button
              key={agent.id}
              onClick={() => insertMention(agent)}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors text-left"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded bg-purple-500/20 text-purple-400 text-xs font-medium">
                AI
              </span>
              <span className="font-medium text-foreground">{agent.name}</span>
              <span className="text-muted-foreground">- {agent.role}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 rounded-lg border bg-background px-3 py-2 focus-within:ring-1 focus-within:ring-ring">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          style={{ maxHeight: "160px" }}
        />
        <div className="flex items-center gap-1">
          {channelAgents.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              onClick={() => {
                setContent((prev) => prev + "@");
                setShowMentions(true);
                setMentionFilter("");
                textareaRef.current?.focus();
              }}
            >
              <AtSign className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-7 w-7",
              content.trim()
                ? "text-primary hover:text-primary"
                : "text-muted-foreground"
            )}
            onClick={handleSubmit}
            disabled={!content.trim() || disabled}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
