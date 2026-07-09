<script lang="ts">
	import { saveToken, getPlatform } from '$lib/auth';
	import type { Platform } from '@review365/api/types';

	let { onDone }: { onDone: (login: string) => void } = $props();

	let step = $state<'intro' | 'connect'>('intro');
	let platform = $state<Platform>(getPlatform());
	let token = $state('');
	let host = $state('');
	let saving = $state(false);
	let error = $state('');

	function selectPlatform(p: Platform) {
		platform = p;
		error = '';
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
	<div class="w-full max-w-lg rounded-xl border border-neutral-800 bg-neutral-900 p-6">
		{#if step === 'intro'}
			<h1 class="mb-1 text-xl font-bold text-neutral-100">Review365</h1>
			<p class="mb-4 text-sm text-neutral-400">
				A kanban board for your pull/merge request reviews, backed by GitHub or GitLab.
			</p>
			<ul class="mb-5 space-y-1.5 text-sm text-neutral-400">
				<li>Runs entirely in your browser — there is no review365 backend or account.</li>
				<li>Board state and your access token are stored only in this browser's localStorage.</li>
				<li>Your token is sent only to the GitHub or GitLab API you choose to connect, never anywhere else.</li>
			</ul>
			<button
				class="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
				onclick={() => (step = 'connect')}
			>
				Get started
			</button>
		{:else}
			<h1 class="mb-1 text-xl font-bold text-neutral-100">Connect your account</h1>
			<p class="mb-4 text-sm text-neutral-400">
				Everything runs in your browser — your token and board state are stored locally and only
				ever sent to your chosen provider.
			</p>

			<div class="mb-4 inline-flex rounded-md border border-neutral-700 p-0.5">
				<button
					class="rounded px-3 py-1 text-sm font-medium transition-colors {platform === 'github'
						? 'bg-blue-600 text-white'
						: 'text-neutral-300 hover:text-neutral-100'}"
					onclick={() => selectPlatform('github')}
				>
					GitHub
				</button>
				<button
					class="rounded px-3 py-1 text-sm font-medium transition-colors {platform === 'gitlab'
						? 'bg-orange-600 text-white'
						: 'text-neutral-300 hover:text-neutral-100'}"
					onclick={() => selectPlatform('gitlab')}
				>
					GitLab
				</button>
			</div>

			{#if platform === 'gitlab'}
				<label class="mb-1 block text-sm font-medium text-neutral-300" for="host-input">
					GitLab instance <span class="text-neutral-500">(optional)</span>
				</label>
				<input
					id="host-input"
					type="text"
					class="mb-3 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none"
					placeholder="https://gitlab.com"
					bind:value={host}
				/>
			{/if}

			<label class="mb-1 block text-sm font-medium text-neutral-300" for="token-input">
				{platform === 'gitlab' ? 'GitLab personal access token' : 'GitHub personal access token'}
			</label>
			<input
				id="token-input"
				type="password"
				class="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none"
				placeholder={platform === 'gitlab' ? 'glpat-...' : 'ghp_...'}
				bind:value={token}
				onkeydown={(e) => {
					if (e.key === 'Enter') submit();
				}}
			/>
			{#if error}
				<div class="mt-2 text-sm text-red-400">{error}</div>
			{/if}
			<button
				class="mt-3 w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
				disabled={!token.trim() || saving}
				onclick={submit}
			>
				{saving ? 'Validating...' : 'Connect account'}
			</button>
			<button
				class="mt-2 w-full text-center text-xs text-neutral-500 hover:text-neutral-300"
				onclick={() => (step = 'intro')}
			>
				Back
			</button>

			<div class="mt-5 rounded-md border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-400">
				<div class="mb-1 font-medium text-neutral-300">Which token?</div>
				{#if platform === 'gitlab'}
					<p class="mb-2">
						Create a
						<a
							class="text-blue-400 hover:underline"
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
							class="text-blue-400 hover:underline"
							href="https://github.com/settings/tokens/new?scopes=repo,read:org&description=review365"
							target="_blank"
							rel="noreferrer">classic token with <code>repo</code> + <code>read:org</code></a
						>
						— it can see PRs across all your repos and orgs. Set an expiry.
					</p>
					<p class="mb-2">
						A fine-grained token also works but is scoped to a <em>single</em> owner (you or one org)
						— PRs outside that owner will silently not appear.
					</p>
				{/if}
				<p>
					The token stays in this browser's localStorage. Anyone with access to this browser
					profile (or a script injected into this page) could read it — use a token with an expiry
					and only the scopes above.
				</p>
			</div>
		{/if}
	</div>
</div>
