"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mergeStringArrays = mergeStringArrays;
exports.matchesStringArray = matchesStringArray;
function mergeStringArrays(existing, required, fieldName) {
    if (existing === undefined) {
        return [...required];
    }
    if (!Array.isArray(existing) || existing.some((item) => typeof item !== "string")) {
        throw new Error(`Expected ${fieldName} to be an array of strings.`);
    }
    const merged = [...existing];
    for (const value of required) {
        if (!merged.includes(value)) {
            merged.push(value);
        }
    }
    return merged;
}
function matchesStringArray(value, expected) {
    return (Array.isArray(value) &&
        value.length === expected.length &&
        value.every((item, index) => typeof item === "string" && item === expected[index]));
}
