#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  diffSessions,
  listRecentSessions,
  regressionCheck,
  replaySession,
  searchSessions,
  TOOL_NAMES,
} from "./tools/sessionTools.js";

export function createServer() {
  const server = new McpServer({
    name: "claude-code-vcr",
    version: "0.2.0",
  });

  server.registerTool(
    "diff_sessions",
    {
      description: "Compare two Claude Code sessions by prompt, assistant text, and tool-call shape.",
      inputSchema: {
        root: z.string().optional(),
        uuidA: z.string(),
        uuidB: z.string(),
      },
    },
    async (args) => jsonResult(await diffSessions(args)),
  );

  server.registerTool(
    "list_recent_sessions",
    {
      description: "List recent local Claude Code sessions with first prompt, turn count, and tool-call summary.",
      inputSchema: {
        root: z.string().optional(),
        n: z.number().int().positive().max(100).optional(),
        project: z.string().optional(),
      },
    },
    async (args) => jsonResult(await listRecentSessions(args)),
  );

  server.registerTool(
    "regression_check",
    {
      description: "Summarize reference session shapes for checking behavior after a CLAUDE.md change.",
      inputSchema: {
        root: z.string().optional(),
        claudeMdPath: z.string(),
        refUuids: z.array(z.string()).min(1),
      },
    },
    async (args) => jsonResult(await regressionCheck(args)),
  );

  server.registerTool(
    "replay_session",
    {
      description: "Replay one Claude Code session as structured user/assistant turns and tool calls.",
      inputSchema: {
        root: z.string().optional(),
        uuid: z.string(),
      },
    },
    async (args) => jsonResult(await replaySession(args)),
  );

  server.registerTool(
    "search_sessions",
    {
      description: "Search local Claude Code sessions by prompt, assistant text, tool name, or tool input.",
      inputSchema: {
        root: z.string().optional(),
        query: z.string(),
        lastNDays: z.number().int().positive().optional(),
        project: z.string().optional(),
      },
    },
    async (args) => jsonResult(await searchSessions(args)),
  );

  return server;
}

function jsonResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

async function main() {
  if (process.argv.includes("--tools")) {
    console.log(TOOL_NAMES.join("\n"));
    return;
  }

  const command = process.argv[2];
  if (command && command !== "mcp") {
    await runCli(process.argv.slice(2));
    return;
  }

  const server = createServer();
  await server.connect(new StdioServerTransport());
}

async function runCli(argv: string[]) {
  const [command, ...rest] = argv;
  const { positional, options } = parseArgs(rest);
  const root = options.root;

  if (command === "list") {
    const result = await listRecentSessions({
      root,
      n: options.limit ? Number(options.limit) : options.n ? Number(options.n) : 10,
      project: options.project,
    });
    printSessionSummaries(result.sessions);
    return;
  }

  if (command === "search") {
    const query = positional.join(" ").trim();
    if (!query) throw new Error("Usage: claude-code-vcr search <query> [--root <path>]");
    const result = await searchSessions({
      root,
      query,
      lastNDays: options.days ? Number(options.days) : undefined,
      project: options.project,
    });
    console.log(`Found ${result.sessions.length} ${result.sessions.length === 1 ? "session" : "sessions"} for "${query}"`);
    printSessionSummaries(result.sessions);
    return;
  }

  if (command === "replay") {
    const uuid = positional[0];
    if (!uuid) throw new Error("Usage: claude-code-vcr replay <uuid> [--root <path>]");
    const result = await replaySession({ root, uuid });
    console.log(`Session ${result.session.uuid}`);
    for (const turn of result.session.turns) {
      console.log(`\n${turn.role.toUpperCase()}`);
      if (turn.text) console.log(indent(turn.text));
      for (const call of turn.toolCalls) console.log(indent(`Tool: ${call.name}`));
    }
    return;
  }

  if (command === "diff") {
    const [uuidA, uuidB] = positional;
    if (!uuidA || !uuidB) throw new Error("Usage: claude-code-vcr diff <uuid-a> <uuid-b> [--root <path>]");
    const result = await diffSessions({ root, uuidA, uuidB });
    console.log(`${result.a.uuid} -> ${result.b.uuid}`);
    console.log(`Same first prompt: ${result.sameFirstPrompt ? "yes" : "no"}`);
    console.log(`Assistant text changed: ${result.assistantTextChanged ? "yes" : "no"}`);
    console.log(`Turn count delta: ${result.turnCountDelta}`);
    console.log(`Tools only in ${result.a.uuid}: ${result.toolCalls.onlyA.join(", ") || "none"}`);
    console.log(`Tools only in ${result.b.uuid}: ${result.toolCalls.onlyB.join(", ") || "none"}`);
    console.log(`Shared tools: ${result.toolCalls.shared.join(", ") || "none"}`);
    return;
  }

  if (command === "help" || command === "-h" || command === "--help") {
    printHelp();
    return;
  }

  throw new Error(`Unknown command "${command}". Run "claude-code-vcr help".`);
}

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const options: Record<string, string | undefined> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      options[key] = "true";
      continue;
    }
    options[key] = next;
    index += 1;
  }

  return { positional, options };
}

function printSessionSummaries(sessions: Array<Awaited<ReturnType<typeof listRecentSessions>>["sessions"][number]>) {
  if (sessions.length === 0) {
    console.log("No sessions found.");
    return;
  }

  for (const session of sessions) {
    const tools = session.toolCallSummary.map((tool) => `${tool.name} x${tool.count}`).join(", ") || "no tools";
    console.log(`${session.uuid}  ${session.project}  ${session.turnCount} turns  ${tools}`);
    if (session.firstUserPrompt) console.log(indent(truncate(session.firstUserPrompt, 96)));
  }
}

function printHelp() {
  console.log(`claude-code-vcr

Usage:
  claude-code-vcr                 Start the MCP stdio server
  claude-code-vcr list [--root <path>] [--limit <n>]
  claude-code-vcr search <query> [--root <path>] [--days <n>]
  claude-code-vcr replay <uuid> [--root <path>]
  claude-code-vcr diff <uuid-a> <uuid-b> [--root <path>]
  claude-code-vcr --tools`);
}

function indent(value: string) {
  return value
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}

function truncate(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}...`;
}

if (isEntrypoint()) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

function isEntrypoint() {
  if (!process.argv[1]) return false;
  return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
}
