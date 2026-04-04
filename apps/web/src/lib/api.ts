import type {
  ApiResponse,
  AuthResponse,
  LoginRequest,
  RegisterRequest,
  User,
  Channel,
  Message,
  AgentDefinition,
  CreateChannelRequest,
  CreateAgentRequest,
  Workflow,
  CreateWorkflowRequest,
} from "@slock/shared";

const BASE_URL = "/api";

function getToken(): string | null {
  return localStorage.getItem("slock_token");
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data: ApiResponse<T> = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }

  return data;
}

// ---- Auth ----

export async function login(payload: LoginRequest): Promise<AuthResponse> {
  const res = await request<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.data!;
}

export async function register(payload: RegisterRequest & { inviteCode?: string }): Promise<AuthResponse> {
  const res = await request<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.data!;
}

export async function getMe(): Promise<User> {
  const res = await request<User>("/auth/me");
  return res.data!;
}

// ---- Channels ----

export async function getChannels(): Promise<Channel[]> {
  const res = await request<Channel[]>("/channels");
  return res.data!;
}

export async function getChannel(id: string): Promise<Channel> {
  const res = await request<Channel>(`/channels/${id}`);
  return res.data!;
}

export async function createChannel(payload: CreateChannelRequest): Promise<Channel> {
  const res = await request<Channel>("/channels", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.data!;
}

export async function joinChannel(id: string): Promise<void> {
  await request(`/channels/${id}/join`, { method: "POST" });
}

export async function leaveChannel(id: string): Promise<void> {
  await request(`/channels/${id}/leave`, { method: "POST" });
}

export async function addAgentToChannel(
  channelId: string,
  agentId: string
): Promise<void> {
  await request(`/channels/${channelId}/agents`, {
    method: "POST",
    body: JSON.stringify({ agentId }),
  });
}

export async function removeAgentFromChannel(
  channelId: string,
  agentId: string
): Promise<void> {
  await request(`/channels/${channelId}/agents/${agentId}`, {
    method: "DELETE",
  });
}

// ---- Messages ----

export async function getMessages(
  channelId: string,
  cursor?: string,
  limit = 50
): Promise<{ messages: Message[]; hasMore: boolean; nextCursor?: string }> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  // Backend returns { data: Message[], hasMore, nextCursor } at top level
  const response = await fetch(`${BASE_URL}/messages/${channelId}?${params}`, {
    headers: {
      "Content-Type": "application/json",
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || "Failed to fetch messages");
  return {
    messages: json.data || [],
    hasMore: json.hasMore || false,
    nextCursor: json.nextCursor,
  };
}

export async function getThreadMessages(parentId: string): Promise<Message[]> {
  const res = await request<Message[]>(`/messages/thread/${parentId}`);
  return res.data!;
}

// ---- Agents ----

export async function getAgents(): Promise<AgentDefinition[]> {
  const res = await request<AgentDefinition[]>("/agents");
  return res.data!;
}

export async function getAgent(id: string): Promise<AgentDefinition> {
  const res = await request<AgentDefinition>(`/agents/${id}`);
  return res.data!;
}

export async function createAgent(payload: CreateAgentRequest): Promise<AgentDefinition> {
  const res = await request<AgentDefinition>("/agents", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.data!;
}

export async function updateAgent(
  id: string,
  payload: Partial<CreateAgentRequest>
): Promise<AgentDefinition> {
  const res = await request<AgentDefinition>(`/agents/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return res.data!;
}

export async function deleteAgent(id: string): Promise<void> {
  await request(`/agents/${id}`, { method: "DELETE" });
}

export async function getSkillPresets(role: string): Promise<import("@slock/shared").ToolDefinition[]> {
  const res = await request<import("@slock/shared").ToolDefinition[]>(`/agents/skills/presets?role=${role}`);
  return res.data!;
}

// ---- Workflows ----

export async function getWorkflows(channelId: string): Promise<Workflow[]> {
  const res = await request<Workflow[]>(`/workflows?channelId=${channelId}`);
  return res.data!;
}

export async function createWorkflow(payload: CreateWorkflowRequest): Promise<Workflow> {
  const res = await request<Workflow>("/workflows", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return res.data!;
}

// ---- Threads ----

export async function createThread(
  channelId: string,
  name: string,
  sourceMessageId?: string,
  agentIds?: string[]
): Promise<Channel> {
  const res = await request<Channel>(`/channels/${channelId}/threads`, {
    method: "POST",
    body: JSON.stringify({ name, sourceMessageId, agentIds }),
  });
  return res.data!;
}

export async function getThreads(channelId: string): Promise<Channel[]> {
  const res = await request<Channel[]>(`/channels/${channelId}/threads`);
  return res.data!;
}

export async function getThread(threadId: string): Promise<Channel> {
  const res = await request<Channel>(`/threads/${threadId}`);
  return res.data!;
}

export async function joinThread(threadId: string): Promise<void> {
  await request(`/threads/${threadId}/join`, { method: "POST" });
}

export async function leaveThread(threadId: string): Promise<void> {
  await request(`/threads/${threadId}/leave`, { method: "POST" });
}

export async function archiveThread(threadId: string): Promise<void> {
  await request(`/threads/${threadId}/archive`, { method: "POST" });
}

// ---- Settings ----

export interface AppSettings {
  anthropicApiKey: string;
  hasAnthropicKey: boolean;
  anthropicBaseUrl: string;
  hasAnthropicBaseUrl: boolean;
  openaiApiKey: string;
  hasOpenaiKey: boolean;
}

export async function getSettings(): Promise<AppSettings> {
  const res = await request<AppSettings>("/settings");
  return res.data!;
}

export async function updateSettings(payload: {
  anthropicApiKey?: string;
  anthropicBaseUrl?: string;
  openaiApiKey?: string;
}): Promise<{ hasAnthropicKey: boolean; hasAnthropicBaseUrl: boolean; hasOpenaiKey: boolean }> {
  const res = await request<{ hasAnthropicKey: boolean; hasOpenaiKey: boolean }>("/settings", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  return res.data!;
}

// ---- Detected Providers ----

export interface DetectedProviderInfo {
  id: string;
  name: string;
  source: "env" | "cli-config" | "cli-binary" | "manual";
  maskedKey: string;
  hasKey: boolean;
  baseUrl: string;
  models: string[];
  cliPath?: string;
}

export async function getDetectedProviders(): Promise<DetectedProviderInfo[]> {
  const res = await request<DetectedProviderInfo[]>("/settings/providers");
  return res.data!;
}

// ---- Invites ----

export interface Invite {
  id: string;
  code: string;
  createdBy: string;
  expiresAt: string | null;
  maxUses: number;
  uses: number;
  isActive: boolean;
  createdAt: string;
}

export async function createInvite(maxUses?: number): Promise<{ code: string; id: string }> {
  const res = await request<{ code: string; id: string }>("/invites", {
    method: "POST",
    body: JSON.stringify({ maxUses: maxUses ?? 0 }),
  });
  return res.data!;
}

export async function getInvites(): Promise<Invite[]> {
  const res = await request<Invite[]>("/invites");
  return res.data!;
}

export async function validateInvite(code: string): Promise<{ valid: boolean; message?: string }> {
  const res = await request<{ valid: boolean; message?: string }>(`/invites/validate/${code}`);
  return res.data!;
}

export async function deleteInvite(id: string): Promise<void> {
  await request(`/invites/${id}`, { method: "DELETE" });
}

// ---- Agent Memories ----

export async function getAgentMemories(
  agentId: string,
  channelId: string
): Promise<import("@slock/shared").AgentMemoryEntry[]> {
  const res = await request<import("@slock/shared").AgentMemoryEntry[]>(
    `/memories/${agentId}/${channelId}`
  );
  return res.data!;
}

export async function getSharedMemories(
  channelId: string
): Promise<import("@slock/shared").AgentMemoryEntry[]> {
  const res = await request<import("@slock/shared").AgentMemoryEntry[]>(
    `/memories/shared/${channelId}`
  );
  return res.data!;
}

export async function deleteMemory(id: string): Promise<void> {
  await request(`/memories/${id}`, { method: "DELETE" });
}

export async function generateDailySummary(
  agentId: string,
  channelId: string
): Promise<{ summary: string }> {
  const res = await request<{ summary: string }>(
    `/memories/${agentId}/${channelId}/summarize`,
    { method: "POST" }
  );
  return res.data!;
}

// ---- Schedules ----

export interface AgentSchedule {
  id: string;
  agentId: string;
  agentName: string;
  channelId: string;
  channelName: string;
  name: string;
  cron: string;
  prompt: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  cronDescription?: string;
  createdAt: string;
}

export interface CreateScheduleData {
  agentId: string;
  agentName: string;
  channelId: string;
  channelName: string;
  name: string;
  cron: string;
  prompt: string;
  enabled: boolean;
}

export async function getSchedules(channelId?: string): Promise<AgentSchedule[]> {
  const params = channelId ? `?channelId=${channelId}` : "";
  const res = await request<AgentSchedule[]>(`/schedules${params}`);
  return res.data!;
}

export async function createScheduleApi(data: CreateScheduleData): Promise<AgentSchedule> {
  const res = await request<AgentSchedule>("/schedules", {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.data!;
}

export async function updateScheduleApi(id: string, data: Partial<AgentSchedule>): Promise<AgentSchedule> {
  const res = await request<AgentSchedule>(`/schedules/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
  return res.data!;
}

export async function deleteScheduleApi(id: string): Promise<void> {
  await request(`/schedules/${id}`, { method: "DELETE" });
}

export async function runScheduleNowApi(id: string): Promise<void> {
  await request(`/schedules/${id}/run`, { method: "POST" });
}
