import { readFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import type { ClaudeContentBlock, ClaudeJsonlRecord, Session, SessionRole, ToolCall, Turn } from "../types.js";

export async function parseSessionFile(path: string): Promise<Session> {
  const raw = await readFile(path, "utf8");
  const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const records = lines.map((line, index) => parseLine(line, index + 1, path));
  const turns = records.flatMap((record) => recordToTurn(record));
  const toolCalls = turns.flatMap((turn) => turn.toolCalls);
  const timestamps = records
    .map((record) => record.timestamp)
    .filter((timestamp): timestamp is string => Boolean(timestamp))
    .sort();

  return {
    uuid: records.find((record) => record.sessionId)?.sessionId ?? basename(path, ".jsonl"),
    project: basename(dirname(path)),
    path,
    cwd: records.find((record) => record.cwd)?.cwd,
    startedAt: timestamps[0],
    updatedAt: timestamps.at(-1),
    firstUserPrompt: turns.find((turn) => turn.role === "user" && turn.text.trim().length > 0)?.text,
    recordCount: records.length,
    turns,
    toolCalls,
  };
}

function parseLine(line: string, lineNumber: number, path: string): ClaudeJsonlRecord {
  try {
    return JSON.parse(line) as ClaudeJsonlRecord;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON on line ${lineNumber} of ${path}: ${message}`);
  }
}

function recordToTurn(record: ClaudeJsonlRecord): Turn[] {
  const role = normalizeRole(record.type, record.message?.role);
  if (!role) return [];

  const blocks = normalizeContent(record.message?.content);
  const toolCalls = blocks
    .filter((block) => block.type === "tool_use" && typeof block.name === "string")
    .map((block) => ({
      id: block.id,
      name: block.name as string,
      input: block.input,
      turnUuid: record.uuid,
      timestamp: record.timestamp,
    }));

  return [
    {
      uuid: record.uuid,
      role,
      text: blocks.map(blockToText).filter(Boolean).join("\n"),
      timestamp: record.timestamp,
      toolCalls,
    },
  ];
}

function normalizeRole(type?: string, messageRole?: string): SessionRole | undefined {
  const role = messageRole ?? type;
  return role === "user" || role === "assistant" ? role : undefined;
}

function normalizeContent(content: string | ClaudeContentBlock[] | undefined): ClaudeContentBlock[] {
  if (!content) return [];
  if (typeof content === "string") return [{ type: "text", text: content }];
  return content;
}

function blockToText(block: ClaudeContentBlock): string {
  if (block.type === "text" && typeof block.text === "string") return block.text;
  if (block.type === "tool_result") return stringifyToolResult(block.content);
  return "";
}

function stringifyToolResult(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => (typeof item === "object" && item && "text" in item ? String(item.text) : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}
