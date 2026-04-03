import { useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { ChannelHeader } from "@/components/layout/channel-header";
import { MemberPanel } from "@/components/layout/member-panel";
import { MessageList } from "@/components/chat/message-list";
import { MessageInput } from "@/components/chat/message-input";
import { ThreadPanel } from "@/components/chat/thread-panel";
import { ThreadView } from "@/components/chat/thread-view";
import { CreateChannelDialog } from "@/components/chat/create-channel-dialog";
import { CreateThreadDialog } from "@/components/chat/create-thread-dialog";
import { AgentManagerDialog } from "@/components/agent/agent-manager-dialog";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import { useChannelStore } from "@/stores/channel-store";
import { useMessageStore } from "@/stores/message-store";
import { useAgentStore } from "@/stores/agent-store";
import { useThreadStore } from "@/stores/thread-store";
import { useSocket } from "@/hooks/use-socket";

export function ChatPage() {
  const [showMembers, setShowMembers] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showAgentManager, setShowAgentManager] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCreateThread, setShowCreateThread] = useState(false);
  const [threadSourceMessageId, setThreadSourceMessageId] = useState<string | undefined>();

  const activeChannelId = useChannelStore((s) => s.activeChannelId);
  const fetchChannels = useChannelStore((s) => s.fetchChannels);
  const channels = useChannelStore((s) => s.channels);
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);
  const fetchMessages = useMessageStore((s) => s.fetchMessages);
  const fetchAgents = useAgentStore((s) => s.fetchAgents);
  const activeReplyThreadId = useMessageStore((s) => s.activeThreadId);
  const activeThreadId = useThreadStore((s) => s.activeThreadId);

  // Connect socket to the thread channel when viewing a thread, otherwise the main channel
  const socketChannelId = activeThreadId || activeChannelId;
  const { sendMessage, sendTyping } = useSocket(socketChannelId);

  // Load channels and agents on mount
  useEffect(() => {
    fetchChannels();
    fetchAgents();
  }, [fetchChannels, fetchAgents]);

  // Auto-select first channel if none active
  useEffect(() => {
    if (!activeChannelId && channels.length > 0) {
      setActiveChannel(channels[0].id);
    }
  }, [activeChannelId, channels, setActiveChannel]);

  // Fetch messages when active channel changes
  useEffect(() => {
    if (activeChannelId) {
      fetchMessages(activeChannelId);
    }
  }, [activeChannelId, fetchMessages]);

  const handleStartThread = (messageId: string) => {
    setThreadSourceMessageId(messageId);
    setShowCreateThread(true);
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        onCreateChannel={() => setShowCreateChannel(true)}
        onManageAgents={() => setShowAgentManager(true)}
        onOpenSettings={() => setShowSettings(true)}
      />

      {/* Main chat area */}
      {activeThreadId ? (
        <ThreadView threadId={activeThreadId} />
      ) : (
        <div className="flex flex-1 flex-col min-w-0 bg-background">
          <ChannelHeader
            onToggleMembers={() => setShowMembers(!showMembers)}
            showMembers={showMembers}
          />
          <MessageList onStartThread={handleStartThread} />
          {activeChannelId && (
            <MessageInput
              onSend={sendMessage}
              onTyping={sendTyping}
              placeholder={
                activeChannelId
                  ? `Message #${channels.find((c) => c.id === activeChannelId)?.name || ""}`
                  : "Select a channel..."
              }
              disabled={!activeChannelId}
            />
          )}
        </div>
      )}

      {/* Reply thread panel (inline message threads) */}
      {activeReplyThreadId && !activeThreadId && <ThreadPanel />}

      {/* Member panel */}
      {showMembers && !activeThreadId && <MemberPanel onClose={() => setShowMembers(false)} />}

      {/* Dialogs */}
      <CreateChannelDialog
        open={showCreateChannel}
        onClose={() => setShowCreateChannel(false)}
      />
      <CreateThreadDialog
        open={showCreateThread}
        onClose={() => {
          setShowCreateThread(false);
          setThreadSourceMessageId(undefined);
        }}
        sourceMessageId={threadSourceMessageId}
      />
      <AgentManagerDialog
        open={showAgentManager}
        onClose={() => setShowAgentManager(false)}
      />
      <SettingsDialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </div>
  );
}
