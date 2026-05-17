import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  diffSessions,
  listRecentSessions,
  regressionCheck,
  replaySession,
  searchSessions,
} from "../../src/tools/sessionTools.js";

async function makeProjectRoot() {
  const root = await mkdtemp(join(tmpdir(), "claude-code-vcr-tests-"));
  const projectDir = join(root, "-tmp-claude-code-vcr");
  await mkdir(projectDir, { recursive: true });
  return { root, projectDir };
}

async function writeSession(projectDir: string, name: string, prompt: string, toolName: string, assistant = "Done") {
  const timestamp = name.endsWith("a") ? "2026-05-13T10:00:00.000Z" : "2026-05-14T12:00:00.000Z";
  await writeFile(
    join(projectDir, `${name}.jsonl`),
    [
      JSON.stringify({
        uuid: `${name}-1`,
        sessionId: name,
        type: "user",
        cwd: "/tmp/claude-code-vcr",
        timestamp,
        message: { role: "user", content: [{ type: "text", text: prompt }] },
      }),
      JSON.stringify({
        uuid: `${name}-2`,
        sessionId: name,
        type: "assistant",
        cwd: "/tmp/claude-code-vcr",
        timestamp,
        message: {
          role: "assistant",
          content: [
            { type: "text", text: assistant },
            { type: "tool_use", id: `${name}-tool`, name: toolName, input: { query: prompt } },
          ],
        },
      }),
    ].join("\n"),
  );
}

describe("session tools", () => {
  it("lists recent sessions sorted by timestamp with summaries", async () => {
    const { root, projectDir } = await makeProjectRoot();
    await writeSession(projectDir, "session-a", "First prompt", "Read");
    await writeSession(projectDir, "session-b", "Second prompt", "Glob");

    const result = await listRecentSessions({ root, n: 1 });

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0]).toMatchObject({
      uuid: "session-b",
      project: "-tmp-claude-code-vcr",
      firstUserPrompt: "Second prompt",
      turnCount: 2,
      toolCallSummary: [{ name: "Glob", count: 1 }],
    });
  });

  it("replays a session by uuid", async () => {
    const { root, projectDir } = await makeProjectRoot();
    await writeSession(projectDir, "session-a", "Replay this", "Read");

    const result = await replaySession({ root, uuid: "session-a" });

    expect(result.session.uuid).toBe("session-a");
    expect(result.session.turns.map((turn) => [turn.role, turn.text])).toEqual([
      ["user", "Replay this"],
      ["assistant", "Done"],
    ]);
  });

  it("searches prompts, assistant text, and tool calls", async () => {
    const { root, projectDir } = await makeProjectRoot();
    await writeSession(projectDir, "session-a", "Build parser", "Read");
    await writeSession(projectDir, "session-b", "Ship package", "Glob", "Found jsonl files");

    const promptMatches = await searchSessions({ root, query: "parser" });
    const toolMatches = await searchSessions({ root, query: "glob" });
    const assistantMatches = await searchSessions({ root, query: "jsonl" });

    expect(promptMatches.sessions.map((session) => session.uuid)).toEqual(["session-a"]);
    expect(toolMatches.sessions.map((session) => session.uuid)).toEqual(["session-b"]);
    expect(assistantMatches.sessions.map((session) => session.uuid)).toEqual(["session-b"]);
  });

  it("skips personal-looking project paths by default", async () => {
    const { root } = await makeProjectRoot();
    const personalDir = join(root, "-Users-paolo-Personal-journal");
    await mkdir(personalDir, { recursive: true });
    await writeSession(personalDir, "session-personal", "Private prompt", "Read");

    const result = await listRecentSessions({ root, n: 10 });

    expect(result.sessions).toEqual([]);
  });

  it("diffs two sessions by prompts, assistant text, and tools", async () => {
    const { root, projectDir } = await makeProjectRoot();
    await writeSession(projectDir, "session-a", "Same prompt", "Read", "Old answer");
    await writeSession(projectDir, "session-b", "Same prompt", "Glob", "New answer");

    const result = await diffSessions({ root, uuidA: "session-a", uuidB: "session-b" });

    expect(result.sameFirstPrompt).toBe(true);
    expect(result.toolCalls).toEqual({
      onlyA: ["Read"],
      onlyB: ["Glob"],
      shared: [],
    });
    expect(result.assistantTextChanged).toBe(true);
  });

  it("summarizes reference sessions for regression checks without mutating logs", async () => {
    const { root, projectDir } = await makeProjectRoot();
    const claudeMd = join(projectDir, "CLAUDE.md");
    await writeFile(claudeMd, "# Rules\nUse tests.\n");
    await writeSession(projectDir, "session-a", "Run the reference flow", "Read");

    const result = await regressionCheck({ root, claudeMdPath: claudeMd, refUuids: ["session-a"] });

    expect(result.claudeMd.exists).toBe(true);
    expect(result.references).toEqual([
      expect.objectContaining({
        uuid: "session-a",
        firstUserPrompt: "Run the reference flow",
        turnCount: 2,
        toolNames: ["Read"],
      }),
    ]);
    expect(result.note).toMatch(/read-only/i);
  });
});
