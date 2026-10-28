import { describe, expect, test } from "bun:test";
import type { BridgeRequest } from "@review365/api/bridge";
import {
  bearerToken,
  channelFor,
  commandChannel,
  MemoryPubSub,
  relayCall,
  replyChannel,
} from "./relay";

const TOKEN = "a".repeat(43);

/** A fake tab: answers every command on `channel` with `reply`. */
async function fakeTab(
  pubsub: MemoryPubSub,
  channel: string,
  reply: (req: BridgeRequest) => object | null,
) {
  return pubsub.subscribe(commandChannel(channel), (raw) => {
    const req = JSON.parse(raw) as BridgeRequest;
    const res = reply(req);
    if (res) void pubsub.publish(replyChannel(channel, req.id), JSON.stringify(res));
  });
}

describe("MemoryPubSub", () => {
  test("publish returns how many subscribers got the message", async () => {
    const pubsub = new MemoryPubSub();
    const got: string[] = [];
    const off = await pubsub.subscribe("c", (m) => got.push(m));
    expect(await pubsub.publish("c", "hi")).toBe(1);
    await off();
    expect(await pubsub.publish("c", "bye")).toBe(0);
    expect(got).toEqual(["hi"]);
  });
});

describe("bearerToken", () => {
  test("reads a long enough bearer token and rejects anything else", () => {
    const req = (auth?: string) =>
      new Request("https://x/api/mcp", { headers: auth ? { Authorization: auth } : {} });
    expect(bearerToken(req(`Bearer ${TOKEN}`))).toBe(TOKEN);
    expect(bearerToken(req())).toBeNull();
    expect(bearerToken(req("Bearer short"))).toBeNull();
    expect(bearerToken(req(`Basic ${TOKEN}`))).toBeNull();
  });
});

describe("channelFor", () => {
  test("is stable per token and does not reveal the token", async () => {
    const a = await channelFor(TOKEN);
    expect(a).toBe(await channelFor(TOKEN));
    expect(a).not.toBe(await channelFor("b".repeat(43)));
    expect(a).not.toContain(TOKEN);
  });
});

describe("relayCall", () => {
  test("fails at once when no tab listens on the channel", async () => {
    const pubsub = new MemoryPubSub();
    await expect(relayCall(pubsub, "ch", "get_board", {})).rejects.toThrow(
      /No review365 tab is connected/,
    );
  });

  test("returns the tab's result", async () => {
    const pubsub = new MemoryPubSub();
    await fakeTab(pubsub, "ch", (req) => ({ id: req.id, ok: true, result: { tool: req.tool } }));
    expect(await relayCall(pubsub, "ch", "move_card", { card_id: "a" })).toEqual({
      tool: "move_card",
    });
  });

  test("rejects with the tab's error", async () => {
    const pubsub = new MemoryPubSub();
    await fakeTab(pubsub, "ch", (req) => ({ id: req.id, ok: false, error: "Unknown card: a" }));
    await expect(relayCall(pubsub, "ch", "archive_card", { card_id: "a" })).rejects.toThrow(
      "Unknown card: a",
    );
  });

  test("times out and stops listening when the tab never answers", async () => {
    const pubsub = new MemoryPubSub();
    await fakeTab(pubsub, "ch", () => null);
    await expect(relayCall(pubsub, "ch", "get_board", {}, 30)).rejects.toThrow(/did not answer/);
    expect(pubsub.subscriberCount()).toBe(1); // only the fake tab is left
  });

  test("keeps tabs on different channels apart", async () => {
    const pubsub = new MemoryPubSub();
    await fakeTab(pubsub, "mine", (req) => ({ id: req.id, ok: true, result: "mine" }));
    await expect(relayCall(pubsub, "theirs", "get_board", {})).rejects.toThrow(/No review365/);
  });
});
