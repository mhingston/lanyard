# Review Protocol

The orchestration contract the `reviewer` coordinator follows.
Lives here, not in the agent file, because the protocol changes more often
than the agent definition and we don't want to force an agent-file edit for
every protocol tweak.

## Inputs

The coordinator receives from the parent agent:

- **scope** — what to review (working tree, branch, PR, commit range, file,
  module). Default: working tree (`git diff` + `git diff --cached`); fall
  back to branch vs the default base when the working tree is clean. See
  the skill's SKILL.md for the full precedence rule.
- **base_ref** (optional) — explicit base ref if the user picked something
  other than `main` / `master`.
- **focus** (optional) — extra hint from the user ("especially the auth
  changes", "the SQL queries worry me"). Passed through to each lens as a
  prompt-time emphasis; lenses still cover their full scope, just weight
  findings near the focus higher.
- **depth** (optional) — `quick`, `standard` (default), or `exhaustive`.
  `quick` skips the design lens and caps findings per lens at 5. `exhaustive`
  lets lenses run their full checklists and produce longer reports.

## Spec resolution

Before dispatching lenses, the coordinator resolves the source of intent.
This is the coordinator's job — **not** the lenses' — for two reasons:

- **Context isolation.** Each lens runs in a subagent with a clean
  context. If the lens pulled the Jira ticket itself, it would carry the
  full ticket (comment threads, linked issues, attachments) into its
  context, anchoring its reading of the code on whatever it scans first.
- **Curated slice.** Most of a Jira ticket is noise to a reviewer — the
  original ask plus acceptance criteria plus linked design docs is the
  signal. The coordinator extracts that slice; the lens gets the focused
  version.

The coordinator's tool list includes `atlassian/*` (Lanyard configures the
Atlassian MCP server as part of the bootstrap; if the user removed it,
the tool is silently unavailable per VS Code's custom-agent rules — the
graceful fallback below kicks in).

### Resolution algorithm

1. **Look for an explicit ticket reference** in the PR description,
   commit message(s), or branch name. Common forms: `PROJ-123`, `jira:
   PROJ-123`, `[PROJ-123]`, links.
2. **If found**, fetch the ticket via Atlassian MCP. Extract:
   - The original ask (issue summary + description).
   - Acceptance criteria (custom field if present, else first/last
     bullet under description).
   - Linked Confluence design pages — fetch each and include the
     spec-relevant sections (skip page history, comments, version
     metadata).
   - Any explicit "do not change", "preserve backwards compat with X",
     "scope: only Y" commitments in the issue body or top comments.
3. **If not found**, fall back to:
   - The PR / branch description from git.
   - README sections, design docs, ADRs the change touches (`read` /
     `search`).
   - The change's own docstrings / CLI help / UI labels.
4. **If nothing is found**, proceed with `spec_source: none` and tell
   the spec lens to limit its findings to behaviour-change and
   scope-creep categories.

### Prompt-time injection

The coordinator injects the resolved spec into every lens's prompt
(under a clearly delimited `## Resolved spec` block), not just the spec
lens. Reason: the other lenses benefit from knowing the original ask as
a tie-breaker (e.g. correctness lens deciding whether a "missing" edge
case is actually out of scope per the spec). The block shape:

```
## Resolved spec
spec_source: jira:PROJ-123   (or `spec_source: none` + what was found in-repo)

<original ask>
<acceptance criteria>
<do-not-change / scope commitments>
<linked design docs (if any)>
```

If the spec is large (a 500-line Confluence page), extract only the
sections relevant to the changed files. Don't dump the whole ticket
into the prompt.

## When to ask the user

Ask **at most one** clarifying question, and only if the answer changes what
the lenses review. Acceptable cases:

- Scope is genuinely ambiguous (no diff, no PR ref, no path, no commit).
- The user said "review this" with no further context — ask scope (working
  tree / branch / PR / file).

Do **not** ask:

- What lenses to use — always the same five.
- Severity thresholds — fixed by the rubric.
- Whether to include praise — yes, always.
- Whether to auto-fix — no, always report only.

If the user is silent on scope and there's no obvious diff, default to
"branch vs main" and say so in the report header. Don't block on the user.

## Dispatch

