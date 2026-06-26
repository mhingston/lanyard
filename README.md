# Lanyard

Lanyard is a one-command bootstrap for AI coding assistants. Run it once in a repository and it configures **GitHub Copilot** (CLI + VS Code) to work with your Atlassian Rovo, Grafana Cloud, and language tooling — and writes the right skills, hooks, and instructions files so every contributor who clones the repo gets the same setup.

## What you get

After `npx lanyard`, your repo has:

- **`.github/mcp.json`** + **`.vscode/mcp.json`** — Atlassian Rovo, Grafana Cloud, and a local `lean-ctx` MCP server
- **`.github/lsp.json`** — language servers for every language Lanyard detects in your repo
- **`.github/copilot-instructions.md`** — an always-on "lazy senior dev" ruleset plus a tool-mapping reference for the lean-ctx context engine
- **`.github/hooks/hooks.json`** — Copilot CLI hooks that compress context on every tool call and capture session events
- **`.github/scripts/regenerate-instructions.mjs`** — the self-learning regenerator that mines captured events and rewrites Copilot's "Learned patterns" between sessions
- **`.github/instructions/*.instructions.md`** — Copilot instruction files scoped to the right paths via the VS Code `applyTo` convention
- **`.github/skills/<name>/`** and **`.github/agents/<name>.agent.md`** — a curated set of agent skills (code review, ticket-to-PR, Jira refinement, etc.) and VS Code custom agents

Everything Lanyard writes is workspace-scoped and committed to your repo — anyone who clones it gets the same assistant setup. Existing MCP, LSP, extension, settings, hooks, and instructions entries are preserved, and timestamped backups are created before any JSON file is overwritten.

## What Lanyard doesn't do

- Doesn't write `AGENTS.md` or `CLAUDE.md` (those are user-owned; Lanyard only touches the Copilot-native files)
- Doesn't install runtime tools (LSPs, lean-ctx, sem, agentrc, `gh`) — it writes the config, you install the binary
- Doesn't merge PRs, commit, push, or modify git history
- Doesn't send telemetry

## Requirements

- **Node.js 18 or newer.**
- **GitHub Copilot CLI** (optional on the runner) — `.github/copilot-instructions.md`, `.github/mcp.json`, `.github/hooks/hooks.json`, etc. are always written so anyone who clones gets the same setup. The post-bootstrap `refactor-instructions` skill run does need `copilot` on PATH and signed in.
- **VS Code** (optional on the runner) — `.vscode/mcp.json`, `.vscode/extensions.json`, `.vscode/settings.json` are always written for the same reason.
- **lean-ctx** (optional, recommended) — install with:
  ```bash
  curl -fsSL https://leanctx.com/install.sh | sh
  ```
  With a JS package manager present, Lanyard offers to install the `lean-ctx-bin` npm wrapper at the end of bootstrap (detects `pnpm`, `yarn`, `npm` in that order). Decline the prompt and it just prints the command for manual install. Either way, verify with:
  ```bash
  lean-ctx doctor integrations
  ```
- **Language servers** (optional) — for each language Lanyard detects it writes the config pointing at the standard server binary (`typescript-language-server`, `pyright-langserver`, `gopls`, `rust-analyzer`, `clangd`, `jdtls`, etc.). Install the servers yourself; Lanyard doesn't install them, and a missing binary just means the language server won't start in Copilot until you install it.

## Install / run

Run directly from the GitHub repo — clones, installs, builds (only on first run when `dist/` is missing), and executes:

```bash
npx github:mark-hingston/lanyard
```

From a local checkout:

```bash
npm install
npm run build
node dist/index.js
```

Run it from the root of the repository you want to configure. It takes no arguments — it always configures Copilot CLI, VS Code, lean-ctx, and LSP against the current working directory, prints what it wrote, then (if Copilot CLI is on PATH and signed in) drives a non-interactive run that executes the `refactor-instructions` skill to tidy the repo's `.github/instructions/` tree (scope files with `applyTo`, sharpen descriptions, split oversized always-on files). If Copilot CLI isn't installed, Lanyard warns and prints the exact command to run yourself; the config files were still written.

