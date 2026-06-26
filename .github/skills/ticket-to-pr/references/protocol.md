# Ticket-to-PR Protocol

The orchestration contract the `ticket-to-pr` coordinator follows.
Lives here, not in the agent file, because the protocol changes more
often than the agent definition and we don't want to force an
agent-file edit for every workflow tweak.

This is intentionally much lighter than the payments `ticket-to-pr`
reference — no Duroxide runtime, no `.pipeline/{KEY}.state.json`, no
worktree isolation, no resume machinery. The workflow runs in one
session, in one process, on one branch. If the session ends between
phases, the user re-invokes the skill and the coordinator re-resolves
the ticket from scratch.

## Inputs

The coordinator receives from the parent agent:

- **ticket** — a Jira issue key (`PROJ-123`) or URL
  (`https://acme.atlassian.net/browse/PROJ-123`). Required. The user
  may have typed either form, or pasted the ticket URL.
- **base_branch** (optional) — explicit base ref if the user picked
  something other than `main` / `master`. Default: detect from the
  repo (`origin/main` first, fall back to `origin/master`, fall back
  to `main`/`master` locally).
- **branch_name** (optional) — explicit feature branch name to use.
  Default: `feat/{KEY}-{slug}` where `{slug}` is a kebab-case of the
  ticket summary, capped at 40 chars, stripped of punctuation.

The coordinator does **not** accept a `comment-only` or `no-pr`
flag. This workflow always produces a PR — for read-only ticket work,
use `jira`; for investigation, use `investigate`.

## Ticket resolution

### Parse the key

1. If the input matches `https?://[^\s]+/browse/([A-Z][A-Z0-9]+-\d+)`
   capture group 1.
2. Else if the input matches `^([A-Z][A-Z0-9]+-\d+)$` capture group 1.
3. Else if the input contains a key-shaped substring
   (`[A-Z][A-Z0-9]+-\d+`), capture the first one.
4. Else — stop and tell the user "I couldn't find a Jira key in
   '{input}'. Pass a key like PROJ-123 or a Jira URL."

Normalise the captured key to upper-case.

### Fetch the issue

Use the Atlassian MCP (`atlassian/*`) to fetch the issue. The tool
surface varies by Atlassian MCP version; the coordinator probes for a
get-issue tool by trying these in order until one works:

- `atlassian.getIssue(issueIdOrKey: string)`
- `mcp_atlassian_get_issue(issueIdOrKey: string)`
- `atlassian.fetch(issueIdOrKey: string)`

If none of the Atlassian MCP tools are available, stop and tell the
user "the Atlassian MCP isn't configured — run `npx lanyard` to add it,
or wire it into `.vscode/mcp.json` / `.github/mcp.json` manually."

If the tool returns an auth error or 404, surface it verbatim.

### Extract the spec slice

See [tech-notes-extraction.md](tech-notes-extraction.md) for the full
algorithm. Summary:

1. Read `summary` and `description` (and `fields.description` /
   `fields.summary` depending on the MCP shape — try both).
2. Strip Atlassian storage-format markup to plain text (paragraphs,
   bullet lists, code blocks, inline code, links). Ignore tables,
   images, attachments.
3. If the description contains a `## Tech notes` or `**Tech notes**`
   section, use that block as the spec.
4. Else, use the entire description.
5. If the description is empty or shorter than ~20 chars of prose,
   stop and tell the user to use `refine` first.

Capture and forward to the implementer subagent:

