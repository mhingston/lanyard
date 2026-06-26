"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureCopilot = configureCopilot;
const fs_1 = require("fs");
const path_1 = require("path");
const constants_1 = require("./constants");
const json_file_1 = require("./json-file");
const leanctx_1 = require("./leanctx");
const server_config_1 = require("./server-config");
const shell_1 = require("./shell");
async function configureCopilot(workspaceRoot, servers) {
    const cliAvailable = await (0, shell_1.commandExists)("copilot");
    const configPath = await resolveWorkspaceConfigPath(workspaceRoot);
    const existing = (await readCopilotConfig(configPath)) ?? {};
    const merged = mergeCopilotConfig(existing, servers);
    const fileWrite = await (0, json_file_1.writeJsonFile)(configPath, merged);
    const persisted = (await readCopilotConfig(configPath)) ?? merged;
    const relativePath = (0, path_1.relative)(workspaceRoot, configPath);
    const verifications = cliAvailable
        ? (await verifyCopilotServersViaList(workspaceRoot, servers, configPath)) ??
            [
                ...servers.map((server) => verifyCopilotServerInConfig(persisted, server, relativePath)),
                verifyLeanCtxServerInConfig(persisted, relativePath),
            ]
        : [
            ...servers.map((server) => verifyCopilotServerInConfig(persisted, server, relativePath)),
            verifyLeanCtxServerInConfig(persisted, relativePath),
        ];
    return {
        files: [
            {
                label: "Copilot CLI workspace config",
                file: {
                    path: configPath,
                    ...fileWrite,
                },
            },
        ],
        verifications,
    };
}
async function resolveWorkspaceConfigPath(workspaceRoot) {
    const defaultPath = (0, path_1.join)(workspaceRoot, constants_1.COPILOT_WORKSPACE_MCP_CONFIG_PATH);
    const alternatePath = (0, path_1.join)(workspaceRoot, constants_1.COPILOT_ALTERNATE_WORKSPACE_MCP_CONFIG_PATH);
    const [defaultContents, alternateContents] = await Promise.all([
        (0, json_file_1.readTextFileIfExists)(defaultPath),
        (0, json_file_1.readTextFileIfExists)(alternatePath),
    ]);
    if (defaultContents !== undefined && alternateContents !== undefined) {
        throw new Error(`Found both ${(0, path_1.relative)(workspaceRoot, defaultPath)} and ${(0, path_1.relative)(workspaceRoot, alternatePath)}. Consolidate to a single Copilot workspace MCP file before running Lanyard.`);
    }
    if (alternateContents !== undefined) {
        return alternatePath;
    }
    return defaultPath;
}
function mergeCopilotConfig(existing, servers) {
    const nextServers = {
        ...getCopilotServers(existing, "Copilot config"),
    };
    for (const server of servers) {
        nextServers[server.name] = (0, server_config_1.buildCopilotServerConfig)(server);
    }
    nextServers["lean-ctx"] = (0, leanctx_1.buildLeanCtxCopilotServerConfig)();
    return {
        ...existing,
        mcpServers: nextServers,
    };
}
function verifyCopilotServerInConfig(config, server, location) {
    const current = getCopilotServers(config, "Copilot config")[server.name];
    const verified = (0, server_config_1.matchesHttpServer)(current, server);
    return {
        name: server.name,
        verified,
        via: "copilot-workspace-file",
        reason: verified
            ? `Found ${server.url} in ${location}.`
            : `Expected ${server.url} in ${location}, but found a different entry.`,
    };
}
function verifyLeanCtxServerInConfig(config, location) {
    const current = getCopilotServers(config, "Copilot config")["lean-ctx"];
    const verified = (0, leanctx_1.matchesLeanCtxCopilotServer)(current);
    return {
        name: "lean-ctx",
        verified,
        via: "copilot-workspace-file",
        reason: verified
            ? `Found lean-ctx in ${location}.`
            : `Expected lean-ctx in ${location}, but found a different entry.`,
    };
}
async function verifyCopilotServersViaList(cwd, servers, expectedSourcePath) {
    const result = await (0, shell_1.runCommand)("copilot", ["mcp", "list", "--json"], {
        cwd,
        allowNonZero: true,
    });
    if (result.code !== 0 || result.stdout.trim() === "") {
        return undefined;
    }
    const parsed = safeParseJson(result.stdout);
    const entries = extractCopilotServerEntries(parsed);
    if (!entries) {
        return undefined;
    }
    return [
        ...servers.map((server) => {
            const current = entries[server.name];
            const verified = (0, json_file_1.isRecord)(current) &&
                current.source === "workspace" &&
                hasExpectedSourcePath(current, expectedSourcePath) &&
                (0, server_config_1.matchesHttpServer)(current, server);
            return {
                name: server.name,
                verified,
                via: "copilot-cli",
                reason: verified
                    ? "`copilot mcp list --json` reported the expected workspace-scoped server configuration."
                    : "`copilot mcp list --json` did not report the expected workspace-scoped server configuration.",
            };
        }),
        (() => {
            const current = entries["lean-ctx"];
            const verified = (0, json_file_1.isRecord)(current) &&
                current.source === "workspace" &&
                hasExpectedSourcePath(current, expectedSourcePath) &&
                (0, leanctx_1.matchesLeanCtxCopilotServer)(current);
            return {
                name: "lean-ctx",
                verified,
                via: "copilot-cli",
                reason: verified
                    ? "`copilot mcp list --json` reported the expected workspace-scoped lean-ctx configuration."
                    : "`copilot mcp list --json` did not report the expected workspace-scoped lean-ctx configuration.",
            };
        })(),
    ];
}
async function readCopilotConfig(configPath) {
    const config = await (0, json_file_1.readJsonFile)(configPath);
    if (config === undefined) {
        return undefined;
    }
    if (!(0, json_file_1.isRecord)(config)) {
        throw new Error(`Expected ${configPath} to contain a JSON object.`);
    }
    if (config.mcpServers !== undefined && !(0, json_file_1.isRecord)(config.mcpServers)) {
        throw new Error(`Expected ${configPath} to contain an "mcpServers" object.`);
    }
    return config;
}
function getCopilotServers(config, sourceName) {
    if (config.mcpServers === undefined) {
        return {};
    }
    if (!(0, json_file_1.isRecord)(config.mcpServers)) {
        throw new Error(`Expected ${sourceName} to contain an "mcpServers" object.`);
    }
    return config.mcpServers;
}
function extractCopilotServerEntries(value) {
    if (!(0, json_file_1.isRecord)(value) || !(0, json_file_1.isRecord)(value.mcpServers)) {
        return undefined;
    }
    const entries = {};
    for (const [key, entry] of Object.entries(value.mcpServers)) {
        if ((0, json_file_1.isRecord)(entry)) {
            entries[key] = entry;
        }
    }
    return entries;
}
function hasExpectedSourcePath(value, expectedSourcePath) {
    return (typeof value.sourcePath === "string" &&
        canonicalizePath(value.sourcePath) === canonicalizePath(expectedSourcePath));
}
function canonicalizePath(value) {
    try {
        return (0, fs_1.realpathSync)(value);
    }
    catch {
        return (0, path_1.resolve)(value);
    }
}
function safeParseJson(value) {
    try {
        return JSON.parse(value);
    }
    catch {
        return undefined;
    }
}
