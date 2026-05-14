# agent-vcr — v0 build playbook

Self-contained brief. Conductor's agent reads this file at the repo root; Paolo reads it to track what the agent should produce. Date: 2026-05-13.

---

## What you're building

**agent-vcr** — an MCP server in TypeScript that exposes structured query tools for past Claude Code sessions, callable from any current CC session.

The product is the conversational eval flow, not a dashboard. Paolo asks Claude inside his normal workflow: *"replay my last 5 skill runs and tell me what regressed since I edited CLAUDE.md last Tuesday"* — Claude calls agent-vcr's tools, answers in the same chat.

## The wedge

Every existing eval-for-AI tool (Braintrust, Langfuse, Phoenix, MLflow, Anthropic Console) is a SaaS dashboard you leave Claude Code to use. **agent-vcr is MCP-native — you never leave Claude Code to evaluate your Claude Code work.**

Discovery + competitive check done upstream by Paolo's idea-scout (`~/Vault-2.0/inbox/idea-scout.md` shortlist #1). You are not asked to validate the idea. You are asked to ship v0.

## Tech direction (open to reframe in /office-hours)

- **Language:** TypeScript
- **MCP SDK:** `@modelcontextprotocol/sdk` (Node)
- **Recording layer:** none. Claude Code already records every session to `~/.claude/projects/<encoded-path>/<uuid>.jsonl`. agent-vcr reads those files directly. **Do NOT add MLflow or any new recording mechanism.** The scout entry suggested wrapping MLflow; that was wrong — the recording is already done.
- **Distribution:** bare npm package v0. Anthropic plugin marketplace submission deferred to v1 once tools feel good.
- **License:** MIT
- **Storage:** local-only. No hosted variant in v0.

## Day 1-3 tool surface

| Order | Tool | Returns |
|---|---|---|
| Day 1 | `list_recent_sessions(n?, project?)` | UUID, timestamp, first user prompt, turn count, tool-call summary |
| Day 1 | `replay_session(uuid)` | Structured turns: user prompts + assistant text + tool calls. Filter/summarize for context-fit. |
| Day 2 | `search_sessions(query, last_n_days?)` | Sessions where query matches user prompt OR tool call OR decision keyword |
| Day 2 | `diff_sessions(uuid_a, uuid_b)` | Side-by-side: same prompt input, what changed in response/tools |
| Day 3 | `regression_check(claude_md_path, ref_uuids[])` | Given a CLAUDE.md change, do the ref sessions still produce the same shape? |

**Day 1 ships ~150-300 LOC.** Don't over-engineer the structured-turn output — start with raw passthrough + per-tool dedup, refine in v2 based on actual use.

## Execution — the gstack sprint

### Step 1 — Install gstack (user-level, NOT --team mode)

Run this command:

```bash
git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack && cd ~/.claude/skills/gstack && ./setup
```

This installs gstack's 23 specialists + 8 power tools at user level. Do NOT run `./setup --team` — Paolo does not want gstack vendored into this project's `.claude/` yet. Decide on team-mode after the v0 verdict.

### Step 2 — Add a gstack section to this project's CLAUDE.md (when one exists)

After `/office-hours` writes CLAUDE.md, append:

```
## gstack
This project uses gstack skills. For all web browsing, use /browse from gstack — never use mcp__claude-in-chrome__* tools directly.

Available skills: /office-hours, /plan-ceo-review, /plan-eng-review, /plan-design-review, /design-consultation, /design-shotgun, /design-html, /review, /ship, /land-and-deploy, /canary, /benchmark, /browse, /connect-chrome, /qa, /qa-only, /design-review, /setup-browser-cookies, /setup-deploy, /setup-gbrain, /retro, /investigate, /document-release, /codex, /cso, /autoplan, /plan-devex-review, /devex-review, /careful, /freeze, /guard, /unfreeze, /gstack-upgrade, /learn
```

### Step 3 — Run /office-hours with this seed

Paste this as your first turn after gstack is installed:

> I want to build agent-vcr — an MCP server in TypeScript that lets me query and replay my past Claude Code sessions from inside any current Claude Code session.
>
> The wedge: every existing eval tool (Braintrust, Langfuse, Phoenix, MLflow, Anthropic Console) is a SaaS dashboard you leave CC to use. agent-vcr is MCP-native — you ask Claude inside your normal session "replay my last 5 skill runs and tell me what regressed since I edited CLAUDE.md last Tuesday," and Claude calls agent-vcr's tools and answers in the same chat.
>
> Tech direction (open to reframe): TypeScript with `@modelcontextprotocol/sdk`, reads existing `~/.claude/projects/<encoded>/<uuid>.jsonl` files directly (no new recording layer — CC already records to disk). MCP server distributed via npm v0, Anthropic plugin marketplace v1.
>
> Day-1 tools to ship: `list_recent_sessions(n=10)` + `replay_session(uuid)`. Day-2 adds `search_sessions` + `diff_sessions`. Day-3 adds `regression_check(claude_md_path, ref_uuids)`.
>
> The competitive discovery is done — Paolo's idea-scout did the research (entry at `~/Vault-2.0/inbox/idea-scout.md` shortlist #1). What I'm asking gstack for is the BUILD execution, not validation of the idea.
>
> /office-hours

**Listen to the pushback.** `/office-hours` will probably reframe at least one thing. Expected reframe: "MCP server" → "MCP server + CLI" because the agent-driven flow doesn't cover the "I just edited my skill, run a regression check before I commit" loop which benefits from a one-shot CLI invocation. If `/office-hours` proposes a reframe that contradicts the brief above, **prefer `/office-hours`'s judgment** — that's the whole point of running the sprint.

### Step 4 — Continue the sprint

