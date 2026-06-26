"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runInstructionsHygiene = runInstructionsHygiene;
exports.warnIfLeanCtxMissing = warnIfLeanCtxMissing;
const shell_1 = require("./shell");
const constants_1 = require("./constants");
// The prompt that drives a non-interactive Copilot run to execute the
// refactor-instructions skill against the repo's .github/instructions/ tree.
// Copilot loads the skill from .github/skills/refactor-instructions/; this prompt
// tells the agent to actually run it (so the tidy-up is guaranteed rather than
// left to the agent's discretion) and scopes the work to structural findings.
// Front-matter `description`/`name`/`applyTo` on Lanyard-owned files is owned
// by the bootstrap source-of-truth in src/constants.ts; the next `lanyard`
// run would reset any model rewrite anyway, so the model only audits those
// files for structural findings and only rewrites front matter on user-added
// files.
const REFACTOR_INSTRUCTIONS_PROMPT = [
    "Run the `refactor-instructions` agent skill from",
    "`.github/skills/refactor-instructions/SKILL.md` to audit and reorganise the",
    "`.github/instructions/` files in this repo per the VS Code custom-instructions",
    "convention. Apply the structural findings: split oversized always-on files",
    "into scoped ones, validate `applyTo` globs against the repo's actual files,",
    "and flag missing front matter on user-added files. Do NOT rewrite the YAML",
    "front matter (`description`, `name`, `applyTo`) of Lanyard-owned",
    "instruction files — those have `<!-- lanyard:*:start/end -->` or",
    "`<!-- managed-by:lanyard start/end -->` markers and their front matter is",
    "the bootstrap's source-of-truth (the next `lanyard` run would overwrite",
    "any rewrite). Do not delete any file.",
].join(" ");
/**
 * Drive a non-interactive Copilot CLI run that executes the refactor-instructions
 * skill against the repo's `.github/instructions/` tree, so existing repo
 * instructions are tidied (applyTo scoping, descriptions, splitting) as part of
 * the bootstrap. The skill must already be on disk (written by
 * configureLeanCtxWorkspace); this runs after every other config write.
 *
 * Warns loudly and returns without throwing if the copilot CLI is not installed
 * (the config writes already succeeded; a missing tidy-up step should not roll
 * those back). A non-zero exit from copilot is surfaced as a warning, not an
 * error, for the same reason.
 */
async function runInstructionsHygiene(workspaceRoot) {
    if (!(await (0, shell_1.commandExists)("copilot"))) {
        console.warn(`\n[warn] The GitHub Copilot CLI was not found on PATH, so the refactor-instructions skill was not run. The instruction files were written; to tidy them now, install the Copilot CLI (https://docs.github.com/copilot/copilot-cli) and run:\n\n  copilot -p "${REFACTOR_INSTRUCTIONS_PROMPT}" --allow-all-tools --add-dir .\n`);
        return;
    }
    console.log("\nRunning the refactor-instructions skill via the Copilot CLI to tidy the .github/instructions/ tree …");
    const exitCode = await (0, shell_1.runInteractiveCommand)("copilot", [
        "-p",
        REFACTOR_INSTRUCTIONS_PROMPT,
        "--allow-all-tools",
        "--add-dir",
        ".",
    ], workspaceRoot);
    if (exitCode !== 0) {
        console.warn(`\n[warn] Copilot exited with code ${exitCode ?? "unknown"} while running the refactor-instructions skill. The configuration files were still written; inspect .github/instructions/ and re-run the skill manually if needed:\n\n  copilot -p "${REFACTOR_INSTRUCTIONS_PROMPT}" --allow-all-tools --add-dir .\n`);
    }
}
/**
 * Warn loudly if lean-ctx (required for the workspace MCP servers to resolve)
 * is not on PATH. Lanyard writes the config but does not install binaries;
 * tell the user the install command so they can do it themselves.
 */
async function warnIfLeanCtxMissing() {
    if (await (0, shell_1.commandExists)("lean-ctx")) {
        return;
    }
    console.warn(`\n[warn] lean-ctx is not on PATH; the workspace MCP servers won't resolve until it's installed. Install it:\n\n  curl -fsSL ${constants_1.LEAN_CTX_INSTALL_URL} | sh\n\nOr, if you have a JS package manager:\n\n  npm install -g ${constants_1.LEAN_CTX_NPM_PACKAGE}\n`);
}
