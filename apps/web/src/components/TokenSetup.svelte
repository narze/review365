<script lang="ts">
	import { beginGitHubOAuth, saveToken, getPlatform } from '$lib/auth';
	import type { Platform } from '@review365/api/types';

	let { onDone }: { onDone: (login: string) => void } = $props();

	let platform = $state<Platform>(getPlatform());
	let token = $state('');
	let host = $state('');
	let saving = $state(false);
	let oauthStarting = $state(false);
	let error = $state('');
	let showTokenForm = $state(false);

	function selectPlatform(p: Platform) {
		platform = p;
		error = '';
		if (p === 'gitlab') showTokenForm = true;
	}

	function connectWithGitHub() {
		if (oauthStarting) return;
		oauthStarting = true;
		error = '';
		beginGitHubOAuth();
	}

	async function submit() {
		if (!token.trim() || saving) return;
		saving = true;
		error = '';
		try {
			const login = await saveToken(
				platform,
				token.trim(),
				platform === 'gitlab' ? host.trim() : undefined
			);
			onDone(login);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to validate token';
		} finally {
			saving = false;
		}
	}
</script>

<div class="flex min-h-[60vh] items-center justify-center p-6">
	<div class="w-full max-w-lg rounded-xl border border-panel surface-panel p-6">
		<a href="/" class="mb-3 inline-block text-xs text-faint hover:text-body">← Back</a>
		<h1 class="mb-1 text-xl font-bold text-heading">Connect your account</h1>
		<p class="mb-4 text-sm text-muted">
			Everything runs in your browser — your token and board state are stored locally and only
			ever sent to your chosen provider. We never collect or use your token on any server we
			control.
			<a
				class="text-blue-500 hover:underline dark:text-blue-400"
				href="https://github.com/narze/review365"
				target="_blank"
				rel="noreferrer">Review365 is open source</a
			>
			— you can verify this yourself.
		</p>

		<div class="mb-4 inline-flex rounded-md border border-control p-0.5">
			<button
				type="button"
				class="rounded px-3 py-1 text-sm font-medium transition-colors {platform === 'github'
					? 'bg-blue-600 text-white'
					: 'text-body hover:text-heading'}"
				onclick={() => selectPlatform('github')}
			>
				GitHub
			</button>
			<button
				type="button"
				class="rounded px-3 py-1 text-sm font-medium transition-colors {platform === 'gitlab'
					? 'bg-orange-600 text-white'
					: 'text-body hover:text-heading'}"
				onclick={() => selectPlatform('gitlab')}
			>
				GitLab
			</button>
		</div>

		{#if platform === 'github'}
			<button
				type="button"
				class="flex w-full items-center justify-center gap-2 rounded-md bg-[#24292f] px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#32383f] disabled:opacity-40 dark:bg-[#f0f6fc] dark:text-[#24292f] dark:hover:bg-white"
				disabled={oauthStarting}
				onclick={connectWithGitHub}
			>
				<svg class="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
					<path
						d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
					/>
				</svg>
				{oauthStarting ? 'Redirecting…' : 'Connect with GitHub'}
			</button>

			<div class="my-4 flex items-center gap-3 text-xs text-faint">
				<div class="h-px flex-1 border-t border-panel"></div>
				<span>or</span>
				<div class="h-px flex-1 border-t border-panel"></div>
			</div>

			{#if !showTokenForm}
				<button
					type="button"
					class="w-full text-left text-sm text-blue-500 hover:underline dark:text-blue-400"
					onclick={() => (showTokenForm = true)}
				>
					Use a personal access token instead
				</button>
			{/if}
		{/if}

		{#if platform === 'gitlab' || showTokenForm}
			{#if platform === 'gitlab'}
				<label class="mb-1 block text-sm font-medium text-body" for="host-input">
					GitLab instance <span class="text-faint">(optional)</span>
				</label>
				<input
					id="host-input"
					type="text"
					class="input-field mb-3 w-full px-3 py-2"
					placeholder="https://gitlab.com"
					bind:value={host}
				/>
			{/if}

			<label class="mb-1 block text-sm font-medium text-body" for="token-input">
				{platform === 'gitlab' ? 'GitLab personal access token' : 'GitHub personal access token'}
			</label>
			<input
				id="token-input"
				type="password"
				class="input-field w-full px-3 py-2"
				placeholder={platform === 'gitlab' ? 'glpat-...' : 'ghp_...'}
				bind:value={token}
				onkeydown={(e) => {
					if (e.key === 'Enter') submit();
				}}
			/>
			{#if error}
				<div class="mt-2 text-sm text-red-500 dark:text-red-400">{error}</div>
			{/if}
			<button
				type="button"
				class="mt-3 w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
				disabled={!token.trim() || saving}
				onclick={submit}
			>
				{saving ? 'Validating...' : 'Connect account'}
			</button>

			<div class="mt-5 rounded-md border border-panel surface-sunken p-3 text-xs text-muted">
				<div class="mb-1 font-medium text-body">Which token?</div>
				{#if platform === 'gitlab'}
					<p class="mb-2">
						Create a
						<a
							class="text-blue-500 hover:underline dark:text-blue-400"
							href="https://gitlab.com/-/user_settings/personal_access_tokens"
							target="_blank"
							rel="noreferrer">personal access token with the <code>read_api</code> scope</a
						>
						— enough to read the merge requests and approvals you're involved in. Set an expiry.
						For a self-hosted instance, enter its URL above.
					</p>
				{:else}
					<p class="mb-2">
						Recommended: a
						<a
							class="text-blue-500 hover:underline dark:text-blue-400"
							href="https://github.com/settings/tokens/new?scopes=repo,read:org&description=review365"
							target="_blank"
							rel="noreferrer">classic token with <code>repo</code> + <code>read:org</code></a
						>
						— it can see PRs across all your repos and orgs. Set an expiry.
					</p>
					<p class="mb-2">
						A fine-grained token also works but is scoped to a <em>single</em> owner (you or one
						org) — PRs outside that owner will silently not appear.
					</p>
				{/if}
				<p>
					The token stays in this browser's localStorage. Anyone with access to this browser
					profile (or a script injected into this page) could read it — use a token with an expiry
					and only the scopes above.
				</p>
			</div>
		{/if}

		{#if platform === 'github' && !showTokenForm}
			{#if error}
				<div class="mt-3 text-sm text-red-500 dark:text-red-400">{error}</div>
			{/if}
			<p class="mt-4 text-xs text-muted">
				Connect with GitHub uses OAuth (<code>repo</code> + <code>read:org</code>). The access
				token is stored only in this browser's localStorage and sent only to the GitHub API.
			</p>
		{/if}
	</div>
</div>
