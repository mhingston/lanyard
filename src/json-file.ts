import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname } from "path";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function readTextFileIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }
    throw error;
  }
}

export async function readJsonFile<T>(filePath: string): Promise<T | undefined> {
  const raw = await readTextFileIfExists(filePath);
  if (raw === undefined) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse JSON at ${filePath}: ${message}`);
  }
}

export async function writeJsonFile(
  filePath: string,
  value: unknown,
  options: { dryRun?: boolean } = {},
): Promise<{ changed: boolean; created: boolean }> {
  return await writeTextFile(filePath, `${JSON.stringify(value, null, 2)}\n`, options);
}

export async function writeTextFile(
  filePath: string,
  value: string,
  options: { dryRun?: boolean } = {},
): Promise<{ changed: boolean; created: boolean }> {
  const { dryRun = false } = options;
  const current = await readTextFileIfExists(filePath);
  const created = current === undefined;
  const changed = current !== value;

  if (!changed) {
    return { changed: false, created: false };
  }

  if (!dryRun) {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, value, "utf8");
  }

  return { changed, created };
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
