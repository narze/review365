<script lang="ts">
	import { clearToken } from '$lib/auth';
	import { exportData, importData } from '$lib/backup';
	import type { Platform } from '@review365/api/types';

	let {
		platform,
		login,
		onSignOut,
		onImported,
		onSwitchPlatform
	}: {
		platform: Platform;
		login: string | null;
		onSignOut: () => void;
		onImported: () => void;
		onSwitchPlatform: (platform: Platform) => void;
	} = $props();

	let importStatus = $state('');
	let fileInput: HTMLInputElement | undefined = $state();

	const platformLabel: Record<Platform, string> = { github: 'GitHub', gitlab: 'GitLab' };

	async function handleExport() {
		const json = await exportData();
		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `review365-${platform}-backup.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	async function handleImportFile(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		try {
			const imported = await importData(await file.text());
			const parts = [imported.board && 'board', imported.config && 'config'].filter(Boolean);
			importStatus = `Imported ${parts.join(' + ')}`;
			onImported();
		} catch (err) {
			importStatus = err instanceof Error ? err.message : 'Import failed';
		}
		if (fileInput) fileInput.value = '';
	}

	function handleSignOut() {
		clearToken(platform);
		onSignOut();
	}
</script>

<div class="rounded-lg border border-panel p-4">
	<div class="mb-3 flex items-center justify-between">
		<div class="text-sm text-body">
			Signed in as <strong class="text-heading">@{login}</strong>
			<span class="text-faint">on {platformLabel[platform]}</span>
		</div>
		<button
			class="btn-secondary px-2.5 py-1 text-xs hover:border-red-500"
			onclick={handleSignOut}
		>
			Sign out
		</button>
	</div>
	<div class="mb-3 flex items-center gap-2">
		<span class="text-xs text-faint">Platform</span>
		<div class="inline-flex rounded-md border border-control p-0.5">
			{#each ['github', 'gitlab'] as const as p}
				<button
					class="rounded px-2.5 py-1 text-xs font-medium transition-colors {platform === p
						? 'bg-blue-600 text-white'
						: 'text-body hover:text-heading'}"
					onclick={() => platform !== p && onSwitchPlatform(p)}
				>
					{platformLabel[p]}
				</button>
			{/each}
		</div>
	</div>
	<div class="flex items-center gap-2">
		<button
			class="btn-secondary px-2.5 py-1 text-xs"
			onclick={handleExport}
		>
			⬇️ Export board
		</button>
		<button
			class="btn-secondary px-2.5 py-1 text-xs"
			onclick={() => fileInput?.click()}
		>
			⬆️ Import board
		</button>
		<input
			bind:this={fileInput}
			type="file"
			accept="application/json,.json"
			class="hidden"
			onchange={handleImportFile}
		/>
		{#if importStatus}
			<span class="text-xs text-muted">{importStatus}</span>
		{/if}
	</div>
	<p class="mt-2 text-xs text-faint">
		Board state lives in this browser only. Export before clearing site data or switching
		machines. Exports never include your token.
	</p>
</div>
