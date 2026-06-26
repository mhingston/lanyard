---
name: sem
description: >
  Entity-level diff, impact analysis, and blast-radius detection for AI
  agents. Wraps the `@ataraxy-labs/sem` npm package to report changes at
  the function / method / class level instead of coarse line-based
  diffs. Use when you need to understand what a change *touches* beyond
  raw file lists — for example to populate a PR description's "affected
  entities" / blast-radius section, or to scope a regression test plan
  from an entity-level diff.
---

# sem — Semantic Version Control

> Entity-level diff, impact analysis, and context for AI agents.
> Built on tree-sitter with support for 26 languages.
>
> Vendored from the upstream `@ataraxy-labs/sem` skill (MIT OR
> Apache-2.0). This copy trims the upstream worktree-specific guidance
> (Lanyard's `ticket-to-pr` workflow does not use worktrees, so the
> `extensions.relativeworktrees` failure mode documented upstream does
> not apply here).

## When to invoke

- **`ticket-to-pr` PR-creator:** use `sem diff` to populate the
  optional `### Affected entities` section of the PR body so reviewers
  see what *functions / methods / classes* changed and not just a flat
  file list.
- **General:** use `sem impact <entity>` to determine blast radius —
  which other entities call this one, and which tests cover it.
  Use `sem context <entity>` for token-budgeted entity context when a
  skill needs focused context about a specific function or class.
  Use `sem blame <file>` for entity-level authorship (who last touched
  each function), and `sem log <entity>` to track a single entity's
  history through git.

---

## Installation

This skill uses the official npm wrapper (`@ataraxy-labs/sem`). The
wrapper downloads the pre-built binary automatically on first run —
no manual install step required.

```bash
# Easiest: probe via npx (downloads the binary on first call, ~50 MB,
# cached afterwards). Use --no-install so a missing binary aborts
# cleanly instead of triggering a download mid-task.
npx --no-install @ataraxy-labs/sem --version

# Or pin it as a dev dependency in the user's repo if they want it
# always-on for AI workflows:
npm install --save-dev @ataraxy-labs/sem
```

The npm wrapper handles platform detection and binary download
automatically. Pre-requisites: Node.js ≥ 18, npm/npx, git, optional
`jq` for JSON output parsing in shell scripts.

---

## Commands

### `sem diff`

Entity-level diff with rename detection and structural hashing:

```bash
# Working-tree changes (uncommitted)
sem diff

# Staged changes only
sem diff --staged

# Commit range — the shape the `ticket-to-pr` PR-creator uses
sem diff --from origin/main --to HEAD

# JSON output (for AI agents — preferred when the output feeds
# another step in a workflow rather than a human reader)
sem diff --format json

# Verbose mode (word-level inline diffs alongside entity changes)
sem diff -v
```

Example output:

```
src/auth.ts:
  ✎ function validateToken (modified)
    - old logic here
    + new logic here

src/api/Processor.cs:
  + class PaymentProcessor (added)
  - interface IPaymentProcessor (deleted)
```

### `sem impact`

Cross-file dependency graph — *what breaks if an entity changes*:

```bash
# Full impact analysis
sem impact authenticateUser

# Direct dependencies only
sem impact authenticateUser --deps

# Affected tests only (the call this skill is most useful for)
sem impact authenticateUser --tests

# JSON output
sem impact authenticateUser --json
```

### `sem context`

Token-budgeted context for LLMs — the entity, its dependencies, and
its dependents fitted to a token budget:

```bash
# Default 4000 token budget
sem context authenticateUser

# Custom token budget
sem context authenticateUser --budget 2000

# JSON output
sem context authenticateUser --json
```

### `sem blame`

Entity-level blame showing who last modified each function / class /
method in a file:

```bash
sem blame src/auth.ts
sem blame src/auth.ts --json
```

### `sem entities`

List all entities in a file (handy for orienting yourself before a
diff or impact call):

```bash
sem entities src/auth.ts
sem entities src/auth.ts --json
```

### `sem log`

Track how a single entity evolved through git history:

```bash
sem log authenticateUser
sem log authenticateUser -v
sem log authenticateUser --limit 20
```

---

## Integration pattern in `ticket-to-pr`

When this skill is invoked from the `ticket-to-pr` PR-creator, the
integration looks like:

```bash
# Probe first — sem may not be installed. If the probe exits non-zero
# the PR-creator silently skips the optional "Affected entities"
# section rather than blocking the PR on a missing optional tool.
if npx --no-install @ataraxy-labs/sem --version >/dev/null 2>&1; then
  sem diff --from origin/<base>...HEAD --format json \
    > /tmp/sem-diff.json
  # Iterate .changes[].entityId, optionally cross-reference with
  # `sem impact <entity> --tests --json` for an even richer blast-radius
  # block. Render as the "### Affected entities" section per the
  # ticket-to-pr PR body template.
fi
```

If the probe fails, do **not** warn the user loudly — `sem` is an
optional enhancement, not a required tool. The PR must still open
without it. If the user wants blast-radius data in every PR body,
install `sem` as a dev dependency once and re-run.

---

## Supported languages

| Language | Extensions | Entities |
|----------|------------|----------|
| TypeScript | `.ts`, `.tsx` | functions, classes, interfaces, types, enums, exports |
| Python | `.py` | functions, classes, decorated definitions |
| C# | `.cs` | classes, methods, interfaces, enums, structs, properties |
| Java | `.java` | classes, methods, interfaces, enums, fields |
| Go | `.go` | functions, methods, types, vars |
| Rust | `.rs` | functions, structs, enums, impls, traits |
| And 20+ more | | |

See [the upstream `@ataraxy-labs/sem` repo](https://github.com/Ataraxy-Labs/sem)
for the full list.

---

## Notes

- **License.** `@ataraxy-labs/sem` is dual-licensed `MIT OR Apache-2.0`.
  This vendored copy preserves the upstream attribution and the same
  license; redistribute under either.
- **Binary download.** First `npx` invocation downloads the matching
  pre-built binary (~50 MB). Subsequent runs use the cached binary.
- **JSON output is agent-friendly.** `--format json` produces output
  designed for AI agent consumption — prefer it when the result feeds
  another step in a workflow rather than a human reader.
- **Rename detection.** Uses structural hashing, so moved-and-edited
  entities are reported as renames rather than add+delete pairs.
- **Unsupported file types.** Falls back to chunk-based diffing for
  files whose language isn't in the supported set — the JSON output
  reflects the fallback so downstream consumers can detect it.
- **Native binary.** The core parser is native Rust (not WASM), so
  first-call startup is fast after the download.