import { realpathSync } from "fs";
import { join, relative, resolve } from "path";

import {
  COPILOT_ALTERNATE_WORKSPACE_MCP_CONFIG_PATH,
  COPILOT_WORKSPACE_MCP_CONFIG_PATH,
} from "./constants";
import { isRecord, readJsonFile, readTextFileIfExists, writeJsonFile } from "./json-file";
import {
  buildLeanCtxCopilotServerConfig,
  matchesLeanCtxCopilotServer,
} from "./leanctx";
import { buildCopilotServerConfig, matchesHttpServer } from "./server-config";
import { commandExists, runCommand } from "./shell";
import {
  CopilotConfig,
  CopilotServerConfig,
  FileMutationResult,
  LabeledFileMutationResult,
  ServerSpec,
  ServerVerification,
} from "./types";

export async function configureCopilot(
  workspaceRoot: string,
  servers: readonly ServerSpec[],
): Promise<CopilotResult> {
  const cliAvailable = await commandExists("copilot");
  const configPath = await resolveWorkspaceConfigPath(workspaceRoot);
  const existing = (await readCopilotConfig(configPath)) ?? {};
  const merged = mergeCopilotConfig(existing, servers);
  const fileWrite = await writeJsonFile(configPath, merged);
  const persisted = (await readCopilotConfig(configPath)) ?? merged;
  const relativePath = relative(workspaceRoot, configPath);

  const verifications =
    cliAvailable
      ? (await verifyCopilotServersViaList(
          workspaceRoot,
          servers,
          configPath,
        )) ??
        [
          ...servers.map((server) =>
            verifyCopilotServerInConfig(
              persisted,
              server,
              relativePath,
            ),
          ),
          verifyLeanCtxServerInConfig(persisted, relativePath),
        ]
      : [
          ...servers.map((server) =>
            verifyCopilotServerInConfig(
              persisted,
              server,
              relativePath,
            ),
          ),
          verifyLeanCtxServerInConfig(persisted, relativePath),
        ];

  return {
    files: [
      {
        label: "Copilot CLI workspace config",
        file: {
          path: configPath,
          ...fileWrite,
        } satisfies FileMutationResult,
      },
    ],
    verifications,
  };
}

export interface CopilotResult {
  files: LabeledFileMutationResult[];
  verifications: ServerVerification[];
}

async function resolveWorkspaceConfigPath(workspaceRoot: string): Promise<string> {
  const defaultPath = join(workspaceRoot, COPILOT_WORKSPACE_MCP_CONFIG_PATH);
  const alternatePath = join(
    workspaceRoot,
    COPILOT_ALTERNATE_WORKSPACE_MCP_CONFIG_PATH,
  );

  const [defaultContents, alternateContents] = await Promise.all([
    readTextFileIfExists(defaultPath),
    readTextFileIfExists(alternatePath),
  ]);

  if (defaultContents !== undefined && alternateContents !== undefined) {
    throw new Error(
      `Found both ${relative(workspaceRoot, defaultPath)} and ${relative(
        workspaceRoot,
        alternatePath,
      )}. Consolidate to a single Copilot workspace MCP file before running Lanyard.`,
    );
  }

  if (alternateContents !== undefined) {
    return alternatePath;
  }

  return defaultPath;
}

function mergeCopilotConfig(
  existing: CopilotConfig,
  servers: readonly ServerSpec[],
): CopilotConfig {
  const nextServers: Record<string, CopilotServerConfig> = {
    ...getCopilotServers(existing, "Copilot config"),
  };

  for (const server of servers) {
    nextServers[server.name] = buildCopilotServerConfig(server);
  }
  nextServers["lean-ctx"] = buildLeanCtxCopilotServerConfig();

  return {
    ...existing,
    mcpServers: nextServers,
  };
}

