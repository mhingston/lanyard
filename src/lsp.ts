import { readdir } from "fs/promises";
import { extname, join, relative } from "path";

import {
  COPILOT_ALTERNATE_WORKSPACE_LSP_CONFIG_PATH,
  COPILOT_WORKSPACE_LSP_CONFIG_PATH,
  VSCODE_EXTENSIONS_CONFIG_PATH,
} from "./constants";
import { isRecord, readJsonFile, readTextFileIfExists, writeJsonFile } from "./json-file";
import { matchesStringArray, mergeStringArrays } from "./string-arrays";
import {
  CopilotLspConfig,
  CopilotLspServerConfig,
  FileMutationResult,
  LabeledFileMutationResult,
  ServerVerification,
  VsCodeExtensionsConfig,
} from "./types";

interface LspCatalogEntry {
  readonly key: string;
  readonly displayName: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly fileExtensions: Readonly<Record<string, string>>;
  readonly detectExtensions: readonly string[];
  readonly detectFileNames?: readonly string[];
  readonly vscodeExtensions?: readonly string[];
}

interface LspTargets {
  readonly configureCopilot: boolean;
  readonly configureVsCode: boolean;
}

interface DetectionIndex {
  readonly byExtension: ReadonlyMap<string, readonly string[]>;
  readonly byFileName: ReadonlyMap<string, readonly string[]>;
}

const LSP_SERVER_CATALOG: readonly LspCatalogEntry[] = [
  {
    key: "typescript",
    displayName: "TypeScript / JavaScript",
    command: "typescript-language-server",
    args: ["--stdio"],
    fileExtensions: {
      ".ts": "typescript",
      ".tsx": "typescriptreact",
      ".js": "javascript",
      ".jsx": "javascriptreact",
      ".mjs": "javascript",
      ".cjs": "javascript",
      ".mts": "typescript",
      ".cts": "typescript",
    },
    detectExtensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"],
  },
  {
    key: "java",
    displayName: "Java",
    command: "jdtls",
    args: [],
    fileExtensions: {
      ".java": "java",
    },
    detectExtensions: [".java"],
    detectFileNames: ["pom.xml", "build.gradle", "build.gradle.kts"],
    vscodeExtensions: ["redhat.java"],
  },
  {
    key: "python",
    displayName: "Python",
    command: "pyright-langserver",
    args: ["--stdio"],
    fileExtensions: {
      ".py": "python",
      ".pyw": "python",
      ".pyi": "python",
    },
    detectExtensions: [".py", ".pyw", ".pyi"],
    vscodeExtensions: ["ms-python.python", "ms-python.vscode-pylance"],
  },
  {
    key: "go",
    displayName: "Go",
    command: "gopls",
    args: ["serve"],
    fileExtensions: {
      ".go": "go",
    },
    detectExtensions: [".go"],
    detectFileNames: ["go.mod", "go.work"],
    vscodeExtensions: ["golang.go"],
  },
  {
    key: "rust",
    displayName: "Rust",
    command: "rust-analyzer",
    args: [],
    fileExtensions: {
      ".rs": "rust",
    },
    detectExtensions: [".rs"],
    detectFileNames: ["cargo.toml"],
    vscodeExtensions: ["rust-lang.rust-analyzer"],
  },
  {
    key: "cpp",
    displayName: "C / C++",
    command: "clangd",
    args: ["--background-index"],
    fileExtensions: {
      ".c": "c",
      ".h": "c",
      ".cpp": "cpp",
      ".cxx": "cpp",
      ".cc": "cpp",
      ".hpp": "cpp",
      ".hxx": "cpp",
    },
    detectExtensions: [".c", ".h", ".cpp", ".cxx", ".cc", ".hpp", ".hxx"],
    vscodeExtensions: ["ms-vscode.cpptools"],
  },
  {
    key: "csharp",
    displayName: "C#",
    command: "dotnet",
    args: [
      "dnx",
      "roslyn-language-server",
      "--yes",
      "--prerelease",
      "--",
      "--stdio",
      "--autoLoadProjects",
    ],
    fileExtensions: {
      ".cs": "csharp",
    },
    detectExtensions: [".cs", ".csproj", ".sln"],
    vscodeExtensions: ["ms-dotnettools.csharp"],
  },
  {
    key: "ruby",
    displayName: "Ruby",
    command: "solargraph",
    args: ["stdio"],
    fileExtensions: {
      ".rb": "ruby",
      ".rbw": "ruby",
      ".rake": "ruby",
      ".gemspec": "ruby",
    },
    detectExtensions: [".rb", ".rbw", ".rake", ".gemspec"],
    detectFileNames: ["gemfile", "rakefile"],
    vscodeExtensions: ["castwide.solargraph"],
  },
  {
    key: "php",
    displayName: "PHP",
    command: "intelephense",
    args: ["--stdio"],
    fileExtensions: {
      ".php": "php",
    },
    detectExtensions: [".php"],
    detectFileNames: ["composer.json"],
    vscodeExtensions: ["bmewburn.vscode-intelephense-client"],
  },
  {
    key: "kotlin",
    displayName: "Kotlin",
    command: "kotlin-language-server",
    args: [],
    fileExtensions: {
      ".kt": "kotlin",
      ".kts": "kotlin",
    },
    detectExtensions: [".kt", ".kts"],
    vscodeExtensions: ["fwcd.kotlin"],
  },
  {
    key: "swift",
    displayName: "Swift",
    command: "sourcekit-lsp",
    args: [],
    fileExtensions: {
      ".swift": "swift",
    },
    detectExtensions: [".swift"],
    detectFileNames: ["package.swift"],
    vscodeExtensions: ["swift-lang.swift"],
  },
  {
    key: "lua",
    displayName: "Lua",
    command: "lua-language-server",
    args: [],
    fileExtensions: {
      ".lua": "lua",
    },
    detectExtensions: [".lua"],
    vscodeExtensions: ["sumneko.lua"],
  },
  {
    key: "yaml",
    displayName: "YAML",
    command: "yaml-language-server",
    args: ["--stdio"],
    fileExtensions: {
      ".yaml": "yaml",
      ".yml": "yaml",
    },
    detectExtensions: [".yaml", ".yml"],
    vscodeExtensions: ["redhat.vscode-yaml"],
  },
  {
    key: "bash",
    displayName: "Bash / Shell",
    command: "bash-language-server",
    args: ["start"],
    fileExtensions: {
      ".sh": "shellscript",
      ".bash": "shellscript",
      ".zsh": "shellscript",
    },
    detectExtensions: [".sh", ".bash", ".zsh"],
    vscodeExtensions: ["mads-hartmann.bash-ide-vscode"],
  },
] as const;

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".idea",
  ".next",
  ".nuxt",
  ".turbo",
  ".venv",
  ".vscode",
  "bin",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "obj",
  "out",
  "target",
  "tmp",
  "venv",
]);

