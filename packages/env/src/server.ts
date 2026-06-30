import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    CORS_ORIGIN: z.url().optional(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    GITHUB_TOKEN: z.string().min(1),
    GITHUB_USER: z.string().min(1),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