Follow gstack's flow in order:
1. `/office-hours` → produces design doc
2. `/plan-ceo-review` → scope challenge, 4 modes (Expansion / Selective / Hold / Reduction)
3. `/plan-eng-review` → architecture, data flow, error paths, test plan
4. (skip `/plan-design-review` — this is a CLI/MCP tool, no UI surface)
5. Implement Day-1 surface (`list_recent_sessions` + `replay_session`)
6. `/review` → catch bugs that CI would miss; auto-fix the obvious
7. `/qa` → if there's a runnable surface (CLI invocation or test harness), exercise it
8. `/ship` → tests, audit coverage, push, open PR

### Step 5 — Hand back to Paolo

When the v0 PR is open:
- Comment "v0 PR ready" in the Conductor task
- Do NOT merge. Paolo reviews, runs the agent-vcr binary against his own session log (Vault-2.0 sessions are at `~/.claude/projects/-Users-paolonessim-Vault-2-0/`), and decides whether to merge as-is or request revisions.

## Constraints (hard rules from Paolo's wiki)

These are non-negotiable. They're enforced upstream by Paolo's `[[framework-lock-in-stance]]` + `[[self-surveillance-trap]]` + `[[ai-os-paradigm]]`:

1. **Local-only storage v0.** No hosted variant. No telemetry. No "phone home." Recordings stay on the user's machine.
2. **Do not parse JSONL for any "Personal" content** — see `[[self-surveillance-trap]]`'s don't-ingest list. The MCP server is for operational/work session content (project work, code, decisions), not for any session that touched private chat content.
3. **No MLflow.** No heavy dependencies. The Bitter Lesson posture: thin layer over first-party Claude Code outputs.
4. **No new daemon.** The MCP server runs only when Claude Code invokes it. No always-on process.
5. **Read-only by default.** agent-vcr does not modify `.jsonl` files. Ever. Records are immutable historical artifacts.
6. **MIT license.** Open source from Day 1.

## Acceptance — how Paolo will know v0 works

- [ ] `npm install -g agent-vcr` works (or `npx agent-vcr` if global install isn't ready)
- [ ] An MCP server config that Claude Code recognizes (test by adding to `.mcp.json` in any project)
- [ ] In a fresh CC session, asking "use agent-vcr to list my 5 most recent sessions in this project" returns structured results
- [ ] In the same session, "use agent-vcr to replay session <uuid>" returns the turns of that session in a readable structure
- [ ] README with: install command, MCP config snippet, example "ask Claude this" prompts
- [ ] PR opens against `main`, all tests pass, gstack `/review` issued a clean report

## What you (the agent) should NOT do

- Do NOT submit to Anthropic's plugin marketplace from this session. That's a Paolo decision after he uses v0 for a few days.
- Do NOT add any analytics, telemetry, or "usage tracking."
- Do NOT vendor gstack into this project's `.claude/` (no `./setup --team`).
- Do NOT propose a SaaS dashboard, web UI, or any user-facing surface beyond the MCP tool exposures.
- Do NOT touch `~/.claude/projects/<encoded-path>/` files for writing — read-only.

---

## For Paolo — evaluation criteria (you score gstack + Conductor after Day 3)

Two variables in play. Isolate them.

### gstack scorecard

| Criterion | Hand-rolled workflow | gstack |
|---|---|---|
| Did `/office-hours` produce a sharper brief than "write CLAUDE.md + go"? | You'd hand-write or use `brainstorming` skill | Should push back, extract capabilities, name premises |
| Did `/plan-eng-review` catch architectural decisions you'd have missed? | You'd build, hit bug, refactor | Should catch race conditions / state-machine gaps / failure modes pre-code |
| Did `/ship` deliver a cleaner PR (tests, coverage, doc) than you'd manually produce? | Manual commits, sometimes skip tests for spike code | Auto-generates test coverage; bootstraps test framework |

**Win condition:** 2 of 3. Below that → kill or partial-adopt.

### Conductor scorecard (separate from gstack)

| Criterion | `/proj-feature` worktree flow | Conductor |
|---|---|---|
| Worktree creation + named branch + first-turn seeding | Same outcome via your skill | Same outcome via UI |
| Ability to *watch* the agent work without taking over the pane | You'd have to switch into the cmux pane | UI shows progress + logs without context switch |
| Ability to spawn parallel agents on different parts of the same project | Multiple `/proj-feature` calls produce multiple worktrees | Conductor designed for this |

**Win condition:** clearly faster, less context-switching, or enables parallel agents you wouldn't have spawned otherwise. If Conductor offers no clear improvement over `/proj-feature` for solo work, file as "use for multi-agent only" or kill.

### After verdict

Drop into `main` lane and write:
- **If gstack stays:** file `wiki/pages/gstack.md` as a Concept page (Tier-2 by `[[framework-lock-in-stance]]`); update `wiki/pages/everything-claude-code.md` with peer-comparison note.
- **If Conductor stays:** file as Entity page or update `wiki/pages/multi-agent-orchestration-landscape.md` with Conductor's tier classification.
- **If either kills:** still write a short "tried it, here's why I didn't keep it" note — high-signal data for `feedback_redirect_to_shipping.md` future application.

---

**Reference back to Paolo's vault:**
- `[[life-os-architecture-decision]]` — Path B framing (Claude Code + Agent SDK foundation)
- `[[framework-lock-in-stance]]` — Tier classification for gstack/Conductor verdicts
- `[[multi-agent-orchestration-landscape]]` — where Conductor's verdict gets filed
- `[[everything-claude-code]]` — Affaan Mustafa's peer to gstack
- `~/Vault-2.0/inbox/idea-scout.md` shortlist #1 — the discovery work this build executes against
- `~/Vault-2.0/raw/inbox/2026-05-12-gstack.md` — gstack source capture
