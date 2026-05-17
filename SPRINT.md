# claude-code-vcr — parallel sprint playbook

Supersedes the sequential Day-1/2/3 framing in `BUILD.md`. Same product, same constraints, same acceptance — different execution shape. We fan out across worktrees + agents instead of stepping through days.

**Premise:** the 5 tools are mostly independent reads over JSONL. After the foundation lands, each tool is a separate worktree, run by a separate agent (Claude Code or Codex), merging back when green. Wall-clock for v0: ~60–90 min if all agents behave; ~3 h with one or two course-corrections.

---

## Topology

```
                ┌─────────────────────────────┐
                │  Track 0 — Foundation       │  [CLAUDE / 10 min compute]
                │  MCP scaffold + JSONL       │  Must land OR stub before fan-out.
                │  reader + shared types      │
                └──────────────┬──────────────┘
                               │ merge to main
        ┌──────────┬───────────┼───────────┬──────────┐
        ▼          ▼           ▼           ▼          ▼
   Track A     Track B     Track C     Track D     Track E
   list_      replay_     search_     diff_       regression_
   recent_    session     sessions    sessions    check
   sessions
   [CODEX]    [CODEX]     [CODEX]     [CODEX]     [CLAUDE]     ← all parallel
   ~8 min     ~12 min     ~15 min     ~10 min     ~25 min        compute each
        │          │           │           │          │
        └──────────┴───────────┼───────────┴──────────┘
                               │ all merge to main when green
                               ▼
                ┌─────────────────────────────┐
                │  Track Z — Integration      │  [CLAUDE / 15 min compute]
                │  README + .mcp.json + smoke │
                │  test + /review + /qa       │
                └──────────────┬──────────────┘
                               │
                               ▼
                          /ship → PR
                          [PAOLO / 2 min to review]
```

Total: ~85 min AI compute (mostly overlapping → ~30–40 min wall-clock), 2–10 min Paolo wall-clock for nudges and the final review.

---

## Track 0 — Foundation (must land first)

**Who:** Claude Code, main repo, no worktree (this IS the seed commit).
**Goal:** ship the scaffold + the one shared module everyone else depends on.

Deliverables:
- `package.json` with `@modelcontextprotocol/sdk`, `typescript`, `tsx`, `vitest`, `zod`, `bin` entry for `claude-code-vcr`.
- `tsconfig.json` (strict, ES2022, Node module resolution).
- `src/index.ts` — MCP server bootstrap exposing **zero** tools (each tool track adds itself).
- `src/lib/jsonl.ts` — read + parse `~/.claude/projects/<encoded-path>/<uuid>.jsonl`. Returns a stream of typed records. **No tool logic here.** Just I/O + parsing + the `SessionRecord` type.
- `src/types.ts` — shared types: `Session`, `Turn`, `ToolCall`, `SessionSummary`.
- `tests/lib/jsonl.test.ts` — read a fixture file, assert turn count + role split.
- `tests/fixtures/sample-session.jsonl` — 10–20 lines of real-ish data (anonymized).

**Gate to fan-out:** `npm test` green on this track. After that, branch out.

**Why this is sequential, not parallel:** every tool calls `parseSession(uuid)`. If 5 worktrees independently invent their own parser, the merges become rewrite-fests. One parser, owned by Track 0.

---

## Tracks A–E — Tool worktrees (parallel)

Each worktree = one branch, one tool, one agent, one PR. Branch names: `feat/list-recent`, `feat/replay`, `feat/search`, `feat/diff`, `feat/regression`.

For each, the agent does:
1. Read `BUILD.md` Day-1-to-3 row for its tool.
2. Read `src/lib/jsonl.ts` + `src/types.ts`.
3. Add `src/tools/<tool-name>.ts` exporting an MCP tool definition + handler.
4. Register the tool in `src/index.ts` (last-write-wins on this file is the only merge conflict zone — keep registrations alphabetical so conflicts are mechanical).
5. Add `tests/tools/<tool-name>.test.ts` against the fixture.
6. Open PR back to `main`.

### Track assignments (Claude vs Codex)

