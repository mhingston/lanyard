"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildVsCodeServerConfig = buildVsCodeServerConfig;
exports.buildCopilotServerConfig = buildCopilotServerConfig;
exports.matchesHttpServer = matchesHttpServer;
exports.normalizeHeaders = normalizeHeaders;
const json_file_1 = require("./json-file");
function buildVsCodeServerConfig(server) {
    return {
        type: server.type,
        url: server.url,
        ...(server.headers ? { headers: server.headers } : {}),
    };
}
function buildCopilotServerConfig(server) {
    return {
        type: server.type,
        url: server.url,
        ...(server.headers ? { headers: server.headers } : {}),
        tools: ["*"],
    };
}
function matchesHttpServer(value, server) {
    if (!(0, json_file_1.isRecord)(value)) {
        return false;
    }
    const currentType = typeof value.type === "string" ? value.type.toLowerCase() : undefined;
    if (currentType !== server.type || value.url !== server.url) {
        return false;
    }
    return headersEqual(normalizeHeaders(value.headers), normalizeHeaders(server.headers));
}
function normalizeHeaders(headers) {
    if (!(0, json_file_1.isRecord)(headers)) {
        return undefined;
    }
    const normalized = Object.entries(headers).reduce((accumulator, [key, value]) => {
        if (typeof value === "string") {
            accumulator[key.toLowerCase()] = value;
        }
        return accumulator;
    }, {});
    return Object.keys(normalized).length > 0 ? normalized : undefined;
}
function headersEqual(left, right) {
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
