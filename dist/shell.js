"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.commandExists = commandExists;
exports.runCommand = runCommand;
exports.runInteractiveCommand = runInteractiveCommand;
exports.formatCommand = formatCommand;
const child_process_1 = require("child_process");
async function commandExists(command) {
    const lookupCommand = process.platform === "win32" ? "where" : "which";
    const result = await runCommand(lookupCommand, [command], { allowNonZero: true });
    return result.code === 0;
}
async function runCommand(command, args, options = {}) {
    const { cwd, allowNonZero = false } = options;
    return await new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)(command, args, {
            cwd,
            stdio: ["ignore", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk) => {
            stdout += chunk.toString();
        });
        child.stderr.on("data", (chunk) => {
            stderr += chunk.toString();
        });
        child.on("error", reject);
        child.on("close", (code) => {
            const result = { code, stdout, stderr };
            if (!allowNonZero && code !== 0) {
                reject(new Error(`${formatCommand(command, args)} failed with exit code ${code ?? "unknown"}.\n${stderr || stdout}`.trim()));
                return;
            }
            resolve(result);
        });
    });
}
async function runInteractiveCommand(command, args, cwd) {
    return await new Promise((resolve, reject) => {
        const child = (0, child_process_1.spawn)(command, args, {
            cwd,
            stdio: "inherit",
        });
        child.on("error", reject);
        child.on("close", (code) => resolve(code));
    });
}
function formatCommand(command, args) {
    return [command, ...args.map(quoteIfNeeded)].join(" ");
}
function quoteIfNeeded(value) {
    return /\s/.test(value) ? JSON.stringify(value) : value;
}
