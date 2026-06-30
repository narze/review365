import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { createContext } from "@review365/api/context";
import { appRouter } from "@review365/api/routers/index";
import { fileBoardStore } from "$lib/file-store";
import { fileConfigStore } from "$lib/file-config-store";
import type { RequestHandler } from "@sveltejs/kit";

const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

const handle: RequestHandler = async ({ request }) => {
  const context = await createContext({
    headers: request.headers,
    store: fileBoardStore,
    configStore: fileConfigStore,
  });

  const rpcResult = await rpcHandler.handle(request, {
    prefix: "/rpc",
    context,
  });
  if (rpcResult.response) return rpcResult.response;

  const apiResult = await apiHandler.handle(request, {
    prefix: "/rpc/api-reference",
    context,
  });
  if (apiResult.response) return apiResult.response;

  return new Response("Not found", { status: 404 });
};

export const HEAD = handle;
export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
