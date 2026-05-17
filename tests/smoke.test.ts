import { execFile } from "node:child_process";
import { mkdtemp, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const fixtureRoot = "demo/sessions";

describe("binary smoke", () => {
  it("prints all MCP tool names", async () => {
    const result = await execFileAsync("npx", ["tsx", "src/index.ts", "--tools"]);

    expect(result.stdout.trim().split("\n")).toEqual([
      "diff_sessions",
      "list_recent_sessions",
      "regression_check",
      "replay_session",
      "search_sessions",
    ]);
  });

  it("runs when invoked through an npm-style symlink", async () => {
    const dir = await mkdtemp(join(tmpdir(), "claude-code-vcr-bin-"));
    const bin = join(dir, "claude-code-vcr");
    await symlink(resolve("src/index.ts"), bin);

    const result = await execFileAsync("npx", ["tsx", bin, "--tools"]);

    expect(result.stdout.trim().split("\n")).toContain("list_recent_sessions");
  });

  it("lists sessions from the CLI", async () => {
    const result = await execFileAsync("npx", ["tsx", "src/index.ts", "list", "--root", fixtureRoot]);

    expect(result.stdout).toContain("session-alpha");
    expect(result.stdout).toContain("Build list_recent_sessions for claude-code-vcr");
  });

  it("searches sessions from the CLI", async () => {
    const result = await execFileAsync("npx", ["tsx", "src/index.ts", "search", "Glob", "--root", fixtureRoot]);

    expect(result.stdout).toContain("Found 2 sessions");
    expect(result.stdout).toContain("session-alpha");
  });

  it("replays sessions from the CLI", async () => {
    const result = await execFileAsync("npx", ["tsx", "src/index.ts", "replay", "session-alpha", "--root", fixtureRoot]);

    expect(result.stdout).toContain("USER");
    expect(result.stdout).toContain("ASSISTANT");
    expect(result.stdout).toContain("Tool: Glob");
  });
});
