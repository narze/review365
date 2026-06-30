<script lang="ts">
	import { flip } from 'svelte/animate';
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
	let dropAbove: boolean = $state(false);

	const visibleCards = $derived(
		showArchived ? cards : cards.filter((c) => !c.archived)
	);

	function handleColumnDragOver(e: DragEvent) {
		e.preventDefault();
		isOver = true;
	}

	function handleColumnDragLeave(e: DragEvent) {
		const rt = e.relatedTarget as HTMLElement;
		if (!rt || !rt.closest('.column-body')) {
			isOver = false;
			dropTargetId = null;
		}
	}

	function handleColumnDrop(e: DragEvent) {
		e.preventDefault();
		isOver = false;
		const cardId = e.dataTransfer?.getData('text/plain');
		if (cardId) {
			if (dropTargetId) {
				const idx = visibleCards.findIndex((c) => c.id === dropTargetId);
				const target = dropAbove ? dropTargetId : (idx < visibleCards.length - 1 ? visibleCards[idx + 1].id : null);
				if (target === cardId) return;
				onReorder(cardId, target, col.id);
			} else {
				onReorder(cardId, null, col.id);
			}
		}
		dropTargetId = null;
	}

	function handleCardDragOver(e: DragEvent, cardId: string) {
		e.preventDefault();
		e.stopPropagation();
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		dropTargetId = cardId;
		dropAbove = (e.clientY - rect.top) < rect.height / 2;
	}

	function handleCardDragLeave() {}
</script>

<div
	class="flex max-h-[calc(100vh-100px)] w-[300px] flex-col rounded-xl border bg-neutral-900 transition-colors {isOver
		? 'border-blue-500 bg-blue-950/30'
		: 'border-neutral-800'}"
	role="region"
	aria-label={col.title}
	ondragover={handleColumnDragOver}
	ondragleave={handleColumnDragLeave}
	ondrop={handleColumnDrop}
>
	<div class="flex items-center justify-between border-b border-neutral-800 px-4 py-3">
		<span class="text-sm font-semibold text-neutral-100">{col.title}</span>
		<span class="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400"
			>{visibleCards.length}</span
		>
	</div>
	<div class="column-body flex flex-1 flex-col gap-2 overflow-y-auto p-2">
		{#if isOver && dropTargetId === null}
			<div class="h-0.5 rounded bg-blue-500" />
		{/if}
		{#each visibleCards as card (card.id)}
			<div
				animate:flip
				ondragover={(e) => handleCardDragOver(e, card.id)}
				ondragleave={handleCardDragLeave}
				class="rounded-md transition-all {dropTargetId === card.id && dropAbove
					? 'border-t-2 border-t-blue-500'
					: dropTargetId === card.id && !dropAbove
						? 'border-b-2 border-b-blue-500'
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