The coordinator must dispatch the five lenses **in parallel** via VS Code's
`agent` tool (subagent invocation), one call per lens, in a single message so
they run concurrently. Order in the prompt:

1. `reviewer-correctness`
2. `reviewer-security`
3. `reviewer-spec`
4. `reviewer-tests`
5. `reviewer-design`

(Or via `context: fork` if available — see VS Code's `context` skill field —
which gives each lens its own subagent context regardless. Either way the
isolation requirement is the same: each lens reads the diff fresh, without
seeing other lenses' findings.)

The prompt to each lens subagent includes:

- The resolved scope (specific paths / commit range / PR number).
- The lens's role description (so the subagent knows which persona to embody
  if the lens file isn't directly referenced).
- A pointer to the lens's own agent file in `.github/agents/` (e.g.
  `.github/agents/reviewer-correctness.agent.md`) so the subagent can read
  its full instructions.
- The `focus` parameter if provided.
- The `depth` parameter if provided.
- The required output schema (see
  [output-template.md](output-template.md)).

If `depth: quick`, skip `reviewer-design` and tell the other lenses to cap
findings at 5.

## Output merge

Each lens returns findings in this shape (see
[output-template.md](output-template.md) for the full schema):

```json
{
  "lens": "correctness",
  "findings": [
    {
      "id": "COR-1",
      "severity": "blocker" | "major" | "minor" | "praise",
      "file": "<repo-relative path>",
      "line": <line number or range>,
      "title": "<one-line summary>",
      "evidence": "<quoted snippet from the diff>",
      "rationale": "<why this is an issue, in the lens's voice>",
      "suggested_fix": "<concrete change, or null if not obvious>"
    }
  ],
  "skipped": "<reason if lens found nothing>"
}
```

The coordinator:

1. **Collects** all five lens outputs.
2. **Deduplicates** findings that overlap. Two findings are duplicates if they
   point at the same file + line range AND make the same point (titles
   match). When deduplicating, keep the more severe verdict; note in the
   report which lenses flagged it (e.g. "Flagged by: correctness, security").
3. **Severity-sorts** per the rubric (blocker → major → minor → praise).
   Within severity, sort by file then line.
4. **Caps praise** at 5 items — pick the most concrete, evidenced ones. The
   report shouldn't be padded with "looks good!" filler.
5. **Writes the report** using [output-template.md](output-template.md).
6. **Includes the lens coverage footer** — which lenses ran, which were
   skipped, and any `unverified` items the lenses flagged as needing
   runtime probing.

## Self-review

Before presenting the report, the coordinator runs it through its own rubric:

- **Every blocker and major finding has a quoted evidence snippet from the
  diff.** No exceptions. Drop findings that lack evidence and rewrite them
  as `minor` if the lens's claim is plausible but unsupported.
- **Every `praise` item has a file + line citation.** "Good naming" without a
  reference is filler; "consistent use of `Result<T, E>` for fallible
  parsing in `src/parser.rs:42-87`" is praise.
- **Findings don't contradict each other** (one says "over-abstracted" and
  another says "should be extracted"). If they do, keep both and let the
  user judge.
- **The scope header matches what was actually reviewed.** If the lenses
  silently couldn't read part of the diff, the header says so.
- **No invented line numbers.** If a finding's `line` doesn't actually
  contain the quoted evidence, rewrite or drop it.
- **The report fits on one screen for the summary** (the per-finding detail
  can be long; the table at the top must not).

If self-review surfaces a problem, fix it before showing the user. Don't
present and then caveat.

## When to refuse or stop

The coordinator stops and reports back without dispatching lenses if:

- The diff is empty (no changes to review).
- The user explicitly said "just give me a quick look" and the diff is < 20
  lines — surface a one-line review directly instead of dispatching five
  lenses. The overhead isn't worth it.

The coordinator never escalates to other agents (reviewer of reviewer, etc).
One level of recursion is the cap.

## Customisation hooks

The user can override the lens set by saying e.g. "skip the design lens" or
"only the security lens for this PR". The coordinator respects explicit scope
narrowing but doesn't invent narrowing the user didn't ask for.

If the repo has a `.github/instructions/` file that's clearly in scope (e.g.
security policy, error-handling rules), each lens reads the relevant ones as
part of grounding — the protocol doesn't enumerate them; the lens decides.