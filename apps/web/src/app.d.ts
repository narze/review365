import type { AppRouterClient } from "@review365/api/routers/index";

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
  var $client: AppRouterClient | undefined;

  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