const DETECTION_INDEX = createDetectionIndex(LSP_SERVER_CATALOG);

export async function configureWorkspaceLsp(
  workspaceRoot: string,
  targets: LspTargets,
): Promise<LspResult> {
  if (!targets.configureCopilot && !targets.configureVsCode) {
    return { files: [], verifications: [] };
  }

  const detectedServers = await detectWorkspaceLspServers(workspaceRoot);
  if (detectedServers.length === 0) {
    return { files: [], verifications: [] };
  }

  const files: LabeledFileMutationResult[] = [];
  const verifications: ServerVerification[] = [];

  if (targets.configureCopilot) {
    const copilotResult = await configureCopilotLspConfig(
      workspaceRoot,
      detectedServers,
    );
    files.push(copilotResult.file);
    verifications.push(...copilotResult.verifications);
  }

  if (targets.configureVsCode) {
    const recommendedExtensions = collectVsCodeExtensions(detectedServers);
    if (recommendedExtensions.length > 0) {
      const vscodeResult = await configureVsCodeExtensions(
        workspaceRoot,
        recommendedExtensions,
      );
      files.push(vscodeResult.file);
      verifications.push(...vscodeResult.verifications);
    }
  }

  return { files, verifications };
}

export interface LspResult {
  files: LabeledFileMutationResult[];
  verifications: ServerVerification[];
}

async function detectWorkspaceLspServers(workspaceRoot: string): Promise<LspCatalogEntry[]> {
  const detectedKeys = new Set<string>();
  await walkWorkspace(workspaceRoot, detectedKeys);
  return LSP_SERVER_CATALOG.filter((server) => detectedKeys.has(server.key));
}

