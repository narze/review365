<script lang="ts">
	import type { PRCard, ColumnId, ColumnDef } from '@review365/api/types';
	import KanbanCard from './KanbanCard.svelte';

	let {
		col,
		cards,
		onDrop,
		onReorder,
		onArchive,
		onUnarchive,
		showArchived = false
	}: {
		col: ColumnDef;
		cards: PRCard[];
		onDrop: (cardId: string, column: ColumnId) => void;
		onReorder: (cardId: string, targetCardId: string | null, column: ColumnId) => void;
		onArchive?: (id: string) => void;
		onUnarchive?: (id: string) => void;
		showArchived?: boolean;
	} = $props();

	let isOver = $state(false);
	let dropTargetId: string | null = $state(null);

	const visibleCards = $derived(
		showArchived ? cards : cards.filter((c) => !c.archived)
	);

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		isOver = true;
	}

	function handleDragLeave(e: DragEvent) {
		const rt = e.relatedTarget as HTMLElement;
		if (!rt || !rt.closest('.column-body')) {
			isOver = false;
			dropTargetId = null;
		}
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		isOver = false;
		const cardId = e.dataTransfer?.getData('text/plain');
		if (cardId) {
			if (dropTargetId && dropTargetId !== cardId) {
				onReorder(cardId, dropTargetId, col.id);
			} else if (!dropTargetId) {
				const cardInCol = visibleCards.some((c) => c.id === cardId);
				if (cardInCol) {
					onReorder(cardId, null, col.id);
				} else {
					onDrop(cardId, col.id);
				}
			}
		}
		dropTargetId = null;
	}

	function handleCardDragOver(e: DragEvent, cardId: string) {
		e.preventDefault();
		e.stopPropagation();
		dropTargetId = cardId;
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
		<span class="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400"
			>{visibleCards.length}</span
		>
	</div>
	<div class="column-body flex flex-1 flex-col gap-2 overflow-y-auto p-2">
		{#each visibleCards as card (card.id)}
			<div
				ondragover={(e) => handleCardDragOver(e, card.id)}
				ondragleave={() => {
					if (dropTargetId === card.id) dropTargetId = null;
				}}
				class="rounded-md transition-all {dropTargetId === card.id
					? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-neutral-900'
					: ''}"
			>
				<KanbanCard {card} {onArchive} {onUnarchive} />
			</div>
		{/each}
		{#if visibleCards.length === 0}
			<div class="py-6 text-center text-sm text-neutral-600">No PRs</div>
		{/if}
	</div>
</div>
