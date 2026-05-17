export type SessionRole = "user" | "assistant";

export type ClaudeContentBlock = {
  type?: string;
  text?: string;
  content?: unknown;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
};

export type ClaudeJsonlRecord = {
  uuid?: string;
  parentUuid?: string | null;
  sessionId?: string;
  type?: string;
  cwd?: string;
  timestamp?: string;
  summary?: string;
  message?: {
    role?: string;
    content?: string | ClaudeContentBlock[];
  };
};

export type ToolCall = {
  id?: string;
  name: string;
  input?: unknown;
  turnUuid?: string;
  timestamp?: string;
};

export type Turn = {
  uuid?: string;
  role: SessionRole;
  text: string;
  timestamp?: string;
  toolCalls: ToolCall[];
};

export type Session = {
  uuid: string;
  project: string;
  path: string;
  cwd?: string;
  startedAt?: string;
  updatedAt?: string;
  firstUserPrompt?: string;
  recordCount: number;
  turns: Turn[];
  toolCalls: ToolCall[];
};

export type SessionSummary = {
  uuid: string;
  project: string;
  path: string;
  startedAt?: string;
  updatedAt?: string;
  firstUserPrompt?: string;
  turnCount: number;
  toolCallSummary: Array<{ name: string; count: number }>;
};
