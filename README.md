# claude-code-vcr

`claude-code-vcr` is a local-only MCP server for querying and replaying past Claude Code sessions from inside a current Claude Code session.

It reads Claude Code's existing JSONL logs from `~/.claude/projects/**/<uuid>.jsonl`. It does not record new data, run a daemon, write to session logs, or send telemetry.

## Why

Claude Code already records session history locally. `claude-code-vcr` makes that history queryable through MCP, so you can ask Claude to list, replay, search, and compare previous work without leaving the chat.

## Install

From GitHub:

```bash
npm install -g github:PaoloJN/claude-code-vcr
```

From npm after npm publish:

```bash
npm install -g claude-code-vcr
```

For local development from this repo:

```bash
npm install
npm run build
npm install -g .
```

## MCP Config

Add this to a project's `.mcp.json` after global install:

```json
{
  "mcpServers": {
    "claude-code-vcr": {
      "command": "claude-code-vcr"
    }
  }
}
```

For local development without global install, point Claude Code at the built file:

```json
{
  "mcpServers": {
    "claude-code-vcr": {
      "command": "node",
      "args": ["/path/to/claude-code-vcr/dist/index.js"]
    }
  }
}
```

## Tools

- `list_recent_sessions`: returns recent sessions with UUID, project, timestamps, first user prompt, turn count, and tool-call summary.
- `replay_session`: returns structured user/assistant turns and tool calls for one session UUID.
- `search_sessions`: searches prompts, assistant text, tool names, and tool inputs.
- `diff_sessions`: compares two sessions by first prompt, assistant text, turn count, and tool names.
- `regression_check`: summarizes reference session shapes next to a `CLAUDE.md` hash for read-only regression review.

All tools accept an optional `root` argument for tests or custom Claude Code log roots. By default, `claude-code-vcr` reads `~/.claude/projects` and skips project paths/files with a `personal` path token.

## Safety Model

- Local-only: no hosted service, network calls, analytics, or telemetry.
- Read-only: session JSONL files are opened for reading and never modified.
- No daemon: the process runs only when invoked by an MCP client.
- Personal-path guard: broad scans skip paths/files with a `personal` token by default.

## Example Prompts

Ask Claude:

```text
Use claude-code-vcr to list my 5 most recent sessions in this project.
```

```text
Use claude-code-vcr to replay session <uuid> and summarize the tool calls.
```

```text
Use claude-code-vcr to search sessions from the last 7 days for "regression_check".
```

```text
Use claude-code-vcr to diff sessions <uuid-a> and <uuid-b>.
```

## Development

```bash
npm test
npm run typecheck
npm run build
```

To smoke-test the binary's registered tool list:

```bash
npx tsx src/index.ts --tools
```
