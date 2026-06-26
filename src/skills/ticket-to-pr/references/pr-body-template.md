# PR Body Template

The PR-creator subagent fills this in from the implementer's change
summary, the ticket summary, and the linked issues. It's a markdown
template — subagent replaces each `<placeholder>` and removes optional
sections that have no content.

## Title format

```
{KEY}: {verb} {summary lower-cased, max 60 chars total}
```

- `{verb}` is one of: `add`, `fix`, `refactor`, `remove`, `update`,
  `migrate`, `extract`, `rename`. Pick the one that fits the diff.
  If none fits, use the verb from the ticket summary.
- `{summary}` is the ticket summary, lower-cased, with the leading
  verb stripped if it duplicates `{verb}`.
- Total title length must be ≤ 72 chars (GitHub truncates with `…`
  past 72 in some clients).
- Examples:
  - `PROJ-123: add tenant cache with TTL fallback`
  - `KEY-9: fix N+1 query in /v2/memberships`
  - `PROJ-77: refactor auth middleware into per-route guards`

If the title would exceed 72 chars, shorten the summary rather than
the `{verb}` or `{KEY}`.

## Body template

```markdown
## Summary

<2-4 sentences in plain English explaining what the change does and
why. Pull from the ticket summary and the implementer's change
summary. Don't restate the diff — explain the *why* for a reviewer
who hasn't read the code yet.>

## Changes

<bulleted list of the most important files or behaviours changed.
One bullet per change, ≤ 1 line each. If the diff has more than 8
files, group into "added", "modified", "removed" sub-bullets.>

- `<path/to/file>` — <one-line summary of what changed here>
- ...

## Affected entities

<Optional, only if `sem` is available — see "Affected entities"
section rules below for the probe and render steps. Pulls the
function / method / class-level blast radius so reviewers see what
the change *touches* beyond a flat file list. If `sem` isn't
installed, drop the entire `## Affected entities` heading — it's
an optional enhancement, not a required section.>

## Test plan

<bulleted list of how the change was tested. Pull from the
implementer's `tests_run` field.>

- `<test command>` — <result> (<duration>s)
- ...

## Tickets

Refs: <KEY>

<!-- Include only the lines that have content. Remove empty lines. -->
Parent of: <EPIC-KEY>
Blocks: <KEY-A>, <KEY-B>
Relates to: <KEY-C>
```

## Section rules

### Summary

- Always present.
- 2–4 sentences. If you can't write 2 sentences, the change is too
  small to merit a PR — but that should never happen because the
  coordinator only dispatches the implementer when there's a real
  ticket behind the work.
- Don't use marketing language ("robust", "seamless", "powerful").
  Plain English. The reviewer will skim this.

### Changes

- Always present.
- One bullet per file, OR grouped under `### Added` / `### Modified`
  / `### Removed` if the diff has more than 8 files. Don't mix
  flat bullets and grouped bullets — pick one shape.
- Don't list every file in a generated migration or scaffold
  (`yarn.lock`, generated `*.pb.go`, etc.). Skip generated files
  unless the change is *about* the generation.

### Test plan

- Always present, even if it's "Manual testing only — no automated
  tests run because the project has no discoverable test command".
  An empty test plan is a red flag; an honest one is fine.
- Format each entry as `- <command> — <result> (<duration>s)`.
  Use `pass`, `fail`, `skip`. If a test was skipped, say why.

### Affected entities

- **Optional section.** Probe for `sem` first; render only if present.
- Probe (use `npx --no-install` so a missing binary aborts cleanly
  instead of triggering a 50 MB download mid-task):
  ```bash
  if npx --no-install @ataraxy-labs/sem --version >/dev/null 2>&1; then
    sem diff --from origin/<base>...HEAD --format json > /tmp/sem-diff.json
  fi
  ```
- If the probe fails, drop the entire `## Affected entities` heading
  silently. `sem` is an enhancement, not a requirement — the PR
  must still open without it. Never surface a warning to the user
  about a missing optional tool.
- If the probe succeeds, render one bullet per changed entity. Use
  the entity's `file: <path>` and `<kind> <name> (<change>)` shape
  from the JSON, plus optionally cross-reference
  `sem impact <entityId> --tests --json` to inline "covered by
  <test files>" when it adds signal.
- Skip entities in files that aren't source code (lockfiles, generated
  files, vendored dependencies) — `sem diff` already filters most of
  these out, but defensive skip is fine.
