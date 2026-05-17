import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { readdir, readFile, stat } from "node:fs/promises";
import { parseSessionFile } from "../lib/jsonl.js";
import type { Session, SessionSummary } from "../types.js";

export const TOOL_NAMES = [
  "diff_sessions",
  "list_recent_sessions",
  "regression_check",
  "replay_session",
  "search_sessions",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

type RootArgs = {
  root?: string;
};

export async function listRecentSessions(args: RootArgs & { n?: number; project?: string }) {
  const sessions = await loadSessions(args.root, args.project);
  const limit = args.n ?? 10;

  return {
    root: resolveRoot(args.root),
    sessions: sessions
      .sort((a, b) => compareDesc(a.updatedAt ?? a.startedAt, b.updatedAt ?? b.startedAt))
      .slice(0, limit)
      .map(toSummary),
  };
}

export async function replaySession(args: RootArgs & { uuid: string }) {
  const session = await findSessionByUuid(args.root, args.uuid);
  return { session };
}

export async function searchSessions(args: RootArgs & { query: string; lastNDays?: number; project?: string }) {
  const query = args.query.trim().toLowerCase();
  if (!query) return { root: resolveRoot(args.root), sessions: [] };

  const cutoff = args.lastNDays ? Date.now() - args.lastNDays * 24 * 60 * 60 * 1000 : undefined;
  const sessions = await loadSessions(args.root, args.project);

  return {
    root: resolveRoot(args.root),
    query: args.query,
    sessions: sessions
      .filter((session) => {
        if (cutoff && session.updatedAt && Date.parse(session.updatedAt) < cutoff) return false;
        return searchableText(session).includes(query);
      })
      .sort((a, b) => compareDesc(a.updatedAt ?? a.startedAt, b.updatedAt ?? b.startedAt))
      .map(toSummary),
  };
}

export async function diffSessions(args: RootArgs & { uuidA: string; uuidB: string }) {
  const [sessionA, sessionB] = await Promise.all([
    findSessionByUuid(args.root, args.uuidA),
    findSessionByUuid(args.root, args.uuidB),
  ]);
  const toolsA = uniqueToolNames(sessionA);
  const toolsB = uniqueToolNames(sessionB);

  return {
    a: toSummary(sessionA),
    b: toSummary(sessionB),
    sameFirstPrompt: normalize(sessionA.firstUserPrompt) === normalize(sessionB.firstUserPrompt),
    assistantTextChanged: assistantText(sessionA) !== assistantText(sessionB),
    turnCountDelta: sessionB.turns.length - sessionA.turns.length,
    toolCalls: {
      onlyA: toolsA.filter((name) => !toolsB.includes(name)),
      onlyB: toolsB.filter((name) => !toolsA.includes(name)),
      shared: toolsA.filter((name) => toolsB.includes(name)),
    },
  };
}

export async function regressionCheck(args: RootArgs & { claudeMdPath: string; refUuids: string[] }) {
  const claudeMd = await readTextIfExists(args.claudeMdPath);
  const references = await Promise.all(args.refUuids.map((uuid) => findSessionByUuid(args.root, uuid)));

  return {
    claudeMd: {
      path: args.claudeMdPath,
      exists: claudeMd !== undefined,
      sha256: claudeMd ? createHash("sha256").update(claudeMd).digest("hex") : undefined,
      bytes: claudeMd ? Buffer.byteLength(claudeMd) : undefined,
    },
    references: references.map((session) => ({
      uuid: session.uuid,
      firstUserPrompt: session.firstUserPrompt,
      turnCount: session.turns.length,
      assistantTurnCount: session.turns.filter((turn) => turn.role === "assistant").length,
      toolNames: uniqueToolNames(session),
      assistantTextBytes: Buffer.byteLength(assistantText(session)),
    })),
    note:
      "Read-only regression summary. claude-code-vcr reports reference session shape; re-run these prompts in Claude Code to compare live behavior.",
  };
}

export async function loadSessions(root?: string, project?: string): Promise<Session[]> {
  const files = await findSessionFiles(resolveRoot(root));
  const parsed = await Promise.all(files.map((file) => parseSessionFile(file)));
  return project ? parsed.filter((session) => matchesProject(session, project)) : parsed;
}

async function findSessionByUuid(root: string | undefined, uuid: string): Promise<Session> {
  const sessions = await loadSessions(root);
  const session = sessions.find((candidate) => candidate.uuid === uuid || candidate.path.endsWith(`${uuid}.jsonl`));
  if (!session) throw new Error(`Session not found: ${uuid}`);
  return session;
}

async function findSessionFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const rootFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
    .map((entry) => join(root, entry.name));
  const projectDirs = entries.filter((entry) => entry.isDirectory() && !isPersonalPath(entry.name));
  const nested = await Promise.all(
    projectDirs.map(async (entry) => {
      const dir = join(root, entry.name);
      const children = await readdir(dir, { withFileTypes: true });
      return children
        .filter((child) => child.isFile() && child.name.endsWith(".jsonl") && !isPersonalPath(child.name))
        .map((child) => join(dir, child.name));
    }),
  );
  return [...rootFiles.filter((file) => !isPersonalPath(file)), ...nested.flat()];
}

export function resolveRoot(root?: string): string {
  return root ?? join(homedir(), ".claude", "projects");
}

function toSummary(session: Session): SessionSummary {
  return {
    uuid: session.uuid,
    project: session.project,
    path: session.path,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    firstUserPrompt: session.firstUserPrompt,
    turnCount: session.turns.length,
    toolCallSummary: summarizeTools(session),
  };
}

function summarizeTools(session: Session): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const call of session.toolCalls) counts.set(call.name, (counts.get(call.name) ?? 0) + 1);
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => ({ name, count }));
}

function compareDesc(a?: string, b?: string): number {
  return (b ? Date.parse(b) : 0) - (a ? Date.parse(a) : 0);
}

function matchesProject(session: Session, project: string): boolean {
  const normalized = normalize(project);
  return [session.project, session.cwd, session.path].filter(Boolean).some((value) => normalize(value).includes(normalized));
}

function searchableText(session: Session): string {
  return [
    session.firstUserPrompt,
    ...session.turns.map((turn) => turn.text),
    ...session.toolCalls.map((call) => `${call.name} ${JSON.stringify(call.input ?? {})}`),
  ]
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
}

function normalize(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function assistantText(session: Session): string {
  return session.turns
    .filter((turn) => turn.role === "assistant")
    .map((turn) => turn.text)
    .join("\n");
}

function uniqueToolNames(session: Session): string[] {
  return [...new Set(session.toolCalls.map((call) => call.name))].sort();
}

function isPersonalPath(path: string): boolean {
  return path
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .includes("personal");
}

async function readTextIfExists(path: string): Promise<string | undefined> {
  try {
    await stat(path);
    return await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}
