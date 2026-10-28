/**
 * Relay between the MCP endpoint and the paired review365 tab. Vercel can run the
 * MCP call and the tab's command stream on different function instances, so they
 * meet on Redis pub/sub. Pub/sub keeps nothing: a message reaches whoever listens
 * at that moment and is then gone. The board itself never leaves the tab.
 *
 * Only `import type` from @review365/api here: Vercel functions bundle this file,
 * and the workspace package ships raw TypeScript.
 */
import Redis from "ioredis";
import type { BridgeRequest, BridgeResponse, BridgeTool } from "@review365/api/bridge";

export interface PubSub {
  /** Resolves to how many subscribers received the message. */
  publish(channel: string, message: string): Promise<number>;
  /** Resolves once subscribed, to a function that unsubscribes. */
  subscribe(channel: string, onMessage: (message: string) => void): Promise<() => Promise<void>>;
}

type Listener = (message: string) => void;

function addListener(map: Map<string, Set<Listener>>, channel: string, fn: Listener): boolean {
  const set = map.get(channel);
  if (set) {
    set.add(fn);
    return false;
  }
  map.set(channel, new Set([fn]));
  return true;
}

function removeListener(map: Map<string, Set<Listener>>, channel: string, fn: Listener): boolean {
  const set = map.get(channel);
  if (!set?.delete(fn) || set.size > 0) return false;
  map.delete(channel);
  return true;
}

/** Single-process pub/sub for local dev and tests. Not for Vercel: instances do not share memory. */
export class MemoryPubSub implements PubSub {
  private listeners = new Map<string, Set<Listener>>();

  async publish(channel: string, message: string): Promise<number> {
    const set = [...(this.listeners.get(channel) ?? [])];
    for (const fn of set) fn(message);
    return set.length;
  }

  async subscribe(channel: string, onMessage: Listener) {
    addListener(this.listeners, channel, onMessage);
    return async () => void removeListener(this.listeners, channel, onMessage);
  }

  subscriberCount(): number {
    let n = 0;
    for (const set of this.listeners.values()) n += set.size;
    return n;
  }
}

/**
 * One publisher and one subscriber connection per function instance, shared by all
 * requests on it. A Redis connection in subscriber mode cannot publish.
 */
export class RedisPubSub implements PubSub {
  private pub: Redis;
  private sub: Redis;
  private listeners = new Map<string, Set<Listener>>();

  constructor(url: string) {
    this.pub = new Redis(url, { maxRetriesPerRequest: 2 });
    this.sub = new Redis(url, { maxRetriesPerRequest: 2 });
    this.sub.on("message", (channel: string, message: string) => {
      for (const fn of this.listeners.get(channel) ?? []) fn(message);
    });
  }

  publish(channel: string, message: string): Promise<number> {
    return this.pub.publish(channel, message);
  }

  async subscribe(channel: string, onMessage: Listener) {
    if (addListener(this.listeners, channel, onMessage)) await this.sub.subscribe(channel);
    return async () => {
      if (removeListener(this.listeners, channel, onMessage)) await this.sub.unsubscribe(channel);
    };
  }
}

let shared: PubSub | undefined;

export class RelayNotConfiguredError extends Error {}

export function getPubSub(env: Record<string, string | undefined> = process.env): PubSub {
  if (shared) return shared;
  const url = env.REDIS_URL?.trim();
  if (url) shared = new RedisPubSub(url);
  else if (env.VERCEL) {
    throw new RelayNotConfiguredError(
      "The MCP relay needs REDIS_URL. Add a Redis database to this Vercel project.",
    );
  } else shared = new MemoryPubSub();
  return shared;
}

/** Pairing tokens come from the tab's crypto.getRandomValues; short ones are refused. */
const MIN_TOKEN_LENGTH = 32;

export function bearerToken(request: Request): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
  const token = match?.[1];
  return token && token.length >= MIN_TOKEN_LENGTH ? token : null;
}

/** Channel names use a hash so the token never shows up in Redis. */
export async function channelFor(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const commandChannel = (channel: string) => `review365:cmd:${channel}`;
export const replyChannel = (channel: string, id: string) => `review365:res:${channel}:${id}`;

export async function relayCall(
  pubsub: PubSub,
  channel: string,
  tool: BridgeTool,
  args: Record<string, unknown>,
  timeoutMs = 15_000,
): Promise<unknown> {
  const req: BridgeRequest = { id: crypto.randomUUID(), tool, args };
  let settle!: (res: BridgeResponse) => void;
  const answered = new Promise<BridgeResponse>((resolve) => (settle = resolve));
  // Listen for the answer before sending, or a fast tab could answer into the void.
  const unsubscribe = await pubsub.subscribe(replyChannel(channel, req.id), (raw) => {
    try {
      settle(JSON.parse(raw) as BridgeResponse);
    } catch {
      // ignore malformed replies; the timeout reports the failure
    }
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const listeners = await pubsub.publish(commandChannel(channel), JSON.stringify(req));
    if (listeners === 0) {
      throw new Error(
        "No review365 tab is connected. Open review365, turn on AI agent access in Settings, and try again.",
      );
    }
    const timedOut = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`The review365 tab did not answer within ${timeoutMs} ms`)),
        timeoutMs,
      );
    });
    const res = await Promise.race([answered, timedOut]);
    if (!res.ok) throw new Error(res.error);
    return res.result;
  } finally {
    clearTimeout(timer);
    await unsubscribe();
  }
}
