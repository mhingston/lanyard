import { spawn } from "child_process";

export interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export async function commandExists(command: string): Promise<boolean> {
  const lookupCommand = process.platform === "win32" ? "where" : "which";
  const result = await runCommand(lookupCommand, [command], { allowNonZero: true });
  return result.code === 0;
}

export async function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; allowNonZero?: boolean } = {},
): Promise<CommandResult> {
  const { cwd, allowNonZero = false } = options;

  return await new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      const result = { code, stdout, stderr };
      if (!allowNonZero && code !== 0) {
        reject(
          new Error(
            `${formatCommand(command, args)} failed with exit code ${
              code ?? "unknown"
            }.\n${stderr || stdout}`.trim(),
          ),
        );
        return;
      }

      resolve(result);
    });
  });
}

export async function runInteractiveCommand(
  command: string,
  args: string[],
  cwd?: string,
): Promise<number | null> {
  return await new Promise<number | null>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("close", (code) => resolve(code));
  });
}

export function formatCommand(command: string, args: string[]): string {
  return [command, ...args.map(quoteIfNeeded)].join(" ");
}

function quoteIfNeeded(value: string): string {
  return /\s/.test(value) ? JSON.stringify(value) : value;
}

