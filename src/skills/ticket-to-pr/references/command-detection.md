# Command Detection

How the implementer subagent discovers the project's test and lint
commands. The implementer must find and run these before committing;
it does not invent commands, and it does not skip the gate because
no obvious command was visible.

## Resolution algorithm

For each kind of command (test, lint, typecheck), the implementer:

1. Reads the relevant manifest file for the detected language.
2. Picks the most authoritative command — the one that runs the
   project's own suite, not a generic one.
3. Runs it.
4. If it fails, fixes the implementation (not the test command) and
   re-runs, up to 3 times.
5. If still failing, reports the failure as a blocker.

## Language-specific detection

### Node / TypeScript

**Manifest:** `package.json` (read with `read` tool).

**Test command:**

| Signal in `package.json` | Command |
| --- | --- |
| `scripts.test` exists and is not `"echo ... && exit 1"` or similar no-op | `npm test` (or `pnpm test` / `yarn test` — detect from lockfile) |
| `scripts.test` is a no-op, but `scripts["test:unit"]` exists | `npm run test:unit` |
| `scripts.test` is missing entirely, but `vitest.config.{ts,js,mjs}` exists | `npx vitest run` |
| `scripts.test` is missing, but `jest.config.*` exists | `npx jest` |

Detect package manager from lockfile (highest priority first):
`pnpm-lock.yaml` → `pnpm`, `yarn.lock` → `yarn`, `bun.lockb` → `bun`,
else `package-lock.json` → `npm`.

If `npm test` runs but only succeeds because it was a no-op
(`echo 'no tests yet'` etc.), treat that as "no discoverable tests" —
fall through to the "no tests" branch below.

**Lint command:**

| Signal | Command |
| --- | --- |
| `scripts.lint` exists and is not a no-op | `npm run lint` (or pnpm/yarn equivalent) |
| `scripts.lint` is missing but `eslint.config.*` or `.eslintrc.*` exists | `npx eslint .` |
| `scripts.lint` is missing but `biome.json` exists | `npx biome check .` |
| `scripts.lint` is missing but `package.json` has `"typecheck"` script | `npm run typecheck` (treat as a soft lint — TS errors caught here) |

Run **one** of these — don't run both eslint and biome even if both
configs exist (rare, but pick the one listed in `scripts.lint` first;
else pick the one with the most files matching its config glob).

### Python

**Manifest:** `pyproject.toml` (preferred), else `setup.py`,
else `setup.cfg`, else `requirements.txt` (no test info, treat as
"no manifest" → see below).

**Test command:**

| Signal | Command |
| --- | --- |
| `[tool.pytest.ini_options]` in `pyproject.toml`, or `[pytest]` in `setup.cfg` | `pytest` |
| `[tool.poetry.scripts]` with `test`, or `[project.scripts]` with `test` | `poetry run test` (Poetry) or `python -m test` |
| `manage.py` exists (Django) | `python manage.py test` |
| `tox.ini` exists | `tox` |
| No pytest/Django/tox signal | `python -m unittest discover` |

Detect Poetry from `poetry.lock`. Use `poetry run <cmd>` if Poetry
is present, else plain `<cmd>`. Don't install pytest globally — if
the project's deps aren't installed, the test command failing is
expected; report the install instructions to the coordinator.

**Lint command:**

| Signal | Command |
| --- | --- |
| `[tool.ruff]` in `pyproject.toml` or `ruff.toml` exists | `ruff check .` |
| `[tool.flake8]` or `.flake8` exists | `flake8 .` |
| `[tool.pylint]` or `.pylintrc` exists | `pylint <source dir>` |
| `[tool.mypy]` in `pyproject.toml` | `mypy .` |
| `pre-commit-config.yaml` exists with hooks | `pre-commit run --all-files` (slow; only if no other lint signal) |

Pick the first match; one command. Don't combine ruff + flake8 + mypy.

### Go

**Manifest:** `go.mod`.

**Test command:** `go test ./...`

**Lint command:**

| Signal | Command |
| --- | --- |
| `.golangci.yml` / `.golangci.yaml` / `.golangci.toml` exists | `golangci-lint run ./...` |
| `.staticcheck.conf` exists | `staticcheck ./...` |
| Neither | `go vet ./...` (always available with the Go toolchain) |

### Rust

**Manifest:** `Cargo.toml`.

**Test command:** `cargo test`

**Lint command:**

| Signal | Command |
| --- | --- |
| `clippy` is the de-facto lint | `cargo clippy --all-targets -- -D warnings` (treat warnings as errors for this workflow) |
| No clippy configuration | `cargo check` (catches type errors at minimum) |

### .NET

**Manifest:** `<name>.sln` or `<name>.csproj`.

**Test command:**

| Signal | Command |
| --- | --- |
| Solution file exists with test project | `dotnet test` |
| Only a `.csproj` and it's a test project (xUnit/NUnit/MSTest by name) | `dotnet test <csproj>` |

**Lint command:**

| Signal | Command |
| --- | --- |
| `dotnet format --verify-no-changes` (always available) | `dotnet format --verify-no-changes` |
| `.editorconfig` exists | `dotnet format --verify-no-changes --include <changed files>` (use changed files only) |

### Generic / Makefile

**Manifest:** `Makefile`.

**Test command:**

| Target | Command |
| --- | --- |
| `test:` target exists | `make test` |
| `check:` target exists (autotools-style) | `make check` |
| Neither | "no discoverable test command" |

**Lint command:**

| Target | Command |
| --- | --- |
| `lint:` target exists | `make lint` |
| `format-check:` target exists | `make format-check` |
| Neither | "no discoverable lint command" |

## "No discoverable command" branch

If, after exhausting the detection rules, the implementer can't find
either a test or lint command, it must **report the gap to the
coordinator in its `blockers` field**, not silently skip.

The coordinator then has three choices:

1. **Ask the user.** "This project doesn't have a discoverable test
   command (no `npm test`, no pytest, etc.). Want me to (a) commit
   anyway, (b) skip ticket-to-pr and have you set up tests first, or
   (c) name the test command to run?"
2. **Name a command explicitly** (e.g. `go test ./...`). User reply
   becomes a hardcoded override.
3. **Stop with no override.** The implementer reports the gap; the
   coordinator stops.

Default: option 1 (ask). The implementer never assumes it's safe to
skip the gate.

## What counts as "pass"

A test or lint run counts as passing if:

- Exit code 0.
- No new failures (existing flaky tests are not the implementer's
  problem unless the implementer changed them).
- Output doesn't contain `FAIL`, `error`, or `ERR_` tokens in a
  non-warning context. Warnings are okay if the exit code is 0 — but
  TypeScript errors, eslint errors, and `cargo clippy -D warnings`
  are treated as failures.

A test run that "passes" because it ran zero tests is a blocker.
The implementer notes "ran 0 tests" in its output and asks the
coordinator to confirm the gate should be waived.

## Timeout

Cap any single command at 10 minutes (600s). If a command exceeds
this, the implementer treats it as a failure and reports. Most
project test suites finish in seconds to a few minutes; a 10-minute
suite likely needs a more focused approach.

## Iterating on failure

When a test or lint run fails, the implementer:

1. Reads the failure output.
2. Identifies whether the failure is in code the implementer just
   wrote (almost always — the implementer changed nothing else) or
   in pre-existing code (rare; report as a blocker if so).
3. Fixes the code.
4. Re-runs the failing command.
5. Repeats up to 3 times.

After 3 failures on the same command, the implementer stops, reports
the last 3 failure outputs (truncated to the first 50 lines of each)
in its `blockers` field, and does not commit. The coordinator stops
and surfaces to the user.