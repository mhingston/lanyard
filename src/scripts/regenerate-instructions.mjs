#!/usr/bin/env node
// Lanyard self-learning regenerator. Invoked by Copilot's sessionEnd hook.
// Reads ~/.lean-ctx/events.jsonl, groups repeating patterns since the last
// run, and rewrites the managed block in
// .github/instructions/self-learning.instructions.md.
//
// Idempotent: tracks last-processed event id in .github/self-learning/.regen-state.json
// so re-runs only scan new events. Never touches content outside the ownership
// markers <!-- managed-by:lanyard start --> ... <!-- managed-by:lanyard end -->.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MARKER_START = '<!-- managed-by:lanyard start -->';
const MARKER_END = '<!-- managed-by:lanyard end -->';

// Front matter seeded when the regenerator has to recreate
// self-learning.instructions.md from scratch (the file is Lanyard-owned but
// may have been deleted by hand). `applyTo: "**"` so VS Code loads the
// learned patterns at the start of every task — matching the canonical
// definition in src/constants.ts. Keep these two in sync.
const SELF_LEARNING_INSTRUCTIONS_FRONT_MATTER = [
  '---',
  'name: Learned patterns',
  'description: Patterns and corrections mined from past Copilot/lean-ctx sessions in this repo. Load at the start of any task to avoid repeating mistakes previously corrected.',
  'applyTo: "**"',
  '---',
  '',
  '',
].join('\n');

const MIN_OCCURRENCES = 3;
const MAX_PATTERNS = 12;
const TTL_DAYS = 30;

// lean-ctx event kinds we treat as failure/issue signal.
const ISSUE_KINDS = new Set([
  'Anomaly',
  'SloViolation',
  'BudgetWarning',
  'PolicyViolation',
]);

function leanCtxDir() {
  // Respect LEAN_CTX_HOME if set, otherwise ~/.lean-ctx (lean-ctx default).
  if (process.env.LEAN_CTX_HOME) return process.env.LEAN_CTX_HOME;
  return join(homedir(), '.lean-ctx');
}

function eventsPath() {
  return join(leanCtxDir(), 'events.jsonl');
}

async function readRegenState(repoRoot) {
  const statePath = join(repoRoot, '.github', 'self-learning', '.regen-state.json');
  try {
    const raw = await readFile(statePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { lastProcessedId: 0, lastRegeneratedAt: null };
  }
}

async function writeRegenState(repoRoot, state) {
  const statePath = join(repoRoot, '.github', 'self-learning', '.regen-state.json');
  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf-8');
}

async function readEvents(sinceId) {
  const path = eventsPath();
  if (!existsSync(path)) return [];
  let raw;
  try {
    raw = await readFile(path, 'utf-8');
  } catch {
    return [];
  }
  const out = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    const id = Number(entry.id);
    if (Number.isFinite(id) && id <= sinceId) continue;
    out.push(entry);
  }
  return out;
}

function bucketToolCall(entry) {
  const kind = entry.kind || {};
  const tool = kind.tool || 'unknown';
  const saved = Number(kind.tokens_saved || 0);
  if (saved > 0) {
    return { key: `tool savings: ${tool} (${saved} tok/call)`, category: 'tool_saving' };
  }
  return { key: `tool used: ${tool}`, category: 'tool' };
}

function bucketIssue(entry) {
  const kind = entry.kind || {};
  const type = kind.type || 'Issue';
  if (type === 'PolicyViolation') {
    const reason = String(kind.reason || '').split('\n')[0].slice(0, 80);
    return { key: `policy: ${reason}`, category: 'policy' };
  }
  if (type === 'BudgetWarning') {
    return {
      key: `budget: ${kind.dimension || 'tokens'} at ${kind.percent || '?'}% (${kind.role || 'agent'} role)`,
      category: 'budget',
    };
  }
  if (type === 'Anomaly') {
    return {
      key: `anomaly: ${kind.metric || 'unknown'} (dev ${Number(kind.deviation_factor || 0).toFixed(1)}x)`,
      category: 'anomaly',
    };
  }
  if (type === 'SloViolation') {
    return {
      key: `slo miss: ${kind.slo_name || 'unknown'} (${kind.metric || '?'}=${Number(kind.actual || 0).toFixed(2)} / ${kind.threshold || '?'}`,
      category: 'slo',
    };
  }
  return { key: type.toLowerCase(), category: 'issue' };
}

function bucketKnowledgeUpdate(entry) {
  const kind = entry.kind || {};
  const cat = kind.category || 'general';
  const key = kind.key || 'unknown';
  return { key: `knowledge: ${cat}/${key}`, category: 'knowledge' };
}

