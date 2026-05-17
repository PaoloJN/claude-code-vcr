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
    version: "0.1.0",
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

  const server = createServer();
  await server.connect(new StdioServerTransport());
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
