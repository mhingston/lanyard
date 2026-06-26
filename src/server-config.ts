import { isRecord } from "./json-file";
import { CopilotServerConfig, ServerSpec, VsCodeServerConfig } from "./types";

export function buildVsCodeServerConfig(server: ServerSpec): VsCodeServerConfig {
  return {
    type: server.type,
    url: server.url,
    ...(server.headers ? { headers: server.headers } : {}),
  };
}

export function buildCopilotServerConfig(server: ServerSpec): CopilotServerConfig {
  return {
    type: server.type,
    url: server.url,
    ...(server.headers ? { headers: server.headers } : {}),
    tools: ["*"],
  };
}

export function matchesHttpServer(value: unknown, server: ServerSpec): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const currentType =
    typeof value.type === "string" ? value.type.toLowerCase() : undefined;
  if (currentType !== server.type || value.url !== server.url) {
    return false;
  }

  return headersEqual(normalizeHeaders(value.headers), normalizeHeaders(server.headers));
}

export function normalizeHeaders(
  headers: unknown,
): Record<string, string> | undefined {
  if (!isRecord(headers)) {
    return undefined;
  }

  const normalized = Object.entries(headers).reduce<Record<string, string>>(
    (accumulator, [key, value]) => {
      if (typeof value === "string") {
        accumulator[key.toLowerCase()] = value;
      }
      return accumulator;
    },
    {},
  );

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function headersEqual(
  left: Record<string, string> | undefined,
  right: Record<string, string> | undefined,
): boolean {
  if (!left && !right) {
    return true;
  }

  const leftEntries = Object.entries(left ?? {});
  const rightEntries = Object.entries(right ?? {});
  if (leftEntries.length !== rightEntries.length) {
    return false;
  }

  return leftEntries.every(([key, value]) => right?.[key] === value);
}