async function walkWorkspace(directory: string, detectedKeys: Set<string>): Promise<void> {
  if (detectedKeys.size === LSP_SERVER_CATALOG.length) {
    return;
  }

  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }

      await walkWorkspace(join(directory, entry.name), detectedKeys);
      if (detectedKeys.size === LSP_SERVER_CATALOG.length) {
        return;
      }
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    detectServerKeysForFile(entry.name, detectedKeys);
    if (detectedKeys.size === LSP_SERVER_CATALOG.length) {
      return;
    }
  }
}

function detectServerKeysForFile(fileName: string, detectedKeys: Set<string>): void {
  const normalizedFileName = fileName.toLowerCase();
  const normalizedExtension = extname(normalizedFileName);

  for (const key of DETECTION_INDEX.byFileName.get(normalizedFileName) ?? []) {
    detectedKeys.add(key);
  }

  for (const key of DETECTION_INDEX.byExtension.get(normalizedExtension) ?? []) {
    detectedKeys.add(key);
  }
}

function createDetectionIndex(servers: readonly LspCatalogEntry[]): DetectionIndex {
  const byExtension = new Map<string, string[]>();
  const byFileName = new Map<string, string[]>();

  for (const server of servers) {
    for (const extension of server.detectExtensions) {
      const keys = byExtension.get(extension) ?? [];
      keys.push(server.key);
      byExtension.set(extension, keys);
    }

    for (const fileName of server.detectFileNames ?? []) {
      const keys = byFileName.get(fileName) ?? [];
      keys.push(server.key);
      byFileName.set(fileName, keys);
    }
  }

  return { byExtension, byFileName };
}

function collectVsCodeExtensions(servers: readonly LspCatalogEntry[]): string[] {
  const extensions: string[] = [];

  for (const server of servers) {
    for (const extension of server.vscodeExtensions ?? []) {
      if (!extensions.includes(extension)) {
        extensions.push(extension);
      }
    }
  }

  return extensions;
}

async function configureCopilotLspConfig(
  workspaceRoot: string,
  servers: readonly LspCatalogEntry[],
): Promise<{
  file: LabeledFileMutationResult;
  verifications: ServerVerification[];
}> {
  const configPath = await resolveCopilotLspConfigPath(workspaceRoot);
  const existing = (await readCopilotLspConfig(configPath)) ?? {};
  const merged = mergeCopilotLspConfig(existing, servers);
  const fileWrite = await writeJsonFile(configPath, merged);
  const persisted = (await readCopilotLspConfig(configPath)) ?? merged;
  const relativePath = relative(workspaceRoot, configPath);

  return {
    file: {
      label: "Copilot CLI repository LSP config",
      file: {
        path: configPath,
        ...fileWrite,
      } satisfies FileMutationResult,
    },
    verifications: servers.map((server) =>
      verifyCopilotLspServerInConfig(persisted, server, relativePath),
    ),
  };
}

async function configureVsCodeExtensions(
  workspaceRoot: string,
  recommendedExtensions: readonly string[],
): Promise<{
  file: LabeledFileMutationResult;
  verifications: ServerVerification[];
}> {
  const filePath = join(workspaceRoot, VSCODE_EXTENSIONS_CONFIG_PATH);
  const existing = (await readJsonFile<VsCodeExtensionsConfig>(filePath)) ?? {};

  if (!isRecord(existing)) {
    throw new Error(`Expected ${filePath} to contain a JSON object.`);
  }

  const nextConfig: VsCodeExtensionsConfig = {
    ...existing,
    recommendations: mergeStringArrays(
      existing.recommendations,
      recommendedExtensions,
      '"recommendations"',
    ),
  };

  const fileWrite = await writeJsonFile(filePath, nextConfig);
  const persisted = (await readJsonFile<VsCodeExtensionsConfig>(filePath)) ?? nextConfig;

  return {
    file: {
      label: "VS Code extension recommendations",
      file: {
        path: filePath,
        ...fileWrite,
      } satisfies FileMutationResult,
    },
    verifications: recommendedExtensions.map((extensionId) =>
      verifyVsCodeExtensionRecommendation(persisted, extensionId),
    ),
  };
}