| Track | Tool | Agent | Why |
|---|---|---|---|
| A | `list_recent_sessions` | **Codex** | Pure transform: stat dir → sort → format. Codex strong on terse spec → terse code. |
| B | `replay_session` | **Codex** | Pure transform over one file. |
| C | `search_sessions` | **Codex** | String matching + scoring; well-specced. |
| D | `diff_sessions` | **Codex** | Two-file diff; mechanical. |
| E | `regression_check` | **Claude Code** | Needs judgment — "does the shape match" is fuzzy. Also touches CLAUDE.md interpretation. |

If you only have 3 Codex slots, run A+B+C on Codex and merge D into the Claude session that's doing E.

### Conflict zone — `src/index.ts`

The one shared file is the tool registry. Tell each agent:

> When you register your tool in `src/index.ts`, add the import + the `server.tool(...)` call alphabetically by tool name. If `src/index.ts` changed since you branched, rebase and re-insert your line — do not auto-resolve with a merge tool.

Five mechanical insertions in one file. ~10 second rebase each.

---

## Track Z — Integration

**Who:** Claude Code, main repo, after all tool PRs are merged.

Deliverables:
- `README.md`: install (`npm i -g claude-code-vcr`), MCP config snippet, 3 example "ask Claude this" prompts.
- `.mcp.json.example` so users can copy into their projects.
- Smoke test: spin the binary, send `tools/list`, assert all 5 names present.
- Run `/review` on the full diff — auto-fix the obvious.
- Run `/qa` — exercise each tool against the fixture session.
- `/ship` — open PR.

---

## gstack touchpoints

You said "try everything in the gstack." Map of where each gstack skill enters:

| gstack skill | When | Where |
|---|---|---|
| `/office-hours` | Before Track 0 starts | Main Claude session (writes design doc + CLAUDE.md) |
| `/plan-ceo-review` | After office-hours | Same session — scope-challenge the 5 tools (drop one? defer one?) |
| `/plan-eng-review` | Before fan-out | Same session — architectural review of Track 0 shape |
| `/plan-devex-review` | After eng-review | Quick — does the dev loop suck? Fix before fan-out |
| `/careful` or `/guard` | Per worktree | If a tool track has tricky logic, prefix with `/careful` |
| `/codex` | Per Codex worktree | gstack has a `/codex` integration — use it instead of raw codex CLI if it routes the prompt better |
| `/review` | Per merge | On each tool PR before integrating |
| `/qa` | Track Z | Once at end against integrated binary |
| `/qa-only` | Per worktree | If the tool agent skipped tests, run `/qa-only` to backfill |
| `/ship` | Track Z | Final PR open |
| `/retro` | After PR is reviewed | Honest postmortem — feeds the gstack scorecard in BUILD.md |
| `/learn` | After `/retro` | gstack's own "what did we just learn" capture |
| `/document-release` | After v0 merges | Auto-generates release notes |

Skip `/plan-design-review` + `/design-*` + `/browse` + `/canary` + `/benchmark` + `/connect-chrome` + `/setup-browser-cookies` + `/setup-deploy` + `/setup-gbrain` — no UI, no browser, no hosted deploy in v0.

`/freeze` / `/unfreeze` / `/cso` / `/autoplan` / `/investigate` / `/gstack-upgrade` — situational, use only if triggered.

---

## How to launch — exact moves

Order matters here. Each step's tag tells you who owns the wall-clock.

### 1. Install gstack — [PAOLO / 1 min]

```
! git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup
```

Restart CC after install so skills load.

### 2. Open claude-code-vcr in cmux `projects` workspace — [PAOLO / 30 sec]

Use `/proj-open claude-code-vcr`. Or manually: `cmux new-workspace projects-claude-code-vcr --command="cd ~/Projects/claude-code-vcr && claude"`.

### 3. Run gstack planning chain — [CLAUDE / 10 min compute, PAOLO ~3 min nudges]

In the claude-code-vcr main session, paste the `/office-hours` seed from `BUILD.md` lines 67–77. Then in order:
- `/office-hours` → design doc
- `/plan-ceo-review` → scope check
- `/plan-eng-review` → architecture
- `/plan-devex-review` → dev loop

Listen to pushback. If office-hours wants MCP+CLI not MCP-only, take it.

### 4. Track 0 ships — [CLAUDE / 10 min compute]

Same session implements foundation. `npm test` green = gate passed.

### 5. Fan out — [PAOLO / 2 min to spawn]

