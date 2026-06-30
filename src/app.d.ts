// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Platform {
			env: Env;
			ctx: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties;
		}
	}
}

interface Env {
	BOARD_STATE: R2Bucket;
	GITHUB_TOKEN: string;
	GITHUB_USER: string;
}

export {};
