import { useEffect, useCallback, useRef } from "react";
import { getSocket, type AppSocket } from "@/lib/socket";
import { useMessageStore } from "@/stores/message-store";
import { useAgentStore } from "@/stores/agent-store";
import { useChannelStore } from "@/stores/channel-store";
import { useThreadStore } from "@/stores/thread-store";
import type { Message, Channel } from "@slock/shared";

export function useSocket(channelId: string | null) {
  const socketRef = useRef<AppSocket | null>(null);
  const addMessage = useMessageStore((s) => s.addMessage);
  const updateMessage = useMessageStore((s) => s.updateMessage);
  const deleteMessage = useMessageStore((s) => s.deleteMessage);
  const appendStreamChunk = useMessageStore((s) => s.appendStreamChunk);
  const finalizeStream = useMessageStore((s) => s.finalizeStream);
  const setAgentTyping = useAgentStore((s) => s.setAgentTyping);
  const clearAgentTyping = useAgentStore((s) => s.clearAgentTyping);
  const updateChannel = useChannelStore((s) => s.updateChannel);
  const addThread = useThreadStore((s) => s.addThread);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    // Named handlers so we can remove exactly these (not all listeners)
    const handleMessageNew = (message: Message) => {
      addMessage(message);
    };

    const handleMessageUpdate = (message: Message) => {
      updateMessage(message);
    };

    const handleMessageDelete = (messageId: string) => {
      if (channelId) {
        deleteMessage(messageId, channelId);
      }
    };

    const handleAgentTyping = ({ agentId, channelId: cId }: { agentId: string; channelId: string }) => {
      setAgentTyping(agentId, cId);
    };

    const handleAgentStream = ({
      agentId,
      channelId: cId,
      messageId,
      chunk,
      done,
    }: {
      agentId: string;
      channelId: string;
      messageId: string;
      chunk: string;
      done: boolean;
    }) => {
      if (done) {
        finalizeStream(messageId);
        clearAgentTyping(agentId, cId);
      } else {
        appendStreamChunk(messageId, chunk);
      }
    };

    const handleAgentResponse = (message: Message) => {
      // Finalize any remaining stream first (handles race condition)
      if (message.id) {
        finalizeStream(message.id);
      }
      addMessage(message);
      if (message.agentId && message.channelId) {
        clearAgentTyping(message.agentId, message.channelId);
      }
    };

    const handleAgentError = ({ agentId, channelId: cId }: { agentId: string; channelId: string }) => {
      clearAgentTyping(agentId, cId);
    };

    const handleChannelUpdate = (channel: any) => {
      updateChannel(channel);
    };

    socket.on("message:new", handleMessageNew);
    socket.on("message:update", handleMessageUpdate);
    socket.on("message:delete", handleMessageDelete);
    socket.on("agent:typing", handleAgentTyping);
    socket.on("agent:stream", handleAgentStream);
    socket.on("agent:response", handleAgentResponse);
    socket.on("agent:error", handleAgentError);
    socket.on("channel:update", handleChannelUpdate);

    return () => {
      socket.off("message:new", handleMessageNew);
      socket.off("message:update", handleMessageUpdate);
      socket.off("message:delete", handleMessageDelete);
      socket.off("agent:typing", handleAgentTyping);
      socket.off("agent:stream", handleAgentStream);
      socket.off("agent:response", handleAgentResponse);
      socket.off("agent:error", handleAgentError);
      socket.off("channel:update", handleChannelUpdate);
    };
  }, [
    channelId,
    addMessage,
    updateMessage,
    deleteMessage,
    appendStreamChunk,
    finalizeStream,
    setAgentTyping,
    clearAgentTyping,
    updateChannel,
    addThread,
  ]);

  useEffect(() => {
    const socket = getSocket();
    if (channelId) {
      // Emit thread:join for thread channels so the socket room is joined server-side
      socket.emit("channel:join", channelId);
      (socket as any).emit("thread:join", channelId);
    }
    return () => {
      if (channelId) {
        socket.emit("channel:leave", channelId);
      }
    };
  }, [channelId]);

  const sendMessage = useCallback(
    (content: string, parentId?: string) => {
      if (!channelId) return;
      const socket = getSocket();
      socket.emit("message:send", { content, channelId, parentId });
    },
    [channelId]
  );

  const sendTyping = useCallback(() => {
    if (!channelId) return;
    const socket = getSocket();
    socket.emit("user:typing", channelId);
  }, [channelId]);

  return { sendMessage, sendTyping };
}
