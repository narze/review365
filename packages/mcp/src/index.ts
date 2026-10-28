#!/usr/bin/env bun
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BRIDGE_DEFAULT_PORT } from "@review365/api/bridge";
import { startBridgeServer, type BridgeServer } from "./bridge-server";
import { createMcpServer } from "./mcp-server";

const DEFAULT_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];

const port = Number(process.env.REVIEW365_MCP_PORT ?? BRIDGE_DEFAULT_PORT);
const allowedOrigins = [
  ...DEFAULT_ORIGINS,
  ...(process.env.REVIEW365_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean),
];

// stdout carries the MCP protocol, so every log goes to stderr.
let bridge: BridgeServer | null = null;
let bridgeError: Error | null = null;
try {
  bridge = await startBridgeServer({ port, allowedOrigins });
  console.error(`review365 bridge listening on ws://127.0.0.1:${bridge.port}`);
  console.error(`allowed origins: ${allowedOrigins.join(", ")}`);
} catch (err) {
  // Keep serving MCP so the client sees a clear tool error instead of a dead server.
  bridgeError =
    (err as NodeJS.ErrnoException).code === "EADDRINUSE"
      ? new Error(
          `Port ${port} is already in use, probably by another review365 MCP server. Close it or set REVIEW365_MCP_PORT.`,
        )
      : (err as Error);
  console.error(bridgeError.message);
}

const server = createMcpServer((tool, args) =>
  bridge ? bridge.call(tool, args) : Promise.reject(bridgeError),
);
await server.connect(new StdioServerTransport());

async function shutdown() {
  await bridge?.close();
  process.exit(0);
}
process.stdin.on("close", shutdown);
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
