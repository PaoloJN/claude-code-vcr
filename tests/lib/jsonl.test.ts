import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseSessionFile } from "../../src/lib/jsonl.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("parseSessionFile", () => {
  it("parses Claude Code JSONL into turns and tool calls", async () => {
    const session = await parseSessionFile(join(__dirname, "../fixtures/sample-session.jsonl"));

    expect(session.uuid).toBe("session-alpha");
    expect(session.recordCount).toBe(5);
    expect(session.turns).toHaveLength(4);
    expect(session.turns.map((turn) => turn.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    expect(session.turns[0]?.text).toBe("Build list_recent_sessions for claude-code-vcr");
    expect(session.toolCalls).toEqual([
      {
        id: "toolu_01",
        name: "Glob",
        input: {
          pattern: "*.jsonl",
          path: "~/.claude/projects",
        },
        turnUuid: "00000000-0000-4000-8000-000000000002",
        timestamp: "2026-05-13T10:00:02.000Z",
      },
    ]);
  });

  it("throws a useful error for malformed JSONL", async () => {
    await expect(parseSessionFile(join(__dirname, "../fixtures/bad-session.jsonl"))).rejects.toThrow(
      /Invalid JSON on line 2/,
    );
  });
});
