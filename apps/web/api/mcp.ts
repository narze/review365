import { handleMcp, relayRoute } from "./_lib/bridge-handlers.js";

// Node runtime (not edge): the relay talks to Redis over TCP.
const handler = relayRoute(handleMcp);
export const GET = handler;
export const POST = handler;
export const DELETE = handler;
