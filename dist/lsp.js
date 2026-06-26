"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configureWorkspaceLsp = configureWorkspaceLsp;
const promises_1 = require("fs/promises");
const path_1 = require("path");
const constants_1 = require("./constants");
const json_file_1 = require("./json-file");
const string_arrays_1 = require("./string-arrays");
const LSP_SERVER_CATALOG = [
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
];
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
async function configureWorkspaceLsp(workspaceRoot, targets) {
    if (!targets.configureCopilot && !targets.configureVsCode) {
        return { files: [], verifications: [] };
    }
    const detectedServers = await detectWorkspaceLspServers(workspaceRoot);
    if (detectedServers.length === 0) {
        return { files: [], verifications: [] };
    }
    const files = [];
    const verifications = [];
    if (targets.configureCopilot) {
        const copilotResult = await configureCopilotLspConfig(workspaceRoot, detectedServers);
        files.push(copilotResult.file);
        verifications.push(...copilotResult.verifications);
    }
    if (targets.configureVsCode) {
        const recommendedExtensions = collectVsCodeExtensions(detectedServers);
        if (recommendedExtensions.length > 0) {
            const vscodeResult = await configureVsCodeExtensions(workspaceRoot, recommendedExtensions);
            files.push(vscodeResult.file);
            verifications.push(...vscodeResult.verifications);
        }
    }
    return { files, verifications };
}
async function detectWorkspaceLspServers(workspaceRoot) {
    const detectedKeys = new Set();
    await walkWorkspace(workspaceRoot, detectedKeys);
    return LSP_SERVER_CATALOG.filter((server) => detectedKeys.has(server.key));
}
async function walkWorkspace(directory, detectedKeys) {
    if (detectedKeys.size === LSP_SERVER_CATALOG.length) {
        return;
    }
    const entries = await (0, promises_1.readdir)(directory, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (IGNORED_DIRECTORIES.has(entry.name)) {
                continue;
            }
            await walkWorkspace((0, path_1.join)(directory, entry.name), detectedKeys);
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
function detectServerKeysForFile(fileName, detectedKeys) {
    const normalizedFileName = fileName.toLowerCase();
    const normalizedExtension = (0, path_1.extname)(normalizedFileName);
    for (const key of DETECTION_INDEX.byFileName.get(normalizedFileName) ?? []) {
        detectedKeys.add(key);
    }
    for (const key of DETECTION_INDEX.byExtension.get(normalizedExtension) ?? []) {
        detectedKeys.add(key);
    }
}
function createDetectionIndex(servers) {
    const byExtension = new Map();
    const byFileName = new Map();
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
function collectVsCodeExtensions(servers) {
    const extensions = [];
    for (const server of servers) {
        for (const extension of server.vscodeExtensions ?? []) {
            if (!extensions.includes(extension)) {
                extensions.push(extension);
            }
        }
    }
    return extensions;
}
async function configureCopilotLspConfig(workspaceRoot, servers) {
    const configPath = await resolveCopilotLspConfigPath(workspaceRoot);
    const existing = (await readCopilotLspConfig(configPath)) ?? {};
    const merged = mergeCopilotLspConfig(existing, servers);
    const fileWrite = await (0, json_file_1.writeJsonFile)(configPath, merged);
    const persisted = (await readCopilotLspConfig(configPath)) ?? merged;
    const relativePath = (0, path_1.relative)(workspaceRoot, configPath);
    return {
        file: {
            label: "Copilot CLI repository LSP config",
            file: {
                path: configPath,
                ...fileWrite,
            },
        },
        verifications: servers.map((server) => verifyCopilotLspServerInConfig(persisted, server, relativePath)),
    };
}
async function configureVsCodeExtensions(workspaceRoot, recommendedExtensions) {
    const filePath = (0, path_1.join)(workspaceRoot, constants_1.VSCODE_EXTENSIONS_CONFIG_PATH);
    const existing = (await (0, json_file_1.readJsonFile)(filePath)) ?? {};
    if (!(0, json_file_1.isRecord)(existing)) {
        throw new Error(`Expected ${filePath} to contain a JSON object.`);
    }
    const nextConfig = {
        ...existing,
        recommendations: (0, string_arrays_1.mergeStringArrays)(existing.recommendations, recommendedExtensions, '"recommendations"'),
    };
    const fileWrite = await (0, json_file_1.writeJsonFile)(filePath, nextConfig);
    const persisted = (await (0, json_file_1.readJsonFile)(filePath)) ?? nextConfig;
    return {
        file: {
            label: "VS Code extension recommendations",
            file: {
                path: filePath,
                ...fileWrite,
            },
        },
        verifications: recommendedExtensions.map((extensionId) => verifyVsCodeExtensionRecommendation(persisted, extensionId)),
    };
}
async function resolveCopilotLspConfigPath(workspaceRoot) {
    const defaultPath = (0, path_1.join)(workspaceRoot, constants_1.COPILOT_WORKSPACE_LSP_CONFIG_PATH);
    const alternatePath = (0, path_1.join)(workspaceRoot, constants_1.COPILOT_ALTERNATE_WORKSPACE_LSP_CONFIG_PATH);
    const [defaultContents, alternateContents] = await Promise.all([
        (0, json_file_1.readTextFileIfExists)(defaultPath),
        (0, json_file_1.readTextFileIfExists)(alternatePath),
    ]);
    if (defaultContents !== undefined && alternateContents !== undefined) {
        throw new Error(`Found both ${(0, path_1.relative)(workspaceRoot, defaultPath)} and ${(0, path_1.relative)(workspaceRoot, alternatePath)}. Consolidate to a single Copilot repository LSP file before running Lanyard.`);
    }
    if (alternateContents !== undefined) {
        return alternatePath;
    }
    return defaultPath;
}
async function readCopilotLspConfig(configPath) {
    const config = await (0, json_file_1.readJsonFile)(configPath);
    if (config === undefined) {
        return undefined;
    }
    if (!(0, json_file_1.isRecord)(config)) {
        throw new Error(`Expected ${configPath} to contain a JSON object.`);
    }
    if (config.lspServers !== undefined && !(0, json_file_1.isRecord)(config.lspServers)) {
        throw new Error(`Expected ${configPath} to contain an "lspServers" object.`);
    }
    return config;
}
function mergeCopilotLspConfig(existing, servers) {
    const nextServers = {
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
function buildCopilotLspServerConfig(server) {
    return {
        command: server.command,
        args: [...server.args],
        fileExtensions: { ...server.fileExtensions },
    };
}
function verifyCopilotLspServerInConfig(config, server, location) {
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
function verifyVsCodeExtensionRecommendation(config, extensionId) {
    const verified = Array.isArray(config.recommendations) && config.recommendations.includes(extensionId);
    return {
        name: extensionId,
        verified,
        via: "vscode-extensions-file",
        reason: verified
            ? `Found ${extensionId} in .vscode/extensions.json.`
            : `Expected ${extensionId} in .vscode/extensions.json, but it was missing.`,
    };
}
function getCopilotLspServers(config, sourceName) {
    if (config.lspServers === undefined) {
        return {};
    }
    if (!(0, json_file_1.isRecord)(config.lspServers)) {
        throw new Error(`Expected ${sourceName} to contain an "lspServers" object.`);
    }
    return config.lspServers;
}
function matchesCopilotLspServer(value, server) {
    if (!(0, json_file_1.isRecord)(value)) {
        return false;
    }
    return (value.command === server.command &&
        (0, string_arrays_1.matchesStringArray)(value.args, server.args) &&
        matchesStringRecord(value.fileExtensions, server.fileExtensions));
}
function matchesStringRecord(value, expected) {
    if (!(0, json_file_1.isRecord)(value)) {
        return false;
    }
    const expectedEntries = Object.entries(expected);
    const valueEntries = Object.entries(value);
    if (valueEntries.length !== expectedEntries.length) {
        return false;
    }
    return expectedEntries.every(([key, item]) => value[key] === item);
}
