<script lang="ts">
	import type { ColumnDef } from '@review365/api/types';

	let {
		columns = [],
		rules = [],
		signalLabels = {},
		onAdd,
		onDelete
	}: {
		columns: ColumnDef[];
		rules: { id: string; signal: string; columnId: string }[];
		signalLabels: Record<string, string>;
		onAdd: (signal: string, columnId: string) => void;
		onDelete: (id: string) => void;
	} = $props();

	let selectedSignal = $state('');
	let selectedColumnId = $state('');

	function add() {
		if (!selectedSignal || !selectedColumnId) return;
		onAdd(selectedSignal, selectedColumnId);
		selectedSignal = '';
		selectedColumnId = '';
	}

	function columnTitle(id: string): string {
		return columns.find((c) => c.id === id)?.title ?? '?';
	}
</script>

<div>
	<h3 class="mb-3 text-sm font-semibold text-neutral-300">Automation Rules</h3>
	<p class="mb-3 text-xs text-neutral-500">
		When a PR's signal is detected, its card auto-moves to the mapped column.
	</p>
	<div class="flex flex-col gap-2">
		{#if rules.length === 0}
			<div class="text-xs italic text-neutral-600">No rules yet. Add one below.</div>
		{:else}
			{#each rules as rule (rule.id)}
				<div class="flex items-center gap-2 rounded-md bg-neutral-800 px-3 py-2 text-sm">
					<span class="flex-1 text-neutral-100">
						<span class="text-blue-400">{signalLabels[rule.signal] ?? rule.signal}</span>
						<span class="text-neutral-500"> → </span>
						<span class="text-neutral-200">{columnTitle(rule.columnId)}</span>
					</span>
					<button
						class="rounded px-2 py-0.5 text-xs text-red-400 hover:bg-neutral-700 hover:text-red-300"
						onclick={() => onDelete(rule.id)}>Delete</button
					>
				</div>
			{/each}
		{/if}
	</div>
	<div class="mt-3 flex gap-2">
		<select
			class="flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none"
			value={selectedSignal}
			onchange={(e) => (selectedSignal = (e.target as HTMLSelectElement).value)}
		>
			<option value="">Signal...</option>
			{#each Object.entries(signalLabels) as [value, label] (value)}
				<option {value}>{label}</option>
			{/each}
		</select>
		<select
			class="flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100 focus:border-blue-500 focus:outline-none"
			value={selectedColumnId}
			onchange={(e) => (selectedColumnId = (e.target as HTMLSelectElement).value)}
		>
			<option value="">Column...</option>
			{#each columns as col (col.id)}
				<option value={col.id}>{col.title}</option>
			{/each}
		</select>
		<button
			class="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-40"
			disabled={!selectedSignal || !selectedColumnId}
			onclick={add}>Add</button
		>
	</div>
</div>
