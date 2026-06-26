---
name: refactor-instructions
description: Audit and reorganize this repo's Copilot/VS Code instructions files (.github/instructions/*.md) per the VS Code custom-instructions convention — scope them with applyTo globs, sharpen front-matter descriptions for progressive disclosure, and split oversized always-on files into scoped ones. Analysis then auto-apply (no prompt). Use after running lanyard, or any time the .github/instructions tree has grown.
---

# Refactor Instructions

Reorganise this repository's Copilot/VS Code instruction files so the agent
gets the right guidance, scoped to the right files, with progressive
disclosure doing the work it's meant to.

**Announce at start:** "I'm using the refactor-instructions skill to audit and
reorganise the instructions tree."

## When to use

- **Immediately after `lanyard` finishes bootstrapping the workspace.** Run
  this as the next step once the bootstrap-written files exist alongside any
  repo-local instruction files, so the tree is tidy before any coding session
  starts.
- Any time the `.github/instructions/` tree has grown and may have drifted
  from the convention.
- The agent is loading too many always-on (`applyTo: "**"`) files, or one
  file is clearly made of separable per-language/per-area sections.

## Scope of audit

Enumerate, do not sample:

- `.github/instructions/**/*.md` (recursive — VS Code searches this tree)
- `.github/copilot-instructions.md` (the always-on Copilot convention file;
  no front matter — read-only for this skill, see rewrite contract)
- `AGENTS.md` at the workspace root, and `**/AGENTS.md` in subfolders
  (cross-agent always-on file; VS Code detects root automatically, subfolder
  detection is experimental and gated by `chat.useNestedAgentsMdFiles`).
  Body is read-only to this skill, but its sections are in-scope for the
  migration heuristic below. Note: Lanyard no longer authors `AGENTS.md`
  itself — if the user has one, they wrote it.
- `CLAUDE.md` and `CLAUDE.local.md` at the workspace root (cross-agent
  compatibility file; same treatment as `AGENTS.md`).
- `.claude/CLAUDE.md` in the workspace (Claude Code–owned location; same
  treatment).

**Cross-agent caveat.** `AGENTS.md` and `CLAUDE.md` are read by every AI
agent in the workspace (VS Code, Cursor, Claude Code, Copilot CLI, etc.),
not just VS Code. Anything moved into or out of these files changes the
guidance seen by *all* of them, including agents that don't understand
`.instructions.md` front matter. The migration mechanics below are designed
with that in mind: extraction *out* is auto-applied, inlining *in* is
recommendation-only.

For each file, read it with `ctx_read(path, "full")` and extract the YAML
front matter (between leading `---` fences) where present. Note:
Lanyard-authored files contain managed blocks delimited by markers — those
bodies are read-only to this skill. The current Lanyard markers are:

- `<!-- lanyard:copilot-instructions:start/end -->` (in `copilot-instructions.md`)
- `<!-- lanyard:bootstrap:start/end -->` (in `lanyard.instructions.md`)
- `<!-- managed-by:lanyard start/end -->` (in `self-learning.instructions.md`)

## Output contract

Build a findings table before applying anything. One row per finding:

| Field | Description |
| ----- | ----------- |
| `file` | Repo-relative path |
| `current_applyTo` | The file's current `applyTo` value, or `n/a` (no front matter) |
| `finding` | `unscoped` | `oversized` | `weak-description` | `splittable` | `glob-matches-nothing` | `missing-frontmatter` | `vscode-specific-in-agents-md` | `cross-agent-in-instructions-tree` | `ok` |
| `action` | Concrete change to apply (front-matter rewrite, split into N files, extract to `.instructions.md`, etc.) |
| `effort` | `trivial` | `moderate` | `large` |
| `auto_apply` | `yes` | `recommendation` — `recommendation` rows are surfaced in the report but never auto-applied; the operator decides |

Present the table, then apply. Do not gate on operator confirmation — apply
per the rewrite contract, then report via `git diff` what changed.
`recommendation` rows appear in the report under a separate "Recommendations"
heading and are not applied.

## Workflow

