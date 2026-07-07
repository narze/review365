<script lang="ts">
	import { saveToken } from '$lib/auth';

	let { onDone }: { onDone: (login: string) => void } = $props();

	let token = $state('');
	let saving = $state(false);
	let error = $state('');

	async function submit() {
		if (!token.trim() || saving) return;
		saving = true;
		error = '';
		try {
			const login = await saveToken(token.trim());
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
		<h1 class="mb-1 text-xl font-bold text-neutral-100">Welcome to Review365</h1>
		<p class="mb-4 text-sm text-neutral-400">
			A kanban board for your GitHub pull request reviews. Everything runs in your browser — your
			token and board state are stored locally and only ever sent to <code
				class="text-neutral-300">api.github.com</code
			>.
		</p>

		<label class="mb-1 block text-sm font-medium text-neutral-300" for="token-input">
			GitHub personal access token
		</label>
		<input
			id="token-input"
			type="password"
			class="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none"
			placeholder="ghp_..."
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
			{saving ? 'Validating...' : 'Sign in'}
		</button>

		<div class="mt-5 rounded-md border border-neutral-800 bg-neutral-950 p-3 text-xs text-neutral-400">
			<div class="mb-1 font-medium text-neutral-300">Which token?</div>
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
			<p>
				The token stays in this browser's localStorage. Anyone with access to this browser
				profile (or a script injected into this page) could read it — use a token with an expiry
				and only the scopes above.
			</p>
		</div>
	</div>
</div>
