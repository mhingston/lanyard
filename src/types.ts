export interface ServerSpec {
  readonly name: string;
  readonly displayName: string;
  readonly url: string;
  readonly type: "http";
  readonly headers?: Record<string, string>;
  readonly docs: readonly string[];
}

export interface VsCodeServerConfig {
  type?: "http" | "sse" | "stdio";
  url?: string;
  command?: string;
  args?: string[];
  headers?: Record<string, unknown>;
  oauth?: unknown;
  [key: string]: unknown;
}

export interface VsCodeConfig {
  servers?: Record<string, VsCodeServerConfig>;
  inputs?: unknown[];
  sandbox?: unknown;
  [key: string]: unknown;
}

export interface CopilotServerConfig {
  type?: "http" | "sse" | "local";
  url?: string;
  headers?: Record<string, unknown>;
  tools?: string[];
  command?: string;
  args?: string[];
  env?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface CopilotConfig {
  mcpServers?: Record<string, CopilotServerConfig>;
  [key: string]: unknown;
}

export interface CopilotLspServerConfig {
  command?: string;
  args?: string[];
  fileExtensions?: Record<string, unknown>;
  env?: Record<string, unknown>;
  rootUri?: string;
  initializationOptions?: unknown;
  requestTimeoutMs?: number;
  [key: string]: unknown;
}

export interface CopilotLspConfig {
  lspServers?: Record<string, CopilotLspServerConfig>;
  [key: string]: unknown;
}

export interface VsCodeExtensionsConfig {
  recommendations?: string[];
  unwantedRecommendations?: string[];
  [key: string]: unknown;
}

export interface FileMutationResult {
  path: string;
  changed: boolean;
  created: boolean;
}

export interface LabeledFileMutationResult {
  label: string;
  file: FileMutationResult;
}

export interface ServerVerification {
  name: string;
  verified: boolean;
  via:
    | "copilot-cli"
    | "copilot-user-file"
    | "copilot-lsp-workspace-file"
    | "copilot-workspace-file"
    | "vscode-extensions-file"
    | "vscode-workspace-file";
  reason: string;
}

export interface VsCodeSetupResult {
  file: FileMutationResult;
  verifications: ServerVerification[];
}
