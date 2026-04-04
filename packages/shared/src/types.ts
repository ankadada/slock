// ============================================================
// Core Entity Types
// ============================================================

export interface User {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  isOnline: boolean;
  createdAt: string;
}

export interface Channel {
  id: string;
  name: string;
  description?: string;
  type: "public" | "private" | "dm";
  createdAt: string;
  members?: ChannelMember[];
  agents?: AgentDefinition[];
  unreadCount?: number;
}

export interface ChannelMember {
  id: string;
  userId: string;
  channelId: string;
  role: "admin" | "member";
  joinedAt: string;
  user?: User;
}

export interface Message {
  id: string;
  content: string;
  type: "text" | "system" | "agent";
  userId?: string;
  agentId?: string;
  channelId: string;
  parentId?: string;
  uiComponent?: UIComponent;
  createdAt: string;
  updatedAt: string;
  user?: User;
  agent?: AgentDefinition;
  replies?: Message[];
}

// ============================================================
// Agent Protocol Types
// ============================================================

export interface AgentDefinition {
  id: string;
  name: string;
  role: AgentRole;
  avatar?: string;
  description: string;
  capabilities: string[];
  tools: ToolDefinition[];
  systemPrompt: string;
  model: string;
  provider: "anthropic" | "openai" | "gemini" | "custom";
  thinkingLevel?: ThinkingLevel;
  isActive: boolean;
  createdAt: string;
}

export type AgentRole =
  | "product_manager"
  | "designer"
  | "analyst"
  | "engineer"
  | "qa"
  | "writer"
  | "custom";

export type ThinkingLevel = "none" | "low" | "medium" | "high";

export const THINKING_LEVEL_LABELS: Record<ThinkingLevel, string> = {
  none: "None (fastest)",
  low: "Low",
  medium: "Medium",
  high: "High (deepest reasoning)",
};

export const AGENT_ROLE_LABELS: Record<AgentRole, string> = {
  product_manager: "Product Manager",
  designer: "Designer",
  analyst: "Analyst",
  engineer: "Engineer",
  qa: "QA Engineer",
  writer: "Technical Writer",
  custom: "Custom",
};

export const AGENT_ROLE_PROMPTS: Record<AgentRole, string> = {
  product_manager:
    "You are an experienced product manager. You excel at defining requirements, writing user stories, prioritizing features, and ensuring alignment between business goals and user needs. You think in terms of user value and impact.",
  designer:
    "You are a skilled UI/UX designer. You focus on user experience, visual design, interaction patterns, and accessibility. You provide design critiques, suggest improvements, and create design specifications.",
  analyst:
    "You are a data analyst and business strategist. You analyze information, identify patterns, provide insights, and make data-driven recommendations. You ask clarifying questions to ensure thorough analysis.",
  engineer:
    "You are a senior software engineer. You write clean, maintainable code, review technical designs, suggest architectural improvements, and debug complex issues. You follow best practices and care about performance.",
  qa:
    "You are a quality assurance engineer. You think about edge cases, write test scenarios, identify potential bugs, and ensure product quality. You are thorough and systematic in your approach.",
  writer:
    "You are a technical writer. You create clear documentation, API references, user guides, and tutorials. You make complex concepts accessible and well-organized.",
  custom: "You are a helpful AI assistant.",
};

// ============================================================
// Model Provider Configuration
// ============================================================

export type ModelProvider = "anthropic" | "openai" | "gemini" | "openai-compatible";

export type ModelCategory = "anthropic" | "openai" | "gemini";

export const MODEL_CATEGORY_LABELS: Record<ModelCategory, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (GPT)",
  gemini: "Google (Gemini)",
};

export interface ModelOption {
  id: string;
  name: string;
  provider: ModelCategory;
  description?: string;
}

export const MODEL_OPTIONS: ModelOption[] = [
  // Anthropic
  { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "anthropic", description: "Fast and capable" },
  { id: "claude-opus-4-6", name: "Claude Opus 4.6", provider: "anthropic", description: "Most capable" },
  { id: "claude-haiku-4-5", name: "Claude Haiku 4.5", provider: "anthropic", description: "Fastest, cheapest" },
  // OpenAI
  { id: "gpt-5.4", name: "GPT-5.4", provider: "openai", description: "Frontier model" },
  { id: "gpt-5.4-mini", name: "GPT-5.4 Mini", provider: "openai", description: "Fast, affordable" },
  // Gemini
  { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro", provider: "gemini", description: "Google flagship" },
  { id: "gemini-3-flash-preview", name: "Gemini 3 Flash", provider: "gemini", description: "Google fast" },
];

export const PROVIDER_LABELS: Record<ModelProvider, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (GPT)",
  gemini: "Google (Gemini)",
  "openai-compatible": "OpenAI Compatible",
};

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  executorKey: string;
  isBuiltIn: boolean;
}

export interface ToolParameter {
  type: "string" | "number" | "boolean" | "object" | "array";
  description: string;
  required?: boolean;
  enum?: string[];
}

export const ROLE_SKILL_PRESETS: Record<AgentRole, string[]> = {
  engineer: ["review_code", "explain_code"],
  designer: ["generate_color_palette", "review_design"],
  analyst: ["create_chart", "generate_report"],
  product_manager: ["create_user_story", "prioritize_features"],
  qa: ["generate_test_cases", "review_test_coverage"],
  writer: ["generate_documentation", "review_content"],
  custom: ["llm_freeform"],
};

