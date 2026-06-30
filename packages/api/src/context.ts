import type { BoardStore } from './store';
import type { ConfigStore } from './config';

export type CreateContextOptions = {
  headers: Headers;
  store: BoardStore;
  configStore: ConfigStore;
};

export async function createContext(options: CreateContextOptions) {
  return {
    auth: null,
    session: null,
    store: options.store,
    configStore: options.configStore,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
