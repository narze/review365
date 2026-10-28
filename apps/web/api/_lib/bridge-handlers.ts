/** Web-standard handlers for the MCP relay, shared by Vercel functions and Vite dev middleware. */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "./mcp-tools.js";
import {
  bearerToken,
  channelFor,
  commandChannel,
  getPubSub,
  RelayNotConfiguredError,
  relayCall,
  replyChannel,
  type PubSub,
} from "./relay.js";

function unauthorized(): Response {
  return Response.json(
    { error: "Missing or invalid pairing token. Copy it from review365 Settings." },
    { status: 401, headers: { "WWW-Authenticate": 'Bearer realm="review365"' } },
  );
}

/** Streamable HTTP MCP endpoint, stateless: each request gets its own server. */
export async function handleMcp(request: Request, pubsub: PubSub): Promise<Response> {
  const token = bearerToken(request);
  if (!token) return unauthorized();
  const channel = await channelFor(token);
  const server = createMcpServer((tool, args) => relayCall(pubsub, channel, tool, args));
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

/**
 * SSE stream of commands for the paired tab. It ends before the function's time
 * limit and the tab reconnects; heartbeats keep proxies from closing it early.
 */
export async function handleStream(
  request: Request,
  pubsub: PubSub,
  { maxMs = 270_000, heartbeatMs = 20_000 } = {},
): Promise<Response> {
  const token = bearerToken(request);
  if (!token) return unauthorized();
  const channel = await channelFor(token);
  const encoder = new TextEncoder();

  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let closed = false;
  let unsubscribe: (() => Promise<void>) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;

  const send = (chunk: string) => {
    if (!closed) controller.enqueue(encoder.encode(chunk));
  };
  const close = async () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    clearTimeout(deadline);
    request.signal.removeEventListener("abort", close);
    await unsubscribe?.();
    try {
      controller.close();
    } catch {
      // already cancelled by the client
    }
  };

  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      c.enqueue(encoder.encode(": connected\n\n"));
    },
    cancel: close,
  });

  // Subscribe before answering, so an MCP call made right after connecting finds the tab.
  unsubscribe = await pubsub.subscribe(commandChannel(channel), (msg) => send(`data: ${msg}\n\n`));
  heartbeat = setInterval(() => send(": ping\n\n"), heartbeatMs);
  deadline = setTimeout(close, maxMs);
  request.signal.addEventListener("abort", close);

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

/** The tab posts each command's result here; it is published to the waiting MCP call. */
export async function handleReply(request: Request, pubsub: PubSub): Promise<Response> {
  const token = bearerToken(request);
  if (!token) return unauthorized();
  let reply: { id?: unknown; ok?: unknown };
  try {
    reply = (await request.json()) as typeof reply;
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 });
  }
  if (typeof reply?.id !== "string" || typeof reply.ok !== "boolean") {
    return Response.json({ error: "Body must be a bridge response" }, { status: 400 });
  }
  const channel = await channelFor(token);
  await pubsub.publish(replyChannel(channel, reply.id), JSON.stringify(reply));
  return new Response(null, { status: 204 });
}

/** Wraps a handler for a Vercel function: picks the pub/sub and reports a missing REDIS_URL. */
export function relayRoute(handler: (request: Request, pubsub: PubSub) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    let pubsub: PubSub;
    try {
      pubsub = getPubSub();
    } catch (err) {
      if (err instanceof RelayNotConfiguredError) {
        return Response.json({ error: err.message }, { status: 503 });
      }
      throw err;
    }
    return handler(request, pubsub);
  };
}
