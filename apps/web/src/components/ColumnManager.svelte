<script lang="ts">
	import type { ColumnDef } from '@review365/api/types';

	let {
		columns = [],
		onAdd,
		onRename,
		onDelete
	}: {
		columns: ColumnDef[];
		onAdd: (title: string) => void;
		onRename: (id: string, title: string) => void;
		onDelete: (id: string) => void;
	} = $props();

	let newTitle = $state('');
	let editingId = $state<string | null>(null);
	let editTitle = $state('');

	function add() {
		if (!newTitle.trim()) return;
		onAdd(newTitle.trim());
		newTitle = '';
	}

	function startEdit(col: ColumnDef) {
		editingId = col.id;
		editTitle = col.title;
	}

	function saveEdit() {
		if (editingId && editTitle.trim()) {
			onRename(editingId, editTitle.trim());
		}
		editingId = null;
	}
</script>

<div>
	<h3 class="mb-3 text-sm font-semibold text-body">Columns</h3>
	<div class="flex flex-col gap-2">
		{#each columns as col (col.id)}
			<div class="flex items-center gap-2">
				{#if editingId === col.id}
					<input
						class="input-field flex-1 px-2 py-1"
						value={editTitle}
						oninput={(e) => (editTitle = (e.target as HTMLInputElement).value)}
						onkeydown={(e) => e.key === 'Enter' && saveEdit()}
					/>
					<button
						class="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
						onclick={saveEdit}>Save</button
					>
					<button
						class="rounded surface-raised px-2 py-1 text-xs text-body hover:bg-neutral-200 dark:hover:bg-neutral-600"
						onclick={() => (editingId = null)}>Cancel</button
					>
				{:else}
					<span class="flex-1 text-sm text-heading">{col.title}</span>
					<button
						class="rounded px-2 py-1 text-xs text-muted hover-surface hover:text-heading"
						onclick={() => startEdit(col)}>Rename</button
					>
					<button
						class="rounded px-2 py-1 text-xs text-red-500 hover-surface hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
						onclick={() => onDelete(col.id)}>Delete</button
					>
				{/if}
			</div>
		{/each}
	</div>
	<div class="mt-3 flex gap-2">
		<input
			class="input-field flex-1 px-3 py-1.5"
			placeholder="New column title..."
			value={newTitle}
			oninput={(e) => (newTitle = (e.target as HTMLInputElement).value)}
			onkeydown={(e) => e.key === 'Enter' && add()}
		/>
		<button
			class="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
			onclick={add}>Add</button
		>
	</div>
</div>
