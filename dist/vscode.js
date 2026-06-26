"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureVsCodeWorkspace = configureVsCodeWorkspace;
const path_1 = require("path");
const constants_1 = require("./constants");
const json_file_1 = require("./json-file");
const leanctx_1 = require("./leanctx");
const server_config_1 = require("./server-config");
async function configureVsCodeWorkspace(workspaceRoot, servers) {
    const filePath = (0, path_1.join)(workspaceRoot, constants_1.VSCODE_MCP_CONFIG_PATH);
    const existing = (await (0, json_file_1.readJsonFile)(filePath)) ?? {};
    if (!(0, json_file_1.isRecord)(existing)) {
        throw new Error(`Expected ${filePath} to contain a JSON object.`);
    }
    const existingServers = existing.servers;
    if (existingServers !== undefined && !(0, json_file_1.isRecord)(existingServers)) {
        throw new Error(`Expected ${filePath} to contain a "servers" object.`);
    }
    const nextServers = {
        ...(existingServers ?? {}),
    };
    for (const server of servers) {
        nextServers[server.name] = (0, server_config_1.buildVsCodeServerConfig)(server);
    }
    nextServers["lean-ctx"] = (0, leanctx_1.buildLeanCtxVsCodeServerConfig)();
    const nextConfig = {
        ...existing,
        servers: nextServers,
    };
    const fileWrite = await (0, json_file_1.writeJsonFile)(filePath, nextConfig);
    const persisted = (await (0, json_file_1.readJsonFile)(filePath)) ?? nextConfig;
    return {
        file: {
            path: filePath,
            ...fileWrite,
        },
        verifications: [
            ...servers.map((server) => verifyVsCodeServer(persisted, server)),
            verifyLeanCtxVsCodeServer(persisted),
        ],
    };
}
function verifyVsCodeServer(config, server) {
    const current = (0, json_file_1.isRecord)(config.servers) && server.name in config.servers
        ? config.servers[server.name]
        : undefined;
    const verified = (0, server_config_1.matchesHttpServer)(current, server);
    return {
        name: server.name,
        verified,
        via: "vscode-workspace-file",
        reason: verified
            ? `Found ${server.url} in .vscode/mcp.json.`
            : `Expected ${server.url} in .vscode/mcp.json, but found a different entry.`,
    };
}
function verifyLeanCtxVsCodeServer(config) {
    const current = (0, json_file_1.isRecord)(config.servers) && "lean-ctx" in config.servers
        ? config.servers["lean-ctx"]
        : undefined;
    const verified = (0, leanctx_1.matchesLeanCtxVsCodeServer)(current);
    return {
        name: "lean-ctx",
        verified,
        via: "vscode-workspace-file",
        reason: verified
            ? "Found lean-ctx in .vscode/mcp.json."
            : "Expected lean-ctx in .vscode/mcp.json, but found a different entry.",
    };
}
