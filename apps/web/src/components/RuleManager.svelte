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
	<h3 class="mb-3 text-sm font-semibold text-body">Automation Rules</h3>
	<p class="mb-3 text-xs text-faint">
		When a PR's signal is detected, its card auto-moves to the mapped column.
	</p>
	<div class="flex flex-col gap-2">
		{#if rules.length === 0}
			<div class="text-xs italic text-dim">No rules yet. Add one below.</div>
		{:else}
			{#each rules as rule (rule.id)}
				<div class="flex items-center gap-2 rounded-md surface-raised px-3 py-2 text-sm">
					<span class="flex-1 text-heading">
						<span class="text-blue-500 dark:text-blue-400">{signalLabels[rule.signal] ?? rule.signal}</span>
						<span class="text-faint"> → </span>
						<span class="text-body">{columnTitle(rule.columnId)}</span>
					</span>
					<button
						class="rounded px-2 py-0.5 text-xs text-red-500 hover:bg-neutral-200 hover:text-red-600 dark:text-red-400 dark:hover:bg-neutral-700 dark:hover:text-red-300"
						onclick={() => onDelete(rule.id)}>Delete</button
					>
				</div>
			{/each}
		{/if}
	</div>
	<div class="mt-3 flex gap-2">
		<select
			class="input-field flex-1 px-2 py-1.5"
			value={selectedSignal}
			onchange={(e) => (selectedSignal = (e.target as HTMLSelectElement).value)}
		>
			<option value="">Signal...</option>
			{#each Object.entries(signalLabels) as [value, label] (value)}
				<option {value}>{label}</option>
			{/each}
		</select>
		<select
			class="input-field flex-1 px-2 py-1.5"
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
