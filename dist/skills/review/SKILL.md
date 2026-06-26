---
name: review
description: Run an adversarial code review of changes (working tree, staged, a PR, a branch, a file, or a module). Spawns the `reviewer` coordinator which dispatches five independent review lenses in parallel — correctness, security, spec adherence, test coverage, and design — then merges their findings into a severity-ordered report. Use when the user asks for a "code review", "review my PR", "review this", "what's wrong with this", "challenge this change", "find bugs in", or wants changes stress-tested before merge. Also use before merging any non-trivial change when a second opinion is wanted.
---

# Review

Five independent lenses read the same change in parallel, each from one
adversarial angle, then the coordinator merges the findings into a single
severity-ordered report. The point isn't to be agreeable — it's to surface
what a single friendly review pass would miss.

**Announce at start:** "I'm running the review skill — dispatching
the five review lenses in parallel and merging the findings."

## When to use

- Before merging a PR or pushing a branch the user wants reviewed.
- When the user asks for a code review, PR review, or "what's wrong with this".
- When the user wants a change stress-tested, challenged, or sanity-checked by
  independent perspectives.
- When changes are non-trivial (more than a few lines, touches trust boundaries,
  changes a public API, or alters shared infrastructure).

Don't use for trivial changes (typo fixes, single-line tweaks) — the overhead
exceeds the value. Don't use when the user explicitly wants a friendly /
supportive review; this skill is explicitly adversarial.

## What it reviews

The user picks the scope. Accept any of:

- **Working tree** — unstaged + staged changes (`git diff`, `git diff --cached`).
- **Branch** — all changes vs the merge base (`git diff <base>...HEAD`).
- **PR** — `gh pr diff <number>`.
- **Specific commit(s)** — `git show <sha>` or a range.
- **File or module** — review a specific path or directory regardless of
  changes.

If the user didn't specify, start with the working tree. If the working
tree is clean, fall back to branch vs the default base. State the resolved
scope in the report header.

**Scope precedence (highest to lowest):**

1. **Explicit user scope** — PR number/link, branch, commit range, file
   path, or "branch vs X". The user's named scope always wins.
2. **Working tree** — unstaged + staged changes (`git diff` +
   `git diff --cached`). This is the default when the user didn't
   specify.
3. **Branch vs default base** — `git diff <base>...HEAD` (usually `main`
   or `master`). Used only when the working tree is clean.

Never silently switch scope once a PR or branch was named — a working
tree full of unrelated edits should not redirect a PR review.

## The five lenses

Each lens runs as an isolated subagent via VS Code's `agent` tool, dispatched in
parallel by the `reviewer` coordinator. Each gets a clean context
so findings are independent and unanchored by what the other lenses found.

| Lens | What it challenges |
|------|---------------------|
| `reviewer-correctness` | Logic errors, off-by-one, type confusion, edge cases the author didn't think of, error-handling gaps that turn bugs into crashes or silent corruption. |
| `reviewer-security` | Injection paths, validation gaps at trust boundaries, secrets in code or logs, data exposure, authn/authz mistakes, unsafe deserialization. |
| `reviewer-spec` | Did this actually solve what was asked, or what the implementer assumed was asked? Spec drift, scope creep, hidden behaviour changes. |
| `reviewer-tests` | What tests would *fail* this? What edge cases aren't covered? What would a malicious user do to break this that the tests don't catch? |
| `reviewer-design` | Is each abstraction earned, or speculative? Is there duplication the author missed? Could this be deleted entirely? Idiomatic vs novel-for-novelty's-sake. |

The lenses are defined as VS Code custom agents in `.github/agents/` (see
[references/review-protocol.md](references/review-protocol.md) for the full
orchestration contract and how to dispatch them).

## Workflow

1. **Resolve scope.** Figure out what to review from the user's prompt (or ask
   one short clarifying question if truly ambiguous — see the protocol's
   "When to ask" section).
2. **Load the coordinator.** Switch to or invoke the `reviewer`
   custom agent from `.github/agents/reviewer.agent.md`. It owns
   the rest of the workflow.
3. **Coordinator dispatches the five lenses in parallel.** Each lens returns
   structured findings (see
   [references/output-template.md](references/output-template.md)).
4. **Coordinator merges.** Deduplicate findings that overlap across lenses,
   severity-sort per [references/severity-rubric.md](references/severity-rubric.md),
   preserve praise items, write the report.
5. **Self-review the report.** The coordinator runs the report back through its
   own rubric before presenting it — any finding without evidence (file + line
   + quoted snippet) is dropped or rewritten. See the protocol's "Self-review"
   section.
6. **Present and decide.** Output the report to the user. Ask the single
   decision question: merge as-is, fix blockers, fix blockers + majors, or
   full review.

Do not auto-apply fixes. This workflow is read-only by default — the user
decides what to act on. (The user can hand the report to an implementer
agent after; that's a separate step.)

## What this skill never does

- **Never edits code.** It produces a report. Fixes are a downstream step.
- **Never praises without evidence.** Every "well done" item cites the file
  and line that demonstrates it.
- **Never invents findings.** If a lens can't find an issue in its scope, it
  says so explicitly. Silence is not evidence.
- **Never collapses the lenses into one.** The point is independent context
  per lens. Don't read all five persona docs and "apply them" sequentially in
  one context — that's a friendly review, not an adversarial one.
- **Never runs the lenses on production data or live systems.** Lenses are
  read-only; if a finding requires runtime probing to confirm, the report
  flags it as `unverified` rather than asserting it.

## References

- [references/review-protocol.md](references/review-protocol.md) — coordinator
  orchestration contract: dispatch order, output merge, self-review, when to
  ask the user for clarification vs proceed.
- [references/severity-rubric.md](references/severity-rubric.md) — what
  counts as blocker / major / minor / praise, with decision rules and
  examples per lens.
- [references/output-template.md](references/output-template.md) — the report
  shape the coordinator writes and the user reads.