function verifyCopilotServerInConfig(
  config: CopilotConfig,
  server: ServerSpec,
  location: string,
): ServerVerification {
  const current = getCopilotServers(config, "Copilot config")[server.name];
  const verified = matchesHttpServer(current, server);

  return {
    name: server.name,
    verified,
    via: "copilot-workspace-file",
    reason: verified
      ? `Found ${server.url} in ${location}.`
      : `Expected ${server.url} in ${location}, but found a different entry.`,
  };
}

function verifyLeanCtxServerInConfig(
  config: CopilotConfig,
  location: string,
): ServerVerification {
  const current = getCopilotServers(config, "Copilot config")["lean-ctx"];
  const verified = matchesLeanCtxCopilotServer(current);

  return {
    name: "lean-ctx",
    verified,
    via: "copilot-workspace-file",
    reason: verified
      ? `Found lean-ctx in ${location}.`
      : `Expected lean-ctx in ${location}, but found a different entry.`,
  };
}

async function verifyCopilotServersViaList(
  cwd: string,
  servers: readonly ServerSpec[],
  expectedSourcePath: string,
): Promise<ServerVerification[] | undefined> {
  const result = await runCommand("copilot", ["mcp", "list", "--json"], {
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
      const verified =
        isRecord(current) &&
        current.source === "workspace" &&
        hasExpectedSourcePath(current, expectedSourcePath) &&
        matchesHttpServer(current, server);

      return {
        name: server.name,
        verified,
        via: "copilot-cli",
        reason: verified
          ? "`copilot mcp list --json` reported the expected workspace-scoped server configuration."
          : "`copilot mcp list --json` did not report the expected workspace-scoped server configuration.",
      } satisfies ServerVerification;
    }),
    (() => {
      const current = entries["lean-ctx"];
      const verified =
        isRecord(current) &&
        current.source === "workspace" &&
        hasExpectedSourcePath(current, expectedSourcePath) &&
        matchesLeanCtxCopilotServer(current);

      return {
        name: "lean-ctx",
        verified,
        via: "copilot-cli",
        reason: verified
          ? "`copilot mcp list --json` reported the expected workspace-scoped lean-ctx configuration."
          : "`copilot mcp list --json` did not report the expected workspace-scoped lean-ctx configuration.",
      } satisfies ServerVerification;
    })(),
  ];
}

async function readCopilotConfig(
  configPath: string,
): Promise<CopilotConfig | undefined> {
  const config = await readJsonFile<CopilotConfig>(configPath);
  if (config === undefined) {
    return undefined;
  }

  if (!isRecord(config)) {
    throw new Error(`Expected ${configPath} to contain a JSON object.`);
  }

  if (config.mcpServers !== undefined && !isRecord(config.mcpServers)) {
    throw new Error(`Expected ${configPath} to contain an "mcpServers" object.`);
  }

  return config;
}

function getCopilotServers(
  config: CopilotConfig,
  sourceName: string,
): Record<string, CopilotServerConfig> {
  if (config.mcpServers === undefined) {
    return {};
  }

  if (!isRecord(config.mcpServers)) {
    throw new Error(`Expected ${sourceName} to contain an "mcpServers" object.`);
  }

  return config.mcpServers as Record<string, CopilotServerConfig>;
}

function extractCopilotServerEntries(
  value: unknown,
): Record<string, Record<string, unknown>> | undefined {
  if (!isRecord(value) || !isRecord(value.mcpServers)) {
    return undefined;
  }

  const entries: Record<string, Record<string, unknown>> = {};
  for (const [key, entry] of Object.entries(value.mcpServers)) {
    if (isRecord(entry)) {
      entries[key] = entry;
    }
  }

  return entries;
}

function hasExpectedSourcePath(
  value: Record<string, unknown>,
  expectedSourcePath: string,
): boolean {
  return (
    typeof value.sourcePath === "string" &&
    canonicalizePath(value.sourcePath) === canonicalizePath(expectedSourcePath)
  );
}

function canonicalizePath(value: string): string {
  try {
    return realpathSync(value);
  } catch {
    return resolve(value);
  }
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}
