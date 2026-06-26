# Tech Notes Extraction

How the `ticket-to-pr` coordinator pulls the spec-relevant slice out of
a Jira issue. The Atlassian MCP returns the issue in one of two shapes
(Cloud REST v3 vs Rovo MCP's flattened shape); both are handled.

## Input shapes

### Atlassian Cloud REST v3 (most common)

```json
{
  "key": "PROJ-123",
  "fields": {
    "summary": "Add tenant cache with TTL fallback",
    "description": { "type": "doc", "content": [ ... ADF nodes ... ] },
    "issuetype": { "name": "Story" },
    "parent": { "key": "PROJ-100" },
    "issuelinks": [
      { "outwardIssue": { "key": "PROJ-122" }, "type": { "outward": "blocks" } }
    ]
  }
}
```

### Flattened (some MCP versions)

```json
{
  "key": "PROJ-123",
  "summary": "Add tenant cache with TTL fallback",
  "description": "... ADF JSON or pre-rendered HTML ...",
  "issueType": "Story",
  "parent": { "key": "PROJ-100" }
}
```

The coordinator probes both. Read whichever fields exist.

## ADF → plain text

The Atlassian Document Format (ADF) is JSON; we walk it and flatten:

| ADF node | Output |
| --- | --- |
| `paragraph` | newline-separated block, blank line between |
| `heading` levels 1–6 | `# ` … `###### ` prefixed line |
| `bulletList` / `orderedList` | `- ` or `1. ` for each `listItem` |
| `codeBlock` | triple-backtick block, language from `attrs.language` |
| `inlineCode` | single-backtick span |
| `text` | literal text + `marks` (bold → `**`, italic → `_`, code → backticks, link → `[text](href)`) |
| `mention` | `@Display Name` |
| `table`, `tableRow`, `tableCell` | newlines between rows, pipes between cells (rare in tech notes — usually safe to skip) |
| `media`, `mediaSingle`, attachments | skipped (mention file names in a separate `[attachments]` line if present) |
| unknown / `emoji` | pass-through text |

Don't try to render ADF perfectly — fidelity to the source matters
less than clarity for the implementer. If a node is unknown, dump its
`text` or `content` children if present, else skip with a
`<!-- skipped: <type> -->` comment.

If the description is already HTML or plain text (some MCP versions
pre-render), use it as-is — no flattening needed, but still strip
`<style>`, `<script>`, and table markup if it makes the result
unreadable.

## Locate the tech notes block

Jira descriptions in this workflow follow one of two conventions:

1. **Whole description is the spec.** Common for fresh tickets written
   directly into the description.
2. **Description has a `## Tech notes` section.** The `refine` skill
   posts an agreed spec into a `## Tech notes` (or `**Tech notes**`)
   heading inside the description. The implementer should read only
   that block, not the whole description.

Detection algorithm:

1. Concatenate the description as plain text.
2. Find any of these markers, case-sensitive:
   - `## Tech notes`
   - `### Tech notes`
   - `**Tech notes**`
   - `**Tech Notes**`
3. If found, take everything from the marker to the next heading
   (`## `, `### `) of equal or higher level, OR to the end of the
   document, whichever comes first.
4. If not found, use the entire description.

When a `## Tech notes` block is found, the rest of the description
(before the marker) becomes the **context** — sent to the implementer
under `## Background`. The block itself becomes the **spec**.

## "Do not change" / scope commitments

Before forwarding the spec, scan for these markers and copy them into
a separate `## Constraints` block in the implementer's prompt:

- `do not change`
- `do not modify`
- `do not break`
- `scope: only`
- `preserve backwards compat`
- `must remain`
- `must not change`
- `out of scope`

Each match becomes a bullet in `## Constraints`, verbatim from the
source. The implementer treats these as hard constraints, not
suggestions.

If the description says "do not change X" but the spec asks the
implementer to change X, the coordinator stops and reports the
contradiction — it does not silently let the implementer pick a side.

## Vague or empty description

If, after ADF flattening and tech-notes extraction, the spec is:

- Empty.
- Less than 20 characters of prose (whitespace and code blocks don't
  count).
- Only a single sentence with no verbs ("cache bug", "login slow",
  "API broken").
- Only links to external documents (Confluence pages, Figma files,
  videos) with no inline description of what to do.

…then the coordinator stops and prints:

```
PROJ-123 doesn't have tech notes yet. The description is empty /
too vague to code against. Run the `refine` skill first to fill
the ticket against the readiness rubric, then re-invoke
ticket-to-pr.
```

It does not fall back to "let me guess what they meant" — that's how
hallucinated code happens.

## Pulling linked context

In addition to the description itself, capture:

- **Parent epic key** (`fields.parent.key`) — goes in the PR body
  `Refs:` line as `parent of: EPIC-100`.
- **Outward issue links** (`fields.issuelinks[].outwardIssue.key`) —
  for `blocks` and `relates to`, include in `Refs:` as
  `blocks: PROJ-122` or `relates to: PROJ-122`. Skip `clones` and
  `duplicates` (they're noise).
- **Acceptance criteria** if present in `fields.customfield_acceptance`
  or similar custom field (project-specific). Include as a `## AC`
  block in the implementer's prompt if found.

Don't fetch linked Confluence pages. If the description says "see
<https://...>" link to a design doc, include the URL as a one-liner
in the implementer's prompt under `## See also` — don't try to fetch
it. The implementer can decide whether to read it.

## What the implementer gets

The coordinator composes a single prompt block:

```
## Spec
<tech notes block OR full description>

## Background
<everything before the tech notes marker, if any>

## Constraints
- <do not change X>
- <preserve backwards compat with Y>
- ...

## AC
- <acceptance criterion 1>
- <acceptance criterion 2>
- ...

## See also
- <Confluence URL 1>
- <Figma URL 2>
- ...

## Branch
feat/PROJ-123-<slug>
```

The `## Spec` and `## Constraints` blocks are required; the others
are optional and omitted if empty.