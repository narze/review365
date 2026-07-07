<script lang="ts">
	import { clearToken, getLogin } from '$lib/auth';
	import { exportData, importData } from '$lib/backup';

	let {
		onSignOut,
		onImported
	}: {
		onSignOut: () => void;
		onImported: () => void;
	} = $props();

	let importStatus = $state('');
	let fileInput: HTMLInputElement | undefined = $state();

	const login = getLogin();

	async function handleExport() {
		const json = await exportData();
		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'review365-backup.json';
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
		clearToken();
		onSignOut();
	}
</script>

<div class="rounded-lg border border-neutral-800 p-4">
	<div class="mb-3 flex items-center justify-between">
		<div class="text-sm text-neutral-300">
			Signed in as <strong class="text-neutral-100">@{login}</strong>
		</div>
		<button
			class="rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-300 transition-colors hover:border-red-500"
			onclick={handleSignOut}
		>
			Sign out
		</button>
	</div>
	<div class="flex items-center gap-2">
		<button
			class="rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-300 transition-colors hover:border-blue-500"
			onclick={handleExport}
		>
			⬇️ Export board
		</button>
		<button
			class="rounded-md border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-300 transition-colors hover:border-blue-500"
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
			<span class="text-xs text-neutral-400">{importStatus}</span>
		{/if}
	</div>
	<p class="mt-2 text-xs text-neutral-500">
		Board state lives in this browser only. Export before clearing site data or switching
		machines. Exports never include your token.
	</p>
</div>
