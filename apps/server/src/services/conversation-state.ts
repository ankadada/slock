/**
 * Conversation state machine for @mention intent classification.
 *
 * When an agent's response contains conditional @mentions (e.g. "confirm first,
 * then let @EG implement"), the mentioned agent should NOT fire immediately.
 * Instead, the channel enters an "awaiting_user" state and the mentions are
 * queued until the user explicitly confirms.
 *
 * Uses a regex fast-path for pattern matching -- no AI call needed.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface PendingTrigger {
  mentionedAgentName: string;
  sourceAgentId: string;
  sourceMessageContent: string;
  queuedAt: number;
}

export interface ChannelConversationState {
  status: "idle" | "awaiting_user";
  askingAgentId: string | null;
  pendingTriggers: PendingTrigger[];
  questionContext: string | null;
  stateSetAt: number;
}

// ── Storage ────────────────────────────────────────────────────────────────

const channelStates = new Map<string, ChannelConversationState>();
const STATE_TTL_MS = 5 * 60 * 1000; // 5 min auto-expire

function defaultState(): ChannelConversationState {
  return {
    status: "idle",
    askingAgentId: null,
    pendingTriggers: [],
    questionContext: null,
    stateSetAt: Date.now(),
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Get channel state. Automatically expires stale states back to idle.
 */
export function getChannelState(channelId: string): ChannelConversationState {
  const state = channelStates.get(channelId);
  if (!state) return defaultState();

  // Auto-expire stale awaiting_user states
  if (state.status === "awaiting_user" && Date.now() - state.stateSetAt > STATE_TTL_MS) {
    channelStates.delete(channelId);
    return defaultState();
  }

  return state;
}

/**
 * Set the channel into "awaiting_user" state with queued triggers.
 */
export function setAwaitingUser(
  channelId: string,
  agentId: string,
  question: string,
  triggers: PendingTrigger[]
): void {
  channelStates.set(channelId, {
    status: "awaiting_user",
    askingAgentId: agentId,
    pendingTriggers: triggers,
    questionContext: question,
    stateSetAt: Date.now(),
  });
}

/**
 * Clear state back to idle.
 */
export function clearState(channelId: string): void {
  channelStates.delete(channelId);
}

/**
 * Flush and return pending triggers, then clear state.
 */
export function flushPendingTriggers(channelId: string): PendingTrigger[] {
  const state = channelStates.get(channelId);
  if (!state) return [];
  const triggers = [...state.pendingTriggers];
  channelStates.delete(channelId);
  return triggers;
}

// ── Mention intent classification ──────────────────────────────────────────

export interface MentionClassification {
  type: "direct_handoff" | "conditional_handoff" | "no_handoff";
  deferredMentions: string[];
  immediateMentions: string[];
}

// Conditional patterns (Chinese + English) that indicate a mention should be
// deferred until the user confirms.
const CONDITIONAL_PATTERNS = [
  // Chinese
  /确认后/,
  /请先/,
  /等.*之后/,
  /如果/,
  /确认.*再/,
  /回复后/,
  /需要.*确认/,
  /同意.*后/,
  /确定.*后/,
  /批准.*后/,
  /审核.*后/,
  // English
  /after you confirm/i,
  /once you/i,
  /when you/i,
  /if you/i,
  /please confirm/i,
  /after.*(?:approval|confirmation)/i,
  /pending.*(?:your|user)/i,
  /wait(?:ing)? for/i,
  /let me know/i,
  /do you want/i,
];

/**
 * Classify each @mention in an agent's response as immediate or deferred.
 *
 * For each @mention, we look at the surrounding text (150 chars before and
 * after) for conditional language patterns and nearby question marks (100 chars).
 */
