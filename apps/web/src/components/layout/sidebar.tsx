import { useState, useEffect } from "react";
import {
  Hash,
  Lock,
  Plus,
  MessageSquare,
  Bot,
  LogOut,
  Settings,
  ChevronDown,
  ChevronRight,
  GitBranch,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip } from "@/components/ui/tooltip";
import { useAuthStore } from "@/stores/auth-store";
import { useChannelStore } from "@/stores/channel-store";
import { useThreadStore } from "@/stores/thread-store";
import type { Channel } from "@slock/shared";

interface SidebarProps {
  onCreateChannel: () => void;
  onManageAgents: () => void;
  onOpenSettings: () => void;
}

export function Sidebar({ onCreateChannel, onManageAgents, onOpenSettings }: SidebarProps) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const channels = useChannelStore((s) => s.channels);
  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);

  const threadsByChannel = useThreadStore((s) => s.threadsByChannel);
  const activeThreadId = useThreadStore((s) => s.activeThreadId);
  const setActiveThread = useThreadStore((s) => s.setActiveThread);
  const fetchThreads = useThreadStore((s) => s.fetchThreads);

  const [channelsExpanded, setChannelsExpanded] = useState(true);
  const [expandedThreadChannels, setExpandedThreadChannels] = useState<Set<string>>(new Set());

  const publicChannels = channels.filter((c) => c.type === "public");
  const privateChannels = channels.filter((c) => c.type === "private");
  const dmChannels = channels.filter((c) => c.type === "dm");

  // Fetch threads for all channels on mount and when channels change
  useEffect(() => {
    for (const channel of channels) {
      fetchThreads(channel.id);
    }
  }, [channels, fetchThreads]);

  const toggleThreadsExpanded = (channelId: string) => {
    setExpandedThreadChannels((prev) => {
      const next = new Set(prev);
      if (next.has(channelId)) {
        next.delete(channelId);
      } else {
        next.add(channelId);
      }
      return next;
    });
  };

  return (
    <div className="flex h-full w-64 flex-col border-r bg-card">
      {/* Workspace header */}
      <div className="flex h-14 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <MessageSquare className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-foreground">Slock</span>
        </div>
      </div>

      {/* Channel list */}
      <ScrollArea className="flex-1 px-2 py-2">
        {/* Channels section */}
        <SidebarSection
          title="Channels"
          expanded={channelsExpanded}
          onToggle={() => setChannelsExpanded(!channelsExpanded)}
          onAction={onCreateChannel}
        >
          {publicChannels.map((channel) => {
            const threads = threadsByChannel[channel.id] || [];
            const isThreadsExpanded = expandedThreadChannels.has(channel.id);
            return (
              <div key={channel.id}>
                <ChannelItem
                  channel={channel}
                  isActive={channel.id === activeChannelId && !activeThreadId}
                  onClick={() => {
                    setActiveThread(null);
                    setActiveChannel(channel.id);
                  }}
                  threadCount={threads.length}
                  onToggleThreads={threads.length > 0 ? () => toggleThreadsExpanded(channel.id) : undefined}
                  threadsExpanded={isThreadsExpanded}
                />
                {isThreadsExpanded && threads.map((thread) => (
                  <ThreadItem
                    key={thread.id}
                    thread={thread}
                    isActive={thread.id === activeThreadId}
                    onClick={() => {
                      setActiveChannel(channel.id);
                      setActiveThread(thread.id);
                    }}
                  />
                ))}
              </div>
            );
          })}
          {privateChannels.map((channel) => {
            const threads = threadsByChannel[channel.id] || [];
            const isThreadsExpanded = expandedThreadChannels.has(channel.id);
            return (
              <div key={channel.id}>
                <ChannelItem
                  channel={channel}
                  isActive={channel.id === activeChannelId && !activeThreadId}
                  onClick={() => {
                    setActiveThread(null);
                    setActiveChannel(channel.id);
                  }}
                  threadCount={threads.length}
                  onToggleThreads={threads.length > 0 ? () => toggleThreadsExpanded(channel.id) : undefined}
                  threadsExpanded={isThreadsExpanded}
                />
                {isThreadsExpanded && threads.map((thread) => (
                  <ThreadItem
                    key={thread.id}
                    thread={thread}
                    isActive={thread.id === activeThreadId}
                    onClick={() => {
                      setActiveChannel(channel.id);
                      setActiveThread(thread.id);
                    }}
                  />
                ))}
              </div>
            );
          })}
        </SidebarSection>

        {/* DMs section */}
        {dmChannels.length > 0 && (
          <SidebarSection title="Direct Messages" expanded={true} onToggle={() => {}}>
            {dmChannels.map((channel) => (
              <ChannelItem
                key={channel.id}
                channel={channel}
                isActive={channel.id === activeChannelId}
                onClick={() => setActiveChannel(channel.id)}
              />
            ))}
          </SidebarSection>
        )}

        {/* Agents shortcut */}
        <div className="mt-2 px-1">
          <button
            onClick={onManageAgents}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <Bot className="h-4 w-4" />
            <span>AI Agents</span>
          </button>
        </div>
      </ScrollArea>

      {/* User footer */}
      <div className="border-t p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Avatar
              name={user?.username || ""}
              isOnline={true}
              size="sm"
            />
            <span className="truncate text-sm font-medium text-foreground">
              {user?.username}
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            <Tooltip content="Settings" side="top">
              <Button variant="ghost" size="icon" onClick={onOpenSettings} className="h-7 w-7">
                <Settings className="h-4 w-4" />
              </Button>
            </Tooltip>
            <Tooltip content="Sign out" side="top">
              <Button variant="ghost" size="icon" onClick={logout} className="h-7 w-7">
                <LogOut className="h-4 w-4" />
              </Button>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarSection({
  title,
  expanded,
  onToggle,
  onAction,
  children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-1">
      <div className="flex items-center justify-between px-1 py-1">
        <button
          onClick={onToggle}
          className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          {title}
        </button>
        {onAction && (
          <Tooltip content={`Add ${title.toLowerCase()}`} side="top">
            <button
              onClick={onAction}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        )}
      </div>
      {expanded && <div className="space-y-0.5">{children}</div>}
    </div>
  );
}

function ChannelItem({
  channel,
  isActive,
  onClick,
  threadCount,
  onToggleThreads,
  threadsExpanded,
}: {
  channel: Channel;
  isActive: boolean;
  onClick: () => void;
  threadCount?: number;
  onToggleThreads?: () => void;
  threadsExpanded?: boolean;
}) {
  const Icon = channel.type === "private" ? Lock : Hash;

  return (
    <div className="flex items-center">
      {onToggleThreads && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleThreads();
          }}
          className="ml-1 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          {threadsExpanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </button>
      )}
      <button
        onClick={onClick}
        className={cn(
          "flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
          !onToggleThreads && "ml-1",
          isActive
            ? "bg-accent text-accent-foreground font-medium"
            : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{channel.name}</span>
        {(threadCount ?? 0) > 0 && (
          <span className="ml-auto text-[10px] text-muted-foreground">
            {threadCount}
          </span>
        )}
        {(channel.unreadCount ?? 0) > 0 && (
          <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
            {channel.unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}

function ThreadItem({
  thread,
  isActive,
  onClick,
}: {
  thread: Channel;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md py-1 pl-8 pr-2 text-sm transition-colors",
        isActive
          ? "bg-accent text-accent-foreground font-medium"
          : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground"
      )}
    >
      <GitBranch className="h-3 w-3 shrink-0" />
      <span className="truncate text-xs">{thread.name}</span>
    </button>
  );
}
