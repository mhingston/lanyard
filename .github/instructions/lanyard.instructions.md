---
name: Lanyard bootstrap config
description: How Lanyard wires up this repo's Copilot/VS Code assistant — the files Lanyard writes, the conventions it enforces, and the scripts that keep the wiring current. Load when editing .github/copilot-instructions.md, .github/instructions/, .github/hooks/hooks.json, .github/mcp.json, .github/lsp.json, .github/scripts/regenerate-instructions.mjs, .vscode/settings.json, or anything under .github/skills/ or .github/agents/.
applyTo: ".github/**"
---
<!-- lanyard:bootstrap:start -->
## What Lanyard writes

Lanyard owns and refreshes these files on every `npx lanyard` run:

| File | Lanyard-managed region | Purpose |
|------|------------------------|---------|
| `.github/copilot-instructions.md` | `<!-- lanyard:copilot-instructions:start/end -->` block | Always-on guidance: ponytail ruleset + lean-ctx tool mapping. The file is user-owned; content outside the markers is preserved. |
| `.github/instructions/lanyard.instructions.md` *(this file)* | `<!-- lanyard:bootstrap:start/end -->` block | Description-only: loaded when editing the assistant wiring. |
| `.github/instructions/self-learning.instructions.md` | `<!-- managed-by:lanyard start/end -->` block | Description-only: learned patterns from past Copilot/lean-ctx sessions. Body rewritten on `sessionEnd`. |
| `.vscode/settings.json` | `chat.mcp.enabled`, `github.copilot.chat.planAgent.additionalTools` | Enables MCP and registers lean-ctx tools with the plan agent. |
| `.github/hooks/hooks.json` | `preToolUse`, `postToolUse`, `sessionEnd` | Lanyard-owned hook entries, merged with any user entries. |
| `.github/mcp.json` (or `.mcp.json`) | Atlassian, Grafana, lean-ctx servers | Workspace MCP servers. |
| `.github/lsp.json` (or `lsp.json`) | Detected language servers | Detected LSP servers. |
| `.github/scripts/regenerate-instructions.mjs` | full file | Self-learning regenerator (invoked by `sessionEnd` hook). |
| `.github/skills/<name>/` and `.github/agents/<name>.agent.md` | full file | Lanyard-shipped skills and custom agents. |

## Invariants

When editing Lanyard-owned content (either in this repo or in the Lanyard source):

- **Never edit inside a managed block.** The block body is regenerated on every `npx lanyard` run from `src/constants.ts` and `src/leanctx.ts` in the Lanyard repo. Manual edits inside the markers are discarded.
- **Front matter above the first managed marker is Lanyard-owned too.** Source of truth: `COPILOT_INSTRUCTIONS_INDEX_FRONT_MATTER` and `SELF_LEARNING_INSTRUCTIONS_FRONT_MATTER` in `src/constants.ts`. The `refactor-instructions` skill audits Lanyard-owned files for structural findings only and never rewrites their front matter.
- **Idempotency.** Re-running `npx lanyard` on an already-bootstrapped repo must be a no-op for content the user has not changed. The block-merge helpers in `src/leanctx.ts` use the marker pair to detect and replace in place; whitespace outside the markers is preserved verbatim.
- **`AGENTS.md` / `CLAUDE.md` are no longer Lanyard's responsibility.** Lanyard targets Copilot only. If the user already has one, leave it alone (the `refactor-instructions` skill may still extract VS Code-specific sections out of it; see its rewrite contract).
<!-- lanyard:bootstrap:end -->
