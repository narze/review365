import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";
import { githubOAuthDevPlugin } from "./vite-plugin-github-oauth";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  envDir: rootDir,
  plugins: [tailwindcss(), sveltekit(), githubOAuthDevPlugin()],
});