- The ticket key (e.g. `PROJ-123`).
- The ticket summary (one line).
- The spec slice (described above).
- Any "do not change" / "scope only X" / "preserve backwards compat"
  commitments, copied verbatim from the description (these go into the
  implementer's prompt under a `## Constraints` heading).
- Linked issues and parent epic key, if available (these go into the
  PR body under `Refs:` — see
  [pr-body-template.md](pr-body-template.md)).

## Branch setup

After spec resolution, before dispatching the implementer:

1. `git rev-parse --is-inside-work-tree` — bail with "not a git
   repository" if false.
2. `git status --porcelain` — if non-empty, bail with "working tree
   has uncommitted changes; commit, stash, or discard them before
   running ticket-to-pr". Never auto-stash; that's destructive.
3. Detect base branch (see Inputs).
4. `git fetch <remote> <base>` to make sure the local base is current.
   The remote is `origin` unless `git config --get remote.origin.url`
   is empty, in which case fall back to the local `main` / `master`.
5. Build the branch name from `branch_name` if provided, else
   `feat/{KEY}-{slug}`. If the branch already exists locally OR on
   the remote, bail with "{branch} already exists; delete it or pick
   another". Never force-recreate; never silently switch to an
   existing branch.
6. `git checkout -b <branch> <base>`.

If any of these fails for a reason other than "already exists" or
"uncommitted changes", surface the git error verbatim and stop.

## Implementer dispatch

Send the implementer subagent a single prompt containing:

- A pointer to its own agent file:
  `.github/agents/ticket-to-pr-implementer.agent.md`.
- The resolved spec slice (under `## Spec`).
- The constraints slice (under `## Constraints`).
- The branch name (under `## Branch`).
- A reminder that the implementer must run the project's test and
  lint commands before committing, blocking on failure.
- The required output schema (below).

Dispatch via the `agent` tool — do not run the implementer's logic
inline in the coordinator's context. Context isolation matters: the
implementer reads code with a fresh context, free of any coordinator
narrative about the ticket, so its reading is unanchored by what the
user emphasised in chat.

### Implementer output schema

```json
{
  "branch": "feat/PROJ-123-add-tenant-cache",
  "commit_sha": "abc1234",
  "files_changed": [
    { "path": "src/cache.ts", "lines_added": 42, "lines_removed": 3 }
  ],
  "summary": "<one-paragraph, plain English summary of the change>",
  "tests_run": [
    { "command": "npm test", "result": "pass", "duration_s": 12 }
  ],
  "lint_run": [
    { "command": "npm run lint", "result": "pass", "duration_s": 4 }
  ],
  "blockers": "<string describing why we stopped, or null on success>"
}
```

If `blockers` is non-null, the coordinator stops and reports the
implementer's blocker to the user. It does not dispatch the
PR-creator. If `blockers` is null, the coordinator proceeds.

## PR-creator dispatch

Send the PR-creator subagent a single prompt containing:

- A pointer to its own agent file:
  `.github/agents/ticket-to-pr-pr-creator.agent.md`.
- The ticket key, the ticket summary, and the ticket's
  `issuetype.name` (e.g. `"Bug"`, `"Story"`, `"Task"`,
  `"Technical Debt"`, `"Spike"`) — the PR-creator maps these to
  GitHub labels per the template's "Label mapping" table.
- The constraint flags captured during spec extraction
  (`schema_change`, `contract_change`, `multi_brand`,
  `feature_flag`) — each flag becomes a constraint label when
  its precondition matched the spec. Omit any flag whose
  precondition did not match.
- The implementer's `summary` (verbatim).
- The branch name, the commit SHA, and the files-changed list.
- The base branch.
- A reminder to derive the PR body from
  [pr-body-template.md](pr-body-template.md) and to push before
  calling `gh pr create`.
- The required output schema (below).

### PR-creator output schema

```json
{
  "pr_url": "https://github.com/org/repo/pull/456",
  "pr_title": "PROJ-123: add tenant cache with TTL fallback",
  "pushed": true,
  "blockers": "<string describing why we stopped, or null on success>"
}
```

If `blockers` is non-null, the coordinator stops and reports. If
`pr_url` is set, the coordinator reports the URL.

## Final report

The coordinator prints to the user:

```
PROJ-123 → https://github.com/org/repo/pull/456

Branch: feat/PROJ-123-add-tenant-cache
Commit: abc1234
Files:  src/cache.ts (+42, −3)  src/cache.test.ts (+18, −0)

Tests: npm test — pass (12s)
Lint:  npm run lint — pass (4s)

PR body follows the standard template; ticket is referenced in the
PR title and `Refs:` line. Nothing has been merged.
```

Plus a one-line decision prompt: "Review the PR or want me to do
something else (e.g. re-run on the same branch, open as draft, add
reviewers)?"

## Error paths and stop conditions

Stop and report without dispatching the implementer if:

- The input has no extractable Jira key.
- The Atlassian MCP is unavailable or returns an auth error.
- The description is empty or too vague to code against.
- The repository isn't a git repo, has a dirty working tree, or the
  target branch already exists.
- The current branch is `main` or `master` AND the user hasn't
  provided an explicit base_branch (defensive — `git checkout -b`
  should handle this, but guard explicitly).

Stop and report after dispatching the implementer if:

- The implementer's `blockers` field is non-null.
- Tests or lint failed and the implementer couldn't recover.
- The implementer hit a recoverable error but exceeded a sensible
  retry budget (3 implementation attempts; 3 test-fix loops; if any
  exceeds, stop and report).

Stop and report after dispatching the PR-creator if:

- `gh` isn't installed or isn't authenticated.
- `git push` is rejected (auth, branch protection, missing upstream).
- `gh pr create` returns a non-zero exit (drafts already exist,
  permission denied, etc.).

In all stop conditions, the coordinator prints the failure verbatim
plus a one-line suggested next step (e.g. "authenticate with
`gh auth login` and re-run", "the branch has commits but no diff vs
{base}; check that the implementer committed").

## Self-review

Before printing the final report, the coordinator verifies:

- The PR URL is a valid `https://github.com/...` URL (or whatever the
  configured git host returns).
- The branch name matches `feat/{KEY}-{slug}` or the user-provided
  override.
- The commit SHA matches what the implementer returned.
- The test/lint run results are non-empty (unless the project has
  no discoverable commands — then the report says so).

If any check fails, the coordinator rewrites the report rather than
presenting a broken one.

## Customisation hooks

The user can override defaults inline:

- "Implement PAY-1234 on a branch called `fix/cache-bug` from
  `develop`." — overrides both `branch_name` and `base_branch`.
- "Implement PAY-1234 but don't push." — coordinator stops after
  the commit and reports the local branch; does not dispatch the
  PR-creator. This is the only override that changes the workflow
  shape — everything else is parameter-passing.

The coordinator respects explicit overrides; it does not invent
overrides the user didn't ask for.