- Cap the list at the 12 most-impactful entities. If there are more,
  group into `### Added` / `### Modified` / `### Removed` (mirrors the
  `## Changes` shape when > 8 files) and truncate the rest with a
  trailing line: `- … and N more entities (run \`sem diff --from
  origin/<base>...HEAD\` to list them)`.
- For languages `sem` doesn't recognise, `sem diff` falls back to
  chunk-based diffing; the JSON's `parser` field reflects this.
  Render the fallback as a single line per file rather than per
  entity — the reviewer can still see "this file changed at the
  chunk level" without the false precision of a fake entity name.

### Tickets

- `Refs: <KEY>` — always present. The KEY is the ticket this PR
  implements. GitHub auto-closes the ticket on merge if the title
  contains `Fixes <KEY>`, but `Refs:` is safer (closes only on
  explicit merge).
- `Parent of:` — include only if the ticket has a parent epic.
- `Blocks:` — include only if the ticket has outbound `blocks`
  links. Comma-separated.
- `Relates to:` — include only if the ticket has outbound
  `relates to` links.
- If a section has no content, drop the heading entirely.

## Label mapping

The coordinator hands you the ticket's `issuetype.name` (e.g.
`"Bug"`, `"Story"`, `"Task"`, `"Technical Debt"`, `"Spike"`) plus
any constraint flags captured during spec extraction. Map them to
GitHub labels and pass the result to `gh pr create --label` as a
single comma-separated string.

**Map ticket type to a label:**

| Ticket type        | Label         |
| ------------------ | ------------- |
| `Bug`              | `bug`         |
| `Story`            | `enhancement` |
| `Task`             | `chore`       |
| `Technical Debt`   | `tech-debt`   |
| `Spike`            | `spike`       |
| (anything else)    | (omit)        |

**Add constraint labels:**

| Constraint detected in spec | Label             |
| --------------------------- | ----------------- |
| Touches a database schema, migration, or entity model | `schema-change`   |
| Touches an event / message contract (publishers, consumers, payload shape) | `contract-change` |
| Touches code that runs in more than one brand / tenant variant | `multi-brand`     |
| Touches a feature-flag definition or rollout config | `feature-flag`    |

Don't invent labels from thin air — if the constraint doesn't fit a
row above, omit it. `gh` creates labels that don't exist on the repo
automatically; no pre-flight check is needed. Order the labels
type-first then constraint-flags, alphabetically within each group,
so the `--label` flag is deterministic across re-runs.

## What not to include

- **No "Screenshots" section** unless the change is user-visible and
  the implementer captured one. (We don't ask the implementer to
  take screenshots — manual capture is the user's job.)
- **No "Checklist" section** (no "I tested this", "I read the
  contributing guide", etc.). The review skill's reviewer-spec lens
  exists to catch checklist-driven PR descriptions that lie about
  what was tested.
- **No emoji.** The user didn't ask for emoji; none of the rest of
  lanyard's PR templates use them.
- **No mention of the AI** ("generated by", "implemented via Copilot",
  etc.). The PR is from the user; the tool used to write it is
  irrelevant to the reviewer.
- **No "Notes for reviewer" hand-holding** ("please review
  carefully", "let me know if you have questions"). Reviewers don't
  need to be told to review.

## What `gh pr create` flags the subagent sets

```
gh pr create \
  --base <base_branch> \
  --head <feature_branch> \
  --title "<title>" \
  --body-file <path to body markdown> \
  --assignee "@me" \
  --label "<comma-separated labels>"
```

- `--base` from the coordinator's resolved base_branch.
- `--head` from the implementer's branch name.
- `--title` from the title format above.
- `--body-file` — write the rendered body to a temp file and pass
  it; don't inline `--body` because shell quoting is fragile for
  multi-line markdown.
- `--assignee @me` — assign to whoever is authenticated to `gh`.
  Don't set `--reviewer` — the user picks reviewers.
- `--label` — comma-separated labels derived from the ticket type
  and constraint flags (see "Label mapping" below). `gh` creates
  labels that don't exist on the repo automatically, so no
  pre-flight check is needed.

If `gh pr create` returns a URL, capture and return it. If it
returns "pull request already exists for this branch", fetch the
existing PR's URL with `gh pr view --json url -q .url` and return
that instead (idempotent re-runs).