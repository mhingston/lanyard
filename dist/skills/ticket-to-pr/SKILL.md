---
name: ticket-to-pr
description: End-to-end Jira ticket to merged-ready pull request workflow. Reads the ticket's tech notes (description) via the Atlassian MCP, implements the change on a fresh branch, runs project tests and lint (blocking on failure), commits, pushes, and opens a PR via the `gh` CLI. Use when the user says "ticket to PR", "implement PROJ-123", "ship this Jira ticket", "open a PR for KEY-1", or hands over a Jira key/URL expecting code to land on a PR without further prompting. Do not use for tickets that have no tech notes yet — use `refine` first.
---

# Ticket to PR

A single coordinated run from Jira key to opened pull request. The
coordinator reads the ticket, dispatches an implementer subagent to write
the code, then a PR-creator subagent to push and open the PR. Each
subagent runs in its own context so the implementation work doesn't leak
into the PR-description work and vice versa.

**Announce at start:** "I'm running the ticket-to-pr skill — fetching the
ticket and dispatching the implementer, then the PR creator."

## When to use

- The user hands over a Jira key or URL and expects code changes plus an
  open PR, end-to-end, with no further prompting.
- The user says "implement this ticket", "ship PROJ-123", "open a PR for
  KEY-1", "do the work described in this Jira", or similar.
- A Jira ticket's tech notes are concrete enough to code against — the
  description names the files, the behaviour, or the approach.

## When not to use

- **The ticket has no tech notes yet.** Use `refine` first — it scores
  the ticket against the readiness rubric, fills gaps with the user,
  and posts the agreed tech notes back into the Jira description. Then
  invoke `ticket-to-pr`. Running against an empty description produces
  hallucinated code.
- **The user wants a quick read or summary of the ticket.** Use `jira`
  (read-only ticket work).
- **The user wants a spike or investigation with no implementation.**
  Use `investigate`. `ticket-to-pr` always creates a branch, a commit,
  and a PR.
- **The user wants only a code review.** Use `review`.
- **The change crosses trust boundaries or needs a human approver
  mid-flow** (production credentials, infra, migrations). Surface this
  to the user and stop before pushing — do not silently ship.

## What it does

The coordinator runs three phases, sequentially. Phases 1 and 3 are
in-coordinator (cheap, no subagent dispatch); phases 2 is a subagent.
Wait — three phases but two subagents. Restating for clarity:

1. **Coordinator: resolve the ticket.** Parse the Jira key/URL from the
   user's prompt. Fetch the issue via `atlassian/*` MCP. Extract the
   spec-relevant slice from the description (the original ask plus any
   "do not change" / scope commitments). See
   [references/tech-notes-extraction.md](references/tech-notes-extraction.md).
2. **Coordinator: set up the branch.** Detect the default base (`main`
   or `master`). `git fetch` it. Create `feat/{KEY}-{slug}` from it
   where `{slug}` is a kebab-cased summary, capped at 40 chars.
   `git checkout -b`. If the working tree is dirty or the branch
   already exists, stop and report — do not silently recover.
3. **Dispatch the implementer subagent.** Send it the ticket key, the
   extracted spec, the branch name, and a pointer to
   `.github/agents/ticket-to-pr-implementer.agent.md`. It owns the
   implementation, test/lint gate, and commit. It returns a structured
   summary of what changed and the commit SHA.
4. **Dispatch the PR-creator subagent.** Send it the ticket key, the
   ticket summary, the implementer's change summary, the commit SHA,
   and a pointer to
   `.github/agents/ticket-to-pr-pr-creator.agent.md`. It pushes the
   branch and calls `gh pr create`. It returns the PR URL.
5. **Coordinator: report.** Print the PR URL, a one-line summary of the
   changes, and the commit SHA. Stop. Do not auto-merge, do not
   re-review, do not run CI — that's the user's call next.

Full orchestration contract (spec resolution, dispatch, error handling,
output schemas): [references/protocol.md](references/protocol.md).

## The two subagents

| Subagent | Owns | Tools |
| --- | --- | --- |
| `ticket-to-pr-implementer` | Reads the spec, implements the change, runs the project's test and lint commands (blocking on failure), commits on the feature branch. | `read`, `search`, `edit`, `bash` |
| `ticket-to-pr-pr-creator` | Derives PR title and body from the ticket and the implementer's change summary, pushes the branch, calls `gh pr create`. | `read`, `bash` |

Subagent definitions live in `.github/agents/`. They are
`user-invocable: false` — the coordinator is the only entry point.

The two subagents are dispatched **sequentially, not in parallel**. The
implementer must commit before the PR creator can describe the diff, and
the PR creator must read the actual diff to write an honest PR body.
Parallelism would force the PR body to lie about what's in the commit.

## Hard rules

- **Never skip the test/lint gate.** If the project has tests or lint,
  the implementer runs them and blocks on failure. No "I'll add tests
  in a follow-up" escape hatch. The only exception is a project with
  no discoverable test command — see
  [references/command-detection.md](references/command-detection.md).
- **Never push without explicit user consent on the first run of a
  session.** If the user invoked the skill, consent is implicit — they
  asked for a PR. Subsequent re-runs in the same session also push
  without prompting. Document the branch name in the announce line so
  the user knows what's about to leave their machine.
- **Never merge.** `gh pr create` opens the PR. It does not merge.
  Merging is the user's call.
- **Never run on `main` or `master`.** If the current branch is one of
  the default bases, the coordinator creates the feature branch
  before dispatching the implementer. If it can't, stop and report.
- **Never invent a spec.** If the ticket description is empty, vague,
  or contains only links to other documents, stop and tell the user
  to use `refine` first. Hallucinated code is worse than no code.
- **Never skip the Jira fetch.** Even if the user pasted the spec into
  the chat, the coordinator still pulls the Jira ticket so the commit
  message, branch name, and PR body reference the canonical key.
- **Never run on production.** If the project connects to production
  systems at test time, the implementer must use a sandbox / test
  double. Flag this in the announce line if you can't verify.

## References

- [references/protocol.md](references/protocol.md) — orchestration
  contract: ticket resolution, branch setup, dispatch order, error
  paths, output schemas for both subagents, when to stop and report
  vs continue.
- [references/tech-notes-extraction.md](references/tech-notes-extraction.md)
  — what to pull from the Jira description and what to ignore; how to
  detect "do not change" / scope commitments; what to do when the
  description is empty.
- [references/command-detection.md](references/command-detection.md) —
  how the implementer detects the project's test and lint commands
  (Node, Python, Go, Rust, .NET, generic Makefile); what counts as a
  discoverable command vs a project that has no tests.
- [references/pr-body-template.md](references/pr-body-template.md) —
  the PR title format and body template the PR-creator subagent fills
  in, including the `Refs:` line that closes the Jira ticket on merge.