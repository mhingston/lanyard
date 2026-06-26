# Severity Rubric

The shared severity model every lens uses. The coordinator applies this when
merging; the lenses apply this when grading their own findings. Same
definitions everywhere, no per-lens reinterpretation.

## Blockers

**Must fix before merge. No exceptions.**

A blocker is a finding where, if the change ships as-is, something bad
happens that the user would not accept and cannot roll back from easily.

Examples per lens:

- **correctness** — silent data corruption, crash on a non-pathological
  input, broken behaviour for any user who follows the documented flow,
  off-by-one that affects every result, type confusion the compiler should
  have caught.
- **security** — injection (SQL, command, template, path traversal, XSS),
  authn or authz bypass, secret in code or logs, unsafe deserialisation,
  SSRF, IDOR, missing CSRF on a state-changing endpoint, hard-coded
  credential.
- **spec** — implements a feature different from what was asked, in a way
  that can't be reconciled with the user's stated intent. Hidden behaviour
  change that affects existing callers. Drops a requirement the user
  explicitly listed.
- **tests** — the change touches trust boundaries or public APIs and ships
  with zero new tests covering the changed behaviour. Coverage gap that
  would let the next regression slip through unnoticed.
- **design** — N/A at this severity. Design problems compound; they don't
  usually cause incidents on day one. If a design choice actively breaks
  something, it's a blocker via one of the other lenses.

Decision rule: *would the user, after reading this finding, agree the change
shouldn't ship in its current form?* If yes, blocker. If "I want to talk
about this first", major.

## Major

**Should fix before merge, or fix soon after with a tracked follow-up.**

A major is a finding where the change is shippable but the team would
materially benefit from fixing it — quality, robustness, or maintainability
issue that will compound or cost real time to address later.

Examples per lens:

- **correctness** — error handling that swallows errors it should surface,
  ambiguous behaviour on edge cases (the type is right but the meaning is
  wrong), missing input validation on a non-trust-boundary input that
  nonetheless causes downstream confusion.
- **security** — input validation gap on a field the author treated as
  trusted but isn't, error message that leaks internal state, debug logging
  that ships to prod, missing rate limiting on a sensitive endpoint.
- **spec** — extra behaviour added that the user didn't ask for and might
  not want, a UX choice that contradicts an explicit user preference,
  scope creep beyond the stated task.
- **tests** — large untested branch, missing tests for a documented
  failure mode, tests that don't actually assert behaviour (just call the
  function), assertion-free mocks.
- **design** — duplication that already exists in the codebase and should
  have been reused, abstraction layer added speculatively (no second
  caller), premature generalisation that makes the simple case harder to
  read.

Decision rule: *would the reviewer point this out in a normal PR review and
expect the author to address it?* If yes, major.

## Minor

**Nice to have. Optional. The author can address, defer, or push back.**

A minor is a finding that improves the change but isn't on the critical
path. Style, naming, small refactors, missing edge-case tests for trivial
inputs, comments that would help the next reader.

Decision rule: *would the reviewer mention this in a normal review but
expect the author to make their own call?* If yes, minor.

## Praise

**Acknowledge what the change does well. Evidence required.**

The VS Code multi-perspective review example explicitly says to acknowledge
what the code does well — adversarial review isn't just "find bad things",
it's "find the bad things *and* tell the author what they got right so they
keep doing it". Praise is in-scope.

Constraints:

- **Every praise item cites a file and line.** "Good error handling" is
  filler; "errors are wrapped with `map_err` and include the failing
  operation at `src/parser.rs:42-67`" is praise.
- **Praise is concrete and specific.** Naming choices, error-message
  structure, test coverage of an unexpected edge case, an idiomatic use
  of a stdlib feature, a reusable helper extracted from a previous
  duplication.
- **Capped at 5 items** total in the report (across all lenses). Pick the
  strongest.
- **Praise never overrides a blocker.** If the change is good in three
  ways and breaks in one, the report leads with the break.

## Severity decision order

When grading a finding, ask these in order:

1. *Does it ship broken behaviour or a security hole?* → **blocker**.
2. *Does it ship behaviour the user didn't ask for, or untested behaviour
   at a trust boundary?* → **blocker**.
3. *Will it cause real cost to fix later, or compound?* → **major**.
4. *Is it a quality / clarity / maintainability improvement?* → **minor**.
5. *Is the author doing something worth reinforcing?* → **praise**.

If a finding satisfies multiple, take the higher severity. When genuinely
between two severities, **escalate** — the cost of over-flagging is the
author ignoring a minor; the cost of under-flagging is shipping a problem.

## Unverified findings

If a lens suspects a problem but can't confirm from the diff alone (e.g.
"this query plan looks like it might N+1, would need to EXPLAIN against
production data to confirm"), the lens returns the finding with `verified:
false`. The coordinator surfaces these in a separate **Unverified
suspicions** section, not in the main findings table. The user decides
whether to investigate.