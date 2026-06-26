import { join } from "path";

import { VSCODE_MCP_CONFIG_PATH } from "./constants";
import { isRecord, readJsonFile, writeJsonFile } from "./json-file";
import {
  buildLeanCtxVsCodeServerConfig,
  matchesLeanCtxVsCodeServer,
} from "./leanctx";
import { buildVsCodeServerConfig, matchesHttpServer } from "./server-config";
import {
  FileMutationResult,
  ServerSpec,
  ServerVerification,
  VsCodeConfig,
  VsCodeSetupResult,
} from "./types";

export async function configureVsCodeWorkspace(
  workspaceRoot: string,
  servers: readonly ServerSpec[],
): Promise<VsCodeSetupResult> {
  const filePath = join(workspaceRoot, VSCODE_MCP_CONFIG_PATH);
  const existing = (await readJsonFile<VsCodeConfig>(filePath)) ?? {};

  if (!isRecord(existing)) {
    throw new Error(`Expected ${filePath} to contain a JSON object.`);
  }

  const existingServers = existing.servers;
  if (existingServers !== undefined && !isRecord(existingServers)) {
    throw new Error(`Expected ${filePath} to contain a "servers" object.`);
  }

  const nextServers: NonNullable<VsCodeConfig["servers"]> = {
    ...(existingServers ?? {}),
  };

  for (const server of servers) {
    nextServers[server.name] = buildVsCodeServerConfig(server);
  }
  nextServers["lean-ctx"] = buildLeanCtxVsCodeServerConfig();

  const nextConfig: VsCodeConfig = {
    ...existing,
    servers: nextServers,
  };

  const fileWrite = await writeJsonFile(filePath, nextConfig);

  const persisted = (await readJsonFile<VsCodeConfig>(filePath)) ?? nextConfig;

  return {
    file: {
      path: filePath,
      ...fileWrite,
    } satisfies FileMutationResult,
    verifications: [
      ...servers.map((server) => verifyVsCodeServer(persisted, server)),
      verifyLeanCtxVsCodeServer(persisted),
    ],
  };
}

function verifyVsCodeServer(
  config: VsCodeConfig,
  server: ServerSpec,
): ServerVerification {
  const current =
    isRecord(config.servers) && server.name in config.servers
      ? config.servers[server.name]
      : undefined;
  const verified = matchesHttpServer(current, server);

  return {
    name: server.name,
    verified,
    via: "vscode-workspace-file",
    reason: verified
      ? `Found ${server.url} in .vscode/mcp.json.`
      : `Expected ${server.url} in .vscode/mcp.json, but found a different entry.`,
  };
}

function verifyLeanCtxVsCodeServer(config: VsCodeConfig): ServerVerification {
  const current =
    isRecord(config.servers) && "lean-ctx" in config.servers
      ? config.servers["lean-ctx"]
      : undefined;
  const verified = matchesLeanCtxVsCodeServer(current);

  return {
    name: "lean-ctx",
    verified,
    via: "vscode-workspace-file",
    reason: verified
      ? "Found lean-ctx in .vscode/mcp.json."
      : "Expected lean-ctx in .vscode/mcp.json, but found a different entry.",
  };
}