## What Lanyard writes

### GitHub Copilot CLI

- **`.github/mcp.json`** (or existing `.mcp.json`) — workspace MCP servers: Atlassian, Grafana, and the local `lean-ctx` server.
- **`.github/lsp.json`** (or existing `lsp.json`) — detected language servers for Copilot CLI, keyed by language with their file extensions.

### Visual Studio Code

- **`.vscode/mcp.json`** — workspace MCP servers: Atlassian, Grafana, and the local `lean-ctx` server.
- **`.vscode/extensions.json`** — recommended extensions for detected languages that need dedicated language support (e.g. Python, Go, Rust, Java, C/C++, C#, Ruby, PHP, Kotlin, Swift, Lua, YAML, Bash). TypeScript/JavaScript uses VS Code's built-in support, so no extension is added for it.

### LeanCTX workspace config

These files are written regardless of anything else, because they configure the context runtime itself. Several of them feed Copilot CLI (hooks, instructions) but are written here because they're LeanCTX-owned.

- **`.vscode/settings.json`** — enables `chat.mcp.enabled` and adds LeanCTX's tools to `github.copilot.chat.planAgent.additionalTools` so VS Code Copilot plan mode can use them.
- **`.github/hooks/hooks.json`** — Copilot CLI hooks:
  - `preToolUse → lean-ctx hook rewrite` — compresses/rewrites context before each tool call
  - `preToolUse → lean-ctx hook redirect` — routes naive file/shell/read calls to lean-ctx's cheaper context-aware tools
  - `postToolUse → lean-ctx hook observe` — records every tool call into `~/.lean-ctx/events.jsonl` (the capture half of self-learning)
  - `sessionEnd → node .github/scripts/regenerate-instructions.mjs` — mines the events captured since the last session and rewrites the `## Learned patterns` block that Copilot reads on its next session (the write-back half)
- **`.github/copilot-instructions.md`** — Copilot's always-on workspace-wide instructions file (per the [VS Code custom-instructions convention](https://code.visualstudio.com/docs/agent-customization/custom-instructions), this is the file Copilot loads for every chat request). Lanyard writes its always-on guidance here: the [ponytail](https://github.com/DietrichGebert/ponytail) "lazy senior dev" ruleset and the lean-ctx tool-mapping reference, inside a managed `<!-- lanyard:copilot-instructions:start/end -->` block. The file is yours — content outside the markers is preserved across re-runs. If the file is missing, Lanyard creates it with the managed block. If it already exists with no Lanyard markers and user content, Lanyard prompts before appending (`[Y/n]`; defaults to yes with a warning when no TTY is attached). If an older Lanyard left a legacy `<!-- lanyard:lean-ctx-rules:start/end -->` block here, the bootstrap strips it and replaces it with the current managed block — your own content above or below is never removed.
- **`.github/instructions/lanyard.instructions.md`** — Lanyard's bootstrap-config reference, using the VS Code file-based instructions convention (`.github/instructions/*.instructions.md` with YAML front matter). Front matter carries `applyTo: ".github/**"`, per the convention: VS Code auto-loads this file whenever any path under `.github/` is in scope — the assistant-wiring trigger condition (`.github/copilot-instructions.md`, `.github/instructions/`, `.github/hooks/hooks.json`, `.github/mcp.json`, `.github/lsp.json`, `.github/scripts/regenerate-instructions.mjs`, `.github/skills/`, `.github/agents/`). The `description` remains as human-readable context and as a fallback for description-matched loading. The body — a quick reference of the files Lanyard owns and the invariants to honour — lives inside a managed `<!-- lanyard:bootstrap:start/end -->` block; anything you write outside the markers is preserved across re-runs. Front matter above the block is Lanyard-owned and refreshed on each run; treat it as read-only.
- Other `.github/instructions/*.instructions.md` files you already have are left untouched; VS Code searches `.github/instructions` recursively and enumerates them automatically alongside Lanyard's.
- **`.github/scripts/regenerate-instructions.mjs`** — the self-learning regenerator (executable). Idempotent: tracks the last event id it processed in `.github/self-learning/.regen-state.json`, so each run only scans the delta and never reprocesses the whole log.
- **`.github/instructions/self-learning.instructions.md`** — Lanyard's learned-patterns file. Front matter carries `applyTo: "**"` so VS Code loads it at the start of every task — learned patterns must be available up front, not only on tasks whose description semantically matches "lessons from past sessions". Its body is a managed `<!-- managed-by:lanyard start/end -->` block rewritten by the regenerator on `sessionEnd`; everything outside the markers is preserved. Front matter above the block is Lanyard-owned and refreshed on each run.
- **`.github/skills/refactor-instructions/`** — Lanyard's own agent skill (a `SKILL.md` plus two reference files under `references/`) that audits and reorganises the repo's `.github/instructions/*.md` files per the [VS Code custom-instructions convention](https://code.visualstudio.com/docs/agent-customization/custom-instructions): it scopes files with `applyTo` globs, sharpens front-matter `description`s for progressive disclosure, and splits oversized always-on files into scoped ones, applying automatically. It is written **after** every instruction file it audits exists and then **run automatically** at the end of the bootstrap (see [Post-bootstrap instructions refactor](#post-bootstrap-instructions-refactor)). It never edits inside Lanyard's managed markers and never deletes a file.
- **`.github/skills/find-skills/`** — third-party skill vendored from [vercel-labs/skills](https://github.com/vercel-labs/skills) (MIT). Teaches the agent to discover and install skills from the open agent-skills ecosystem via `npx skills` when the user asks "how do I do X" or "find a skill for X". Runtime tool: `npx skills` (you install it).
- **`.github/skills/skill-creator/`** — third-party skill vendored from [anthropics/skills](https://github.com/anthropics/skills) (MIT). Walks through creating, testing, and iteratively improving a new skill (intent capture → draft → parallel test runs → user review → iterate). Ships with the Python run-loop, eval schemas, and browser reviewer it expects. The Python scripts are referenced by the SKILL.md but not auto-installed; you run them with your own Python.
- **`.github/skills/sem/`** — third-party skill vendored from [@ataraxy-labs/sem](https://github.com/Ataraxy-Labs/sem) (MIT OR Apache-2.0). Entity-level diff, impact analysis, and blast-radius for AI agents (functions / methods / classes instead of coarse line-based diffs). Runtime tool: `npm install --save-dev @ataraxy-labs/sem`. The `ticket-to-pr` PR-creator probes with `npx --no-install @ataraxy-labs/sem --version` and uses it to populate the optional `## Affected entities` section of the PR body. Fails open: if `sem` isn't installed, the section is dropped silently and the PR still opens.
- **`.github/skills/audit-integrity/`** — third-party skill vendored from [github/awesome-copilot/skills/audit-integrity](https://github.com/github/awesome-copilot/tree/main/skills/audit-integrity) (MIT). Shared audit integrity framework for any analysis agent: anti-rationalization guards, self-critique loops, retry protocols, non-negotiable behaviours, self-reflection quality gates (1–10 scoring, ≥8 threshold), and a self-learning lesson/memory system. Pure methodology — no runtime tool, no external dependency. Useful as a post-lens quality gate for the `review` skill and as the formalisation of the lesson/memory pattern Lanyard's self-learning regenerator implements.
- **`.github/skills/acreadiness-assess/`** — third-party skill vendored from [github/awesome-copilot/skills/acreadiness-assess](https://github.com/github/awesome-copilot/tree/main/skills/acreadiness-assess) (MIT). The Measure step in AgentRC's Measure → Generate → Maintain loop: runs `npx -y github:microsoft/agentrc readiness --json` and hands the JSON envelope to the companion `ai-readiness-reporter` custom agent, which renders `reports/index.html` from the bundled `report-template.html`. Runtime tool: `agentrc` (auto-downloads via `npx -y` on first run, ~50MB cached). Fails open: if `agentrc` or the companion agent is unavailable, the skill reports the missing prerequisite rather than blocking.
- **`.github/skills/review/`** — Lanyard's adversarial code-review skill. Loads from its `description` when the user asks for a code review, PR review, "review this", "what's wrong with this", or wants a change stress-tested before merge. The `SKILL.md` is the entry point and links to three `references/` files: `review-protocol.md` (coordinator orchestration contract), `severity-rubric.md` (blocker / major / minor / praise definitions with examples per lens), and `output-template.md` (the report shape — findings table, per-finding detail, lenses footer, single decision prompt).
- **`.github/skills/refine/`** — Lanyard's Jira-ticket refinement skill. Loads from its `description` when the user asks to "refine" or "prepare" a Jira ticket for the agent workflow. The `SKILL.md` is the entry point and ships with a generic definition-of-ready rubric at `references/refine-rubric.yml` (8 points across 7 criteria: specific summary, rationale, acceptance criteria present and testable, component identified, scope bounded, no blockers). At invoke time the skill reads the rubric, scores the ticket, runs a one-question-at-a-time gap-filling loop, rewrites the live ticket inline, hands off to the VS Code Plan agent for tech notes, and posts those notes back as a managed `## Tech notes` section. Requires the Atlassian MCP and the VS Code Plan agent.
- **`.github/skills/ticket-to-pr/`** — Lanyard's end-to-end Jira ticket to opened pull request skill. Loads from its `description` when the user says "ticket to PR", "implement PROJ-123", "ship this Jira ticket", "open a PR for KEY-1", or hands over a Jira key/URL expecting code to land on a PR. The `SKILL.md` is the entry point and ships with four `references/` files: `protocol.md` (orchestrator contract — ticket resolution, branch setup, dispatch order, error paths, output schemas), `tech-notes-extraction.md` (ADF flattening, `## Tech notes` detection, "do not change" capture), `command-detection.md` (how the implementer discovers the project's test and lint commands for Node, Python, Go, Rust, .NET, generic Makefile), and `pr-body-template.md` (title format, section shape, what `gh pr create` flags to set). Requires the Atlassian MCP and a `gh` CLI authenticated for the target repo.
- **`.github/agents/reviewer.agent.md`** — user-invocable VS Code custom agent (visible in the agents dropdown). The coordinator for the review workflow: dispatches the five lens subagents in parallel via VS Code's `agent` tool, merges their findings, self-reviews the report against the rubric, then asks the single "merge / fix / re-review" decision question. Read-only — never edits code.
- **`.github/agents/reviewer-{correctness,security,spec,tests,design}.agent.md`** — five lens subagents (`user-invocable: false`, subagent-only). Each runs in isolated context so findings are independent and unanchored by what the other lenses found:
  - `reviewer-correctness` — logic errors, off-by-one, type confusion, error-handling gaps, edge cases the author didn't think of.
  - `reviewer-security` — injection, validation gaps at trust boundaries, secrets in code/logs, authn/authz mistakes, unsafe deserialisation.
  - `reviewer-spec` — challenge the framing: did the change solve what was asked, or what the implementer assumed? Spec drift, scope creep, hidden behaviour changes, dropped requirements.
  - `reviewer-tests` — what tests would *fail* this? Missing edge cases, assertion-free tests, mocks that mock too much, untested trust boundaries.
  - `reviewer-design` — challenge every abstraction. Speculative generality, duplication of existing helpers, wrong abstraction level, naming that lies, idiomatic vs novel-for-novelty's-sake.
- **`.github/agents/ticket-to-pr.agent.md`** — user-invocable VS Code custom agent (visible in the agents dropdown). The coordinator for the ticket-to-PR workflow: reads the Jira ticket via the Atlassian MCP, extracts the tech notes / constraints / linked issues, sets up a fresh `feat/{KEY}-{slug}` branch, then dispatches two subagents sequentially (not in parallel — the PR-creator needs the actual diff to write an honest body). Read-write: ends with `gh pr create` returning a URL; never merges.
- **`.github/agents/ticket-to-pr-implementer.agent.md`** — subagent-only (`user-invocable: false`). Receives only the ticket spec, constraints, and branch name from the coordinator. Implements the change in a fresh subagent context, detects and runs the project's test and lint commands (blocking on failure), commits with a `Refs: {KEY}` trailer, and returns a one-paragraph change summary plus the commit SHA.
- **`.github/agents/ticket-to-pr-pr-creator.agent.md`** — subagent-only (`user-invocable: false`). Receives only the ticket key, the implementer's summary, the commit SHA, and the branch name in a fresh subagent context. Renders the PR title and body from `pr-body-template.md`, pushes the branch, and calls `gh pr create --body-file`. Idempotent on re-run: if a PR already exists for the branch, fetches its URL instead of failing.
- **`.github/agents/ai-readiness-reporter.agent.md`** — subagent-only (`user-invocable: false`). Companion to the `acreadiness-assess` skill: invoked by the skill's reporter step to render the `agentrc readiness --json` envelope into `reports/index.html` using the bundled `report-template.html`. Vendored from [github/awesome-copilot/agents/ai-readiness-reporter](https://github.com/github/awesome-copilot/blob/main/agents/ai-readiness-reporter.agent.md) (MIT), unchanged from upstream.

## Post-bootstrap instructions refactor

Once every config file is written, Lanyard drives a non-interactive Copilot CLI run (`copilot -p "…" --allow-all-tools --add-dir .`) that executes the `refactor-instructions` skill against the repo's `.github/instructions/` tree. This tidies any existing repo instruction files alongside the ones Lanyard just wrote — scoping them with `applyTo` globs, sharpening front-matter descriptions, and splitting oversized always-on files into scoped ones — so the tree is consistent before any coding session starts.

Notes:

- **Automatic.** No flag to opt in; it runs at the end of every `npx lanyard`. Re-runs on an already-tidy tree change little or nothing (the skill is idempotent and refuses to scope a glob that matches no repo files).
- **Requires the Copilot CLI on PATH and signed in.** If `copilot` isn't found, Lanyard warns loudly and prints the exact command to run yourself; the config files were still written. If the run fails or returns non-zero, Lanyard surfaces it as a warning without failing the whole bootstrap (the config writes already succeeded).
- **Safe mutation.** The skill preserves content inside Lanyard's managed markers and never deletes a file — it rewrites front matter, splits files, and leaves originals as pointers. No commit is made; review with `git diff`.

## Self-learning loop

The self-learning loop is the part Lanyard owns end-to-end. It is split so each half is done by what's best at it:

- **Capture (lean-ctx):** the `postToolUse → lean-ctx hook observe` entry records every tool call into `~/.lean-ctx/events.jsonl`. lean-ctx is already doing this — Lanyard just wires the hook.
- **Write-back (Lanyard):** on Copilot's `sessionEnd` event, the `regenerate-instructions.mjs` script Lanyard shipped into your repo mines the events captured *since the last run* and rewrites the managed `## Learned patterns` block inside `.github/instructions/self-learning.instructions.md`. Because that file carries `applyTo: "**"`, the lessons land in front of the agent on its next session, on every task — no one has to remember to ask for them.

Design notes that matter to users:

- **Idempotent and delta-only.** The regenerator tracks the last event id it processed in `.github/self-learning/.regen-state.json`, so a session end with no new activity changes nothing, and one with 5 new events scans only those 5.
- **Repo-local write-back, machine-local capture.** Events live in `~/.lean-ctx/` per developer; the *patterns* derived from them are written into the repo, so the whole team benefits from any one developer's sessions. (Raw event logs are never committed.)
- **Safe ownership.** The regenerator only ever rewrites content inside `<!-- managed-by:lanyard start --> … <!-- managed-by:lanyard end -->` markers. Anything you write in the instructions file outside those markers is preserved untouched.
- **No new runtime dependency.** The regenerator is plain Node.js (`node .github/scripts/regenerate-instructions.mjs`) — it only reads lean-ctx's event log; it does not require `lean-ctx` to be on PATH to run. lean-ctx is still required for the *capture* half.

## Review

The review workflow is the read-only code-review skill that ships with Lanyard. It is **not** auto-run after bootstrap (it costs five parallel model invocations and only makes sense on real changes). It loads from its `description` the first time the user asks for a code review or PR review.

How it works:

- The user asks for a review (or switches to the `reviewer` agent from the dropdown).
- The coordinator agent dispatches **five lenses in parallel** via VS Code's `agent` tool: `reviewer-correctness`, `reviewer-security`, `reviewer-spec`, `reviewer-tests`, `reviewer-design`. Each lens runs in its own subagent context — no anchoring from the others.
- Each lens returns findings in a shared schema (severity, file, line, evidence, rationale, suggested fix) per `severity-rubric.md`.
- The coordinator dedupes overlapping findings, severity-sorts, caps praise at 5 items, self-reviews the report (every blocker/major has quoted evidence, every praise has a line citation), then renders it per `output-template.md` and asks the single decision question: merge as-is, fix blockers, fix blockers + majors, or re-review after fixes.

Design notes that matter to users:

- **Five independent lenses, not one review with five hats.** The point of parallelism is independence — collapsing the lenses into a sequential pass in one context produces a friendly review, not an adversarial one.
- **Read-only by default.** The workflow never edits code; fixes are a downstream step the user (or an implementer agent) handles after seeing the report.
- **No invented findings.** If a lens can't find anything in its scope, it says so explicitly. Silence is not evidence.
- **Praise is in-scope.** Every report includes up to 5 concrete, evidenced "this is good" items — the lenses tell the author what to keep doing, not just what to fix.
- **Tunables.** `depth: quick` skips the design lens and caps each lens at 5 findings; `depth: exhaustive` runs full checklists with longer per-finding rationale. `focus: <hint>` weights a lens toward a specific area (e.g. "the SQL queries worry me") without narrowing its scope.
- **Skill vs. custom-agent boundary.** The skill (`.github/skills/review/`) is the trigger — its `description` is what loads it on review prompts. The custom agents (`.github/agents/`) are VS Code's discovery primitives — the coordinator uses `agent` frontmatter to restrict which subagents it can invoke, and each lens is `user-invocable: false` so the dropdown stays uncluttered.
- **Bring-your-own reviewer override.** The user can skip lenses by saying so ("only the security lens for this PR"). The coordinator respects explicit narrowing but doesn't invent narrowing the user didn't ask for.

## Ticket to PR

The ticket-to-PR workflow is the write side of Lanyard's agent skill set. It pairs with `review`: `review` stress-tests a change that's already landed; `ticket-to-pr` lands the change in the first place. It is **not** auto-run after bootstrap (it costs a coordinator dispatch plus two subagent invocations and only makes sense on a real Jira ticket). It loads from its `description` the first time the user asks for an end-to-end Jira-to-PR run.

How it works:

- The user invokes `ticket-to-pr PROJ-123` (or a Jira URL, or just hands over a key in chat).
- The coordinator fetches the ticket via the Atlassian MCP, extracts the spec (prefers a managed `## Tech notes` block over the whole description; captures "do not change" commitments into `## Constraints`), refuses empty descriptions with "run `refine` first".
- The coordinator verifies git, refuses a dirty working tree, and creates `feat/{KEY}-{slug}` from `main`/`master`.
- The coordinator dispatches `ticket-to-pr-implementer` via VS Code's `agent` tool. The subagent runs in a **fresh, isolated context** — it sees only the spec, constraints, and branch name passed in the dispatch prompt, not the coordinator's chat history or its narrative about the ticket. It implements the change, detects and runs the project's test and lint commands per `command-detection.md`, blocks on failure (up to 3 fix-and-rerun cycles), commits with a `Refs: {KEY}` trailer, and returns a one-paragraph change summary plus the commit SHA.
- If the implementer reports `blockers`, the coordinator stops and surfaces them. Otherwise it dispatches `ticket-to-pr-pr-creator` via the `agent` tool. The PR-creator also starts in a **fresh context** — it sees only the ticket key, ticket type and constraint flags, the implementer's summary, the commit SHA, and the branch name. It renders the PR title and body from `pr-body-template.md` (including the optional `## Affected entities` blast-radius section when `@ataraxy-labs/sem` is installed — probed via `npx --no-install`, fails open if absent), maps the ticket type and constraints to GitHub `--label` flags per the template's "Label mapping" table, pushes the branch, calls `gh pr create --body-file`, and returns the PR URL.
- The coordinator prints the PR URL plus the change summary, then stops. It never merges.

Design notes that matter to users:

- **Coordinator + 2 workers, not coordinator + 1 inline.** Splitting implementation and PR creation across two subagents in their own contexts keeps each phase honest: the implementer reads code without anchoring on the eventual PR description, and the PR-creator writes a body based on the actual diff rather than on what the implementer was about to write.
- **Sequential, not parallel.** The PR-creator needs the implementer's commit SHA and change summary to do its job; running them in parallel would force the PR body to lie about what's in the commit. The review skill's lenses are parallel because they're independent; ticket-to-pr's workers are sequential because they're not.
- **No worktrees, no planning phase.** The workflow runs in one session on one branch. If the session ends between phases, the user re-invokes `ticket-to-pr` and the coordinator re-resolves from Jira. There is no `.pipeline/` state file, no Duroxide runtime, no resume machinery — this is intentionally much lighter than typical Jira-to-PR pipelines.
- **Test/lint gate is mandatory.** The implementer detects the project's test and lint commands (Node, Python, Go, Rust, .NET, generic Makefile per `command-detection.md`) and blocks on failure. There is no `--no-verify` escape hatch. A project with no discoverable test command triggers an explicit ask to the user, never a silent skip.
- **Read-only on the spec.** The implementer never modifies files outside the scope of the spec. If it notices an unrelated issue (typo, dead code), it mentions it in the summary but doesn't fix it in the same commit.
- **Idempotent re-runs.** If `gh pr create` returns "pull request already exists", the PR-creator fetches the existing PR's URL via `gh pr view` and returns that. Re-running the skill against the same branch won't open a duplicate PR.
- **Skill vs. custom-agent boundary.** The skill (`.github/skills/ticket-to-pr/`) is the trigger — its `description` is what loads it on `ticket-to-pr PROJ-123`. The custom agents (`.github/agents/ticket-to-pr*.agent.md`) are VS Code's discovery primitives — the coordinator uses the `agents` frontmatter to restrict which subagents it can invoke, and both subagents are `user-invocable: false` so the dropdown stays uncluttered.
- **Bring-your-own gate override.** The user can name a base branch (`from develop`) or a branch name (`on a branch called fix/cache-bug`). The coordinator respects explicit overrides but doesn't invent overrides the user didn't ask for.

## Authentication after bootstrap

- **VS Code** — the first time you start or use each remote MCP server (Atlassian, Grafana), VS Code opens a browser-based OAuth flow to sign in.
- **Copilot CLI** — each remote server's browser-based OAuth starts the first time Copilot uses it. If Copilot CLI itself isn't signed in yet, run `copilot login` to complete GitHub's device/browser flow. The post-bootstrap `refactor-instructions` skill run also requires the Copilot CLI to be signed in.

## Supported LSP languages

Lanyard scans the workspace (skipping `node_modules`, `dist`, `.git`, `.venv`, `target`, etc.) and sets up language servers for any of these it finds:

| Language | Server command |
|----------|----------------|
| TypeScript / JavaScript | `typescript-language-server` |
| Java | `jdtls` |
| Python | `pyright-langserver` |
| Go | `gopls` |
| Rust | `rust-analyzer` |
| C / C++ | `clangd` |
| C# | `dotnet dnx roslyn-language-server` |
| Ruby | `solargraph` |
| PHP | `intelephense` |
| Kotlin | `kotlin-language-server` |
| Swift | `sourcekit-lsp` |
| Lua | `lua-language-server` |
| YAML | `yaml-language-server` |
| Bash / Shell | `bash-language-server` |

Languages are detected by file extension and/or by known project files (e.g. `go.mod`, `Cargo.toml`, `package.swift`, `pom.xml`, `composer.json`).

## License

MIT
