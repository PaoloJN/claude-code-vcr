import { execFile } from "node:child_process";
import { mkdtemp, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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
});