function bucket(entry) {
  const type = entry?.kind?.type;
  if (!type) return null;
  if (type === 'ToolCall' || type === 'AgentAction') {
    // Only AgentAction tool registrations are noise; ToolCall is signal.
    if (type === 'AgentAction') return null;
    return bucketToolCall(entry);
  }
  if (ISSUE_KINDS.has(type)) return bucketIssue(entry);
  if (type === 'KnowledgeUpdate') {
    if (entry.kind?.action !== 'run') return bucketKnowledgeUpdate(entry);
    return null;
  }
  // CacheHit, ThresholdAdapted: noise for pattern learning.
  return null;
}

export function groupPatterns(entries) {
  const groups = new Map();
  const now = Date.now();
  const ttlMs = TTL_DAYS * 24 * 60 * 60 * 1000;

  for (const entry of entries) {
    const ts = Date.parse(entry.timestamp || '');
    if (Number.isFinite(ts) && now - ts > ttlMs) continue;

    const b = bucket(entry);
    if (!b) continue;

    const existing = groups.get(b.key) || {
      pattern: b.key,
      category: b.category,
      count: 0,
      firstSeen: ts || now,
      lastSeen: ts || now,
    };
    existing.count += 1;
    if (ts) {
      if (ts < existing.firstSeen) existing.firstSeen = ts;
      if (ts > existing.lastSeen) existing.lastSeen = ts;
    }
    groups.set(b.key, existing);
  }

  return [...groups.values()]
    .filter((g) => g.count >= MIN_OCCURRENCES)
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_PATTERNS);
}

function renderMarkdown(groups) {
  const lines = ['## Learned patterns', ''];
  if (groups.length === 0) {
    lines.push('_No repeating patterns detected yet. Mined from lean-ctx events since last session._');
    return lines.join('\n');
  }
  for (const g of groups) {
    const last = Number.isFinite(g.lastSeen)
      ? ` (last ${new Date(g.lastSeen).toISOString().slice(0, 10)})`
      : '';
    lines.push(`- **${g.pattern}** — ${g.count} occurrences${last}`);
  }
  return lines.join('\n');
}

export async function regenerate(repoRoot) {
  const state = await readRegenState(repoRoot);
  const entries = await readEvents(state.lastProcessedId || 0);
  if (entries.length === 0) return;

  const groups = groupPatterns(entries);
  const block = renderMarkdown(groups);

  // Single target: the description-only .instructions.md file. Earlier Lanyard
  // versions also rewrote the workspace-root AGENTS.md; that surface is no
  // longer Lanyard's responsibility (Lanyard targets Copilot only — see the
  // README and constants.ts for the rationale).
  const targets = [
    {
      // Lanyard-owned instructions file. createIfMissing: true so the
      // regenerator recreates it if a user deleted it by hand — otherwise
      // patterns would silently stop surfacing on the next session.
      path: join(repoRoot, '.github', 'instructions', 'self-learning.instructions.md'),
      createIfMissing: true,
    },
  ];

  for (const target of targets) {
    await updateLearnedPatternsBlock(target, block);
  }

  const maxId = entries.reduce((max, e) => {
    const id = Number(e.id);
    return Number.isFinite(id) && id > max ? id : max;
  }, state.lastProcessedId || 0);

  await writeRegenState(repoRoot, {
    lastProcessedId: maxId,
    lastRegeneratedAt: new Date().toISOString(),
  });
}

// Rewrite the `<!-- managed-by:lanyard start/end -->` block in one target
  // file. If the file is missing and `createIfMissing` is true, seed it with
  // front matter plus a fresh managed block. If the file exists but has no
  // managed markers, append them rather than touch the user's existing
  // content.
async function updateLearnedPatternsBlock(target, block) {
  let sourceContent;
  try {
    sourceContent = await readFile(target.path, 'utf-8');
  } catch {
    if (!target.createIfMissing) return;
    sourceContent = SELF_LEARNING_INSTRUCTIONS_FRONT_MATTER;
  }

  const startIdx = sourceContent.indexOf(MARKER_START);
  const endIdx = sourceContent.indexOf(MARKER_END, startIdx === -1 ? 0 : startIdx);

  let newContent;
  if (startIdx === -1 || endIdx === -1) {
    // No markers: append a fresh managed block.
    const prefix = sourceContent.trimEnd();
    const sep = prefix.length > 0 ? '\n\n' : '';
    newContent = `${prefix}${sep}${MARKER_START}\n${block}\n${MARKER_END}\n`;
  } else {
    const before = sourceContent.slice(0, startIdx);
    const after = sourceContent.slice(endIdx + MARKER_END.length);
    newContent = `${before}${MARKER_START}\n${block}\n${MARKER_END}${after}`;
  }

  await mkdir(dirname(target.path), { recursive: true });
  await writeFile(target.path, newContent, 'utf-8');
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;

if (isMain) {
  // repoRoot is the cwd when the hook fires, or the dir containing the script's
  // parent .github/ (i.e. two levels up from .github/scripts/).
  const fromEnv = process.env.LANYARD_REPO_ROOT;
  const repoRoot = fromEnv || process.cwd();
  try {
    await regenerate(repoRoot);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
  }
  process.exit(0);
}
