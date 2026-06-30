<script lang="ts">
	import type { PRCard, ColumnId, ColumnDef } from '@review365/api/types';
	import KanbanCard from './KanbanCard.svelte';

	let {
		col,
		cards,
		onDrop
	}: {
		col: ColumnDef;
		cards: PRCard[];
		onDrop: (cardId: string, column: ColumnId) => void;
	} = $props();

	let isOver = $state(false);

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		isOver = true;
	}

	function handleDragLeave() {
		isOver = false;
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		isOver = false;
		const cardId = e.dataTransfer?.getData('text/plain');
		if (cardId) onDrop(cardId, col.id);
	}
</script>

<div
	class="flex max-h-[calc(100vh-100px)] w-[300px] flex-col rounded-xl border bg-neutral-900 transition-colors {isOver
		? 'border-blue-500 bg-blue-950/30'
		: 'border-neutral-800'}"
	role="region"
	aria-label={col.title}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
>
	<div class="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
		<span class="text-sm font-semibold text-neutral-100">{col.title}</span>
		<span
			class="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400"
		>{cards.length}</span>
	</div>
	<div class="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
		{#each cards as card (card.id)}
			<KanbanCard {card} />
		{/each}
		{#if cards.length === 0}
			<div class="py-6 text-center text-sm text-neutral-600">No PRs</div>
		{/if}
	</div>
</div>
