import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { handleMcp, handleReply, handleStream } from "./api/_lib/bridge-handlers";
import { getPubSub, type PubSub } from "./api/_lib/relay";

const routes: Record<string, (request: Request, pubsub: PubSub) => Promise<Response>> = {
  "/api/mcp": handleMcp,
  "/api/bridge/stream": (request, pubsub) => handleStream(request, pubsub),
  "/api/bridge/reply": handleReply,
};

async function toRequest(req: IncomingMessage, signal: AbortSignal): Promise<Request> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(key, value);
    else if (Array.isArray(value)) for (const v of value) headers.append(key, v);
  }
  let body: Uint8Array<ArrayBuffer> | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    body = new Uint8Array(Buffer.concat(chunks));
  }
  return new Request(url, { method: req.method, headers, body, signal });
}

async function sendResponse(res: ServerResponse, response: Response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (response.body) {
    for await (const chunk of response.body) res.write(chunk);
  }
  res.end();
}

/**
 * Local-dev stand-in for the Vercel MCP relay functions. Without REDIS_URL it uses an
 * in-memory pub/sub, which works because the dev server is one process.
 */
export function mcpRelayDevPlugin(): Plugin {
  return {
    name: "review365-mcp-relay",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const route = routes[(req.url ?? "").split("?")[0] ?? ""];
        if (!route) {
          next();
          return;
        }
        const abort = new AbortController();
        res.on("close", () => abort.abort());
        try {
          await sendResponse(res, await route(await toRequest(req, abort.signal), getPubSub()));
        } catch (err) {
          next(err);
        }
      });
    },
  };
}
