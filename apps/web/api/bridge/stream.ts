import { handleStream, relayRoute } from "../_lib/bridge-handlers.js";

export const GET = relayRoute((request, pubsub) => handleStream(request, pubsub));