export function classifyMentionIntent(
  agentMessage: string,
  mentionedNames: string[]
): MentionClassification {
  if (mentionedNames.length === 0) {
    return { type: "no_handoff", deferredMentions: [], immediateMentions: [] };
  }

  const immediateMentions: string[] = [];
  const deferredMentions: string[] = [];

  for (const name of mentionedNames) {
    // Find all positions of this @mention in the message
    const mentionRegex = new RegExp(`@${name}`, "gi");
    let isDeferred = false;
    let match: RegExpExecArray | null;

    while ((match = mentionRegex.exec(agentMessage)) !== null) {
      const pos = match.index;
      const start = Math.max(0, pos - 150);
      const end = Math.min(agentMessage.length, pos + name.length + 1 + 150);
      const surrounding = agentMessage.slice(start, end);

      // Check for conditional patterns in surrounding text
      for (const pattern of CONDITIONAL_PATTERNS) {
        if (pattern.test(surrounding)) {
          isDeferred = true;
          break;
        }
      }

      // Check for question marks near the @mention (within 100 chars)
      if (!isDeferred) {
        const qStart = Math.max(0, pos - 100);
        const qEnd = Math.min(agentMessage.length, pos + name.length + 1 + 100);
        const nearbyText = agentMessage.slice(qStart, qEnd);
        if (/[?？]/.test(nearbyText)) {
          isDeferred = true;
        }
      }

      if (isDeferred) break;
    }

    if (isDeferred) {
      deferredMentions.push(name);
    } else {
      immediateMentions.push(name);
    }
  }

  if (deferredMentions.length === 0) {
    return { type: "direct_handoff", deferredMentions: [], immediateMentions };
  }

  return {
    type: "conditional_handoff",
    deferredMentions,
    immediateMentions,
  };
}

// ── User response classification ───────────────────────────────────────────

export type UserResponseType = "confirmation" | "rejection" | "topic_change" | "explicit_mention";

const CONFIRM_PATTERNS = [
  /^确认$/,
  /^好的?$/,
  /^可以$/,
  /^没问题$/,
  /^同意$/,
  /^行$/,
  /^对$/,
  /^是的?$/,
  /^嗯$/,
  /^ok$/i,
  /^okay$/i,
  /^yes$/i,
  /^yep$/i,
  /^yeah$/i,
  /^sure$/i,
  /^go$/i,
  /^go ahead$/i,
  /^confirm$/i,
  /^lgtm$/i,
  /^approved?$/i,
  /^do it$/i,
  /开始吧/,
  /继续吧/,
  /执行吧/,
  /没问题/,
  /可以的/,
  /同意/,
  /确认/,
  /批准/,
  /通过/,
];

const REJECT_PATTERNS = [
  /^不$/,
  /^不行$/,
  /^不要$/,
  /^算了$/,
  /^取消$/,
  /^暂停$/,
  /^等等$/,
  /^先不/,
  /^no\b/i,
  /^nope\b/i,
  /^wait\b/i,
  /^stop\b/i,
  /^cancel/i,
  /^hold\s/i,
  /^not\s+yet/i,
  /^don'?t\b/i,
  /先别/,
  /暂时不/,
  /等一下/,
  /再等等/,
  /不用了/,
];

/**
 * Classify the user's response when the channel is in "awaiting_user" state.
 *
 * Priority:
 *   1. If the user explicitly @mentions a queued agent -> "explicit_mention"
 *   2. If the message matches confirm patterns -> "confirmation"
 *   3. If the message matches reject patterns -> "rejection"
 *   4. Otherwise -> "topic_change"
 */
export function classifyUserResponse(
  userMessage: string,
  pendingState: ChannelConversationState,
  mentionedNames: string[]
): UserResponseType {
  const trimmed = userMessage.trim();

  // 1. Check if user explicitly @mentions a queued agent
  const queuedNames = pendingState.pendingTriggers.map((t) => t.mentionedAgentName.toLowerCase());
  for (const name of mentionedNames) {
    if (queuedNames.includes(name.toLowerCase())) {
      return "explicit_mention";
    }
  }

  // 2. Check confirm patterns
  for (const pattern of CONFIRM_PATTERNS) {
    if (pattern.test(trimmed)) {
      return "confirmation";
    }
  }

  // 3. Check reject patterns
  for (const pattern of REJECT_PATTERNS) {
    if (pattern.test(trimmed)) {
      return "rejection";
    }
  }

  // 4. Default: topic change
  return "topic_change";
}