async function resolveCopilotLspConfigPath(workspaceRoot: string): Promise<string> {
  const defaultPath = join(workspaceRoot, COPILOT_WORKSPACE_LSP_CONFIG_PATH);
  const alternatePath = join(workspaceRoot, COPILOT_ALTERNATE_WORKSPACE_LSP_CONFIG_PATH);
  const [defaultContents, alternateContents] = await Promise.all([
    readTextFileIfExists(defaultPath),
    readTextFileIfExists(alternatePath),
  ]);

  if (defaultContents !== undefined && alternateContents !== undefined) {
    throw new Error(
      `Found both ${relative(workspaceRoot, defaultPath)} and ${relative(
        workspaceRoot,
        alternatePath,
      )}. Consolidate to a single Copilot repository LSP file before running Lanyard.`,
    );
  }

  if (alternateContents !== undefined) {
    return alternatePath;
  }

  return defaultPath;
}

async function readCopilotLspConfig(configPath: string): Promise<CopilotLspConfig | undefined> {
  const config = await readJsonFile<CopilotLspConfig>(configPath);
  if (config === undefined) {
    return undefined;
  }

  if (!isRecord(config)) {
    throw new Error(`Expected ${configPath} to contain a JSON object.`);
  }

  if (config.lspServers !== undefined && !isRecord(config.lspServers)) {
    throw new Error(`Expected ${configPath} to contain an "lspServers" object.`);
  }

  return config;
}

function mergeCopilotLspConfig(
  existing: CopilotLspConfig,
  servers: readonly LspCatalogEntry[],
): CopilotLspConfig {
  const nextServers: Record<string, CopilotLspServerConfig> = {
    ...getCopilotLspServers(existing, "Copilot LSP config"),
  };

  for (const server of servers) {
    nextServers[server.key] = buildCopilotLspServerConfig(server);
  }

  return {
    ...existing,
    lspServers: nextServers,
  };
}

function buildCopilotLspServerConfig(server: LspCatalogEntry): CopilotLspServerConfig {
  return {
    command: server.command,
    args: [...server.args],
    fileExtensions: { ...server.fileExtensions },
  };
}

function verifyCopilotLspServerInConfig(
  config: CopilotLspConfig,
  server: LspCatalogEntry,
  location: string,
): ServerVerification {
  const current = getCopilotLspServers(config, "Copilot LSP config")[server.key];
  const verified = matchesCopilotLspServer(current, server);

  return {
    name: server.key,
    verified,
    via: "copilot-lsp-workspace-file",
    reason: verified
      ? `Found ${server.command} in ${location}.`
      : `Expected ${server.command} in ${location}, but found a different entry.`,
  };
}

function verifyVsCodeExtensionRecommendation(
  config: VsCodeExtensionsConfig,
  extensionId: string,
): ServerVerification {
  const verified =
    Array.isArray(config.recommendations) && config.recommendations.includes(extensionId);

  return {
    name: extensionId,
    verified,
    via: "vscode-extensions-file",
    reason: verified
      ? `Found ${extensionId} in .vscode/extensions.json.`
      : `Expected ${extensionId} in .vscode/extensions.json, but it was missing.`,
  };
}

function getCopilotLspServers(
  config: CopilotLspConfig,
  sourceName: string,
): Record<string, CopilotLspServerConfig> {
  if (config.lspServers === undefined) {
    return {};
  }

  if (!isRecord(config.lspServers)) {
    throw new Error(`Expected ${sourceName} to contain an "lspServers" object.`);
  }

  return config.lspServers as Record<string, CopilotLspServerConfig>;
}

function matchesCopilotLspServer(value: unknown, server: LspCatalogEntry): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.command === server.command &&
    matchesStringArray(value.args, server.args) &&
    matchesStringRecord(value.fileExtensions, server.fileExtensions)
  );
}

function matchesStringRecord(
  value: unknown,
  expected: Readonly<Record<string, string>>,
): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const expectedEntries = Object.entries(expected);
  const valueEntries = Object.entries(value);
  if (valueEntries.length !== expectedEntries.length) {
    return false;
  }

  return expectedEntries.every(([key, item]) => value[key] === item);
}
