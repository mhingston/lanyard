"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRecord = isRecord;
exports.readTextFileIfExists = readTextFileIfExists;
exports.readJsonFile = readJsonFile;
exports.writeJsonFile = writeJsonFile;
exports.writeTextFile = writeTextFile;
const promises_1 = require("fs/promises");
const path_1 = require("path");
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
async function readTextFileIfExists(filePath) {
    try {
        return await (0, promises_1.readFile)(filePath, "utf8");
    }
    catch (error) {
        if (isMissingFileError(error)) {
            return undefined;
        }
        throw error;
    }
}
async function readJsonFile(filePath) {
    const raw = await readTextFileIfExists(filePath);
    if (raw === undefined) {
        return undefined;
    }
    try {
        return JSON.parse(raw);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to parse JSON at ${filePath}: ${message}`);
    }
}
async function writeJsonFile(filePath, value, options = {}) {
    return await writeTextFile(filePath, `${JSON.stringify(value, null, 2)}\n`, options);
}
async function writeTextFile(filePath, value, options = {}) {
    const { dryRun = false } = options;
    const current = await readTextFileIfExists(filePath);
    const created = current === undefined;
    const changed = current !== value;
    if (!changed) {
        return { changed: false, created: false };
    }
    if (!dryRun) {
        await (0, promises_1.mkdir)((0, path_1.dirname)(filePath), { recursive: true });
        await (0, promises_1.writeFile)(filePath, value, "utf8");
    }
    return { changed, created };
}
function isMissingFileError(error) {
    return (error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT");
}
