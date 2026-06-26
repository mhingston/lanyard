# Audit Rubric

What "good" looks like for a `.github/instructions/*.md` file, per the VS Code
custom-instructions convention.

## Front matter

Every `.instructions.md` file should have:

- `name` — kebab-case, ≤ 64 chars.
- `description` — what the file covers and when to use it. Specific enough to
  serve as a table-of-contents entry the agent sees before opening the file.
- `applyTo` — a glob controlling when the file is loaded.

`.github/copilot-instructions.md` is the exception: it is the always-on
Copilot convention file and has no front matter. Read-only to this skill.

## applyTo scoping decision rule

Scope wherever the content is file-type or area specific:

| Content flavour | Example `applyTo` |
| --------------- | ------------------- |
| TypeScript-specific guidance | `**/*.ts`, `**/*.tsx` |
| Test-file conventions | `**/*.test.*`, `**/*.spec.*` |
| A specific module area | `src/payments/**` |
| Genuinely cross-cutting (ruleset, tool mapping, learned patterns) | `**` |

Only use `applyTo: "**"` when the content is **demonstrably** cross-cutting.
A "lazy senior dev" ruleset is `**`; a list of TypeScript naming rules is not.

Note: the always-on slot for genuinely cross-cutting content in a Lanyard-
bootstrapped repo is **not** a `.instructions.md` file with `applyTo: "**"` —
it is the managed block inside `.github/copilot-instructions.md`, which
Copilot loads for every chat request. `.instructions.md` files with
`applyTo: "**"` are only appropriate for *scoped-but-globally-relevant*
content; truly cross-cutting content (the ponytail ruleset, the lean-ctx
tool mapping) belongs in `copilot-instructions.md`.

## Description quality

The `description` is the progressive-disclosure entry — it decides whether the
agent opens the file. Weak descriptions to flag and rewrite:

- Vague: "Helps with tests.", "Coding standards.", "General guidance."
- Empty or "TODO".
- Restates only the filename without the *when*.

Good: "Testing conventions for this repo: test file layout, naming, and when to
prefer integration over unit. Load when editing `.test.` or `.spec.` files."

The description is a **judgement call** — heuristics below catch the worst
offenders, but you decide the rewrite:

- < 20 chars or > 600 chars → likely too thin or too long.
- Contains only the same word as the filename → likely vacuous.
- Lacks a "when to use" signal → likely weak.

## Oversized / splittable

A file is `oversized` / `splittable` when:

- It is `applyTo: "**"` **and**
- It contains clearly separable sections addressing disjoint file
  types/areas **and**
- An always-on load of the whole file wastes context on guidance irrelevant to
  the current task.

Split into one scoped file per separable section, plus a thin index file
(`applyTo: "**"`, short body, links to the scoped children) if the parent
file was acting as an index. Do **not** split a 40-line always-on file that is
genuinely cross-cutting — splitting for its own sake is over-engineering.

## glob-matches-nothing

For every proposed `applyTo`, resolve it against the repo's actual files (use
`ctx_search` or `ctx_find`). If zero files match, the finding is invalid:
widen the glob or drop it. Never write a scoped file whose `applyTo` matches
nothing.

## Don't-over-engineer guardrails

- Don't scope a file unless its content is demonstrably file-type/area-specific.
- Don't split unless splitting removes real context cost.
- Prefer widening an existing scoped file over creating a new one.
- A file that's fine is a finding of `ok` — leave it alone.
- Don't extract a section out of `AGENTS.md` / `CLAUDE.md` unless it
  *demonstrably* uses VS Code–specific syntax — vague resemblance is not
  enough; "this guidance mentions TypeScript" is not the same as "this
  guidance only makes sense to a VS Code–aware agent".

## AGENTS.md and CLAUDE.md

These files are **always-on, no front matter, cross-agent**:

- `AGENTS.md` at workspace root (and `**/AGENTS.md` in monorepos when
  `chat.useNestedAgentsMdFiles` is enabled).
- `CLAUDE.md` and `CLAUDE.local.md` at workspace root.
- `.claude/CLAUDE.md` in the workspace.

VS Code applies them to every chat request alongside
`.github/copilot-instructions.md`. Other agents (Cursor, Claude Code,
Copilot CLI, …) read `AGENTS.md` / `CLAUDE.md` and ignore the
`.github/instructions/*.instructions.md` convention.

Note: **Lanyard no longer authors `AGENTS.md` or `CLAUDE.md`.** Lanyard
targets Copilot only, and its always-on content lives in
`.github/copilot-instructions.md`. If the user already has one of these
files (e.g. they use Claude Code or Aider), Lanyard leaves it alone; this
skill may still extract VS Code–specific sections out of it (see the
`vscode-specific-in-agents-md` finding and the rewrite contract).

For this skill, the body of these files is **read-only**. The only mutation
allowed is extracting a section out of them (see rewrite contract). The
rationale: every agent in the workspace reads them, so an edit is a
cross-tooling change, not a VS Code-only change.

### vscode-specific-in-agents-md

Flag a section in `AGENTS.md` / `CLAUDE.md` as a candidate to extract into a
new `.github/instructions/*.instructions.md` file when it contains any of:

- `#tool:` syntax (VS Code prompt-file tool references, e.g. `#tool:web/fetch`).
- VS Code settings keys (`chat.*`, `github.copilot.chat.*`, etc.).
- Direct references to the `.github/instructions/` tree mechanics (e.g.
  "see our file-based instructions", "the `applyTo` glob controls…").
- YAML front matter rendered as part of the *content* rather than the
  metadata block.
- Instructions that only make sense to an agent that resolves
  `.instructions.md` files (e.g. "load the file whose `name` matches…").

A section that just says "use tabs" or "follow conventional commits" or
"tests are co-located with source" stays in `AGENTS.md` — it is
agent-agnostic and rightly belongs to every agent.

### cross-agent-in-instructions-tree

Flag a file in `.github/instructions/*.instructions.md` as a candidate to
inline into `AGENTS.md` (recommendation only, never auto-applied) when:

- `applyTo: "**"` (already always-on).
- The body has **no** VS Code–specific syntax (no `#tool:`, no settings
  keys, no `.github/instructions/` mechanics).
- The body is short-to-medium (the kind of content that fits naturally in
  an always-on file; a 500-line ruleset is too big).
- The body is agent-agnostic (it would be useful to Cursor / Claude Code
  too, not just VS Code).

Surface as a `recommendation`-class finding in the report. The operator
decides whether to inline; this skill never auto-applies this direction.
