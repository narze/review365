<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { oauthErrorMessage, saveToken } from '$lib/auth';

	let { onDone }: { onDone?: (login: string) => void } = $props();

	let status = $state<'working' | 'error'>('working');
	let message = $state('Finishing GitHub sign-in…');

	onMount(async () => {
		const params = new URLSearchParams(window.location.search);
		const error = params.get('error');
		if (error) {
			status = 'error';
			message = oauthErrorMessage(error);
			return;
		}

		const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
		const accessToken = hash.get('access_token');
		// Drop the token from the URL bar as soon as we read it.
		history.replaceState(null, '', '/settings/oauth');

		if (!accessToken) {
			status = 'error';
			message = oauthErrorMessage('token_exchange_failed');
			return;
		}

		try {
			const login = await saveToken('github', accessToken);
			if (onDone) onDone(login);
			else await goto('/');
		} catch (e) {
			status = 'error';
			message = e instanceof Error ? e.message : 'Failed to validate GitHub token';
		}
	});
</script>

<div class="flex min-h-[60vh] items-center justify-center p-6">
	<div class="w-full max-w-lg rounded-xl border border-panel surface-panel p-6">
		{#if status === 'working'}
			<h1 class="mb-1 text-xl font-bold text-heading">Connecting…</h1>
			<p class="text-sm text-muted">{message}</p>
		{:else}
			<h1 class="mb-1 text-xl font-bold text-heading">Could not connect</h1>
			<p class="mb-4 text-sm text-red-500 dark:text-red-400">{message}</p>
			<a
				href="/settings"
				class="inline-block rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
			>
				Back to connect
			</a>
		{/if}
	</div>
</div>