export interface AgentMessage {
  type: "text" | "tool_call" | "tool_result" | "ui_component" | "workflow_step";
  content: string;
  metadata?: Record<string, unknown>;
  uiComponent?: UIComponent;
  toolCall?: ToolCall;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AgentMemory {
  id: string;
  agentId: string;
  channelId: string;
  key: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// Memory Layer Types
// ============================================================

export type MemoryLayer = "session" | "daily" | "long_term" | "shared";

export interface AgentMemoryEntry {
  id: string;
  agentId: string;
  channelId: string;
  layer: MemoryLayer;
  key: string;
  content: string;
  importance: number;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// Generative UI Types
// ============================================================

export type UIComponentType =
  | "markdown"
  | "code"
  | "card"
  | "form"
  | "table"
  | "chart"
  | "image"
  | "approval"
  | "html";

export interface UIComponent {
  id: string;
  type: UIComponentType;
  props: Record<string, unknown>;
  actions?: UIAction[];
}

export interface UIAction {
  id: string;
  label: string;
  type: "button" | "submit" | "link";
  variant?: "primary" | "secondary" | "danger";
  payload?: Record<string, unknown>;
}

// Specific UI component prop types
export interface CardProps {
  title: string;
  description?: string;
  content?: string;
  image?: string;
  footer?: string;
}

export interface FormProps {
  title?: string;
  fields: FormField[];
  submitLabel?: string;
}

export interface FormField {
  name: string;
  label: string;
  type: "text" | "textarea" | "number" | "select" | "checkbox";
  placeholder?: string;
  required?: boolean;
  options?: { label: string; value: string }[];
  defaultValue?: string;
}

export interface TableProps {
  columns: { key: string; label: string; width?: string }[];
  rows: Record<string, unknown>[];
  caption?: string;
}

export interface ChartProps {
  type: "bar" | "line" | "pie";
  data: { name: string; value: number; [key: string]: unknown }[];
  xKey?: string;
  yKey?: string;
  title?: string;
}

export interface ApprovalProps {
  title: string;
  description: string;
  approveLabel?: string;
  rejectLabel?: string;
}

export interface CodeProps {
  code: string;
  language?: string;
  filename?: string;
}

// ============================================================
// Workflow Types
// ============================================================

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  channelId: string;
  steps: WorkflowStep[];
  status: "idle" | "running" | "paused" | "completed" | "failed";
  currentStepIndex: number;
  createdAt: string;
}

export interface WorkflowStep {
  id: string;
  agentId: string;
  action: string;
  prompt: string;
  waitForApproval?: boolean;
  maxTurns?: number;
  status: "pending" | "running" | "completed" | "skipped" | "failed";
  result?: string;
}

// ============================================================
// Socket.IO Event Types
// ============================================================

export interface ServerToClientEvents {
  // Messages
  "message:new": (message: Message) => void;
  "message:update": (message: Message) => void;
  "message:delete": (messageId: string) => void;

  // Agent
  "agent:typing": (data: { agentId: string; channelId: string }) => void;
  "agent:stream": (data: {
    agentId: string;
    channelId: string;
    messageId: string;
    chunk: string;
    done: boolean;
  }) => void;
  "agent:response": (message: Message) => void;
  "agent:tool_use": (data: {
    agentId: string;
    channelId: string;
    messageId: string;
    toolName: string;
    args: Record<string, unknown>;
    result: { success: boolean; text: string; uiComponent?: UIComponent };
  }) => void;
  "agent:error": (data: { agentId: string; channelId: string; error: string }) => void;

  // UI Actions
  "ui:action": (data: {
    messageId: string;
    actionId: string;
    result: unknown;
  }) => void;

  // Workflow
  "workflow:update": (workflow: Workflow) => void;
  "workflow:step_complete": (data: {
    workflowId: string;
    stepIndex: number;
    result: string;
  }) => void;

  // Presence
  "user:online": (userId: string) => void;
  "user:offline": (userId: string) => void;
  "user:typing": (data: { userId: string; channelId: string }) => void;

  // Channel
  "channel:update": (channel: Channel) => void;
}

export interface ClientToServerEvents {
  // Messages
  "message:send": (data: {
    content: string;
    channelId: string;
    parentId?: string;
  }) => void;

  // Channels
  "channel:join": (channelId: string) => void;
  "channel:leave": (channelId: string) => void;

  // Presence
  "user:typing": (channelId: string) => void;

  // UI Actions
  "ui:action": (data: {
    messageId: string;
    actionId: string;
    payload?: Record<string, unknown>;
  }) => void;

  // Workflow
  "workflow:start": (workflowId: string) => void;
  "workflow:pause": (workflowId: string) => void;
  "workflow:resume": (workflowId: string) => void;
  "workflow:approve_step": (data: {
    workflowId: string;
    stepIndex: number;
    approved: boolean;
  }) => void;
}

// ============================================================
// API Request/Response Types
// ============================================================

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface CreateChannelRequest {
  name: string;
  description?: string;
  type: "public" | "private";
}

export interface CreateAgentRequest {
  name: string;
  role: AgentRole;
  avatar?: string;
  description: string;
  systemPrompt?: string;
  model?: string;
  provider?: "anthropic" | "openai" | "gemini" | "custom";
  thinkingLevel?: ThinkingLevel;
  capabilities?: string[];
  tools?: ToolDefinition[];
}

export interface CreateWorkflowRequest {
  name: string;
  description?: string;
  channelId: string;
  steps: Omit<WorkflowStep, "id" | "status" | "result">[];
}

export interface PaginationParams {
  page?: number;
  limit?: number;
  cursor?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}