For each tool track, spawn a worktree:

```
/proj-feature claude-code-vcr list-recent codex
/proj-feature claude-code-vcr replay codex
/proj-feature claude-code-vcr search codex
/proj-feature claude-code-vcr diff codex
/proj-feature claude-code-vcr regression claude
```

(If `/proj-feature` doesn't take a `codex` arg yet, spawn the worktree manually and `codex` into it.)

Each spawned agent gets the same seed:
> Read SPRINT.md and BUILD.md. You own track <X> — tool `<tool-name>`. Implement `src/tools/<tool-name>.ts` + tests, register alphabetically in `src/index.ts`, open PR. Foundation (`src/lib/jsonl.ts`, `src/types.ts`) is already on main. Don't touch other tools' files. Don't add new dependencies. Run `/review` before opening PR.

### 6. Watch the swarm — [PAOLO / 5–15 min wall-clock]

Conductor surface OR `cmux ls` + tab through. Look for:
- Agents fabricating types instead of reading `src/types.ts` → tell them to read it.
- Two agents touching `src/index.ts` non-alphabetically → tell one to rebase.
- Tests passing locally but missing edge cases → not your problem yet; `/review` catches it.

### 7. Merge as PRs go green — [PAOLO / 1 min per merge]

Sequential merges, not parallel, to keep `src/index.ts` rebase mechanical. Order doesn't matter — alphabetize-on-conflict handles it.

### 8. Track Z — [CLAUDE / 15 min compute]

Back in main session. README, MCP config, smoke test, `/review`, `/qa`, `/ship`.

### 9. Verdict — [PAOLO / 10 min wall-clock]

- Install the v0 against your own session log.
- Ask Claude "use claude-code-vcr to list my 5 most recent Vault sessions" in a real session.
- Score the BUILD.md gstack + Conductor scorecards.
- `/retro` + `/learn` in the claude-code-vcr session for gstack's own capture.

---

## Compute / wall-clock budget

| Phase | AI compute | Paolo wall-clock | Latency |
|---|---|---|---|
| Install gstack | — | 1 min | — |
| Open workspace | — | 30 sec | — |
| `/office-hours` chain | 10 min | 3 min | — |
| Track 0 foundation | 10 min | 1 min | — |
| Spawn 5 tracks | — | 2 min | — |
| Tool tracks (parallel) | 25 min real / 70 min summed | 5–15 min watching | — |
| Merge PRs | — | 5 min | — |
| Track Z integration | 15 min | 1 min | — |
| Smoke + verdict | — | 10 min | — |
| **Totals** | **~60 min wall AI / 105 min summed** | **~30 min Paolo** | **0** |

The "summed compute" number matters for cost. The "wall AI" number is what you actually wait. Parallelism saves ~45 min on the build, plus the latency you saved by not spreading across days.

---

## Why this isn't "Day 1 / Day 2 / Day 3"

The original BUILD.md staged tools across days because that's how a solo human ships. With 5 agents + Codex slots open in parallel, the bottleneck stops being capacity and starts being **integration discipline** — Track 0 shape, the alphabetical-registry trick, the rebase rule.

The thing to defend against isn't "do we have time" — it's "do five agents land coherent code on shared files." That's what Track 0 + the conflict-zone rule are for.

---

## Hard constraints (carried from BUILD.md)

Unchanged. Re-read `BUILD.md` lines 99–108 if you forget:

1. Local-only storage. No telemetry.
2. Don't ingest `[[self-surveillance-trap]]` Personal content.
3. No MLflow. Thin layer only.
4. No daemon.
5. Read-only on `.jsonl`.
6. MIT license.

---

## Eval scorecards

BUILD.md has the gstack + Conductor scorecards (lines 134–157). Score after Track Z lands. Add a third row to the gstack card:

| Criterion | Without gstack | gstack |
|---|---|---|
| Did `/plan-devex-review` catch a dev-loop pain point pre-build? | Discovered during build, refactor mid-flight | Caught pre-fan-out, fixed once |

Plus a parallelism-specific row:

| Did the gstack chain produce a brief sharp enough that 5 parallel agents understood their slice without asking? | Brief mostly clear; 1–2 agents ask clarifying questions | Brief tight; agents executed without ping-back |
