import { getRequestEvent } from "$app/server";
import { createRouterClient } from "@orpc/server";
import { createContext } from "@review365/api/context";
import { appRouter, type AppRouterClient } from "@review365/api/routers/index";
import { fileBoardStore } from "$lib/file-store";
import { fileConfigStore } from "$lib/file-config-store";

if (typeof window !== "undefined") {
  throw new Error("This file should only be imported on the server.");
}

const serverClient: AppRouterClient = createRouterClient(appRouter, {
  context: async () => {
    const event = getRequestEvent();
    return createContext({
      headers: event.request.headers,
      store: fileBoardStore,
      configStore: fileConfigStore,
    });
  },
});

globalThis.$client = serverClient;
