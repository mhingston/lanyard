# Rewrite Contract

How the skill applies changes safely.

## Preservation: managed markers

Lanyard-authored files contain managed blocks delimited by:

- `<!-- lanyard:copilot-instructions:start --> ... <!-- lanyard:copilot-instructions:end -->` — inside `.github/copilot-instructions.md` (always-on guidance: ponytail ruleset + lean-ctx tool mapping).
- `<!-- lanyard:bootstrap:start --> ... <!-- lanyard:bootstrap:end -->` — inside `.github/instructions/lanyard.instructions.md` (description-only bootstrap-config reference).
- `<!-- managed-by:lanyard start --> ... <!-- managed-by:lanyard end -->` — inside `.github/instructions/self-learning.instructions.md` (description-only learned patterns, rewritten on `sessionEnd`).

These bodies are Lanyard-owned and rewritten on each `lanyard` run. **This
skill never edits inside them** — including their YAML front matter, which
is also Lanyard-owned (the source-of-truth lives in the Lanyard bootstrap's
`src/constants.ts`; any rewrite would be overwritten on the next `lanyard`
run). Per Lanyard file you may only:

- Add or edit content *between* the front matter and the first marker, or
  *between*/*after* markers.

Anything you add outside the markers is preserved across `lanyard` re-runs
(by lanyard's own contract), so reorganisation you do here sticks.

## Splitting an oversized always-on file

When the rubric says a `applyTo: "**"` file is splittable:

1. Read the file and identify the separable sections.
2. For each section, create a new scoped `.instructions.md` in the same
   directory:
   - Filename: kebab-case, descriptive (e.g. `typescript-conventions.instructions.md`).
   - Front matter: `name`, `description` (specific), `applyTo` (the section's
     glob, validated non-empty against the repo).
   - Body: the section's content, unchanged.
3. Replace the original file's managed-or-non-managed body region (whichever
   contained the section) with a short pointer paragraph linking to the new
   scoped children. Keep its front matter; set `applyTo: "**"` only if it is
   now genuinely an index.
4. Never delete the original file (see below).

## No deletion

Never delete an instruction file. If two files cover the same scope, inline the
content of one into a non-managed region of the other and leave the emptied
original in place with its front matter intact (its body may be reduced to a
pointer). Deletion is the easiest way for an automated pass to lose team
knowledge that wasn't actually redundant.

## Apply, diff, report, stop

1. After applying every finding, run `git diff` over the instructions tree.
2. Print the diff (or a summary if very large) and one line per file touched.
3. **Do not commit.** The operator reviews and commits.

## Idempotency

A re-run on an already-tidy tree should produce a findings table of all `ok`
and write nothing. Track this: if `git diff` is empty after applying, say so
explicitly.

## AGENTS.md and CLAUDE.md

These files are read by every AI agent in the workspace, not just VS Code.
The body is **read-only** to this skill — the only mutation allowed is
extracting a section out (with a pointer left behind). Direction is
deliberate: extraction *out* is auto-applied, inlining *in* is
recommendation-only, because the latter changes guidance for every agent.

### Extracting VS Code–specific content out of AGENTS.md (auto-apply)

When a section of `AGENTS.md` / `CLAUDE.md` matches the
`vscode-specific-in-agents-md` rubric:

1. Read the file and identify the section (by Markdown heading, fenced
   block, or natural-language break — pick the most defensible boundary).
2. Create a new scoped `.instructions.md` file under `.github/instructions/`:
   - Filename: kebab-case derived from the section heading.
   - Front matter: `name`, `description` (specific, includes the "when to
     use" signal), `applyTo` glob derived from the section's referenced
     file types, validated non-empty against the repo.
   - Body: the section's content, **unchanged** (so VS Code picks up
     exactly what the cross-agent file had).
3. In `AGENTS.md` / `CLAUDE.md`, replace the extracted section with a
   one-line pointer in the form:
   `> VS Code–specific guidance extracted to [`name`](../instructions/<file>.instructions.md).`
4. Do not touch any other section of the source file.

If the source file is now only pointers, leave it in place — never delete.

### Inlining .instructions.md content into AGENTS.md (recommendation only)

When a `.github/instructions/*.instructions.md` file matches the
`cross-agent-in-instructions-tree` rubric, surface it in the report and
**stop**. The operator decides whether to inline. Do not auto-apply this
direction.