1. **Enumerate** the audit scope above.
2. **Read** each file. Build the findings table per the rubric in
   [references/audit-rubric.md](references/audit-rubric.md).
3. **Deduplicate findings** — one action per file (combine related findings).
4. **Apply** changes per
   [references/rewrite-contract.md](references/rewrite-contract.md): rewrite
   front matter, split oversized always-on files into scoped files (creating
   new files), preserve managed markers and all non-managed content.
5. **Render the diff** with `git diff` and report it. Do not commit.

## Auto-apply scope

Apply automatically **including**:

- Rewriting front matter (`applyTo`, `description`, `name`) to scope files
  and sharpen descriptions.
- **Splitting** an oversized `applyTo: "**"` file into multiple scoped
  `.instructions.md` files plus a thin index pointing at them.
- **Extracting VS Code–specific sections out of `AGENTS.md` / `CLAUDE.md`**
  into a new scoped `.instructions.md` file under `.github/instructions/`,
  leaving a one-line pointer in the source file (see rewrite contract).
  This is the only mutation this skill performs on cross-agent files.

Apply **only as a recommendation, never auto-applied** (surfaced in the
report; operator decides):

- **Inlining an `applyTo: "**"` `.instructions.md` file into `AGENTS.md`**
  when the body is genuinely agent-agnostic. Direction matters: content can
  be moved *out* of `AGENTS.md` automatically, but moving it *in* is a
  cross-agent blast radius decision that humans own. Surface and stop.

**Never** (these are hard guardrails, enforced even in auto-apply mode):

- **No deletion.** Never delete an instruction file, even one that looks
  redundant. Consolidate by inlining content into another file's non-managed
  region; leave the original in place.
- **No edits inside managed markers.** Lanyard-authored files use
  `<!-- lanyard:*:start/end -->` and `<!-- managed-by:lanyard start/end -->`
  markers. The marker-delimited bodies are Lanyard-owned and refreshed on
  each lanyard run; never edit inside them.
- **No front-matter rewrites on Lanyard-owned files.** The YAML front matter
  (`description`, `name`, `applyTo`) above the first managed marker is the
  bootstrap's source-of-truth (see `src/constants.ts` in the Lanyard repo:
  `COPILOT_INSTRUCTIONS_INDEX_FRONT_MATTER` for the bootstrap file and
  `SELF_LEARNING_INSTRUCTIONS_FRONT_MATTER` for the learned-patterns file).
  Any rewrite this skill makes would be overwritten on the next `lanyard`
  run. Audit Lanyard-owned files for structural findings only (oversized body,
  missing markers, etc.); never touch their front matter. Front-matter
  rewrites remain in scope for user-added files.
- **No body edits to `AGENTS.md` / `CLAUDE.md` beyond the pointer replacement
  in the extraction rule above.** Their structure is read-only to this
  skill; only an extracted section is removed, and only because it is being
  preserved verbatim in the new `.instructions.md` file. (Lanyard does not
  author these files itself, so any content they hold is the user's.)
- **No glob that matches zero files.** If the proposed `applyTo` matches no
  file in the repo, widen it or drop the finding.
- **Don't scope genuinely cross-cutting content.** Ponytail's "lazy senior dev"
  ruleset lives in the managed block of `.github/copilot-instructions.md` and
  applies to every chat request — it is not in any `.instructions.md` file
  with `applyTo: "**"` and should not be moved there. Only scope content that
  is demonstrably file-type or area specific.

## Authoring discipline

This skill reorganises; it does not author new guidance. If the audit surfaces
a *gap* (something the agent needs guidance on that no file covers), note it
in the final report as a recommendation and stop — do not write new
instructional content. When widening a scoped file before creating a
new one (cluster two `**.ts`-scoped files' content into one), that is
reorganisation and is in-scope.

## References

- [references/audit-rubric.md](references/audit-rubric.md) — "what good looks
  like", decision rules, the don't-over-engineer guardrails
- [references/rewrite-contract.md](references/rewrite-contract.md) — marker
  preservation, split mechanics, the no-delete rule, diff/apply/report
